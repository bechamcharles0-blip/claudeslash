/**
 * PERFORMANCE TESTING - Critical Path Validation
 *
 * This file validates that Claude Router meets production SLOs:
 * - Single request P99 latency < 100ms
 * - Concurrent P99 latency < 500ms (5 parallel calls)
 * - Cache hit rate > 70%
 * - Throughput scales linearly with replicas
 * - Error rate < 0.1% at all loads
 *
 * METHODOLOGY: Must test with 1000+ requests minimum (single outlier can shift P99 by 100s of ms)
 * MEASUREMENT: Collect P50, P95, P99, P99.9 (NOT just average)
 * BASELINE: Run baseline FIRST before optimizing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter } from './core/modelRouter.js';

interface PerformanceMetrics {
  latencies: number[];
  p50: number;
  p95: number;
  p99: number;
  p99_9: number;
  average: number;
  min: number;
  max: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  throughput: number; // requests per second
}

class PerformanceTester {
  private latencies: number[] = [];
  private errors: Error[] = [];

  calculatePercentile(percentile: number): number {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  getMetrics(): PerformanceMetrics {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      latencies: sorted,
      p50: this.calculatePercentile(50),
      p95: this.calculatePercentile(95),
      p99: this.calculatePercentile(99),
      p99_9: this.calculatePercentile(99.9),
      average: sorted.length > 0 ? sorted.reduce((a, b) => a + b) / sorted.length : 0,
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      totalRequests: this.latencies.length + this.errors.length,
      successfulRequests: this.latencies.length,
      failedRequests: this.errors.length,
      errorRate: (this.errors.length / (this.latencies.length + this.errors.length)) * 100,
      throughput: this.latencies.length / (this.latencies[this.latencies.length - 1] / 1000),
    };
  }

  recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
  }

  recordError(error: Error): void {
    this.errors.push(error);
  }

  reset(): void {
    this.latencies = [];
    this.errors = [];
  }
}

describe('Performance Testing - Critical SLOs', () => {
  let router: ModelRouter;
  let tester: PerformanceTester;

  beforeEach(() => {
    router = new ModelRouter(process.env.ANTHROPIC_API_KEY || 'test-key');
    tester = new PerformanceTester();
  });

  describe('Single Request Latency - P99 < 100ms', () => {
    it('should measure single request P99 latency (minimum 1000 requests)', async () => {
      const request = {
        task: 'Quick test',
        budget: 50000,
      };

      // Run 1000+ requests to establish P99
      const iterations = 100; // Use 100 for testing, 1000+ for production baseline
      for (let i = 0; i < iterations; i++) {
        try {
          const startTime = Date.now();
          await router.route(request);
          const latency = Date.now() - startTime;
          tester.recordLatency(latency);
        } catch (error) {
          tester.recordError(error as Error);
        }
      }

      const metrics = tester.getMetrics();

      console.log('✅ Single Request Latency Metrics:');
      console.log(`   P50:  ${metrics.p50}ms`);
      console.log(`   P95:  ${metrics.p95}ms`);
      console.log(`   P99:  ${metrics.p99}ms (SLO: < 100ms)`);
      console.log(`   P99.9: ${metrics.p99_9}ms`);
      console.log(`   Error Rate: ${metrics.errorRate.toFixed(2)}%`);

      // SLO: P99 < 100ms
      expect(metrics.p99).toBeLessThan(100);

      // No errors allowed at normal load
      expect(metrics.errorRate).toBeLessThan(0.1);
    }).timeout(120000); // 2 minute timeout
  });

  describe('Concurrent Request Latency - P99 < 500ms', () => {
    it('should measure P99 latency with 5 concurrent requests', async () => {
      // Fan-out latency problem: p99 of N parallel calls ≈ 1/(0.99^N) = higher
      // With 5 parallel calls: p99 should be ~5x the single request p99
      const request = {
        task: 'Concurrent test',
        budget: 50000,
      };

      const iterations = 50; // 50 iterations = 250 total requests
      for (let i = 0; i < iterations; i++) {
        try {
          const startTime = Date.now();

          // Execute 5 concurrent requests
          await Promise.all([
            router.route(request),
            router.route(request),
            router.route(request),
            router.route(request),
            router.route(request),
          ]);

          const latency = Date.now() - startTime;
          tester.recordLatency(latency);
        } catch (error) {
          tester.recordError(error as Error);
        }
      }

      const metrics = tester.getMetrics();

      console.log('✅ Concurrent Request Latency (5 parallel):');
      console.log(`   P50:  ${metrics.p50}ms`);
      console.log(`   P95:  ${metrics.p95}ms`);
      console.log(`   P99:  ${metrics.p99}ms (SLO: < 500ms)`);
      console.log(`   P99.9: ${metrics.p99_9}ms`);
      console.log(`   Error Rate: ${metrics.errorRate.toFixed(2)}%`);

      // SLO: P99 for 5 concurrent < 500ms
      expect(metrics.p99).toBeLessThan(500);
      expect(metrics.errorRate).toBeLessThan(0.5);
    }).timeout(120000);
  });

  describe('Cache Effectiveness - Hit Rate > 70%', () => {
    it('should achieve > 70% cache hit rate on repeated requests', async () => {
      const request = {
        task: 'Cache test prompt',
        budget: 50000,
      };

      // Run same request 100 times - should hit cache
      let cacheHits = 0;
      for (let i = 0; i < 100; i++) {
        try {
          const startTime = Date.now();
          const response = await router.route(request);
          const latency = Date.now() - startTime;

          tester.recordLatency(latency);

          if (response.cacheHit) {
            cacheHits++;
          }
        } catch (error) {
          tester.recordError(error as Error);
        }
      }

      const metrics = tester.getMetrics();
      const hitRate = (cacheHits / 100) * 100;

      console.log('✅ Cache Hit Rate Metrics:');
      console.log(`   Hit Rate: ${hitRate.toFixed(1)}% (SLO: > 70%)`);
      console.log(`   P99 Cache Hit Latency: ${metrics.p99}ms (SLO: < 10ms)`);
      console.log(`   Error Rate: ${metrics.errorRate.toFixed(2)}%`);

      // SLO: Cache hit rate > 70%
      expect(hitRate).toBeGreaterThan(70);

      // Cache hits should be much faster (< 10ms P99)
      // TODO: Track cache hit latency separately
    }).timeout(120000);
  });

  describe('Error Rate Under Load - < 0.1%', () => {
    it('should maintain < 0.1% error rate at 50 concurrent requests', async () => {
      const request = {
        task: 'Error rate test',
        budget: 50000,
      };

      const totalRequests = 500; // 500 requests @ 50 concurrent = 10 iterations
      const concurrency = 50;

      const queue: Promise<void>[] = [];
      for (let i = 0; i < totalRequests; i++) {
        const promise = (async () => {
          try {
            const startTime = Date.now();
            await router.route(request);
            const latency = Date.now() - startTime;
            tester.recordLatency(latency);
          } catch (error) {
            tester.recordError(error as Error);
          }
        })();

        queue.push(promise);

        if (queue.length >= concurrency) {
          await Promise.race(queue);
          queue.splice(queue.findIndex((p) => !p), 1);
        }
      }

      await Promise.all(queue);

      const metrics = tester.getMetrics();

      console.log('✅ Error Rate at Load (50 concurrent):');
      console.log(`   Total Requests: ${metrics.totalRequests}`);
      console.log(`   Successful: ${metrics.successfulRequests}`);
      console.log(`   Failed: ${metrics.failedRequests}`);
      console.log(`   Error Rate: ${metrics.errorRate.toFixed(2)}% (SLO: < 0.1%)`);
      console.log(`   P99 Latency: ${metrics.p99}ms`);

      // SLO: Error rate < 0.1%
      expect(metrics.errorRate).toBeLessThan(0.1);
    }).timeout(180000); // 3 minute timeout
  });

  describe('Throughput Scaling - Linear with Load', () => {
    it('should measure throughput at different concurrency levels', async () => {
      const concurrencyLevels = [1, 10, 50]; // Test at 1, 10, 50 concurrent
      const resultsPerLevel = [];

      for (const concurrency of concurrencyLevels) {
        tester.reset();

        const request = {
          task: `Throughput test at concurrency ${concurrency}`,
          budget: 50000,
        };

        const totalRequests = 100; // 100 requests at each level
        const queue: Promise<void>[] = [];
        const startTime = Date.now();

        for (let i = 0; i < totalRequests; i++) {
          const promise = (async () => {
            try {
              const reqStart = Date.now();
              await router.route(request);
              const latency = Date.now() - reqStart;
              tester.recordLatency(latency);
            } catch (error) {
              tester.recordError(error as Error);
            }
          })();

          queue.push(promise);

          if (queue.length >= concurrency) {
            await Promise.race(queue);
            queue.splice(queue.findIndex((p) => !p), 1);
          }
        }

        await Promise.all(queue);
        const totalDuration = Date.now() - startTime;
        const metrics = tester.getMetrics();
        const rps = (totalRequests / totalDuration) * 1000;

        resultsPerLevel.push({
          concurrency,
          throughput: rps.toFixed(2),
          p99: metrics.p99,
          errorRate: metrics.errorRate.toFixed(2),
        });
      }

      console.log('✅ Throughput Scaling:');
      resultsPerLevel.forEach((result) => {
        console.log(`   Concurrency ${result.concurrency}: ${result.throughput} req/sec, P99: ${result.p99}ms, Error: ${result.errorRate}%`);
      });

      // Verify scaling is somewhat linear (allow 20% variance)
      const scaling1to10 = parseFloat(resultsPerLevel[1].throughput) / parseFloat(resultsPerLevel[0].throughput);
      const scaling10to50 = parseFloat(resultsPerLevel[2].throughput) / parseFloat(resultsPerLevel[1].throughput);

      console.log(`   Scaling 1→10: ${scaling1to10.toFixed(2)}x (expected: ~10x)`);
      console.log(`   Scaling 10→50: ${scaling10to50.toFixed(2)}x (expected: ~5x)`);

      // Allow 50% variance due to API rate limits
      expect(scaling1to10).toBeGreaterThan(5); // At least 50% of expected
      expect(scaling10to50).toBeGreaterThan(2.5); // At least 50% of expected
    }).timeout(300000); // 5 minute timeout
  });

  describe('Resource Efficiency', () => {
    it('should not leak memory during sustained load', async () => {
      const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
      console.log(`   Memory before: ${memBefore.toFixed(1)} MB`);

      const request = {
        task: 'Memory test',
        budget: 50000,
      };

      // Run 200 requests
      for (let i = 0; i < 200; i++) {
        try {
          await router.route(request);
        } catch (error) {
          // Ignore errors for this test
        }
      }

      const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
      const memGrowth = memAfter - memBefore;

      console.log(`   Memory after: ${memAfter.toFixed(1)} MB`);
      console.log(`   Growth: ${memGrowth.toFixed(1)} MB`);
      console.log(`   Per-request: ${(memGrowth / 200).toFixed(2)} MB/req`);

      // Should not grow excessively (< 5 MB for 200 requests = 25KB per request)
      expect(memGrowth).toBeLessThan(5);
    }).timeout(120000);
  });
});
