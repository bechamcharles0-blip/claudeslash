// Core exports
export { ModelRouter } from './core/modelRouter.js';
export { securityManager, SecurityManager } from './core/security.js';

// Type exports
export type {
  ModelTier,
  EffortLevel,
  RouteRequest,
  RouteResponse,
  ModelConfig,
  SecurityContext,
  CacheEntry,
  RouterStats,
} from './types/index.js';

// API exports
export { createRestAPI } from './api/rest.js';
export { createGraphQLSchema } from './api/graphql.js';

// Version
export const VERSION = '1.0.0';
