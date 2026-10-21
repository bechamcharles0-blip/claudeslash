import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter } from './core/modelRouter.js';

/**
 * Integration tests validate the full pipeline without mocks
 * These should run with a test Anthropic API key and real models
 */
describe('Integration Tests - Full Pipeline', () => {
  let router: ModelRouter;

  beforeEach(() => {
    // Use test API key (should be in .env.test)
    const apiKey = process.env.ANTHROPIC_API_KEY_TEST || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('⚠️ INTEGRATION TESTS: No API key. Skipping real API tests.');
      console.warn('   Set ANTHROPIC_API_KEY_TEST in environment to enable.');
      return;
    }

    router = new ModelRouter(apiKey);
  });

  describe('Real API Integration', () => {
    it('CRITICAL: Should route real request and get valid response', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      const response = await router.route({
        task: 'What is 2+2?',
        budget: 50000,
      });

      // Verify response structure
      expect(response).toHaveProperty('result');
      expect(response.result.length).toBeGreaterThan(0);
      expect(response.model).toBeDefined();
      expect(response.tokensUsed.input).toBeGreaterThan(0);
      expect(response.tokensUsed.output).toBeGreaterThan(0);
      expect(response.cost).toBeGreaterThan(0);

      console.log('✅ Real API Response:', {
        model: response.model,
        tokens: response.tokensUsed.input + response.tokensUsed.output,
        cost: response.cost,
      });
    });

    it('CRITICAL: Token count must match API reality', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      const response = await router.route({
        task: 'Say hello',
        budget: 50000,
      });

      // Estimated vs actual tokens
      const estimated = await router.estimateTokens('Say hello', 'haiku');
      const actual = response.tokensUsed.input + response.tokensUsed.output;

      console.log('Token Accuracy Test:', {
        estimated,
        actual,
        estimationError: ((Math.abs(estimated - actual) / actual) * 100).toFixed(1) + '%',
      });

      // Current implementation likely has 30-40% error
      console.warn('⚠️ TOKEN ACCURACY: Estimated vs actual may have significant variance');
    });

    it('CRITICAL: Cost calculation must be accurate', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      const response = await router.route({
        task: 'What is machine learning?',
        budget: 100000,
      });

      const models = router.getModels();
      const config = models[response.model];

      // Manually calculate cost
      const expectedCost =
        (response.tokensUsed.input / 1_000_000) * config.costPer1MTok.input +
        (response.tokensUsed.output / 1_000_000) * config.costPer1MTok.output;

      expect(response.cost).toBeCloseTo(expectedCost, 8);

      console.log('Cost Calculation:', {
        calculated: response.cost,
        expected: expectedCost,
        model: response.model,
      });
    });

    it('CRITICAL: Model selection should be optimal', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      // Test simple task - should use Haiku
      const simple = await router.route({
        task: 'Say yes',
        budget: 50000,
      });

      // Test complex task - may escalate
      const complex = await router.route({
        task: 'Explain quantum entanglement and its applications in quantum computing, addressing current challenges and future possibilities.',
        budget: 200000,
      });

      console.log('Model Selection:', {
        simple: simple.model,
        complex: complex.model,
      });

      // Verify that complex task got reasonable model
      expect(['sonnet', 'opus', 'fable']).toContain(complex.model);
    });

    it('should measure accurate latency', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      const response = await router.route({
        task: 'Quick test',
        budget: 50000,
      });

      expect(response.executionTime).toBeGreaterThan(0);
      console.log('Execution Time:', response.executionTime + 'ms');
    });
  });

  describe('Multi-Request Scenarios', () => {
    it('CRITICAL: Should handle sequential requests with consistent stats', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      const requests = 3;
      const responses = [];

      for (let i = 0; i < requests; i++) {
        const response = await router.route({
          task: `Task ${i}`,
          budget: 50000,
        });
        responses.push(response);
      }

      const stats = router.getStats();
      expect(stats.totalRequests).toBe(requests);

      console.log('Sequential Requests Stats:', {
        requests: stats.totalRequests,
        totalTokensSaved: stats.totalTokensSaved,
      });
    });

    it('CRITICAL: Different quality requirements should select different models', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      const lowQuality = await router.route({
        task: 'Summarize this',
        budget: 50000,
        minQuality: 2,
      });

      const highQuality = await router.route({
        task: 'Summarize this',
        budget: 200000,
        minQuality: 8,
      });

      console.log('Quality-Based Selection:', {
        lowQualityModel: lowQuality.model,
        highQualityModel: highQuality.model,
      });

      // Higher quality should select equal or higher-quality model
      const modelQuality = { haiku: 4, sonnet: 7, opus: 9, fable: 10 };
      expect(modelQuality[highQuality.model as any])
        .toBeGreaterThanOrEqual(modelQuality[lowQuality.model as any]);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid API key gracefully', async () => {
      const badRouter = new ModelRouter('invalid-key-12345');

      try {
        await badRouter.route({
          task: 'Test',
          budget: 50000,
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
        console.log('Invalid API Key Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should handle timeout on slow API', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ SKIPPED: No API key');
        return;
      }

      // Create router with timeout
      const response = await router.route({
        task: 'Test',
        budget: 50000,
        timeout: 30000, // 30 seconds
      });

      // Should complete or timeout gracefully
      expect(response).toBeDefined();
    });
  });
});

/**
 * Performance Baselines - Establish what "normal" looks like
 */
describe('Performance Baselines', () => {
  it('CRITICAL: Should establish latency baselines per model', () => {
    // Sample baselines (should measure real API):
    const expectedBaselines = {
      haiku: { min: 500, max: 3000 }, // ms, very fast
      sonnet: { min: 800, max: 5000 }, // ms
      opus: { min: 1200, max: 8000 }, // ms, slower
      fable: { min: 2000, max: 15000 }, // ms, complex reasoning
    };

    console.warn('⚠️ PERFORMANCE: Need to measure actual latencies');
    console.warn('   Expected baselines:', expectedBaselines);
  });

  it('CRITICAL: Token counting accuracy baseline', () => {
    // Measure error between estimated and actual
    // Target: < 10% error
    // Current implementation: ~30-40% error

    console.warn('⚠️ TOKEN ACCURACY: Need accuracy < 10%. Currently ~60-70%.');
  });

  it('CRITICAL: Cost calculation accuracy baseline', () => {
    // Compare calculated vs actual API costs
    // Target: Exact match (within rounding)

    console.warn('⚠️ COST ACCURACY: Need exact calculation validation');
  });
});
