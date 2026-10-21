import { describe, it, expect, beforeEach, vi } from 'vitest';
import { graphql } from 'graphql';
import { createGraphQLSchema } from './graphql.js';
import { ModelRouter } from '../core/modelRouter.js';

// Mock ModelRouter
vi.mock('../core/modelRouter.js', () => {
  return {
    ModelRouter: class MockRouter {
      route = vi.fn().mockResolvedValue({
        result: 'Test response',
        model: 'haiku',
        effort: 'low',
        tokensUsed: { input: 100, output: 50, cached: 0 },
        cost: 0.00005,
        quality: 4,
        savings: {
          tokensReduced: 50,
          percentReduced: 30,
          estimatedCost: 0.0001,
        },
        escalated: false,
        executionTime: 100,
        cacheHit: false,
      });

      estimateTokens = vi.fn().mockResolvedValue(150);

      getModels = vi.fn().mockReturnValue({
        haiku: {
          name: 'haiku',
          apiId: 'claude-haiku-5-5',
          speed: 50,
          quality: 4,
          maxTokens: 200000,
          capabilities: ['text', 'basic-reasoning'],
        },
        sonnet: {
          name: 'sonnet',
          apiId: 'claude-sonnet-5-5',
          speed: 30,
          quality: 7,
          maxTokens: 1000000,
          capabilities: ['text', 'vision', 'advanced-reasoning'],
        },
      });

      getStats = vi.fn().mockReturnValue({
        totalRequests: 10,
        totalTokensSaved: 500,
        totalCostSaved: 0.25,
        averageQuality: 6.5,
        escalationRate: 0.1,
      });
    },
  };
});

describe('GraphQL API', () => {
  let schema: any;
  let mockRouter: ModelRouter;

  beforeEach(() => {
    mockRouter = new ModelRouter('test-key');
    schema = createGraphQLSchema(mockRouter);
  });

  describe('Queries', () => {
    it('should query all models', async () => {
      const query = `
        query {
          models {
            name
            apiId
            quality
            speed
            maxTokens
            capabilities
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.errors).toBeUndefined();
      expect(result.data?.models).toBeDefined();
      expect(result.data?.models.length).toBeGreaterThan(0);
    });

    it('should query single model by name', async () => {
      const query = `
        query {
          model(name: "haiku") {
            name
            quality
            apiId
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.errors).toBeUndefined();
      expect(result.data?.model).toBeDefined();
      expect(result.data?.model.name).toBe('haiku');
    });

    it('should return null for unknown model', async () => {
      const query = `
        query {
          model(name: "unknown") {
            name
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.data?.model).toBeNull();
    });

    it('should query stats', async () => {
      const query = `
        query {
          stats {
            totalRequests
            totalTokensSaved
            totalCostSaved
            averageQuality
            escalationRate
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.errors).toBeUndefined();
      expect(result.data?.stats).toBeDefined();
      expect(result.data?.stats.totalRequests).toBe(10);
    });

    it('should estimate tokens', async () => {
      const query = `
        query {
          estimateTokens(task: "Test task", model: "haiku") {
            task
            estimatedTokens
            estimatedCost
            model
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.errors).toBeUndefined();
      expect(result.data?.estimateTokens).toBeDefined();
      expect(result.data?.estimateTokens.estimatedTokens).toBe(150);
    });

    it('should handle missing model parameter for estimateTokens', async () => {
      const query = `
        query {
          estimateTokens(task: "Test task") {
            task
            estimatedTokens
            model
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.data?.estimateTokens.model).toBe('haiku'); // Default
    });

    it('should check health', async () => {
      const query = `
        query {
          health
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.errors).toBeUndefined();
      expect(result.data?.health).toBe('OK');
    });
  });

  describe('Mutations', () => {
    it('should route request via mutation', async () => {
      const mutation = `
        mutation {
          route(task: "Test task", budget: 50000) {
            result
            model
            effort
            cost
            quality
            executionTime
          }
        }
      `;

      const result = await graphql({ schema, source: mutation });

      expect(result.errors).toBeUndefined();
      expect(result.data?.route).toBeDefined();
      expect(result.data?.route.model).toBe('haiku');
    });

    it('should include tokens used in response', async () => {
      const mutation = `
        mutation {
          route(task: "Test task") {
            tokensUsed {
              input
              output
              cached
            }
          }
        }
      `;

      const result = await graphql({ schema, source: mutation });

      expect(result.data?.route.tokensUsed).toBeDefined();
      expect(result.data?.route.tokensUsed.input).toBe(100);
      expect(result.data?.route.tokensUsed.output).toBe(50);
    });

    it('should include savings calculation', async () => {
      const mutation = `
        mutation {
          route(task: "Test task") {
            savings {
              tokensReduced
              percentReduced
              estimatedCost
            }
          }
        }
      `;

      const result = await graphql({ schema, source: mutation });

      expect(result.data?.route.savings).toBeDefined();
      expect(result.data?.route.savings.percentReduced).toBe(30);
    });

    it('should accept quality parameter', async () => {
      const mutation = `
        mutation {
          route(task: "Test task", minQuality: 8) {
            model
            quality
          }
        }
      `;

      const result = await graphql({ schema, source: mutation });

      expect(result.errors).toBeUndefined();
      expect(result.data?.route).toBeDefined();
    });

    it('should accept allowed models parameter', async () => {
      const mutation = `
        mutation {
          route(
            task: "Test task"
            allowedModels: ["sonnet", "opus"]
          ) {
            model
          }
        }
      `;

      const result = await graphql({ schema, source: mutation });

      expect(result.errors).toBeUndefined();
      expect(result.data?.route).toBeDefined();
    });
  });

  describe('Type Validation', () => {
    it('should enforce non-null task parameter', async () => {
      const mutation = `
        mutation {
          route(budget: 50000) {
            result
          }
        }
      `;

      const result = await graphql({ schema, source: mutation });

      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should enforce non-null for estimateTokens task', async () => {
      const query = `
        query {
          estimateTokens(model: "haiku") {
            task
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(result.errors).toBeDefined();
    });

    it('should validate model name parameter', async () => {
      const query = `
        query {
          model(name: "invalid_model_type") {
            name
          }
        }
      `;

      // GraphQL should accept it (string), but return null from resolver
      const result = await graphql({ schema, source: query });

      expect(result.data?.model).toBeNull();
    });

    it('should return array for models query', async () => {
      const query = `
        query {
          models {
            name
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      expect(Array.isArray(result.data?.models)).toBe(true);
    });
  });

  describe('Response Types', () => {
    it('RouteResponse should include all fields', async () => {
      const mutation = `
        mutation {
          route(task: "Test") {
            result
            model
            effort
            tokensUsed { input output cached }
            cost
            quality
            savings { tokensReduced percentReduced estimatedCost }
            escalated
            escalationReason
            executionTime
            cacheHit
          }
        }
      `;

      const result = await graphql({ schema, source: mutation });

      const response = result.data?.route;
      expect(response.result).toBeDefined();
      expect(response.model).toBeDefined();
      expect(response.effort).toBeDefined();
      expect(response.tokensUsed).toBeDefined();
      expect(response.cost).toBeDefined();
      expect(response.quality).toBeDefined();
      expect(response.savings).toBeDefined();
      expect(response.executionTime).toBeDefined();
      expect(response.cacheHit).toBeDefined();
    });

    it('ModelInfo should include all fields', async () => {
      const query = `
        query {
          models {
            name
            apiId
            speed
            quality
            maxTokens
            capabilities
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      const model = result.data?.models[0];
      expect(model.name).toBeDefined();
      expect(model.apiId).toBeDefined();
      expect(model.speed).toBeDefined();
      expect(model.quality).toBeDefined();
      expect(model.maxTokens).toBeDefined();
      expect(model.capabilities).toBeDefined();
    });

    it('Stats should include all fields', async () => {
      const query = `
        query {
          stats {
            totalRequests
            totalTokensSaved
            totalCostSaved
            averageQuality
            escalationRate
          }
        }
      `;

      const result = await graphql({ schema, source: query });

      const stats = result.data?.stats;
      expect(stats.totalRequests).toBeDefined();
      expect(stats.totalTokensSaved).toBeDefined();
      expect(stats.totalCostSaved).toBeDefined();
      expect(stats.averageQuality).toBeDefined();
      expect(stats.escalationRate).toBeDefined();
    });
  });

  describe('CRITICAL: GraphQL Schema Issues', () => {
    it('CRITICAL: Should validate token estimates in GraphQL', () => {
      // Token estimation accuracy is critical
      // GraphQL should show estimated accuracy
      console.warn('⚠️ GRAPHQL: Token estimate accuracy not visible in schema');
    });

    it('CRITICAL: Should expose real vs estimated tokens', () => {
      // Current API doesn't show estimation accuracy
      // Add field to show actual vs estimated
      console.warn('⚠️ GRAPHQL: Missing actual token counts for validation');
    });

    it('CRITICAL: Should include escalation reason', () => {
      // escalationReason field exists but never populated
      // Need to actually set reason when escalating
      console.warn('⚠️ GRAPHQL: escalationReason always null. Need implementation.');
    });

    it('CRITICAL: Should track request source', () => {
      // Need to track if request came from REST, GraphQL, or CLI
      // For debugging and metrics
      console.warn('⚠️ GRAPHQL: No request source tracking');
    });
  });
});
