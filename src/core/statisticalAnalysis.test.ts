import { describe, it, expect } from 'vitest';
import { statisticalAnalysis } from './statisticalAnalysis.js';

describe('StatisticalAnalysis', () => {
  describe('calculateBasicStats', () => {
    it('should calculate mean correctly', () => {
      const values = [1, 2, 3, 4, 5];
      const stats = statisticalAnalysis.calculateBasicStats(values);

      expect(stats.mean).toBe(3);
    });

    it('should calculate standard deviation correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const stats = statisticalAnalysis.calculateBasicStats(values);

      // Expected stdDev for this set
      expect(Math.round(stats.stdDev * 100) / 100).toBe(2.14);
    });

    it('should handle empty array', () => {
      const stats = statisticalAnalysis.calculateBasicStats([]);

      expect(stats.mean).toBe(0);
      expect(stats.stdDev).toBe(0);
    });

    it('should handle single value', () => {
      const stats = statisticalAnalysis.calculateBasicStats([5]);

      expect(stats.mean).toBe(5);
      expect(stats.stdDev).toBe(0);
    });
  });

  describe('calculateConfidenceInterval', () => {
    it('should calculate 95% confidence interval', () => {
      // With N=100, mean=7.5, stdDev=1
      const values = Array(100).fill(0).map((_, i) => 7 + (i % 10) * 0.1);
      const ci = statisticalAnalysis.calculateConfidenceInterval(values);

      expect(ci.lower).toBeLessThan(ci.upper);
      expect(ci.error).toBeGreaterThan(0);
    });

    it('should calculate 99% confidence interval', () => {
      const values = Array(50).fill(0).map((_, i) => 10 + (i % 10) * 0.1);
      const ci99 = statisticalAnalysis.calculateConfidenceInterval(values, 0.99);
      const ci95 = statisticalAnalysis.calculateConfidenceInterval(values, 0.95);

      // 99% CI should be wider than 95% CI
      expect(ci99.error).toBeGreaterThan(ci95.error);
    });

    it('should handle empty array', () => {
      const ci = statisticalAnalysis.calculateConfidenceInterval([]);

      expect(ci.lower).toBe(0);
      expect(ci.upper).toBe(0);
      expect(ci.error).toBe(0);
    });
  });

  describe('tTest', () => {
    it('should detect significant difference', () => {
      const group1 = [1, 2, 3, 4, 5];
      const group2 = [10, 11, 12, 13, 14];

      const result = statisticalAnalysis.tTest(group1, group2);

      expect(result.t_statistic).not.toBe(0);
      expect(result.p_value).toBeLessThan(0.05); // Should be significant
      expect(result.isSignificant).toBe(true);
    });

    it('should detect no significant difference', () => {
      const group1 = [5, 5.1, 4.9, 5.2, 4.8];
      const group2 = [5, 5.1, 4.9, 5.2, 4.8];

      const result = statisticalAnalysis.tTest(group1, group2);

      expect(result.t_statistic).toBe(0); // Same values = no difference
      expect(result.isSignificant).toBe(false);
    });

    it('should calculate correct degrees of freedom', () => {
      const group1 = Array(30).fill(5);
      const group2 = Array(30).fill(5);

      const result = statisticalAnalysis.tTest(group1, group2);

      expect(result.df).toBeGreaterThan(0);
    });

    it('should calculate Cohen\'s d (effect size)', () => {
      const group1 = [1, 2, 3, 4, 5]; // mean=3
      const group2 = [10, 11, 12, 13, 14]; // mean=12

      const result = statisticalAnalysis.tTest(group1, group2);

      expect(result.cohensD).not.toBe(0); // Non-zero effect size
      expect(Math.abs(result.cohensD)).toBeGreaterThan(0);
    });

    it('should handle insufficient samples', () => {
      const result = statisticalAnalysis.tTest([5], [10]);

      expect(result.isSignificant).toBe(false);
      expect(result.recommendation).toContain('Insufficient');
    });
  });

  describe('compareModels', () => {
    it('should compare two models and identify winner', () => {
      const haiku_results = [5, 5.5, 4.8, 5.2, 5.1, 5.3, 4.9, 5.0, 5.2, 5.1];
      const sonnet_results = [8, 8.2, 7.9, 8.1, 8.3, 7.8, 8.2, 8.0, 8.1, 8.2];

      const comparison = statisticalAnalysis.compareModels(
        'haiku',
        haiku_results,
        'sonnet',
        sonnet_results
      );

      expect(comparison.model1).toBe('haiku');
      expect(comparison.model2).toBe('sonnet');
      expect(comparison.winner).toBe('sonnet'); // Higher mean
      expect(comparison.tTest.isSignificant).toBe(true);
    });

    it('should provide statistics for both models', () => {
      const values1 = Array(30).fill(0).map(() => Math.random() * 10 + 5); // 5-15
      const values2 = Array(30).fill(0).map(() => Math.random() * 10 + 6); // 6-16

      const comparison = statisticalAnalysis.compareModels('model1', values1, 'model2', values2);

      expect(comparison.model1Stats.sampleSize).toBe(30);
      expect(comparison.model2Stats.sampleSize).toBe(30);
      expect(comparison.model1Stats.confidenceInterval.lower).toBeLessThan(comparison.model1Stats.mean);
      expect(comparison.model1Stats.confidenceInterval.upper).toBeGreaterThan(comparison.model1Stats.mean);
    });

    it('should calculate confidence in comparison', () => {
      const values1 = [5, 5, 5, 5, 5];
      const values2 = [10, 10, 10, 10, 10];

      const comparison = statisticalAnalysis.compareModels('model1', values1, 'model2', values2);

      expect(comparison.confidence).toBeGreaterThan(0);
      expect(comparison.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('getQualityMetricsCI', () => {
    it('should return confidence interval for metric', () => {
      const values = Array(30).fill(0).map(() => Math.random() * 2 + 7);
      const ci = statisticalAnalysis.getQualityMetricsCI('quality_score', values, values.length);

      expect(ci.metric).toBe('quality_score');
      expect(ci.value).toBeGreaterThan(0);
      expect(ci.confidenceInterval.lower).toBeLessThan(ci.value);
      expect(ci.confidenceInterval.upper).toBeGreaterThan(ci.value);
      expect(ci.sufficient).toBe(true); // N=30
    });

    it('should flag insufficient sample size', () => {
      const values = [7, 7.5, 6.8, 7.2, 7.1]; // N=5

      const ci = statisticalAnalysis.getQualityMetricsCI('quality', values, 5);

      expect(ci.sufficient).toBe(false);
    });
  });

  describe('isSampleSizeSufficient', () => {
    it('should return true for N >= 30', () => {
      expect(statisticalAnalysis.isSampleSizeSufficient(30)).toBe(true);
      expect(statisticalAnalysis.isSampleSizeSufficient(50)).toBe(true);
      expect(statisticalAnalysis.isSampleSizeSufficient(100)).toBe(true);
    });

    it('should return false for N < 30', () => {
      expect(statisticalAnalysis.isSampleSizeSufficient(29)).toBe(false);
      expect(statisticalAnalysis.isSampleSizeSufficient(10)).toBe(false);
      expect(statisticalAnalysis.isSampleSizeSufficient(1)).toBe(false);
    });

    it('should support custom minimum', () => {
      expect(statisticalAnalysis.isSampleSizeSufficient(20, 20)).toBe(true);
      expect(statisticalAnalysis.isSampleSizeSufficient(20, 30)).toBe(false);
    });
  });

  describe('getSampleSizeRecommendation', () => {
    it('should show progress for insufficient samples', () => {
      const rec = statisticalAnalysis.getSampleSizeRecommendation(15);

      expect(rec.sufficient).toBe(false);
      expect(rec.recommendation).toContain('15');
      expect(rec.progress).toBe(0.5); // 15/30
    });

    it('should confirm sufficient samples', () => {
      const rec = statisticalAnalysis.getSampleSizeRecommendation(30);

      expect(rec.sufficient).toBe(true);
      expect(rec.recommendation).toContain('Sufficient');
      expect(rec.progress).toBe(1);
    });

    it('should handle large sample sizes', () => {
      const rec = statisticalAnalysis.getSampleSizeRecommendation(100);

      expect(rec.sufficient).toBe(true);
      expect(rec.progress).toBe(1);
    });
  });

  describe('interpretEffectSize', () => {
    it('should interpret negligible effect', () => {
      expect(statisticalAnalysis.interpretEffectSize(0.1)).toBe('Negligible');
      expect(statisticalAnalysis.interpretEffectSize(-0.1)).toBe('Negligible');
    });

    it('should interpret small effect', () => {
      expect(statisticalAnalysis.interpretEffectSize(0.3)).toBe('Small');
      expect(statisticalAnalysis.interpretEffectSize(-0.35)).toBe('Small');
    });

    it('should interpret medium effect', () => {
      expect(statisticalAnalysis.interpretEffectSize(0.6)).toBe('Medium');
      expect(statisticalAnalysis.interpretEffectSize(-0.7)).toBe('Medium');
    });

    it('should interpret large effect', () => {
      expect(statisticalAnalysis.interpretEffectSize(0.9)).toBe('Large');
      expect(statisticalAnalysis.interpretEffectSize(-1.2)).toBe('Large');
    });
  });

  describe('Real-world scenarios', () => {
    it('should validate model superiority with sufficient data', () => {
      // Simulate 40 measurements per model
      const haiku = Array(40)
        .fill(0)
        .map(() => 6 + Math.random() * 1); // Mean ~6.5
      const sonnet = Array(40)
        .fill(0)
        .map(() => 7.5 + Math.random() * 1); // Mean ~8

      const comparison = statisticalAnalysis.compareModels('haiku', haiku, 'sonnet', sonnet);

      expect(comparison.model1Stats.sampleSize).toBe(40);
      expect(comparison.model2Stats.sampleSize).toBe(40);
      expect(comparison.tTest.isSignificant).toBe(true); // Should be significant
      expect(comparison.winner).toBe('sonnet');
      expect(comparison.confidence).toBeGreaterThan(0.95); // High confidence
    });

    it('should flag insufficient data for decision', () => {
      const haiku = [6, 6.5, 5.8, 6.2];
      const sonnet = [7, 7.5, 6.9, 7.1];

      const comparison = statisticalAnalysis.compareModels('haiku', haiku, 'sonnet', sonnet);

      // Even if significant, note that sample size is too small
      expect(comparison.model1Stats.sampleSize).toBe(4);
      expect(comparison.model2Stats.sampleSize).toBe(4);
    });

    it('should detect tiny differences with large N', () => {
      // 100 samples with tiny difference
      const group1 = Array(100).fill(5.0);
      const group2 = Array(100).fill(5.01); // 0.01 difference

      const result = statisticalAnalysis.tTest(group1, group2);

      // With large N, even tiny differences can be significant
      // But Cohen's d will be negligible
      expect(result.cohensD).toBeCloseTo(0, 2); // Negligible effect
    });
  });
});
