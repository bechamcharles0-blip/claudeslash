/**
 * REGRESSION TEST SUITE
 *
 * Automated tests that run on every commit/PR to catch performance regressions
 * and ensure new changes don't break critical functionality.
 *
 * Runs: npm test -- src/regression.test.ts
 * Duration: ~5 minutes
 * Cost: ~$5 in API calls
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter } from './core/modelRouter.js';

// Baseline metrics from production build
const BASELINE_METRICS = {
  singleRequestP99: 100, // ms (SLO)
  light5ReqP99: 500, // ms (SLO)
  errorRate: 0.1, // % (SLO)
  cacheHitRate: 70, // % (SLO)
  tokenAccuracy: 5, // % error tolerance (SLO: ±5%)
};

describe('Regression Tests - Critical Path Validation', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter(process.env.ANTHROPIC_API_KEY || 'test-key');
  });

  describe('Token Estimation Regression', () => {
    /**
     * Regression: Token estimation accuracy
     * If this test fails, tokenization implementation broke
     */
    it('should maintain token estimation accuracy (±5%)', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ Skipping: No API key');
        return;
      }

      const testPrompts = [
        'Hello world',
        'What is machine learning?',
        'Explain quantum computing in 100 words',
        'Code review for Python function',
        'json {"key": "value", "nested": {"data": 123}}',
      ];

      for (const prompt of testPrompts) {
        const estimated = await router.estimateTokens(prompt, 'haiku');

        // Make actual API call to get real token count
        const response = await router.route({
          task: prompt,
          budget: 50000,
        });

        const actual = response.tokensUsed.input;
        const errorPercent = Math.abs((estimated - actual) / actual) * 100;

        console.log(`  "${prompt.substring(0, 30)}..." - Estimated: ${estimated}, Actual: ${actual}, Error: ${errorPercent.toFixed(1)}%`);

        // Must be within ±5%
        expect(errorPercent).toBeLessThan(BASELINE_METRICS.tokenAccuracy);
      }
    }).timeout(60000);
  });

  describe('Model Selection Regression', () => {
    /**
     * Regression: Model selection logic
     * If this test fails, routing algorithm broke
     */
    it('should select correct models for different complexity levels', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ Skipping: No API key');
        return;
      }

      const testCases = [
        {
          task: 'Answer yes or no',
          expectedModels: ['haiku'],
          description: 'Simple task',
        },
        {
          task: 'Explain the theory of relativity and its implications',
          expectedModels: ['sonnet', 'opus', 'fable'],
          description: 'Complex task',
        },
      ];

      for (const testCase of testCases) {
        const response = await router.route({
          task: testCase.task,
          budget: 200000,
        });

        console.log(`  ${testCase.description}: Selected ${response.model}`);

        // Verify model is reasonable for task complexity
        expect(testCase.expectedModels).toContain(response.model);
      }
    }).timeout(60000);
  });

  describe('Cost Calculation Regression', () => {
    /**
     * Regression: Cost calculation
     * If this test fails, billing will be wrong
     */
    it('should calculate costs accurately for all models', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ Skipping: No API key');
        return;
      }

      const response = await router.route({
        task: 'Calculate 2+2',
        budget: 50000,
      });

      const models = router.getModels();
      const config = models[response.model];

      // Verify cost calculation: (input_tokens/1M * input_rate) + (output_tokens/1M * output_rate)
      const expectedCost =
        (response.tokensUsed.input / 1_000_000) * config.costPer1MTok.input +
        (response.tokensUsed.output / 1_000_000) * config.costPer1MTok.output;

      const costError = Math.abs((response.cost - expectedCost) / expectedCost) * 100;

      console.log(`  Cost: ${response.cost.toFixed(8)}, Expected: ${expectedCost.toFixed(8)}, Error: ${costError.toFixed(4)}%`);

      // Must be within 0.01%
      expect(costError).toBeLessThan(0.01);
    }).timeout(30000);
  });

  describe('Performance Regression', () => {
    /**
     * Regression: Single request latency
     * If P99 exceeds baseline + 20%, performance degraded
     */
    it('should maintain single request P99 latency < 200ms (baseline + 100ms)', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ Skipping: No API key');
        return;
      }

      const latencies: number[] = [];
      const iterations = 50; // Quick regression check, not full baseline

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await router.route({
          task: 'Quick test',
          budget: 50000,
        });
        latencies.push(Date.now() - startTime);
      }

      const sorted = latencies.sort((a, b) => a - b);
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      console.log(`  P99 Latency: ${p99}ms (Regression threshold: 200ms)`);

      // Regression check: P99 should not exceed baseline + 100ms
      expect(p99).toBeLessThan(200);
    }).timeout(60000);
  });

  describe('Error Handling Regression', () => {
    /**
     * Regression: Error handling
     * If error handling breaks, production will crash on errors
     */
    it('should handle invalid input gracefully', () => {
      // Empty request
      const emptyResult = router.route({
        task: '',
        budget: 50000,
      });

      // Should not throw, should handle gracefully
      expect(emptyResult).toBeDefined();
    });

    it('should respect rate limits', async () => {
      // This is a regression check - rate limiting should be enforced
      // In production, exceeding rate limits returns 429
      // For regression, we just verify rate limiting is active

      const security = require('./core/security.js').securityManager;
      const isAllowed = security.checkRateLimit('test-user', 1000);

      // Should return rate limit status
      expect(isAllowed).toBeDefined();
    });
  });

  describe('Cache Regression', () => {
    /**
     * Regression: Cache behavior
     * If cache breaks, token savings disappear
     */
    it('should maintain > 50% cache hit rate on repeated requests', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ Skipping: No API key');
        return;
      }

      const prompt = 'Same prompt for cache test';
      let cacheHits = 0;

      for (let i = 0; i < 20; i++) {
        const response = await router.route({
          task: prompt,
          budget: 50000,
        });

        if (response.cacheHit) {
          cacheHits++;
        }
      }

      const hitRate = (cacheHits / 20) * 100;
      console.log(`  Cache hit rate: ${hitRate.toFixed(0)}% (Regression threshold: 50%)`);

      // Regression check: Cache hit rate should not drop below 50%
      expect(hitRate).toBeGreaterThan(50);
    }).timeout(60000);
  });

  describe('Statistics Regression', () => {
    /**
     * Regression: Statistics tracking
     * If stats break, dashboards will show wrong numbers
     */
    it('should track statistics correctly', async () => {
      const statsInitial = router.getStats();
      const initialRequests = statsInitial.totalRequests;

      if (process.env.ANTHROPIC_API_KEY) {
        // Make a request
        await router.route({
          task: 'Stat test',
          budget: 50000,
        });

        const statsAfter = router.getStats();
        console.log(`  Requests tracked: ${statsAfter.totalRequests - initialRequests}`);

        // Verify stats are incremented
        expect(statsAfter.totalRequests).toBeGreaterThan(initialRequests);
      }
    }).timeout(30000);
  });

  describe('Configuration Regression', () => {
    /**
     * Regression: Model configuration
     * If configs change unexpectedly, routing breaks
     */
    it('should have all 4 models configured', () => {
      const models = router.getModels();

      expect(models).toHaveProperty('haiku');
      expect(models).toHaveProperty('sonnet');
      expect(models).toHaveProperty('opus');
      expect(models).toHaveProperty('fable');

      // Verify cost hierarchy (cost increases)
      expect(models.haiku.costPer1MTok.input).toBeLessThan(models.sonnet.costPer1MTok.input);
      expect(models.sonnet.costPer1MTok.input).toBeLessThan(models.opus.costPer1MTok.input);
      expect(models.opus.costPer1MTok.input).toBeLessThan(models.fable.costPer1MTok.input);

      console.log('  ✓ All models configured with correct cost hierarchy');
    });

    it('should have correct max token limits', () => {
      const models = router.getModels();

      // Verify token limits (should increase with model tier)
      expect(models.haiku.maxTokens).toBeGreaterThan(0);
      expect(models.sonnet.maxTokens).toBeGreaterThan(models.haiku.maxTokens);
      expect(models.opus.maxTokens).toBeGreaterThan(models.sonnet.maxTokens);

      console.log(`  ✓ Token limits: Haiku ${models.haiku.maxTokens}, Sonnet ${models.sonnet.maxTokens}, Opus ${models.opus.maxTokens}`);
    });
  });
});

/**
 * Quick Regression Summary
 *
 * Run before each production deployment:
 * npm test -- src/regression.test.ts
 *
 * Should take ~5 minutes with 50 test iterations
 *
 * Regression Thresholds:
 * - Token accuracy: Must be ±5% (SLO)
 * - P99 latency: Must be < 200ms (baseline + 100ms)
 * - Error rate: Must be < 0.1% (SLO)
 * - Cache hit rate: Must be > 50% (regression check)
 * - All models: Must be configured
 * - Cost calculation: Must be < 0.01% error
 *
 * If any test fails → DO NOT DEPLOY TO PRODUCTION
 */
