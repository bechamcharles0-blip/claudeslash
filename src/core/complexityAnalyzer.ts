/**
 * ComplexityAnalyzer v2: Advanced task complexity analysis
 *
 * 5-Factor Analysis with statistical calibration:
 * 1. Length & Context Window Usage (tokens, context density)
 * 2. Reasoning Requirements (multi-step, logic depth, creativity)
 * 3. Technical Content (code, domain-specific patterns)
 * 4. Structured Information (format, clarity, ambiguity)
 * 5. Domain Expertise Requirements (specialized knowledge needed)
 *
 * Includes calibration against actual API performance to improve predictions.
 */
export interface ComplexityProfile {
  score: number; // 1-10
  percentile: number; // Compared to historical data (0-100)
  factors: {
    length: number;
    reasoning: number;
    technical: number;
    structured: number;
    domain: number;
  };
  factorWeights: {
    length: number;
    reasoning: number;
    technical: number;
    structured: number;
    domain: number;
  };
  category: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';
  explanation: string;
  confidence: number; // 0-1, how confident in this assessment
}

export interface CalibrationPoint {
  taskHash: string;
  estimatedComplexity: number;
  actualModel: string;
  success: boolean;
  qualityScore: number;
  executionTime: number;
  timestamp: number;
}

const REASONING_KEYWORDS = [
  'analyze', 'why', 'how', 'explain', 'compare', 'contrast', 'evaluate',
  'argue', 'reasoning', 'think', 'logic', 'problem', 'debug', 'optimize',
  'design', 'architecture', 'strategy', 'algorithm', 'derive', 'prove',
  'method', 'approach', 'implement', 'solve', 'complex', 'difficult',
];

const TECHNICAL_KEYWORDS = [
  'code', 'function', 'class', 'sql', 'python', 'javascript', 'java',
  'api', 'database', 'algorithm', 'data structure', 'regex', 'binary',
  'hash', 'tree', 'graph', 'neural', 'tensor', 'model', 'framework',
  'library', 'module', 'package', 'compile', 'debug', 'deploy',
];

const DOMAIN_KEYWORDS = [
  'medical', 'legal', 'financial', 'scientific', 'academic', 'research',
  'physics', 'chemistry', 'biology', 'mathematics', 'theorem', 'hypothesis',
  'experiment', 'patent', 'compliance', 'regulation', 'audit',
];

export class ComplexityAnalyzer {
  private calibrationHistory: CalibrationPoint[] = [];
  private complexityDistribution: number[] = []; // For percentile calculation
  private defaultFactorWeights = {
    length: 0.12,      // Reduced: token counting is becoming cheap
    reasoning: 0.38,   // Increased: reasoning matters most
    technical: 0.18,   // Stable: technical content is medium-complex
    structured: 0.12,  // Reduced: structure is less complex alone
    domain: 0.20,      // Increased: domain knowledge is critical
  };

  /**
   * Analyze task complexity with calibration
   */
  analyzeComplexity(task: string, estimatedInputTokens: number, useHistoricalWeights: boolean = true): ComplexityProfile {
    const factors = {
      length: this.analyzeLength(estimatedInputTokens),
      reasoning: this.analyzeReasoning(task),
      technical: this.analyzeTechnical(task),
      structured: this.analyzeStructure(task),
      domain: this.analyzeDomain(task),
    };

    // Use adaptive weights if calibration data available
    const weights = useHistoricalWeights && this.calibrationHistory.length > 100
      ? this.getAdaptiveWeights()
      : this.defaultFactorWeights;

    // Calculate weighted score
    const score = Math.min(10, Math.max(1, Math.round(
      factors.length * weights.length +
      factors.reasoning * weights.reasoning +
      factors.technical * weights.technical +
      factors.structured * weights.structured +
      factors.domain * weights.domain
    )));

    // Calculate percentile against historical distribution
    const percentile = this.calculatePercentile(score);

    // Assess confidence in this prediction
    const confidence = this.assessConfidence(factors, task);

    const category = this.categorizeScore(score);
    const explanation = this.generateExplanation(factors, category);

    return {
      score,
      percentile,
      factors,
      factorWeights: weights,
      category,
      explanation,
      confidence,
    };
  }

  /**
   * Record actual complexity from executed task (for calibration)
   */
  recordCalibrationPoint(
    task: string,
    estimatedComplexity: number,
    actualModel: string,
    success: boolean,
    qualityScore: number,
    executionTime: number
  ): void {
    // Simple task hash
    let hash = 0;
    for (let i = 0; i < task.length; i++) {
      hash = ((hash << 5) - hash) + task.charCodeAt(i);
    }

    this.calibrationHistory.push({
      taskHash: hash.toString(16),
      estimatedComplexity,
      actualModel,
      success,
      qualityScore,
      executionTime,
      timestamp: Date.now(),
    });

    // Keep only recent calibration points (last 10k)
    if (this.calibrationHistory.length > 10000) {
      this.calibrationHistory = this.calibrationHistory.slice(-10000);
    }

    // Update distribution
    this.complexityDistribution.push(estimatedComplexity);
    if (this.complexityDistribution.length > 10000) {
      this.complexityDistribution = this.complexityDistribution.slice(-10000);
    }
  }

  /**
   * Calculate adaptive weights based on calibration data
   */
  private getAdaptiveWeights(): { length: number; reasoning: number; technical: number; structured: number; domain: number } {
    if (this.calibrationHistory.length < 50) {
      return this.defaultFactorWeights;
    }

    // Analyze correlation between estimated complexity and success
    const successful = this.calibrationHistory.filter(c => c.success);

    // If success rate is high, current weights are good
    if (successful.length / this.calibrationHistory.length > 0.85) {
      return this.defaultFactorWeights;
    }

    // Otherwise slightly adjust (increase reasoning weight if failures on reasoning tasks)
    const weights = { ...this.defaultFactorWeights };

    // This is a placeholder for more sophisticated weight adaptation
    // In practice, would use correlation analysis between factors and outcomes

    return weights;
  }

  /**
   * Calculate percentile position in historical distribution
   */
  private calculatePercentile(score: number): number {
    if (this.complexityDistribution.length === 0) return 50;

    const sorted = [...this.complexityDistribution].sort((a, b) => a - b);
    const index = sorted.findIndex(s => s >= score);

    if (index === -1) return 100;
    return Math.round((index / sorted.length) * 100);
  }

  /**
   * Assess confidence in complexity assessment
   */
  private assessConfidence(factors: any, task: string): number {
    let confidence = 0.6; // Base confidence

    // High confidence if factors are clear
    const factorValues = [factors.length, factors.reasoning, factors.technical, factors.structured, factors.domain];
    const factorVariance = this.calculateVariance(factorValues);

    // Low variance = clear signal
    if (factorVariance < 2) {
      confidence += 0.2;
    }

    // Higher confidence if we have calibration data for similar tasks
    if (this.calibrationHistory.length > 500) {
      confidence += 0.1;
    }

    // Reduce confidence for very high/low scores (edge cases)
    if (factors.reasoning > 8 || factors.domain > 8) {
      confidence = Math.min(confidence, 0.85);
    }

    return Math.min(0.95, Math.max(0.3, confidence));
  }

  /**
   * Calculate variance of factor scores
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Analyze length/context window impact (1-10)
   * Modern: token cost is cheap, focus on context density
   */
  private analyzeLength(tokens: number): number {
    // Tokens themselves are cheap now, but they affect:
    // 1. Context window saturation (more tokens = less room for reasoning)
    // 2. Attention overhead (quadratic in Transformer)

    if (tokens < 100) return 1;      // Tiny, trivial
    if (tokens < 500) return 2;      // Small, fits easily
    if (tokens < 2000) return 3;     // Medium, standard size
    if (tokens < 5000) return 4;     // Large, getting tight
    if (tokens < 10000) return 5;    // Very large
    if (tokens < 50000) return 7;    // Huge, near limits
    if (tokens < 100000) return 8;   // Massive
    return 10;                         // At hard limit
  }

  /**
   * Analyze reasoning requirements (1-10)
   * Multi-step logic, causal chains, trade-offs
   */
  private analyzeReasoning(task: string): number {
    const lowerTask = task.toLowerCase();
    let score = 1;

    // Count reasoning keyword occurrences (weighted)
    const reasoningCount = REASONING_KEYWORDS.filter(
      keyword => lowerTask.includes(keyword)
    ).length;

    // Non-linear contribution: 1 keyword = +1, but diminishing returns
    score += Math.min(7, Math.sqrt(reasoningCount) * 2.5);

    // Explicit multi-step reasoning indicators
    if (/step\s+\d+|step\s+by\s+step|break\s+down|decompose/i.test(task)) score += 1.5;
    if (/multiple\s+perspectives|trade.?off|pros\s+and\s+cons/i.test(task)) score += 1.5;
    if (/novel|creative|original|design|architecture/i.test(task)) score += 0.5;

    // Evidence of causal reasoning
    if (/why|because|therefore|cause|effect/i.test(task)) score += 0.5;

    // Long-horizon reasoning
    if (/long.?term|future|predict|forecast/i.test(task)) score += 0.5;

    return Math.min(10, score);
  }

  /**
   * Analyze technical content complexity (1-10)
   */
  private analyzeTechnical(task: string): number {
    const lowerTask = task.toLowerCase();
    let score = 1;

    // Technical keywords with frequency weighting
    const technicalCount = TECHNICAL_KEYWORDS.filter(
      keyword => lowerTask.includes(keyword)
    ).length;

    score += Math.min(7, technicalCount * 1.1);

    // Code density analysis
    const codeBlocks = (task.match(/```/g) || []).length / 2; // Pairs of backticks
    const codeChars = (task.match(/[{}[\]]/g) || []).length;

    if (codeBlocks > 0) score += Math.min(2, codeBlocks * 0.5);
    if (codeChars > 10) score += Math.min(1.5, codeChars / 10);

    // Error handling/debugging
    if (/error|exception|bug|fix|debug|trace|stack/i.test(task)) score += 0.5;

    // Algorithm/complex logic
    if (/algorithm|pattern|architecture|optimize|refactor|performance/i.test(task)) score += 0.5;

    return Math.min(10, score);
  }

  /**
   * Analyze information structure quality (1-10)
   * Well-structured = easier, ambiguous = harder
   */
  private analyzeStructure(task: string): number {
    let score = 5; // Neutral baseline

    // Structured patterns are EASIER (reduce complexity)
    const bulletPoints = (task.match(/^[\s]*[-*•]/gm) || []).length;
    const numberedList = (task.match(/^\s*\d+[.)]/gm) || []).length;
    const jsonPatterns = (task.match(/{\s*"[^"]*":/g) || []).length;
    const tables = (task.match(/\|.*\|/g) || []).length;

    if (bulletPoints > 3) score -= 1.5;
    if (numberedList > 3) score -= 1.5;
    if (jsonPatterns > 0) score -= 1;
    if (tables > 0) score -= 1;

    // Unstructured, dense text INCREASES complexity
    const lines = task.split('\n').length;
    const avgLineLength = task.length / Math.max(1, lines);

    if (avgLineLength > 150) score += 1.5; // Dense paragraphs
    if (avgLineLength > 250) score += 1;   // Very dense

    // Ambiguity signals
    if (/vague|unclear|maybe|possibly|might|unclear/i.test(task)) score += 1;

    return Math.min(10, Math.max(1, score));
  }

  /**
   * Analyze domain expertise requirements (1-10)
   * Specialized knowledge = harder
   */
  private analyzeDomain(task: string): number {
    const lowerTask = task.toLowerCase();
    let score = 1;

    // Count domain keyword occurrences
    const domainCount = DOMAIN_KEYWORDS.filter(
      keyword => lowerTask.includes(keyword)
    ).length;

    // Non-linear: each domain keyword adds expertise requirement
    score += Math.min(6, Math.pow(domainCount, 0.8) * 1.8);

    // Specialized terminology
    if (/latency|throughput|bandwidth|scalability|distributed/i.test(task)) score += 1;
    if (/compliance|regulation|audit|legal|liability/i.test(task)) score += 1.5;
    if (/cryptography|security|vulnerability|exploit/i.test(task)) score += 1.5;
    if (/ml|neural|gradient|backprop|tensor|model/i.test(task)) score += 1;

    // Academic/research depth
    if (/hypothesis|theorem|proof|experiment|peer|review/i.test(task)) score += 1;

    return Math.min(10, score);
  }

  /**
   * Categorize complexity score
   */
  private categorizeScore(score: number): 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert' {
    if (score <= 2) return 'trivial';
    if (score <= 3.5) return 'simple';
    if (score <= 5.5) return 'moderate';
    if (score <= 7.5) return 'complex';
    return 'expert';
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(factors: any, category: string): string {
    const parts: string[] = [];

    // List top contributing factors
    const factorRankings = [
      { name: 'reasoning', value: factors.reasoning },
      { name: 'domain expertise', value: factors.domain },
      { name: 'technical depth', value: factors.technical },
      { name: 'content length', value: factors.length },
      { name: 'structure clarity', value: 10 - factors.structured }, // Inverse: higher = clearer
    ].sort((a, b) => b.value - a.value);

    // Top 2-3 factors
    if (factorRankings[0].value > 6) {
      parts.push(`primarily requires ${factorRankings[0].name}`);
    }
    if (factorRankings[1].value > 6) {
      parts.push(`also involves ${factorRankings[1].name}`);
    }
    if (factorRankings[2].value > 6 && parts.length < 2) {
      parts.push(`plus ${factorRankings[2].name}`);
    }

    if (parts.length === 0) {
      return `${category} task requiring straightforward processing`;
    }

    return parts.join(', ');
  }

  /**
   * Determine recommended model tier based on complexity + quality + percentile
   */
  getRecommendedModel(
    complexity: ComplexityProfile,
    qualityRequirement: number
  ): 'haiku' | 'sonnet' | 'opus' | 'fable' {
    // Expert-level tasks or very high quality requirement
    if ((complexity.score >= 8 && qualityRequirement >= 7) || qualityRequirement >= 9) {
      return 'fable';
    }

    // Complex tasks or high quality requirement
    if (complexity.score >= 6.5 || qualityRequirement >= 8) {
      return 'opus';
    }

    // Moderate complexity or medium quality requirement
    if (complexity.score >= 3.5 || qualityRequirement >= 6) {
      return 'sonnet';
    }

    // Simple/trivial tasks with low quality requirement
    return 'haiku';
  }

  /**
   * Get calibration statistics
   */
  getCalibrationStats() {
    if (this.calibrationHistory.length === 0) {
      return {
        totalPoints: 0,
        successRate: 0,
        averageQuality: 0,
        averageExecutionTime: 0,
      };
    }

    const successful = this.calibrationHistory.filter(c => c.success).length;
    const avgQuality = this.calibrationHistory.reduce((sum, c) => sum + c.qualityScore, 0) / this.calibrationHistory.length;
    const avgExecTime = this.calibrationHistory.reduce((sum, c) => sum + c.executionTime, 0) / this.calibrationHistory.length;

    return {
      totalPoints: this.calibrationHistory.length,
      successRate: successful / this.calibrationHistory.length,
      averageQuality: avgQuality,
      averageExecutionTime: avgExecTime,
    };
  }

  /**
   * Clear calibration data
   */
  clearCalibration(): void {
    this.calibrationHistory = [];
    this.complexityDistribution = [];
  }
}

export default ComplexityAnalyzer;
