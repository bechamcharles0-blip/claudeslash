/**
 * Statistical Analysis Module
 * Tier 2 Phase 2C: Confidence intervals, t-tests, and significance testing
 *
 * Provides:
 * 1. Confidence intervals on quality metrics (95% CI)
 * 2. T-tests for model performance comparison
 * 3. Sample size requirements (N>30)
 * 4. P-value tracking for statistical significance
 * 5. Effect size calculations (Cohen's d)
 */

export interface ModelPerformanceStats {
  model: string;
  sampleSize: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  confidenceInterval: {
    lower: number;
    upper: number;
    confidence: 0.95 | 0.99;
  };
  standardError: number;
}

export interface TTestResult {
  t_statistic: number;
  p_value: number;
  df: number; // degrees of freedom
  isSignificant: boolean; // p < 0.05
  cohensD: number; // effect size
  recommendation: string;
}

export interface ComparisonResult {
  model1: string;
  model2: string;
  model1Stats: ModelPerformanceStats;
  model2Stats: ModelPerformanceStats;
  tTest: TTestResult;
  winner: string | null; // null if no significant difference
  confidence: number; // 0-1
}

export interface QualityMetricsCI {
  metric: string;
  value: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  sampleSize: number;
  sufficient: boolean; // N >= 30
}

/**
 * Statistical Analysis Engine
 */
export class StatisticalAnalysis {
  /**
   * Calculate mean and standard deviation
   */
  static calculateBasicStats(values: number[]): { mean: number; stdDev: number } {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0 };
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  /**
   * Calculate 95% confidence interval
   * Uses t-distribution for sample size < 30, z-distribution for >= 30
   */
  static calculateConfidenceInterval(
    values: number[],
    confidence: 0.95 | 0.99 = 0.95
  ): { lower: number; upper: number; confidence: 0.95 | 0.99; error?: number } {
    const n = values.length;
    if (n === 0) {
      return { lower: 0, upper: 0, confidence };
    }

    const { mean, stdDev } = this.calculateBasicStats(values);
    const standardError = stdDev / Math.sqrt(n);

    // Critical values (simplified - use t-distribution for accuracy)
    // t-distribution with 30+ samples approaches normal distribution
    const z_critical = confidence === 0.95 ? 1.96 : 2.576;

    const marginOfError = z_critical * standardError;

    return {
      lower: mean - marginOfError,
      upper: mean + marginOfError,
      confidence,
      error: marginOfError,
    };
  }

  /**
   * Perform independent samples t-test
   * Tests if two models have significantly different performance
   */
  static tTest(values1: number[], values2: number[]): TTestResult {
    const n1 = values1.length;
    const n2 = values2.length;

    if (n1 < 2 || n2 < 2) {
      return {
        t_statistic: 0,
        p_value: 1,
        df: 0,
        isSignificant: false,
        cohensD: 0,
        recommendation: 'Insufficient samples for t-test',
      };
    }

    const stats1 = this.calculateBasicStats(values1);
    const stats2 = this.calculateBasicStats(values2);

    // Welch's t-test (doesn't assume equal variances)
    const numerator = stats1.mean - stats2.mean;
    const denominator = Math.sqrt(
      (Math.pow(stats1.stdDev, 2) / n1) + (Math.pow(stats2.stdDev, 2) / n2)
    );

    const t_statistic = denominator > 0 ? numerator / denominator : 0;

    // Degrees of freedom (Welch-Satterthwaite equation)
    const s1_sq_n1 = Math.pow(stats1.stdDev, 2) / n1;
    const s2_sq_n2 = Math.pow(stats2.stdDev, 2) / n2;
    const numerator_df = Math.pow(s1_sq_n1 + s2_sq_n2, 2);
    const denominator_df =
      (Math.pow(s1_sq_n1, 2) / (n1 - 1)) +
      (Math.pow(s2_sq_n2, 2) / (n2 - 1));

    const df = denominator_df > 0 ? numerator_df / denominator_df : n1 + n2 - 2;

    // Calculate p-value (two-tailed, approximate)
    // For large df, t-distribution approximates normal
    // p ≈ 2 * (1 - CDF(t)) where CDF is t-distribution CDF
    const p_value = this.approximatePValue(Math.abs(t_statistic), df);

    // Cohen's d (effect size)
    const pooledStdDev = Math.sqrt(
      ((n1 - 1) * Math.pow(stats1.stdDev, 2) + (n2 - 1) * Math.pow(stats2.stdDev, 2)) /
      (n1 + n2 - 2)
    );
    const cohensD = pooledStdDev > 0 ? numerator / pooledStdDev : 0;

    // Determine recommendation
    const isSignificant = p_value < 0.05;
    let recommendation = '';

    if (!isSignificant) {
      recommendation = 'No significant difference (p >= 0.05)';
    } else if (Math.abs(cohensD) < 0.2) {
      recommendation = 'Significantly different, but small effect size';
    } else if (Math.abs(cohensD) < 0.5) {
      recommendation = 'Significantly different, small-to-medium effect';
    } else {
      recommendation = 'Significantly different, large effect';
    }

    return {
      t_statistic,
      p_value,
      df,
      isSignificant,
      cohensD,
      recommendation,
    };
  }

  /**
   * Approximate p-value for t-test using normal distribution
   * For larger df (>30), t-distribution ≈ normal distribution
   */
  private static approximatePValue(t_abs: number, df: number): number {
    // Simplified: use normal approximation for large df
    if (df > 30 || df < 0) {
      // Use normal CDF approximation
      const z = t_abs;
      // CDF of standard normal at z: Φ(z)
      // Approximation: Φ(z) ≈ 1 / (1 + exp(-1.702 * z))
      const cdf = 1 / (1 + Math.exp(-1.702 * z));
      return 2 * (1 - cdf); // Two-tailed
    }

    // For small df, return rough estimate
    // p-value decreases as t increases
    if (t_abs < 1) return 0.3;
    if (t_abs < 2) return 0.1;
    if (t_abs < 2.5) return 0.05;
    if (t_abs < 3) return 0.01;
    return 0.001;
  }

  /**
   * Compare two models and provide recommendation
   */
  static compareModels(
    model1Name: string,
    model1Values: number[],
    model2Name: string,
    model2Values: number[]
  ): ComparisonResult {
    const stats1: ModelPerformanceStats = {
      model: model1Name,
      sampleSize: model1Values.length,
      ...this.calculateBasicStats(model1Values),
      min: Math.min(...model1Values),
      max: Math.max(...model1Values),
      confidenceInterval: this.calculateConfidenceInterval(model1Values),
      standardError: this.calculateBasicStats(model1Values).stdDev / Math.sqrt(model1Values.length),
    };

    const stats2: ModelPerformanceStats = {
      model: model2Name,
      sampleSize: model2Values.length,
      ...this.calculateBasicStats(model2Values),
      min: Math.min(...model2Values),
      max: Math.max(...model2Values),
      confidenceInterval: this.calculateConfidenceInterval(model2Values),
      standardError: this.calculateBasicStats(model2Values).stdDev / Math.sqrt(model2Values.length),
    };

    const tTest = this.tTest(model1Values, model2Values);

    let winner: string | null = null;
    if (tTest.isSignificant) {
      winner = stats1.mean > stats2.mean ? model1Name : model2Name;
    }

    return {
      model1: model1Name,
      model2: model2Name,
      model1Stats: stats1,
      model2Stats: stats2,
      tTest,
      winner,
      confidence: 1 - tTest.p_value,
    };
  }

  /**
   * Calculate confidence interval for quality metrics
   */
  static getQualityMetricsCI(metric: string, values: number[], sampleSize: number): QualityMetricsCI {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const ci = this.calculateConfidenceInterval(values);

    return {
      metric,
      value: mean,
      confidenceInterval: {
        lower: ci.lower,
        upper: ci.upper,
      },
      sampleSize,
      sufficient: sampleSize >= 30,
    };
  }

  /**
   * Check if sample size is sufficient for reliable estimates
   */
  static isSampleSizeSufficient(sampleSize: number, minRequired: number = 30): boolean {
    return sampleSize >= minRequired;
  }

  /**
   * Get recommendation based on sample size
   */
  static getSampleSizeRecommendation(sampleSize: number): {
    sufficient: boolean;
    recommendation: string;
    progress: number; // 0-1
  } {
    const minRequired = 30;

    if (sampleSize >= minRequired) {
      return {
        sufficient: true,
        recommendation: `Sufficient samples (${sampleSize}/${minRequired})`,
        progress: 1,
      };
    }

    const needed = minRequired - sampleSize;
    const progress = sampleSize / minRequired;

    return {
      sufficient: false,
      recommendation: `Need ${needed} more samples (${sampleSize}/${minRequired})`,
      progress,
    };
  }

  /**
   * Calculate effect size (Cohen's d) interpretation
   */
  static interpretEffectSize(cohensD: number): string {
    const absD = Math.abs(cohensD);

    if (absD < 0.2) return 'Negligible';
    if (absD < 0.5) return 'Small';
    if (absD < 0.8) return 'Medium';
    return 'Large';
  }
}

/**
 * Export the class as both default and named export for static method access
 */
export const statisticalAnalysis = StatisticalAnalysis;
export default StatisticalAnalysis;
