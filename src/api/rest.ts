import express, { Request, Response } from 'express';
import { ModelRouter } from '../core/modelRouter.js';
import { securityManager } from '../core/security.js';
import { RouteRequest } from '../types/index.js';

export const createRestAPI = (router: ModelRouter) => {
  const app = express.Router();

  /**
   * POST /api/route - Main routing endpoint
   */
  app.post('/route', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string || 'anonymous';
      const { task, budget, minQuality, allowedModels } = req.body as RouteRequest;

      // Security: Validate input
      const validation = securityManager.validateInput(task);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.reason });
      }

      // Security: Check rate limits
      const rateCheck = securityManager.checkRateLimit(userId);
      if (!rateCheck.allowed) {
        return res.status(429).json({ error: rateCheck.reason });
      }

      // Security: Detect anomalies
      const anomaly = securityManager.detectAnomalies(userId, task);
      if (anomaly) {
        securityManager.logSecurityEvent(userId, anomaly, 'medium');
        return res.status(403).json({ error: 'Request blocked due to unusual pattern' });
      }

      // Route the request
      const result = await router.route({
        task,
        budget: budget || 100000,
        minQuality: minQuality || 5,
        allowedModels: allowedModels || ['haiku', 'sonnet', 'opus'],
      });

      // Security: Sanitize output
      result.result = securityManager.sanitizeOutput(result.result);

      return res.json(result);
    } catch (error) {
      console.error('Route error:', error);
      return res.status(500).json({
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/direct - Bypass routing (use specific model)
   */
  app.post('/direct', async (req: Request, res: Response) => {
    try {
      const { task, model, effort } = req.body;

      const validation = securityManager.validateInput(task);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.reason });
      }

      // Estimate tokens
      const tokens = await router.estimateTokens(task, model || 'opus');

      return res.json({
        message: `Will use ${model || 'opus'} with effort: ${effort || 'high'}`,
        estimatedTokens: tokens,
        note: 'Endpoint prepared for direct execution',
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to process direct request' });
    }
  });

  /**
   * GET /api/models - List available models
   */
  app.get('/models', (req: Request, res: Response) => {
    const models = router.getModels();
    return res.json(
      Object.entries(models).map(([name, config]: any) => ({
        name,
        apiId: config.apiId,
        speed: config.speed,
        quality: config.quality,
        costPer1M: config.costPer1MTok,
        maxTokens: config.maxTokens,
        capabilities: config.capabilities,
      }))
    );
  });

  /**
   * POST /api/token-estimate - Estimate tokens before execution
   */
  app.post('/token-estimate', async (req: Request, res: Response) => {
    try {
      const { task, model } = req.body;

      const validation = securityManager.validateInput(task);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.reason });
      }

      const tokens = await router.estimateTokens(task, (model || 'haiku') as any);
      const models = router.getModels();
      const selectedModel = models[(model || 'haiku') as any];

      const estimatedCost =
        (tokens / 1_000_000) *
        (selectedModel.costPer1MTok.input + selectedModel.costPer1MTok.output / 2);

      return res.json({
        task: task.substring(0, 100) + (task.length > 100 ? '...' : ''),
        estimatedTokens: tokens,
        estimatedCost,
        model: model || 'haiku',
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to estimate tokens' });
    }
  });

  /**
   * GET /api/stats - Get router statistics
   */
  app.get('/stats', (req: Request, res: Response) => {
    const stats = router.getStats();
    return res.json({
      totalRequests: stats.totalRequests,
      totalTokensSaved: stats.totalTokensSaved,
      totalCostSaved: `$${stats.totalCostSaved.toFixed(2)}`,
      modelDistribution: stats.modelUsage,
      averageQuality: stats.averageQuality,
      escalationRate: `${(stats.escalationRate * 100).toFixed(1)}%`,
    });
  });

  /**
   * GET /api/config - Show current configuration
   */
  app.get('/config', (req: Request, res: Response) => {
    return res.json({
      routingStrategy: 'Haiku → Sonnet → Opus escalation',
      tokenOptimizations: [
        'Prompt caching (10-15% savings)',
        'Effort tuning (5-8% savings)',
        'Model selection (5-10% savings)',
        'Token estimation (3-5% savings)',
      ],
      securityFeatures: [
        'Input validation',
        'Rate limiting',
        'Anomaly detection',
        'Output sanitization',
        'Prompt injection prevention',
      ],
      totalSavingsTarget: '30-50%',
    });
  });

  /**
   * Health check
   */
  app.get('/health', (req: Request, res: Response) => {
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
};
