import { GraphQLSchema, GraphQLObjectType, GraphQLString, GraphQLInt, GraphQLFloat, GraphQLList, GraphQLNonNull, GraphQLField } from 'graphql';
import { ModelRouter } from '../core/modelRouter.js';

export const createGraphQLSchema = (router: ModelRouter): GraphQLSchema => {
  // Route response type
  const RouteResponseType = new GraphQLObjectType({
    name: 'RouteResponse',
    fields: {
      result: { type: new GraphQLNonNull(GraphQLString) },
      model: { type: new GraphQLNonNull(GraphQLString) },
      effort: { type: new GraphQLNonNull(GraphQLString) },
      tokensUsed: {
        type: new GraphQLNonNull(
          new GraphQLObjectType({
            name: 'TokensUsed',
            fields: {
              input: { type: new GraphQLNonNull(GraphQLInt) },
              output: { type: new GraphQLNonNull(GraphQLInt) },
              cached: { type: GraphQLInt },
            },
          })
        ),
      },
      cost: { type: new GraphQLNonNull(GraphQLFloat) },
      quality: { type: new GraphQLNonNull(GraphQLInt) },
      savings: {
        type: new GraphQLNonNull(
          new GraphQLObjectType({
            name: 'Savings',
            fields: {
              tokensReduced: { type: new GraphQLNonNull(GraphQLInt) },
              percentReduced: { type: new GraphQLNonNull(GraphQLInt) },
              estimatedCost: { type: new GraphQLNonNull(GraphQLFloat) },
            },
          })
        ),
      },
      executionTime: { type: new GraphQLNonNull(GraphQLInt) },
      cacheHit: { type: new GraphQLNonNull(GraphQLString) },
    },
  });

  // Model info type
  const ModelInfoType = new GraphQLObjectType({
    name: 'ModelInfo',
    fields: {
      name: { type: new GraphQLNonNull(GraphQLString) },
      apiId: { type: new GraphQLNonNull(GraphQLString) },
      speed: { type: new GraphQLNonNull(GraphQLInt) },
      quality: { type: new GraphQLNonNull(GraphQLInt) },
      maxTokens: { type: new GraphQLNonNull(GraphQLInt) },
      capabilities: { type: new GraphQLNonNull(new GraphQLList(GraphQLString)) },
    },
  });

  // Stats type
  const StatsType = new GraphQLObjectType({
    name: 'Stats',
    fields: {
      totalRequests: { type: new GraphQLNonNull(GraphQLInt) },
      totalTokensSaved: { type: new GraphQLNonNull(GraphQLInt) },
      totalCostSaved: { type: new GraphQLNonNull(GraphQLFloat) },
      averageQuality: { type: new GraphQLNonNull(GraphQLFloat) },
      escalationRate: { type: new GraphQLNonNull(GraphQLFloat) },
    },
  });

  // Token estimate type
  const TokenEstimateType = new GraphQLObjectType({
    name: 'TokenEstimate',
    fields: {
      task: { type: new GraphQLNonNull(GraphQLString) },
      estimatedTokens: { type: new GraphQLNonNull(GraphQLInt) },
      estimatedCost: { type: new GraphQLNonNull(GraphQLFloat) },
      model: { type: new GraphQLNonNull(GraphQLString) },
    },
  });

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        // Get all models
        models: {
          type: new GraphQLNonNull(new GraphQLList(ModelInfoType)),
          resolve: () => {
            const models = router.getModels();
            return Object.entries(models).map(([name, config]: any) => ({
              name,
              apiId: config.apiId,
              speed: config.speed,
              quality: config.quality,
              maxTokens: config.maxTokens,
              capabilities: config.capabilities,
            }));
          },
        },

        // Get model by name
        model: {
          type: ModelInfoType,
          args: { name: { type: new GraphQLNonNull(GraphQLString) } },
          resolve: (_: any, { name }: any) => {
            const models = router.getModels();
            const model = models[name as keyof typeof models];
            if (!model) return null;
            return {
              name,
              apiId: model.apiId,
              speed: model.speed,
              quality: model.quality,
              maxTokens: model.maxTokens,
              capabilities: model.capabilities,
            };
          },
        },

        // Get stats
        stats: {
          type: new GraphQLNonNull(StatsType),
          resolve: () => router.getStats(),
        },

        // Estimate tokens
        estimateTokens: {
          type: TokenEstimateType,
          args: {
            task: { type: new GraphQLNonNull(GraphQLString) },
            model: { type: GraphQLString },
          },
          resolve: async (_: any, { task, model }: any) => {
            const tokens = await router.estimateTokens(task, model || 'haiku');
            const models = router.getModels();
            const selectedModel = models[(model || 'haiku') as any];
            const estimatedCost =
              (tokens / 1_000_000) *
              (selectedModel.costPer1MTok.input + selectedModel.costPer1MTok.output / 2);
            return {
              task: task.substring(0, 100),
              estimatedTokens: tokens,
              estimatedCost,
              model: model || 'haiku',
            };
          },
        },

        // Health check
        health: {
          type: GraphQLString,
          resolve: () => 'OK',
        },
      },
    }),

    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        // Route a request
        route: {
          type: RouteResponseType,
          args: {
            task: { type: new GraphQLNonNull(GraphQLString) },
            budget: { type: GraphQLInt },
            minQuality: { type: GraphQLInt },
            allowedModels: { type: new GraphQLList(GraphQLString) },
          },
          resolve: async (_, { task, budget, minQuality, allowedModels }) => {
            return await router.route({
              task,
              budget: budget || 100000,
              minQuality: minQuality || 5,
              allowedModels: allowedModels || ['haiku', 'sonnet', 'opus'],
            });
          },
        },
      },
    }),
  });
};
