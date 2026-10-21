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
  useHistoricalData?: boolean; // Use feedback loop for selection
  feedbackQuality?: number; // Quality score for feedback (1-10)
  userPreference?: 'fast' | 'cheap' | 'quality'; // Explicit user preference (overrides auto-detection)
}

export interface RouteResponse {
  result: string;
  model: ModelTier;
  effort: EffortLevel;
  complexity?: {
    score: number;
    category: string;
  };
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
  selectionConfidence?: number; // 0-1, confidence in model selection
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
  // Generation metadata (NEW)
  generation: number; // 3, 3.5, 4, 4.5, etc.
  generationRelease?: Date; // When released
  generationTradeoffs?: {
    speedVsQuality: 'fast' | 'balanced' | 'quality'; // What this generation optimizes for
    stability: number; // 0-10, consistency/predictability
    reasoning: number; // 0-10, multi-step reasoning capability
    latency: number; // ms, average output latency
    contextWindow: number;
    supportsEffort: EffortLevel[];
  };
  strengths?: string[]; // What this model is good at
  weaknesses?: string[]; // What this model struggles with
  poorFitFor?: {
    taskType: string[]; // Task categories where this is poor fit
    budgetConstraint: boolean;
    latencyConstraint: boolean;
    stabilityRequired: boolean;
  };
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

export interface TokenCountResponse {
  input: number;
  output: number;
  timestamp: number;
  cached: boolean;
}

export interface ComplexityScore {
  score: number; // 1-10
  category: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';
  factors: {
    length: number;
    reasoning: number;
    technical: number;
    structured: number;
    domain: number;
  };
}

export interface FeedbackInput {
  taskHash: string;
  model: ModelTier;
  success: boolean;
  qualityScore?: number;
  escalationReason?: string;
  notes?: string;
}
