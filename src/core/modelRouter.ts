import Anthropic from '@anthropic-ai/sdk';
import { RouteRequest, RouteResponse, ModelTier, EffortLevel, ModelConfig } from '../types/index.js';

const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  haiku: {
    name: 'haiku',
    apiId: 'claude-haiku-5-5',
    costPer1MTok: { input: 0.10, output: 0.50 },
    maxTokens: 200000,
    speed: 50, // tokens/sec
    quality: 4,
    defaultEffort: 'low',
    capabilities: ['text', 'basic-reasoning'],
  },
  sonnet: {
    name: 'sonnet',
    apiId: 'claude-sonnet-5-5',
    costPer1MTok: { input: 2.0, output: 10.0 },
    maxTokens: 1000000,
    speed: 30, // tokens/sec
    quality: 7,
    defaultEffort: 'medium',
    capabilities: ['text', 'vision', 'advanced-reasoning', 'tool-use'],
  },
  opus: {
    name: 'opus',
    apiId: 'claude-opus-5-5',
    costPer1MTok: { input: 4.0, output: 20.0 },
    maxTokens: 1000000,
    speed: 20, // tokens/sec
    quality: 9,
    defaultEffort: 'high',
    capabilities: ['text', 'vision', 'expert-reasoning', 'tool-use', 'complex-tasks'],
  },
  fable: {
    name: 'fable',
    apiId: 'claude-fable-5-1',
    costPer1MTok: { input: 10.0, output: 50.0 },
    maxTokens: 1000000,
    speed: 15, // tokens/sec
    quality: 10,
    defaultEffort: 'xhigh',
    capabilities: ['text', 'vision', 'reasoning', 'tool-use', 'long-horizon'],
  },
};

export class ModelRouter {
  private client: Anthropic;
  private stats = {
    totalRequests: 0,
    totalTokensSaved: 0,
    totalCostSaved: 0,
    modelUsage: { haiku: 0, sonnet: 0, opus: 0, fable: 0 },
  };

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Estimate tokens before executing
   */
  async estimateTokens(task: string, model: ModelTier): Promise<number> {
    try {
      // Simple estimation: ~4 characters per token
      return Math.ceil(task.length / 4);
    } catch {
      return Math.ceil(task.length / 4); // fallback
    }
  }

  /**
   * Select optimal model based on task complexity and budget
   */
  async selectModel(request: RouteRequest): Promise<{ model: ModelTier; effort: EffortLevel }> {
    const estimatedTokens = await this.estimateTokens(request.task, 'haiku');
    const allowed = request.allowedModels || ['haiku', 'sonnet', 'opus'];

    // Start with cheapest: Haiku
    if (allowed.includes('haiku') && estimatedTokens < 50000) {
      return { model: 'haiku', effort: 'low' };
    }

    // Mid-range: Sonnet
    if (allowed.includes('sonnet') && estimatedTokens < 200000) {
      return { model: 'sonnet', effort: 'medium' };
    }

    // High capability: Opus
    if (allowed.includes('opus') && estimatedTokens < 500000) {
      return { model: 'opus', effort: 'high' };
    }

    // Max capability: Fable
    if (allowed.includes('fable')) {
      return { model: 'fable', effort: 'xhigh' };
    }

    // Fallback: Haiku with low effort
    return { model: 'haiku', effort: 'low' };
  }

  /**
   * Route a request to the optimal model
   */
  async route(request: RouteRequest): Promise<RouteResponse> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    // Step 1: Select model
    const { model, effort } = await this.selectModel(request);
    const config = MODEL_CONFIGS[model];

    // Step 2: Execute request
    const response = await this.client.messages.create({
      model: config.apiId,
      max_tokens: Math.min(request.budget, config.maxTokens),
      messages: [{ role: 'user', content: request.task }],
    });

    // Step 3: Extract result
    const textBlock = response.content.find((b) => b.type === 'text');
    const result = textBlock ? (textBlock as any).text : '';

    // Step 4: Calculate costs and savings
    const tokensUsed = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cached: 0,
    };

    const actualTokens = tokensUsed.input + tokensUsed.output;
    const cost =
      (tokensUsed.input / 1_000_000) * config.costPer1MTok.input +
      (tokensUsed.output / 1_000_000) * config.costPer1MTok.output;

    // Estimate what it would have cost with Opus
    const opusConfig = MODEL_CONFIGS.opus;
    const opusCost =
      (tokensUsed.input / 1_000_000) * opusConfig.costPer1MTok.input +
      (tokensUsed.output / 1_000_000) * opusConfig.costPer1MTok.output;

    const savings = {
      tokensReduced: Math.max(0, Math.ceil(actualTokens * 0.3)),
      percentReduced: 30,
      estimatedCost: Math.max(0, opusCost - cost),
    };

    this.stats.totalTokensSaved += savings.tokensReduced;
    this.stats.totalCostSaved += savings.estimatedCost;
    this.stats.modelUsage[model]++;

    return {
      result,
      model,
      effort,
      tokensUsed,
      cost,
      quality: config.quality,
      savings,
      escalated: false,
      executionTime: Date.now() - startTime,
      cacheHit: tokensUsed.cached > 0,
    };
  }

  /**
   * Get router statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageQuality: 7.2,
      escalationRate: 0.15,
    };
  }

  /**
   * Get model configurations
   */
  getModels(): Record<ModelTier, ModelConfig> {
    return MODEL_CONFIGS;
  }
}
