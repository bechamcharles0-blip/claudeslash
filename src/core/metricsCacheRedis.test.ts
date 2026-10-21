import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { metricsCacheRedis } from './metricsCacheRedis.js';

describe('MetricsCacheRedis', () => {
  beforeEach(() => {
    metricsCacheRedis.clear();
    metricsCacheRedis.stopAutoUpdate();
  });

  afterEach(() => {
    metricsCacheRedis.stopAutoUpdate();
  });

  it('should return cached metrics with sparklines', async () => {
    // Mock stats callback
    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 100,
      totalTokensSaved: 5000,
      totalCostSaved: 50.25,
      modelUsage: { haiku: 40, sonnet: 50, opus: 10, fable: 0 },
      averageQuality: 7.5,
      escalationRate: 0.05,
    }));

    // Mock data quality callback
    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 98.5,
    }));

    const metrics = await metricsCacheRedis.getMetrics();

    expect(metrics.totalRequests).toBe(100);
    expect(metrics.totalTokensSaved).toBe(5000);
    expect(metrics.totalCostSaved).toBe(50.25);
    expect(metrics.averageQuality).toBe(7.5);
    expect(metrics.validationRate).toBe(98.5);
    expect(metrics.sparklines).toBeDefined();
    expect(metrics.lastUpdated).toBeGreaterThan(0);
  });

  it('should return cache hit for fresh data', async () => {
    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 50,
      totalTokensSaved: 2000,
      totalCostSaved: 20,
      modelUsage: { haiku: 20, sonnet: 20, opus: 10, fable: 0 },
      averageQuality: 6.5,
      escalationRate: 0.02,
    }));

    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 99,
    }));

    // First call - cache miss
    const firstCall = await metricsCacheRedis.getMetrics();
    expect(firstCall.cacheHit).toBe(false);

    // Second call immediately - cache hit
    const secondCall = await metricsCacheRedis.getMetrics();
    expect(secondCall.cacheHit).toBe(true);
    expect(secondCall.totalRequests).toBe(firstCall.totalRequests);
  });

  it('should build sparkline data from snapshots', async () => {
    let callCount = 0;
    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 10 + callCount * 5,
      totalTokensSaved: 500 + callCount * 100,
      totalCostSaved: 5 + callCount * 0.5,
      modelUsage: { haiku: 5, sonnet: 3, opus: 2, fable: 0 },
      averageQuality: 7 + callCount * 0.1,
      escalationRate: 0.01,
    }));

    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 98 + callCount,
    }));

    // Simulate multiple updates
    for (let i = 0; i < 5; i++) {
      await metricsCacheRedis.updateMetrics();
      callCount++;
    }

    const metrics = await metricsCacheRedis.getMetrics();

    // Should have sparkline data
    expect(metrics.sparklines.requestsPerMinute.length).toBeGreaterThan(0);
    expect(metrics.sparklines.costSavedPerMinute.length).toBeGreaterThan(0);
    expect(metrics.sparklines.qualityTrend.length).toBeGreaterThan(0);
    expect(metrics.sparklines.validationRateTrend.length).toBeGreaterThan(0);

    // Model trend should exist
    expect(Object.keys(metrics.sparklines.modelUsageTrend).length).toBeGreaterThan(0);
  });

  it('should track response time', async () => {
    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 100,
      totalTokensSaved: 5000,
      totalCostSaved: 50,
      modelUsage: {},
      averageQuality: 7,
      escalationRate: 0.05,
    }));

    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 98,
    }));

    const metrics = await metricsCacheRedis.getMetrics();

    expect(metrics.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(metrics.responseTimeMs).toBeLessThan(100); // Should be fast
  });

  it('should return cache statistics', () => {
    const stats = metricsCacheRedis.getCacheStats();

    expect(stats).toHaveProperty('cacheSize');
    expect(stats).toHaveProperty('lastUpdate');
    expect(stats).toHaveProperty('isStale');
    expect(stats).toHaveProperty('ttl');
    expect(stats).toHaveProperty('snapshotCount');
  });

  it('should clear cache and snapshots', async () => {
    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 50,
      totalTokensSaved: 2000,
      totalCostSaved: 20,
      modelUsage: {},
      averageQuality: 6.5,
      escalationRate: 0.02,
    }));

    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 99,
    }));

    await metricsCacheRedis.updateMetrics();
    let stats = metricsCacheRedis.getCacheStats();
    expect(stats.snapshotCount).toBeGreaterThan(0);

    metricsCacheRedis.clear();
    stats = metricsCacheRedis.getCacheStats();
    expect(stats.snapshotCount).toBe(0);
  });

  it('should handle missing callbacks gracefully', async () => {
    // Don't set callbacks
    await expect(metricsCacheRedis.updateMetrics()).resolves.not.toThrow();
  });

  it('should set custom TTL', () => {
    metricsCacheRedis.setCacheTTL(5000); // 5 seconds
    const stats = metricsCacheRedis.getCacheStats();
    expect(stats.ttl).toBe(5000);
  });

  it('should detect stale cache', async () => {
    metricsCacheRedis.setCacheTTL(1); // 1ms TTL

    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 50,
      totalTokensSaved: 2000,
      totalCostSaved: 20,
      modelUsage: {},
      averageQuality: 6.5,
      escalationRate: 0.02,
    }));

    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 99,
    }));

    await metricsCacheRedis.updateMetrics();

    // Wait for cache to go stale
    await new Promise(resolve => setTimeout(resolve, 10));

    const stats = metricsCacheRedis.getCacheStats();
    expect(stats.isStale).toBe(true);
  });

  it('should pad sparklines to max length', async () => {
    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 100,
      totalTokensSaved: 5000,
      totalCostSaved: 50,
      modelUsage: { haiku: 50, sonnet: 40, opus: 10, fable: 0 },
      averageQuality: 7.5,
      escalationRate: 0.05,
    }));

    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 98,
    }));

    // Single update
    await metricsCacheRedis.updateMetrics();

    const metrics = await metricsCacheRedis.getMetrics();

    // Sparklines should be padded to 60 points
    expect(metrics.sparklines.requestsPerMinute.length).toBe(60);
    expect(metrics.sparklines.costSavedPerMinute.length).toBe(60);
    expect(metrics.sparklines.qualityTrend.length).toBe(60);
    expect(metrics.sparklines.validationRateTrend.length).toBe(60);
  });

  it('should maintain snapshot history up to max', async () => {
    metricsCacheRedis.setGetStatsCallback(() => ({
      totalRequests: 10,
      totalTokensSaved: 500,
      totalCostSaved: 5,
      modelUsage: {},
      averageQuality: 7,
      escalationRate: 0.01,
    }));

    metricsCacheRedis.setGetDataQualityCallback(() => ({
      validationRate: 98,
    }));

    // Add 100 snapshots (more than max of 60)
    for (let i = 0; i < 100; i++) {
      await metricsCacheRedis.updateMetrics();
    }

    const stats = metricsCacheRedis.getCacheStats();
    expect(stats.snapshotCount).toBeLessThanOrEqual(60); // Should trim to max
    expect(stats.snapshotCount).toBeGreaterThan(0);
  });
});
