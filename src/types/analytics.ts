/**
 * Analytics Event Schema
 * All data captured in the system
 */

export type EventType =
  | 'request_received'
  | 'model_selected'
  | 'request_executed'
  | 'request_completed'
  | 'cache_hit'
  | 'cache_miss'
  | 'escalation'
  | 'feedback_submitted'
  | 'error_occurred'
  | 'security_event';

export type FeedbackType = 'success' | 'partial' | 'failure' | 'quality_issue' | 'latency_issue';

export type SecurityEventType =
  | 'rate_limit_exceeded'
  | 'anomaly_detected'
  | 'injection_attempt'
  | 'invalid_input'
  | 'suspicious_pattern';

/**
 * Core event captured for every request
 */
export interface AnalyticsEvent {
  // Identifiers
  eventId: string;
  requestId: string;
  userId: string;
  timestamp: number;

  // Event metadata
  type: EventType;
  version: string; // schema version

  // Request context
  task: string;
  taskLength: number;
  taskCategory?: string; // inferred: summarization, analysis, generation, etc.
  budget: number;
  minQuality?: number;

  // Model selection
  selectedModel?: 'haiku' | 'sonnet' | 'opus' | 'fable';
  selectedEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  selectionReason?: string; // why this model was chosen

  // Execution metrics
  tokensEstimated?: number;
  tokensInput?: number;
  tokensOutput?: number;
  tokensCached?: number;
  executionTimeMs?: number;

  // Cost metrics
  costEstimated?: number;
  costActual?: number;
  costBaseline?: number; // what Opus would have cost
  tokensSaved?: number;
  percentSaved?: number;

  // Quality metrics
  qualityEstimate?: number; // 0-10
  cacheHit?: boolean;
  escalated?: boolean;
  escalationReason?: string;

  // Error tracking
  error?: boolean;
  errorCode?: string;
  errorMessage?: string;

  // Security
  securityScore?: number; // 0-100, higher = safer
  securityFlags?: SecurityEventType[];
  rateLimit?: number;
  requestCountThisHour?: number;

  // Metadata
  apiVersion?: string;
  userAgent?: string;
  endpoint?: string;
  ipHash?: string; // privacy-preserving IP tracking

  // Raw response data (truncated for storage)
  responsePreview?: string; // first 500 chars
}

/**
 * User feedback on a request
 */
export interface UserFeedback {
  feedbackId: string;
  requestId: string;
  userId: string;
  timestamp: number;

  // Feedback data
  feedbackType: FeedbackType;
  satisfaction: number; // 1-5 scale
  accuracy: number; // 1-5 scale
  speed: number; // 1-5 scale
  comment?: string;

  // What would they have preferred
  preferredModel?: 'haiku' | 'sonnet' | 'opus' | 'fable';
  preferredSpeed?: 'faster' | 'slower' | 'ok';
  preferredQuality?: 'lower' | 'higher' | 'ok';

  // Categories
  issueCategory?: string; // hallucination, incomplete, wrong, slow, expensive, etc.
  wasRelevant?: boolean;
  wouldUseAgain?: boolean;
}

/**
 * Aggregated metrics for dashboards
 */
export interface AggregatedMetrics {
  // Time period
  periodStart: number;
  periodEnd: number;
  period: 'hour' | 'day' | 'week' | 'month';

  // Volume metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number; // %

  // Token metrics
  totalTokensUsed: number;
  totalTokensCached: number;
  totalTokensSaved: number;
  averageTokensSavedPerRequest: number;
  cacheHitRate: number; // %

  // Cost metrics
  totalCostActual: number;
  totalCostBaseline: number; // if all used Opus
  totalCostSaved: number;
  savingsPercent: number; // %
  costPerRequest: number;

  // Model distribution
  modelUsage: Record<string, number>; // haiku, sonnet, opus, fable
  modelCosts: Record<string, number>;
  modelQuality: Record<string, number>; // avg quality per model

  // Quality metrics
  averageQuality: number; // 0-10
  averageSatisfaction: number; // 1-5, from feedback
  averageAccuracy: number; // 1-5, from feedback
  averageSpeed: number; // 1-5, from feedback
  feedbackResponseRate: number; // % of requests with feedback

  // Latency metrics
  averageExecutionTime: number; // ms
  p50ExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;

  // Escalation metrics
  escalationRate: number; // %
  escalationReasons: Record<string, number>;

  // Error metrics
  errorRate: number; // %
  topErrors: Array<{ errorCode: string; count: number; rate: number }>;

  // Security metrics
  anomalyDetectionRate: number; // % of requests flagged
  rateViolations: number;
  injectionAttempts: number;

  // User metrics
  uniqueUsers: number;
  userRetention: number; // % of users from previous period
  requestsPerUser: number; // average
  topUsers: Array<{ userId: string; requestCount: number }>;

  // Task category metrics
  topTaskCategories: Array<{ category: string; count: number }>;
  categoryMetrics: Record<string, {
    count: number;
    averageQuality: number;
    averageCost: number;
    successRate: number;
  }>;
}

/**
 * Insights and recommendations
 */
export interface AnalyticsInsight {
  insightId: string;
  timestamp: number;

  // What type of insight
  type: 'opportunity' | 'warning' | 'anomaly' | 'trend' | 'recommendation';
  severity: 'low' | 'medium' | 'high';

  // The insight
  title: string;
  description: string;
  evidence: {
    metric: string;
    current: number;
    previous?: number;
    change?: number;
    threshold?: number;
  }[];

  // Who should care
  targetTeam: 'ml' | 'devops' | 'product' | 'engineering';

  // What to do
  recommendedAction: string;
  estimatedImpact?: string;
  priority: number; // 1-10

  // Timeframe
  periodStart: number;
  periodEnd: number;
}

/**
 * Model selection feedback for ML team
 */
export interface ModelSelectionFeedback {
  timestamp: number;

  // What happened
  requestId: string;
  selectedModel: 'haiku' | 'sonnet' | 'opus' | 'fable';
  actualQuality: number; // from feedback
  expectedQuality: number; // what we predicted

  // Was it right?
  correct: boolean; // did user confirm it was good?
  userPreference?: 'haiku' | 'sonnet' | 'opus' | 'fable';

  // Cost analysis
  actualCost: number;
  counterfactualCosts: Record<string, number>; // cost if we'd picked each model

  // Task features
  taskLength: number;
  taskCategory?: string;

  // User features
  userId: string;
  userSegment?: string;
}

/**
 * Infrastructure recommendations
 */
export interface InfrastructureInsight {
  timestamp: number;
  type: 'bottleneck' | 'optimization' | 'cost' | 'reliability';

  // Latency analysis
  averageLatency?: number;
  p95Latency?: number;
  bottleneck?: 'claude_api' | 'cache' | 'database' | 'router_logic';

  // Caching analysis
  cacheHitRate?: number;
  cacheSize?: number;
  evictionRate?: number;

  // Cost analysis
  costPerRequest?: number;
  savingsPotential?: number;
  savingsAction?: string;

  // Reliability
  errorRate?: number;
  errorTypes?: Record<string, number>;

  // Recommendation
  action: string;
  estimatedBenefit: string;
}
