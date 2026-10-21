export type ModelTier = 'haiku' | 'sonnet' | 'opus' | 'fable';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface RouteRequest {
  task: string;
  budget: number; // max tokens allowed
  minQuality?: number; // 0-10 scale, default 5
  allowedModels?: ModelTier[];
  timeout?: number; // ms
  cacheKey?: string;
  streaming?: boolean;
}

export interface RouteResponse {
  result: string;
  model: ModelTier;
  effort: EffortLevel;
  tokensUsed: {
    input: number;
    output: number;
    cached?: number;
  };
  cost: number;
  quality: number; // 0-10 estimate
  savings: {
    tokensReduced: number;
    percentReduced: number;
    estimatedCost: number;
  };
  escalated: boolean;
  escalationReason?: string;
  executionTime: number; // ms
  cacheHit: boolean;
}

export interface ModelConfig {
  name: ModelTier;
  apiId: string;
  costPer1MTok: { input: number; output: number };
  maxTokens: number;
  speed: number; // tokens/sec estimate
  quality: number; // 0-10
  defaultEffort: EffortLevel;
  capabilities: string[];
}

export interface SecurityContext {
  userId: string;
  rateLimit: number;
  requestsThisHour: number;
  lastRequestTime: number;
  isSuspicious: boolean;
}

export interface CacheEntry {
  key: string;
  result: string;
  model: ModelTier;
  tokens: number;
  timestamp: number;
  ttl: number; // seconds
}

export interface RouterStats {
  totalRequests: number;
  totalTokensSaved: number;
  totalCostSaved: number;
  modelDistribution: Record<ModelTier, number>;
  averageQuality: number;
  escalationRate: number;
}
