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
      const { task, budget, minQuality, allowedModels, userPreference } = req.body as RouteRequest;

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

      // Route the request (with optional user preference)
      const result = await router.route({
        task,
        budget: budget || 100000,
        minQuality: minQuality || 5,
        allowedModels: allowedModels || ['haiku', 'sonnet', 'opus'],
        userPreference, // NEW: Pass user preference (fast/cheap/quality)
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
   * POST /api/token-estimate - Count tokens using real Claude API
   */
  app.post('/token-estimate', async (req: Request, res: Response) => {
    try {
      const { task, model } = req.body;

      const validation = securityManager.validateInput(task);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.reason });
      }

      const tokens = await router.countTokens(task, (model || 'haiku') as any);
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
        method: 'real_counting',
        source: 'claude_api',
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to count tokens' });
    }
  });

  /**
   * POST /api/analyze-complexity - Analyze task complexity
   */
  app.post('/complexity-analysis', async (req: Request, res: Response) => {
    try {
      const { task } = req.body;

      const validation = securityManager.validateInput(task);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.reason });
      }

      const tokenCounter = router.getTokenCounter();
      const inputTokens = await tokenCounter.countTokens(task, 'haiku');

      return res.json({
        message: 'Complexity analysis endpoint prepared',
        inputTokens: inputTokens.input,
        note: 'Full complexity analysis will be available with ComplexityAnalyzer integration',
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to analyze complexity' });
    }
  });

  /**
   * POST /api/feedback - Record feedback for learning
   */
  app.post('/feedback', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string || 'anonymous';
      const { taskHash, model, success, qualityScore, escalationReason } = req.body;

      if (!taskHash || !model) {
        return res.status(400).json({ error: 'taskHash and model are required' });
      }

      router.recordFeedback(taskHash, model as any, success, qualityScore, escalationReason);

      return res.json({
        message: 'Feedback recorded successfully',
        taskHash,
        model,
        success,
        userId,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to record feedback' });
    }
  });

  /**
   * GET /api/stats - Get comprehensive router statistics (cached, <100ms)
   * NEW (Tier 2 Phase 2B): Uses Redis-backed metrics cache
   */
  app.get('/stats', async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const cachedMetrics = await router.getCachedMetrics();

      return res.json({
        totalRequests: cachedMetrics.totalRequests,
        totalTokensSaved: cachedMetrics.totalTokensSaved,
        totalCostSaved: `$${cachedMetrics.totalCostSaved.toFixed(2)}`,
        modelDistribution: cachedMetrics.modelDistribution,
        averageQuality: cachedMetrics.averageQuality.toFixed(2),
        escalationRate: `${(cachedMetrics.escalationRate * 100).toFixed(1)}%`,
        validationRate: `${cachedMetrics.validationRate.toFixed(1)}%`,
        sparklines: cachedMetrics.sparklines,
        cacheInfo: {
          cacheHit: cachedMetrics.cacheHit,
          responseTimeMs: Date.now() - startTime,
          lastUpdated: new Date(cachedMetrics.lastUpdated).toISOString(),
          nextUpdate: new Date(cachedMetrics.nextUpdate).toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to get cached stats:', error);
      // Fallback to non-cached stats
      const stats = router.getStats();
      return res.json({
        totalRequests: stats.totalRequests,
        totalTokensSaved: stats.totalTokensSaved,
        totalCostSaved: `$${stats.totalCostSaved.toFixed(2)}`,
        modelDistribution: stats.modelUsage,
        timestamp: new Date().toISOString(),
        error: 'Cache unavailable, returned non-cached metrics',
      });
    }
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
   * GET /api/dashboard - Get dashboard data with sparklines (NEW: Tier 2 Phase 2B real-time)
   */
  app.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      const metrics = await router.getCachedMetrics();
      const cacheStats = router.getMetricsCacheStats();

      return res.json({
        summary: {
          totalRequests: metrics.totalRequests,
          totalTokensSaved: metrics.totalTokensSaved,
          totalCostSaved: metrics.totalCostSaved,
          averageQuality: metrics.averageQuality,
          escalationRate: metrics.escalationRate,
          validationRate: metrics.validationRate,
        },
        sparklines: metrics.sparklines,
        cache: {
          hitRate: `${cacheStats.snapshotCount}/${cacheStats.cacheSize} snapshots`,
          responseTimeMs: Date.now() - startTime,
          isStale: cacheStats.isStale,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to fetch dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/data-quality - Get data quality metrics (Tier 2 Phase 2A measurement infrastructure)
   */
  app.get('/data-quality', (req: Request, res: Response) => {
    try {
      const metrics = router.getDataQualityMetrics();
      const report = router.getDataQualityReport();

      return res.json({
        metrics,
        report,
        status:
          metrics.validationRate >= 99
            ? 'healthy'
            : metrics.validationRate >= 95
              ? 'warning'
              : 'critical',
        message:
          metrics.validationRate >= 99
            ? 'Data quality is excellent'
            : metrics.validationRate >= 95
              ? 'Data quality has some issues - investigate errors'
              : 'Data quality is critical - immediate attention required',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to get data quality metrics:', error);
      return res.status(500).json({
        error: 'Failed to retrieve data quality metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/data-quality/reset - Reset data quality metrics (admin endpoint)
   */
  app.get('/data-quality/reset', (req: Request, res: Response) => {
    try {
      // Simple admin check - in production, use proper auth
      const adminKey = req.headers['x-admin-key'];
      if (adminKey !== process.env.ADMIN_KEY && process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      router.resetQualityMetrics();

      return res.json({
        message: 'Data quality metrics reset successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to reset metrics' });
    }
  });

  /**
   * Health check
   */
  app.get('/health', (req: Request, res: Response) => {
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
};
