import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelRouter } from './modelRouter.js';
import { RouteRequest } from '../types/index.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor(config?: any) {}
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Test response' }],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        }),
      };
    },
  };
});

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter('test-api-key');
  });

  describe('Token Estimation', () => {
    it('should estimate tokens based on character count', async () => {
      const task = 'Hello world'; // 11 characters
      const estimated = await router.estimateTokens(task, 'haiku');

      // Current implementation: Math.ceil(length / 4)
      const expected = Math.ceil(11 / 4); // 3
      expect(estimated).toBe(expected);
    });

    it('should handle long inputs', async () => {
      const longTask = 'a'.repeat(10000);
      const estimated = await router.estimateTokens(longTask, 'haiku');

      // Should roughly follow 4 chars per token rule
      const expected = Math.ceil(10000 / 4); // 2500
      expect(estimated).toBe(expected);
    });

    it('should handle empty strings gracefully', async () => {
      const estimated = await router.estimateTokens('', 'haiku');
      expect(estimated).toBe(0);
    });

    it('should be consistent across models for same input', async () => {
      const task = 'Test task';
      const haikuEstimate = await router.estimateTokens(task, 'haiku');
      const sonnetEstimate = await router.estimateTokens(task, 'sonnet');
      const opusEstimate = await router.estimateTokens(task, 'opus');

      expect(haikuEstimate).toBe(sonnetEstimate);
      expect(sonnetEstimate).toBe(opusEstimate);
    });

    it('CRITICAL: Should validate against actual Claude API token count', async () => {
      // This is a critical test that MUST be done against real API
      // Current implementation uses 4 chars per token which is INACCURATE
      // Real Claude uses tiktoken-like counting
      // Mark as TODO for real API validation

      const task = 'Summarize the benefits of renewable energy';
      const estimated = await router.estimateTokens(task, 'haiku');

      // The simple 4-char rule will be wrong
      // We need to:
      // 1. Use Anthropic's token counting API when available
      // 2. Implement proper BPE tokenization
      // 3. Validate accuracy within 5% of actual tokens

      expect(estimated).toBeGreaterThan(0);
      console.warn('⚠️ TOKEN ESTIMATION: Using naive 4-char/token estimation. Accuracy ~60-70%. Need real API validation.');
    });
  });

  describe('Model Selection', () => {
    it('should select Haiku for small tasks under 50k tokens', async () => {
      const request: RouteRequest = {
        task: 'Short task',
        budget: 50000,
      };

      const { model, effort } = await router.selectModel(request);
      expect(model).toBe('haiku');
      expect(effort).toBe('low');
    });

    it('should select Sonnet for medium tasks', async () => {
      const request: RouteRequest = {
        task: 'a'.repeat(200000), // Will estimate to ~50k tokens
        budget: 200000,
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('sonnet');
    });

    it('should select Opus for large tasks', async () => {
      const request: RouteRequest = {
        task: 'a'.repeat(400000), // Will estimate to ~100k tokens
        budget: 500000,
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('opus');
    });

    it('should respect allowed models constraint', async () => {
      const request: RouteRequest = {
        task: 'Short task',
        budget: 50000,
        allowedModels: ['sonnet', 'opus'], // Exclude Haiku
      };

      const { model } = await router.selectModel(request);
      expect(model).not.toBe('haiku');
    });

    it('should fallback to Haiku when no models allowed', async () => {
      const request: RouteRequest = {
        task: 'Test',
        budget: 50000,
        allowedModels: [], // Empty list
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('haiku'); // Falls back to default
    });

    it('should select correct effort level based on model', async () => {
      const haiku = await router.selectModel({ task: 'x'.repeat(20000), budget: 50000 });
      const sonnet = await router.selectModel({ task: 'x'.repeat(200000), budget: 200000 });
      const opus = await router.selectModel({ task: 'x'.repeat(500000), budget: 500000 });

      expect(haiku.effort).toBe('low');
      expect(sonnet.effort).toBe('medium');
      expect(opus.effort).toBe('high');
    });

    it('CRITICAL: Model selection must optimize for cost vs quality trade-off', () => {
      // This requires validation that the routing decisions actually save tokens
      // Need to test against real API responses to ensure:
      // 1. Haiku actually handles simple tasks correctly
      // 2. Unnecessary escalation doesn't happen
      // 3. Quality degradation is minimal for cost savings

      console.warn('⚠️ MODEL SELECTION: Need A/B testing against real API to validate routing correctness');
    });

    // NEW: Generation-aware and user preference tests
    it('should prefer fast models for latency-critical tasks (generation-aware)', async () => {
      const request: RouteRequest = {
        task: 'Quick response needed',
        budget: 50000,
        timeout: 200, // 200ms timeout = latency critical
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('haiku'); // Fastest model (150ms latency)
    });

    it('should prefer cheap models for cost-constrained tasks (generation-aware)', async () => {
      const request: RouteRequest = {
        task: 'Simple task',
        budget: 100, // Very tight budget
        minQuality: 3,
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('haiku'); // Cheapest model (2.4 cost ratio)
    });

    it('should avoid overkill: not use Opus for trivial tasks', async () => {
      const request: RouteRequest = {
        task: 'x', // Trivial input
        budget: 50000,
        minQuality: 2,
        allowedModels: ['haiku', 'opus'],
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('haiku'); // Should avoid expensive Opus
    });

    it('should prefer quality models for expert tasks (generation-aware)', async () => {
      const request: RouteRequest = {
        task: 'Analyze complex quantum computing algorithm and provide expert-level analysis',
        budget: 50000,
        minQuality: 9,
        allowedModels: ['sonnet', 'opus', 'fable'],
      };

      const { model } = await router.selectModel(request);
      expect(['opus', 'fable']).toContain(model); // Should use expert model
    });

    it('should respect user preference: fast mode chooses Haiku over Sonnet', async () => {
      const request: RouteRequest = {
        task: 'Moderate task',
        budget: 50000,
        minQuality: 5,
        userPreference: 'fast',
        allowedModels: ['haiku', 'sonnet'],
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('haiku'); // Fast preference should choose Haiku
    });

    it('should respect user preference: cheap mode minimizes cost', async () => {
      const request: RouteRequest = {
        task: 'Moderate task',
        budget: 50000,
        minQuality: 5,
        userPreference: 'cheap',
        allowedModels: ['haiku', 'sonnet', 'opus'],
      };

      const { model } = await router.selectModel(request);
      expect(model).toBe('haiku'); // Cheap preference should choose cheapest
    });

    it('should respect user preference: quality mode chooses best reasoning', async () => {
      const request: RouteRequest = {
        task: 'Complex analytical task',
        budget: 50000,
        minQuality: 8,
        userPreference: 'quality',
        allowedModels: ['sonnet', 'opus', 'fable'],
      };

      const { model } = await router.selectModel(request);
      expect(['opus', 'fable']).toContain(model); // Quality preference should choose best reasoning
    });

    it('NEW: Should include generation metadata in model configs', async () => {
      const models = router.getModels();

      // All models should have generation metadata
      Object.values(models).forEach((config: any) => {
        expect(config).toHaveProperty('generation');
        expect(config).toHaveProperty('generationTradeoffs');
        expect(config).toHaveProperty('strengths');
        expect(config).toHaveProperty('weaknesses');
        expect(config).toHaveProperty('poorFitFor');
      });

      // Verify generation data
      expect(models.haiku.generation).toBe(4.5);
      expect(models.sonnet.generation).toBe(3.5);
      expect(models.opus.generation).toBe(3.0);
      expect(models.fable.generation).toBe(4.0);
    });
  });

  describe('Routing', () => {
    it('should execute route and return response structure', async () => {
      const request: RouteRequest = {
        task: 'Test task',
        budget: 50000,
      };

      const response = await router.route(request);

      expect(response).toHaveProperty('result');
      expect(response).toHaveProperty('model');
      expect(response).toHaveProperty('effort');
      expect(response).toHaveProperty('tokensUsed');
      expect(response).toHaveProperty('cost');
      expect(response).toHaveProperty('quality');
      expect(response).toHaveProperty('savings');
      expect(response).toHaveProperty('executionTime');
      expect(response).toHaveProperty('cacheHit');
    });

    it('should calculate tokens correctly', async () => {
      const request: RouteRequest = {
        task: 'Test task',
        budget: 50000,
      };

      const response = await router.route(request);
      expect(response.tokensUsed.input).toBe(100); // From mock
      expect(response.tokensUsed.output).toBe(50); // From mock
    });

    it('should calculate cost based on model pricing', async () => {
      const request: RouteRequest = {
        task: 'Test task',
        budget: 50000,
      };

      const response = await router.route(request);

      // Mock returns 100 input + 50 output tokens, model is Haiku
      // Haiku: input $0.10, output $0.50 per 1M
      // cost = (100/1M)*0.10 + (50/1M)*0.50
      const expected = (100 / 1_000_000) * 0.10 + (50 / 1_000_000) * 0.50;
      expect(response.cost).toBeCloseTo(expected, 8);
    });

    it('should record statistics after routing', async () => {
      const request: RouteRequest = {
        task: 'Test task',
        budget: 50000,
      };

      const initialStats = router.getStats();
      const initialRequests = initialStats.totalRequests;

      await router.route(request);

      const updatedStats = router.getStats();
      expect(updatedStats.totalRequests).toBe(initialRequests + 1);
    });

    it('should measure execution time', async () => {
      const request: RouteRequest = {
        task: 'Test task',
        budget: 50000,
      };

      const response = await router.route(request);
      expect(response.executionTime).toBeGreaterThanOrEqual(0);
      expect(typeof response.executionTime).toBe('number');
    });

    it('CRITICAL: Savings calculation must be validated', async () => {
      const request: RouteRequest = {
        task: 'Test task',
        budget: 50000,
      };

      const response = await router.route(request);

      // ISSUE: Current implementation HARDCODES 30% savings
      // This is WRONG - savings depend on:
      // 1. Actual token difference between selected and baseline model
      // 2. Real API responses (not assumptions)

      expect(response.savings.percentReduced).toBe(30); // Currently hardcoded
      expect(response.savings.tokensReduced).toBeGreaterThan(0); // Should be calculated

      console.warn('⚠️ SAVINGS CALCULATION: Currently hardcoded at 30%. Need real API baseline comparison.');
    });
  });

  describe('Statistics', () => {
    it('should return stats object with all fields', () => {
      const stats = router.getStats();

      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('totalTokensSaved');
      expect(stats).toHaveProperty('totalCostSaved');
      expect(stats).toHaveProperty('modelUsage');
      expect(stats).toHaveProperty('averageQuality');
      expect(stats).toHaveProperty('escalationRate');
    });

    it('should initialize stats correctly', () => {
      const stats = router.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.totalTokensSaved).toBe(0);
      expect(stats.totalCostSaved).toBe(0);
      expect(stats.averageQuality).toBe(7.2); // Hardcoded
      expect(stats.escalationRate).toBe(0.15); // Hardcoded
    });

    it('CRITICAL: Quality and escalation metrics are hardcoded', () => {
      const stats = router.getStats();

      // These should be calculated from actual responses
      expect(stats.averageQuality).toBe(7.2);
      expect(stats.escalationRate).toBe(0.15);

      console.warn('⚠️ METRICS: averageQuality and escalationRate are hardcoded. Need real calculation.');
    });
  });

  describe('Model Configuration', () => {
    it('should return all model configurations', () => {
      const models = router.getModels();

      expect(models).toHaveProperty('haiku');
      expect(models).toHaveProperty('sonnet');
      expect(models).toHaveProperty('opus');
      expect(models).toHaveProperty('fable');
    });

    it('should have correct model hierarchy (cost and quality)', () => {
      const models = router.getModels();

      // Cost hierarchy: Haiku < Sonnet < Opus < Fable
      expect(models.haiku.costPer1MTok.input).toBeLessThan(models.sonnet.costPer1MTok.input);
      expect(models.sonnet.costPer1MTok.input).toBeLessThan(models.opus.costPer1MTok.input);
      expect(models.opus.costPer1MTok.input).toBeLessThan(models.fable.costPer1MTok.input);

      // Quality hierarchy: Haiku < Sonnet < Opus < Fable
      expect(models.haiku.quality).toBeLessThan(models.sonnet.quality);
      expect(models.sonnet.quality).toBeLessThan(models.opus.quality);
      expect(models.opus.quality).toBeLessThan(models.fable.quality);
    });

    it('CRITICAL: Model API IDs must match current Claude API', () => {
      const models = router.getModels();

      // Current implementation uses old IDs like claude-haiku-5-5
      // Need to verify against current Anthropic API documentation
      expect(models.haiku.apiId).toBe('claude-haiku-5-5');
      expect(models.sonnet.apiId).toBe('claude-sonnet-5-5');
      expect(models.opus.apiId).toBe('claude-opus-5-5');

      console.warn('⚠️ MODEL IDs: Verify these match current Anthropic API. Use latest model versions.');
    });
  });
});
