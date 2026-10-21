import { ModelTier, EffortLevel, ModelConfig } from '../types/index.js';
import { ComplexityAnalyzer, ComplexityProfile } from './complexityAnalyzer.js';
import { FeedbackLoop } from './feedbackLoop.js';
import { TokenCounter } from './tokenCounter.js';

/**
 * SelectionCriteria: Input parameters for model selection
 */
export interface SelectionCriteria {
  complexity: ComplexityProfile;
  inputTokens: number;
  budget: number; // Max tokens allowed
  minQuality: number; // Minimum acceptable quality (1-10)
  allowedModels: ModelTier[];
  timeout?: number; // Max execution time in ms
  useHistoricalData: boolean; // Use feedback loop data
  userPreference?: 'fast' | 'cheap' | 'quality'; // NEW: explicit user preference
}

/**
 * FactorScores: Detailed scoring for model suitability
 */
export interface FactorScores {
  quality: number;           // 0-10, task quality fit
  costEfficiency: number;    // 0-10, cost vs quality
  speed: number;            // 0-10, latency suitability
  tokenFit: number;         // 0-10, context window fit
  historical: number;       // 0-10, past performance
  calibration: number;      // 0-10, empirical calibration
  consistencyBonus: number; // 0-5, penalty/bonus for consistency
}

/**
 * SelectionResult: Model selection output with detailed reasoning
 */
export interface SelectionResult {
  model: ModelTier;
  effort: EffortLevel;
  reasoning: string;
  confidence: number; // 0-1, calibrated confidence score
  confidenceBreakdown: {
    qualityMatch: number;
    historical: number;
    tokenFit: number;
    modelVariety: number; // Penalty if switching models too much
  };
  alternatives: Array<{
    model: ModelTier;
    reasoning: string;
    score: number;
    confidence: number;
  }>;
  fallback: {
    model: ModelTier;
    reason: string;
  };
}

/**
 * ModelSelector v2: Multi-factor intelligent model selection with calibration
 *
 * Scoring factors:
 * 1. Quality fit: Does model quality match task complexity?
 * 2. Cost efficiency: Quality per dollar (Pareto frontier)
 * 3. Speed: Meets latency requirements?
 * 4. Token fit: Fits in context window?
 * 5. Historical: Past performance on similar tasks
 * 6. Calibration: Empirical improvements from feedback loop
 * 7. Consistency: Penalty for switching models (reduces debugging burden)
 *
 * Confidence calibration: Scores are scaled 0-1 based on:
 * - Factor agreement (if all factors agree, confidence is high)
 * - Historical data availability
 * - Quality match precision
 */
export class ModelSelector {
  private complexityAnalyzer: ComplexityAnalyzer;
  private feedbackLoop: FeedbackLoop;
  private tokenCounter: TokenCounter;
  private modelConfigs: Record<ModelTier, ModelConfig>;
  private selectionHistory: Array<{ model: ModelTier; complexity: number; confidence: number }> = [];
  private modelStability: Record<ModelTier, number> = { haiku: 0, sonnet: 0, opus: 0, fable: 0 };

  constructor(
    modelConfigs: Record<ModelTier, ModelConfig>,
    feedbackLoop: FeedbackLoop,
    tokenCounter: TokenCounter
  ) {
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.feedbackLoop = feedbackLoop;
    this.tokenCounter = tokenCounter;
    this.modelConfigs = modelConfigs;
  }

  /**
   * Select optimal model based on all criteria (v2)
   */
  selectModel(criteria: SelectionCriteria): SelectionResult {
    const scores = this.scoreModels(criteria);

    // Get best model
    const bestScore = scores[0];
    const model = bestScore.model;
    const config = this.modelConfigs[model];

    // Determine effort level based on complexity and model
    const effort = this.determineEffort(criteria.complexity.score, model);

    // Generate reasoning
    const reasoning = this.generateReasoning(bestScore, criteria);

    // Calculate calibrated confidence
    const confidenceData = this.calibrateConfidence(bestScore, scores, criteria);
    const confidence = confidenceData.overall;

    // Get alternatives with confidence scores
    const alternatives = scores.slice(1, 3).map(score => ({
      model: score.model,
      reasoning: `Quality: ${score.factorScores.quality.toFixed(2)}/10, Cost efficiency: ${score.factorScores.costEfficiency.toFixed(2)}/10, Historical: ${score.factorScores.historical.toFixed(2)}/10`,
      score: score.totalScore,
      confidence: score.confidence || 0.5,
    }));

    // Determine fallback strategy
    const fallback = this.determineFallback(model, criteria.allowedModels);

    // Record selection for stability analysis
    this.selectionHistory.push({
      model,
      complexity: criteria.complexity.score,
      confidence,
    });
    if (this.selectionHistory.length > 1000) {
      this.selectionHistory = this.selectionHistory.slice(-1000);
    }

    return {
      model,
      effort,
      reasoning,
      confidence,
      confidenceBreakdown: confidenceData.breakdown,
      alternatives,
      fallback,
    };
  }

  /**
   * Score model generation fit (NEW: addresses model generation trade-offs)
   * Considers: speed vs quality, cost sensitivity, stability requirements
   */
  private scoreGenerationFit(
    model: ModelTier,
    config: ModelConfig,
    criteria: SelectionCriteria
  ): number {
    if (!config.generationTradeoffs) return 5; // Neutral if no generation data

    let score = 5; // Neutral baseline

    const tradeoffs = config.generationTradeoffs;

    // SPEED-CRITICAL TASKS: Prefer older/faster models
    if (criteria.timeout && criteria.timeout < 300) {
      if (tradeoffs.speedVsQuality === 'fast') {
        score += 3; // Fast models get bonus
      } else if (tradeoffs.speedVsQuality === 'balanced') {
        score += 1;
      } else {
        score -= 2; // Quality-focused models penalized
      }
    }

    // COST-CONSTRAINED: Prefer cheaper/older models
    if (criteria.budget && criteria.budget < 1000) {
      const avgCost = (config.costPer1MTok.input + config.costPer1MTok.output) / 2;
      if (avgCost < 10) {
        score += 2;
      }
    }

    // STABILITY REQUIRED: Prefer proven/older models
    if (criteria.complexity.score < 3) {
      if (tradeoffs.stability >= 8) {
        score += 2; // Older, proven models preferred
      }
    }

    // REASONING TASK: Prefer newer/better reasoning
    if (criteria.complexity.category === 'expert' && criteria.minQuality >= 8) {
      if (tradeoffs.reasoning >= 8.5) {
        score += 2;
      }
    }

    // CHECK: Is this model explicitly NOT suitable for this task?
    if (config.poorFitFor) {
      if (config.poorFitFor.taskType.includes(criteria.complexity.category)) {
        score -= 3; // Strong penalty if explicitly poor fit
      }

      if (config.poorFitFor.latencyConstraint && criteria.timeout && criteria.timeout < 300) {
        score -= 2;
      }

      if (config.poorFitFor.budgetConstraint && criteria.budget && criteria.budget < 1000) {
        score -= 2;
      }
    }

    return Math.max(1, Math.min(10, score));
  }

  /**
   * Apply user preference modifier to score (NEW: explicit fast/cheap/quality mode)
   */
  private applyUserPreference(
    baseScore: number,
    generationScore: number,
    model: ModelTier,
    criteria: SelectionCriteria
  ): number {
    if (!criteria.userPreference) {
      return baseScore; // No preference, use base score
    }

    const config = this.modelConfigs[model];
    const tradeoffs = config.generationTradeoffs;

    switch (criteria.userPreference) {
      case 'fast':
        // Boost fast/older models, penalize quality-focused models
        if (tradeoffs && tradeoffs.speedVsQuality === 'fast') {
          return baseScore * 1.15; // 15% boost for fast-friendly models
        }
        if (tradeoffs && tradeoffs.speedVsQuality === 'quality') {
          return baseScore * 0.85; // 15% penalty for slow models
        }
        return baseScore;

      case 'cheap':
        // Boost cost-efficient models
        const avgCost = (config.costPer1MTok.input + config.costPer1MTok.output) / 2;
        const costs = {
          haiku: 2.4,
          sonnet: 9,
          opus: 45,
          fable: 90,
        };
        const selectedCost = costs[model] || avgCost;
        const avgModelCost = Object.values(costs).reduce((a, b) => a + b, 0) / Object.keys(costs).length;

        if (selectedCost < avgModelCost * 0.8) {
          return baseScore * 1.2; // 20% boost for cheap models
        } else if (selectedCost > avgModelCost * 1.5) {
          return baseScore * 0.7; // 30% penalty for expensive models
        }
        return baseScore;

      case 'quality':
        // Boost quality-focused models (newer, higher reasoning)
        // Penalize cheap/fast models
        if (tradeoffs && tradeoffs.speedVsQuality === 'fast') {
          return baseScore * 0.8; // 20% penalty for fast models
        }
        if (tradeoffs && tradeoffs.reasoning >= 8.5) {
          return baseScore * 1.15; // 15% boost for quality-focused
        }
        return baseScore;

      default:
        return baseScore;
    }
  }

  /**
   * Score all allowed models (v2: enhanced multi-factor analysis with generation awareness)
   */
  private scoreModels(
    criteria: SelectionCriteria
  ): Array<{
    model: ModelTier;
    totalScore: number;
    confidence: number;
    factorScores: FactorScores;
    generationScore: number;
  }> {
    const scores = criteria.allowedModels.map(model => {
      const config = this.modelConfigs[model];

      const factorScores: FactorScores = {
        quality: this.scoreQuality(criteria.complexity.score, config, criteria.complexity.percentile),
        speed: this.scoreSpeed(criteria.timeout, config),
        tokenFit: this.scoreTokenFit(criteria.inputTokens, config, criteria.budget),
        costEfficiency: this.scoreCostEfficiency(criteria.complexity.score, model),
        historical: criteria.useHistoricalData
          ? this.scoreHistorical(model, criteria.complexity.score, criteria.minQuality)
          : 5,
        calibration: this.scoreCalibration(model, criteria.complexity.score),
        consistencyBonus: this.scoreConsistency(model),
      };

      // NEW: Add generation-specific scoring
      const generationScore = this.scoreGenerationFit(model, config, criteria);

      // ADJUSTED WEIGHTS: Generation trade-offs now higher priority (15% vs 8%)
      // Rationale: Selecting wrong generation (e.g., Opus for trivial task) wastes more money
      // than slight quality difference; must be primary factor
      let totalScore =
        factorScores.quality * 0.24 +        // Reduced from 0.28
        factorScores.costEfficiency * 0.20 + // Reduced from 0.22
        factorScores.historical * 0.15 +     // Reduced from 0.18
        factorScores.tokenFit * 0.12 +       // Reduced from 0.15
        generationScore * 0.15 +             // INCREASED from 0.08 (now weighted heavily)
        factorScores.speed * 0.10 +
        factorScores.calibration * 0.02 +
        factorScores.consistencyBonus * 0.02;

      // NEW: Apply user preference modifier
      totalScore = this.applyUserPreference(totalScore, generationScore, model, criteria);

      // Calculate confidence based on factor agreement
      const confidence = this.calculateFactorConfidence(factorScores, model);

      return {
        model,
        totalScore,
        confidence,
        factorScores,
        generationScore,
      };
    });

    // Sort by score descending
    scores.sort((a, b) => b.totalScore - a.totalScore);
    return scores;
  }

  /**
   * Score model for quality at complexity level (0-10)
   * Matches model quality to task complexity with sweet spot bonus
   */
  private scoreQuality(complexity: number, config: ModelConfig, percentile: number = 50): number {
    const modelQuality = config.quality;

    // Calculate quality-complexity gap
    const gap = Math.abs(modelQuality - complexity);

    // Sweet spot: model quality ~= complexity + 1-2 points
    // (e.g., Sonnet (7) for complexity 5-6 tasks)
    const idealQuality = complexity + 1.5;
    const qualityMatch = Math.max(0, 10 - Math.abs(modelQuality - idealQuality) * 1.2);

    // Penalty for severe over-engineering
    if (modelQuality > complexity + 3 && complexity < 3) {
      return Math.max(1, qualityMatch * 0.7);
    }

    // Penalty for under-engineering complex tasks
    if (modelQuality < complexity - 1 && complexity > 6) {
      return Math.max(1, qualityMatch * 0.6);
    }

    return Math.min(10, qualityMatch);
  }

  /**
   * Score cost efficiency (0-10): Quality delivered per dollar
   * Pareto frontier optimization
   */
  private scoreCostEfficiency(complexity: number, model: ModelTier): number {
    const config = this.modelConfigs[model];

    // Cost per million tokens (average of input+output)
    const avgCost = (config.costPer1MTok.input + config.costPer1MTok.output) / 2;

    // Quality per dollar: quality / cost
    const qualityPerDollar = config.quality / avgCost;

    // Normalize to 0-10 scale
    // Haiku (4/2.4) = 1.67, Sonnet (7/9) = 0.78, Opus (9/45) = 0.2, Fable (10/90) = 0.11
    const maxQualityPerDollar = 2.0; // Haiku's ratio
    let score = Math.min(10, (qualityPerDollar / maxQualityPerDollar) * 10);

    // Bonus for tasks where simple models work
    if (complexity < 3 && config.quality >= 4) {
      score *= 1.3; // Much better value for simple tasks
    }

    // Penalty for overkill on simple tasks
    if (complexity < 2 && config.quality >= 8) {
      score *= 0.6;
    }

    return Math.min(10, score);
  }

  /**
   * Score speed/latency fit (0-10)
   */
  private scoreSpeed(timeout: number | undefined, config: ModelConfig): number {
    if (!timeout) return 5; // Neutral if no timeout

    // Estimate output latency: tokens per second = speed
    // For a typical 500-token output, latency = 500 / speed seconds
    const estimatedOutputLatency = (500 / config.speed) * 1000; // ms

    // If model can't generate response in time
    if (estimatedOutputLatency > timeout * 0.85) {
      return 2; // Risky timeout
    }

    if (estimatedOutputLatency > timeout * 0.5) {
      return 5; // Acceptable but tight
    }

    if (estimatedOutputLatency > timeout * 0.25) {
      return 8; // Good margin
    }

    return 10; // Plenty of time
  }

  /**
   * Score context window fit (0-10)
   * How comfortably does the model fit the task?
   */
  private scoreTokenFit(inputTokens: number, config: ModelConfig, budget: number): number {
    const maxAllowed = Math.min(config.maxTokens, budget);

    // Estimate output tokens: typically 30-50% of input
    const outputEstimate = Math.ceil(inputTokens * 0.4);
    const totalNeeded = inputTokens + outputEstimate;

    // Utilization ratio
    const utilization = totalNeeded / maxAllowed;

    // Score based on utilization
    if (utilization > 0.95) {
      return 1; // Way over budget
    }
    if (utilization > 0.85) {
      return 3; // Very tight
    }
    if (utilization > 0.70) {
      return 6; // Tight
    }
    if (utilization > 0.50) {
      return 8; // Comfortable
    }

    return 10; // Plenty of room
  }

  /**
   * Score based on historical feedback (0-10)
   * Weighted by availability of data
   */
  private scoreHistorical(model: ModelTier, complexity: number, minQuality: number): number {
    const perf = this.feedbackLoop.getModelPerformance(model, complexity);

    if (!perf) {
      return 5; // No data, neutral score
    }

    // Hard constraints: can't use if unreliable or low quality
    if (perf.successRate < 0.7) {
      return 2;
    }

    if (perf.averageQuality < minQuality) {
      return 2;
    }

    // Score combines success rate, quality, and stability
    const successBonus = perf.successRate * 8;
    const qualityBonus = Math.min(4, (perf.averageQuality - minQuality) * 0.5);
    const stabilityBonus = (1 - perf.escalationRate) * 1; // Bonus for low escalation

    return Math.min(10, successBonus + qualityBonus + stabilityBonus);
  }

  /**
   * Score calibration: empirical improvements from feedback
   */
  private scoreCalibration(model: ModelTier, complexity: number): number {
    // Check if this model has been calibrated
    const calibrationPoints = this.feedbackLoop.getModelPerformance(model, complexity);

    if (!calibrationPoints || calibrationPoints.totalRequests < 20) {
      return 5; // No calibration data
    }

    // If empirical performance is excellent, boost score
    if (calibrationPoints.successRate > 0.95 && calibrationPoints.averageQuality > 8.5) {
      return 9;
    }

    if (calibrationPoints.successRate > 0.90 && calibrationPoints.averageQuality > 8) {
      return 7.5;
    }

    // Scale with success rate
    return Math.min(10, calibrationPoints.successRate * 8);
  }

  /**
   * Score consistency: penalty for switching models too much
   * Reduces cognitive load and debugging burden
   */
  private scoreConsistency(model: ModelTier): number {
    // How often is this model selected?
    const recentSelections = this.selectionHistory.slice(-100);
    const modelCount = recentSelections.filter(s => s.model === model).length;
    const frequency = recentSelections.length > 0 ? modelCount / recentSelections.length : 0.25;

    // Bonus for stable, frequently-used models
    if (frequency > 0.4) {
      return 4; // High consistency bonus
    }
    if (frequency > 0.25) {
      return 2;
    }
    if (frequency > 0.15) {
      return 1;
    }

    return -2; // Penalty for rarely used models
  }

  /**
   * Calculate confidence based on factor agreement
   */
  private calculateFactorConfidence(factorScores: FactorScores, model: ModelTier): number {
    const scores = [
      factorScores.quality,
      factorScores.costEfficiency,
      factorScores.tokenFit,
      factorScores.speed,
      factorScores.historical,
    ].filter(s => s >= 0);

    if (scores.length === 0) return 0.5;

    // Standard deviation of factor scores
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Low variance = high agreement = high confidence
    // stdDev of 0 = perfect agreement (100% confidence)
    // stdDev of 5 = significant disagreement (50% confidence)
    const confidence = Math.max(0.3, Math.min(0.95, 1 - stdDev / 10));

    return confidence;
  }

  /**
   * Determine effort level for execution
   */
  private determineEffort(complexity: number, model: ModelTier): EffortLevel {
    const config = this.modelConfigs[model];

    // For simple tasks on powerful models, use lower effort
    if (complexity < 3) {
      return 'low';
    }

    // For moderate tasks, use model's default
    if (complexity < 5) {
      return config.defaultEffort === 'low' ? 'medium' : config.defaultEffort;
    }

    // For complex tasks, escalate effort if model supports it
    if (complexity > 7) {
      if (model === 'haiku') return 'medium';
      if (model === 'sonnet') return 'high';
      return 'xhigh';
    }

    return config.defaultEffort;
  }

  /**
   * Generate human-readable reasoning for selection
   */
  private generateReasoning(
    selectedScore: any,
    criteria: SelectionCriteria
  ): string {
    const parts: string[] = [];
    const factorScores = selectedScore.factorScores;

    // Build reasoning from strongest factors
    if (factorScores.quality > 7.5) {
      parts.push(`excellent quality match (${factorScores.quality.toFixed(1)}/10) for ${criteria.complexity.category} task`);
    } else if (factorScores.quality > 6) {
      parts.push(`good quality fit for ${criteria.complexity.category} task`);
    }

    if (factorScores.costEfficiency > 8) {
      parts.push('exceptional cost efficiency');
    } else if (factorScores.costEfficiency > 6.5) {
      parts.push('cost-efficient');
    }

    if (factorScores.historical > 7) {
      parts.push('strong historical performance at this level');
    }

    if (factorScores.tokenFit < 3) {
      parts.push('WARNING: tight token fit, monitor output length');
    }

    if (parts.length === 0) {
      parts.push('best option given constraints');
    }

    return parts.join('; ');
  }

  /**
   * Calibrate confidence in selection (0-1)
   * Multi-factor confidence with breakdown
   */
  private calibrateConfidence(
    bestScore: any,
    allScores: any[],
    criteria: SelectionCriteria
  ): { overall: number; breakdown: { qualityMatch: number; historical: number; tokenFit: number; modelVariety: number } } {
    const factorScores = bestScore.factorScores;

    // Individual factor confidence (0-1)
    const qualityConfidence = Math.min(1, Math.max(0.3, factorScores.quality / 10 * 0.9 + 0.1));
    const historicalConfidence = criteria.useHistoricalData
      ? Math.min(1, Math.max(0.3, factorScores.historical / 10 * 0.8 + 0.2))
      : 0.5;
    const tokenFitConfidence = Math.min(1, Math.max(0.3, factorScores.tokenFit / 10 * 0.8 + 0.2));

    // Gap between best and second-best (larger gap = more confident)
    const gapBonus = allScores.length > 1
      ? Math.min(0.2, (bestScore.totalScore - allScores[1].totalScore) / 5)
      : 0;

    // Model variety penalty: if switching too often, lower confidence
    const varietyPenalty = bestScore.factorScores.consistencyBonus < 0
      ? 0.1
      : 0;

    // Overall calibrated confidence
    const overallConfidence = Math.min(1, Math.max(0.3,
      qualityConfidence * 0.35 +
      historicalConfidence * 0.25 +
      tokenFitConfidence * 0.20 +
      gapBonus +
      (1 - varietyPenalty) * 0.10
    ));

    return {
      overall: overallConfidence,
      breakdown: {
        qualityMatch: qualityConfidence,
        historical: historicalConfidence,
        tokenFit: tokenFitConfidence,
        modelVariety: 1 - varietyPenalty,
      },
    };
  }

  /**
   * Determine fallback model if primary fails
   */
  private determineFallback(primaryModel: ModelTier, allowed: ModelTier[]): { model: ModelTier; reason: string } {
    // Escalation path: haiku -> sonnet -> opus -> fable
    const escalationPath: ModelTier[] = ['haiku', 'sonnet', 'opus', 'fable'];
    const primaryIndex = escalationPath.indexOf(primaryModel);

    // Try next model in escalation path
    for (let i = primaryIndex + 1; i < escalationPath.length; i++) {
      if (allowed.includes(escalationPath[i])) {
        return {
          model: escalationPath[i],
          reason: `Escalate to ${escalationPath[i]} if ${primaryModel} fails`,
        };
      }
    }

    // If no escalation possible, fallback to haiku (most available)
    return {
      model: 'haiku',
      reason: 'Default fallback',
    };
  }
}

export default ModelSelector;
