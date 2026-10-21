import { ModelTier, EffortLevel } from '../types/index.js';

/**
 * FeedbackRecord: Structure for storing feedback about a request
 */
export interface FeedbackRecord {
  id: string;
  taskHash: string;
  model: ModelTier;
  effort: EffortLevel;
  complexity: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  qualityScore: number; // 1-10, assigned by user or system
  executionTime: number; // ms
  cost: number;
  escalated: boolean;
  escalationReason?: string;
  timestamp: number;
  feedbackNotes?: string;
}

/**
 * ModelPerformance: Aggregated performance metrics for a model at a complexity level
 */
export interface ModelPerformance {
  model: ModelTier;
  complexity: number; // Complexity level (1-10)
  totalRequests: number;
  successCount: number;
  successRate: number;
  averageQuality: number;
  averageExecutionTime: number;
  averageCost: number;
  averageTokensUsed: number;
  escalationRate: number;
}

/**
 * FeedbackLoop: Tracks request outcomes and learns optimal model selection
 *
 * Stores feedback about which models worked well for different task complexities.
 * Used by ModelSelector to make intelligent routing decisions.
 */
export class FeedbackLoop {
  private feedbackHistory: FeedbackRecord[] = [];
  private performanceCache: Map<string, ModelPerformance> = new Map();
  private maxHistorySize = 10000; // Keep last 10k records in memory

  /**
   * Record feedback for a completed request
   */
  recordFeedback(record: Omit<FeedbackRecord, 'id' | 'timestamp'>): FeedbackRecord {
    const fullRecord: FeedbackRecord = {
      ...record,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.feedbackHistory.push(fullRecord);

    // Trim history if needed
    if (this.feedbackHistory.length > this.maxHistorySize) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistorySize);
    }

    // Invalidate cache for this model+complexity
    const cacheKey = `${record.model}:${Math.floor(record.complexity)}`;
    this.performanceCache.delete(cacheKey);

    return fullRecord;
  }

  /**
   * Get performance metrics for a specific model at a complexity level
   */
  getModelPerformance(model: ModelTier, complexity: number): ModelPerformance | null {
    const cacheKey = `${model}:${Math.floor(complexity)}`;

    // Check cache
    if (this.performanceCache.has(cacheKey)) {
      return this.performanceCache.get(cacheKey)!;
    }

    // Calculate from history
    const complexityBand = Math.floor(complexity); // Group by complexity level
    const relevant = this.feedbackHistory.filter(
      record => record.model === model && Math.floor(record.complexity) === complexityBand
    );

    if (relevant.length === 0) {
      return null;
    }

    const successful = relevant.filter(r => r.success);
    const performance: ModelPerformance = {
      model,
      complexity: complexityBand,
      totalRequests: relevant.length,
      successCount: successful.length,
      successRate: successful.length / relevant.length,
      averageQuality: relevant.reduce((sum, r) => sum + r.qualityScore, 0) / relevant.length,
      averageExecutionTime: relevant.reduce((sum, r) => sum + r.executionTime, 0) / relevant.length,
      averageCost: relevant.reduce((sum, r) => sum + r.cost, 0) / relevant.length,
      averageTokensUsed: relevant.reduce((sum, r) => sum + (r.inputTokens + r.outputTokens), 0) / relevant.length,
      escalationRate: relevant.filter(r => r.escalated).length / relevant.length,
    };

    this.performanceCache.set(cacheKey, performance);
    return performance;
  }

  /**
   * Get all model performances for a complexity level
   */
  getAllModelPerformances(complexity: number): ModelPerformance[] {
    const models: ModelTier[] = ['haiku', 'sonnet', 'opus', 'fable'];
    const performances: ModelPerformance[] = [];

    for (const model of models) {
      const perf = this.getModelPerformance(model, complexity);
      if (perf) {
        performances.push(perf);
      }
    }

    return performances;
  }

  /**
   * Get the best model for a complexity level (based on success rate and quality)
   */
  getBestModel(complexity: number, qualityWeight: number = 0.5): ModelTier | null {
    const performances = this.getAllModelPerformances(complexity);

    if (performances.length === 0) {
      return null;
    }

    // Score: successRate * 0.4 + (averageQuality/10) * qualityWeight + (1-escalationRate) * 0.1
    const scored = performances.map(perf => ({
      model: perf.model,
      score:
        perf.successRate * 0.4 +
        (perf.averageQuality / 10) * qualityWeight +
        (1 - perf.escalationRate) * 0.1,
    }));

    // Sort by score and return best
    scored.sort((a, b) => b.score - a.score);
    return scored[0].model;
  }

  /**
   * Estimate cost for a model at a complexity level
   */
  getAverageCost(model: ModelTier, complexity: number): number | null {
    const perf = this.getModelPerformance(model, complexity);
    return perf ? perf.averageCost : null;
  }

  /**
   * Mark a request as successful (user gave it a high quality score)
   */
  markSuccess(taskHash: string, model: ModelTier, qualityScore: number): void {
    const record = this.feedbackHistory.find(
      r => r.taskHash === taskHash && r.model === model && !r.success
    );

    if (record) {
      record.success = true;
      record.qualityScore = qualityScore;

      // Invalidate cache
      const cacheKey = `${model}:${Math.floor(record.complexity)}`;
      this.performanceCache.delete(cacheKey);
    }
  }

  /**
   * Mark a request as failed
   */
  markFailure(taskHash: string, model: ModelTier, escalationReason: string): void {
    const record = this.feedbackHistory.find(
      r => r.taskHash === taskHash && r.model === model && !r.escalated
    );

    if (record) {
      record.escalated = true;
      record.escalationReason = escalationReason;

      // Invalidate cache
      const cacheKey = `${model}:${Math.floor(record.complexity)}`;
      this.performanceCache.delete(cacheKey);
    }
  }

  /**
   * Get statistics about feedback collection
   */
  getStats() {
    const byModel: Record<ModelTier, { count: number; successRate: number }> = {
      haiku: { count: 0, successRate: 0 },
      sonnet: { count: 0, successRate: 0 },
      opus: { count: 0, successRate: 0 },
      fable: { count: 0, successRate: 0 },
    };

    for (const model of Object.keys(byModel) as ModelTier[]) {
      const records = this.feedbackHistory.filter(r => r.model === model);
      const successful = records.filter(r => r.success).length;
      byModel[model] = {
        count: records.length,
        successRate: records.length > 0 ? successful / records.length : 0,
      };
    }

    return {
      totalRecords: this.feedbackHistory.length,
      byModel,
      averageQuality: this.feedbackHistory.length > 0
        ? this.feedbackHistory.reduce((sum, r) => sum + r.qualityScore, 0) / this.feedbackHistory.length
        : 0,
      overallSuccessRate: this.feedbackHistory.length > 0
        ? this.feedbackHistory.filter(r => r.success).length / this.feedbackHistory.length
        : 0,
    };
  }

  /**
   * Export feedback for analysis or storage
   */
  exportFeedback(limit?: number): FeedbackRecord[] {
    if (limit) {
      return this.feedbackHistory.slice(-limit);
    }
    return [...this.feedbackHistory];
  }

  /**
   * Import feedback from external source
   */
  importFeedback(records: FeedbackRecord[]): void {
    this.feedbackHistory.push(...records);

    // Trim if needed
    if (this.feedbackHistory.length > this.maxHistorySize) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistorySize);
    }

    // Clear cache
    this.performanceCache.clear();
  }

  /**
   * Clear all feedback
   */
  clearFeedback(): void {
    this.feedbackHistory = [];
    this.performanceCache.clear();
  }

  /**
   * Generate a stable hash of a task
   */
  hashTask(task: string): string {
    let hash = 0;
    for (let i = 0; i < task.length; i++) {
      const char = task.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default FeedbackLoop;
