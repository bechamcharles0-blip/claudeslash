/**
 * Analytics API: REST endpoints for metrics, dashboards, and insights
 * Serves aggregated data to dashboards and reporting systems
 */

import express, { Request, Response } from 'express';
import { EventPersistenceAdapter } from '../core/analytics.js';
import { AnalyticsEvent, AggregatedMetrics, AnalyticsInsight } from '../types/analytics.js';

export const createAnalyticsAPI = (persistence: EventPersistenceAdapter) => {
  const app = express.Router();

  /**
   * GET /analytics/metrics - Aggregated metrics for a time period
   * Query params: period (hour|day|week|month), startTime, endTime
   */
  app.get('/metrics', async (req: Request, res: Response) => {
    try {
      const { period = 'day', startTime, endTime } = req.query;

      const start = startTime ? parseInt(startTime as string) : Date.now() - 24 * 3600 * 1000;
      const end = endTime ? parseInt(endTime as string) : Date.now();

      const events = await persistence.getEvents({
        startTime: start,
        endTime: end,
      });

      const metrics = calculateMetrics(events, start, end, period as string);

      return res.json(metrics);
    } catch (error) {
      console.error('Metrics error:', error);
      return res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  /**
   * GET /analytics/kpis - Key Performance Indicators
   */
  app.get('/kpis', async (req: Request, res: Response) => {
    try {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const start = Date.now() - hoursBack * 3600 * 1000;

      const events = await persistence.getEvents({
        startTime: start,
        endTime: Date.now(),
      });

      const feedback = await persistence.getFeedback({
        startTime: start,
        endTime: Date.now(),
      });

      const kpis = {
        tokenSavings: calculateTokenSavings(events),
        costSavings: calculateCostSavings(events),
        modelAccuracy: calculateModelAccuracy(events, feedback),
        userSatisfaction: calculateUserSatisfaction(feedback),
        apiLatency: calculateLatencyMetrics(events),
        cacheHitRate: calculateCacheHitRate(events),
        systemReliability: calculateReliability(events),
        period: {
          hours: hoursBack,
          startTime: start,
          endTime: Date.now(),
        },
      };

      return res.json(kpis);
    } catch (error) {
      console.error('KPI error:', error);
      return res.status(500).json({ error: 'Failed to get KPIs' });
    }
  });

  /**
   * GET /analytics/dashboard - Complete dashboard data
   */
  app.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const { period = 'day' } = req.query;

      const hoursBack = period === 'week' ? 168 : period === 'month' ? 720 : 24;
      const start = Date.now() - hoursBack * 3600 * 1000;

      const [events, feedback] = await Promise.all([
        persistence.getEvents({ startTime: start }),
        persistence.getFeedback({ startTime: start }),
      ]);

      const metrics = calculateMetrics(events, start, Date.now(), period as string);
      const insights = generateInsights(events, feedback);

      const dashboard = {
        metrics,
        insights: insights.slice(0, 10), // Top 10 insights
        period,
        generatedAt: new Date().toISOString(),
      };

      return res.json(dashboard);
    } catch (error) {
      console.error('Dashboard error:', error);
      return res.status(500).json({ error: 'Failed to get dashboard data' });
    }
  });

  /**
   * GET /analytics/users - User-level metrics
   */
  app.get('/users', async (req: Request, res: Response) => {
    try {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const start = Date.now() - hoursBack * 3600 * 1000;

      const events = await persistence.getEvents({ startTime: start });
      const userMetrics = analyzeByUser(events);

      return res.json({
        period: { hours: hoursBack },
        totalUsers: Object.keys(userMetrics).length,
        users: Object.entries(userMetrics)
          .sort(([, a], [, b]) => b.requestCount - a.requestCount)
          .slice(0, 50)
          .map(([userId, metrics]) => ({ userId, ...metrics })),
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get user metrics' });
    }
  });

  /**
   * GET /analytics/models - Model selection analysis
   */
  app.get('/models', async (req: Request, res: Response) => {
    try {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const start = Date.now() - hoursBack * 3600 * 1000;

      const events = await persistence.getEvents({ startTime: start });
      const modelAnalysis = analyzeByModel(events);

      return res.json({
        period: { hours: hoursBack },
        models: modelAnalysis,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get model analysis' });
    }
  });

  /**
   * GET /analytics/errors - Error analysis
   */
  app.get('/errors', async (req: Request, res: Response) => {
    try {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const start = Date.now() - hoursBack * 3600 * 1000;

      const events = await persistence.getEvents({ startTime: start, eventType: 'error_occurred' });

      const errorsByCode = new Map<string, number>();
      const errorDetails = new Map<string, string[]>();

      for (const event of events) {
        if (event.errorCode) {
          errorsByCode.set(event.errorCode, (errorsByCode.get(event.errorCode) || 0) + 1);
          const details = errorDetails.get(event.errorCode) || [];
          if (event.errorMessage) details.push(event.errorMessage);
          errorDetails.set(event.errorCode, details.slice(-5)); // keep last 5
        }
      }

      return res.json({
        period: { hours: hoursBack },
        totalErrors: events.length,
        errorsByCode: Object.fromEntries(
          Array.from(errorsByCode.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 20)
        ),
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get error analysis' });
    }
  });

  /**
   * GET /analytics/feedback - User feedback summary
   */
  app.get('/feedback', async (req: Request, res: Response) => {
    try {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const start = Date.now() - hoursBack * 3600 * 1000;

      const feedback = await persistence.getFeedback({ startTime: start });

      const summary = {
        totalFeedback: feedback.length,
        averageSatisfaction: feedback.length > 0
          ? feedback.reduce((sum, f) => sum + (f.satisfaction || 0), 0) / feedback.length
          : 0,
        averageAccuracy: feedback.length > 0
          ? feedback.reduce((sum, f) => sum + (f.accuracy || 0), 0) / feedback.length
          : 0,
        averageSpeed: feedback.length > 0
          ? feedback.reduce((sum, f) => sum + (f.speed || 0), 0) / feedback.length
          : 0,
        feedbackByType: Object.fromEntries(
          Array.from(
            feedback.reduce((map, f) => {
              map.set(f.feedbackType, (map.get(f.feedbackType) || 0) + 1);
              return map;
            }, new Map<string, number>())
          )
        ),
        topIssues: Array.from(
          feedback
            .filter(f => f.issueCategory)
            .reduce((map, f) => {
              const cat = f.issueCategory!;
              map.set(cat, (map.get(cat) || 0) + 1);
              return map;
            }, new Map<string, number>())
          .entries()
        )
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10),
        wouldUseAgainRate: feedback.length > 0
          ? (feedback.filter(f => f.wouldUseAgain).length / feedback.length) * 100
          : 0,
      };

      return res.json(summary);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to get feedback summary' });
    }
  });

  return app;
};

/**
 * Calculate aggregated metrics from events
 */
function calculateMetrics(
  events: AnalyticsEvent[],
  startTime: number,
  endTime: number,
  period: string
): AggregatedMetrics {
  const completedEvents = events.filter(e => e.type === 'request_completed');
  const errorEvents = events.filter(e => e.error);

  const totalRequests = completedEvents.length;
  const totalTokensUsed = completedEvents.reduce((sum, e) => sum + (e.tokensInput || 0) + (e.tokensOutput || 0), 0);
  const totalTokensCached = completedEvents.reduce((sum, e) => sum + (e.tokensCached || 0), 0);
  const totalTokensSaved = completedEvents.reduce((sum, e) => sum + (e.tokensSaved || 0), 0);
  const totalCostActual = completedEvents.reduce((sum, e) => sum + (e.costActual || 0), 0);
  const totalCostBaseline = completedEvents.reduce((sum, e) => sum + (e.costBaseline || 0), 0);

  const modelUsage: Record<string, number> = {};
  const modelCosts: Record<string, number> = {};
  const modelQuality: Record<string, number> = {};

  for (const event of completedEvents) {
    if (event.selectedModel) {
      modelUsage[event.selectedModel] = (modelUsage[event.selectedModel] || 0) + 1;
      modelCosts[event.selectedModel] = (modelCosts[event.selectedModel] || 0) + (event.costActual || 0);
      modelQuality[event.selectedModel] = (modelQuality[event.selectedModel] || 0) + (event.qualityEstimate || 0);
    }
  }

  // Normalize quality
  for (const model in modelQuality) {
    modelQuality[model] = modelQuality[model] / (modelUsage[model] || 1);
  }

  return {
    periodStart: startTime,
    periodEnd: endTime,
    period: period as any,
    totalRequests,
    successfulRequests: totalRequests - errorEvents.length,
    failedRequests: errorEvents.length,
    successRate: totalRequests > 0 ? ((totalRequests - errorEvents.length) / totalRequests) * 100 : 0,
    totalTokensUsed,
    totalTokensCached,
    totalTokensSaved,
    averageTokensSavedPerRequest: totalRequests > 0 ? totalTokensSaved / totalRequests : 0,
    cacheHitRate: totalTokensUsed > 0 ? (totalTokensCached / totalTokensUsed) * 100 : 0,
    totalCostActual,
    totalCostBaseline,
    totalCostSaved: totalCostBaseline - totalCostActual,
    savingsPercent: totalCostBaseline > 0 ? ((totalCostBaseline - totalCostActual) / totalCostBaseline) * 100 : 0,
    costPerRequest: totalRequests > 0 ? totalCostActual / totalRequests : 0,
    modelUsage,
    modelCosts,
    modelQuality,
    averageQuality: completedEvents.length > 0
      ? completedEvents.reduce((sum, e) => sum + (e.qualityEstimate || 0), 0) / completedEvents.length
      : 0,
    averageSatisfaction: 0, // from feedback
    averageAccuracy: 0, // from feedback
    averageSpeed: 0, // from feedback
    feedbackResponseRate: 0,
    averageExecutionTime: completedEvents.length > 0
      ? completedEvents.reduce((sum, e) => sum + (e.executionTimeMs || 0), 0) / completedEvents.length
      : 0,
    p50ExecutionTime: 0,
    p95ExecutionTime: 0,
    p99ExecutionTime: 0,
    escalationRate: totalRequests > 0
      ? (completedEvents.filter(e => e.escalated).length / totalRequests) * 100
      : 0,
    escalationReasons: {},
    errorRate: totalRequests > 0 ? (errorEvents.length / totalRequests) * 100 : 0,
    topErrors: [],
    anomalyDetectionRate: 0,
    rateViolations: 0,
    injectionAttempts: 0,
    uniqueUsers: new Set(events.map(e => e.userId)).size,
    userRetention: 0,
    requestsPerUser: totalRequests > 0 ? totalRequests / new Set(events.map(e => e.userId)).size : 0,
    topUsers: [],
    topTaskCategories: [],
    categoryMetrics: {},
  };
}

/**
 * Calculate token savings
 */
function calculateTokenSavings(events: AnalyticsEvent[]) {
  const completedEvents = events.filter(e => e.type === 'request_completed');
  const totalTokensSaved = completedEvents.reduce((sum, e) => sum + (e.tokensSaved || 0), 0);
  const totalTokensUsed = completedEvents.reduce((sum, e) => sum + (e.tokensInput || 0) + (e.tokensOutput || 0), 0);

  return {
    totalSaved: totalTokensSaved,
    percent: totalTokensUsed > 0 ? (totalTokensSaved / totalTokensUsed) * 100 : 0,
    requestsAnalyzed: completedEvents.length,
  };
}

/**
 * Calculate cost savings
 */
function calculateCostSavings(events: AnalyticsEvent[]) {
  const completedEvents = events.filter(e => e.type === 'request_completed');
  const totalCostActual = completedEvents.reduce((sum, e) => sum + (e.costActual || 0), 0);
  const totalCostBaseline = completedEvents.reduce((sum, e) => sum + (e.costBaseline || 0), 0);

  return {
    saved: totalCostBaseline - totalCostActual,
    percent: totalCostBaseline > 0 ? ((totalCostBaseline - totalCostActual) / totalCostBaseline) * 100 : 0,
    actual: totalCostActual,
    baseline: totalCostBaseline,
  };
}

/**
 * Calculate model selection accuracy from feedback
 */
function calculateModelAccuracy(events: AnalyticsEvent[], feedback: any[]) {
  if (feedback.length === 0) {
    return { score: 0, totalFeedback: 0 };
  }

  // Count how many users confirmed their preferred model match
  const correct = feedback.filter(f => f.preferredModel === f.selectedModel || !f.preferredModel).length;

  return {
    score: (correct / feedback.length) * 100,
    totalFeedback: feedback.length,
  };
}

/**
 * Calculate user satisfaction
 */
function calculateUserSatisfaction(feedback: any[]) {
  if (feedback.length === 0) {
    return { score: 0, totalFeedback: 0 };
  }

  const avgSatisfaction = feedback.reduce((sum, f) => sum + (f.satisfaction || 0), 0) / feedback.length;

  return {
    score: avgSatisfaction,
    scale: '1-5',
    totalFeedback: feedback.length,
  };
}

/**
 * Calculate latency metrics
 */
function calculateLatencyMetrics(events: AnalyticsEvent[]) {
  const completedEvents = events.filter(e => e.type === 'request_completed' && e.executionTimeMs);
  const times = completedEvents.map(e => e.executionTimeMs || 0).sort((a, b) => a - b);

  return {
    average: times.length > 0 ? times.reduce((a, b) => a + b) / times.length : 0,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
    max: times[times.length - 1],
  };
}

/**
 * Calculate cache hit rate
 */
function calculateCacheHitRate(events: AnalyticsEvent[]) {
  const completedEvents = events.filter(e => e.type === 'request_completed');
  const cacheHits = completedEvents.filter(e => e.cacheHit).length;

  return {
    rate: completedEvents.length > 0 ? (cacheHits / completedEvents.length) * 100 : 0,
    hits: cacheHits,
    total: completedEvents.length,
  };
}

/**
 * Calculate system reliability
 */
function calculateReliability(events: AnalyticsEvent[]) {
  const completedEvents = events.filter(e => e.type === 'request_completed');
  const errorEvents = events.filter(e => e.error);

  return {
    uptime: completedEvents.length > 0 ? ((completedEvents.length - errorEvents.length) / completedEvents.length) * 100 : 100,
    errors: errorEvents.length,
    total: completedEvents.length,
  };
}

/**
 * Analyze metrics by user
 */
function analyzeByUser(events: AnalyticsEvent[]) {
  const userMetrics: Record<string, any> = {};

  for (const event of events) {
    if (!userMetrics[event.userId]) {
      userMetrics[event.userId] = {
        requestCount: 0,
        totalTokens: 0,
        totalCost: 0,
        averageQuality: 0,
      };
    }

    if (event.type === 'request_completed') {
      userMetrics[event.userId].requestCount++;
      userMetrics[event.userId].totalTokens += (event.tokensInput || 0) + (event.tokensOutput || 0);
      userMetrics[event.userId].totalCost += event.costActual || 0;
      userMetrics[event.userId].averageQuality += event.qualityEstimate || 0;
    }
  }

  // Normalize quality
  for (const userId in userMetrics) {
    if (userMetrics[userId].requestCount > 0) {
      userMetrics[userId].averageQuality /= userMetrics[userId].requestCount;
    }
  }

  return userMetrics;
}

/**
 * Analyze metrics by model
 */
function analyzeByModel(events: AnalyticsEvent[]) {
  const modelMetrics: Record<string, any> = {};

  for (const event of events) {
    if (event.type === 'request_completed' && event.selectedModel) {
      if (!modelMetrics[event.selectedModel]) {
        modelMetrics[event.selectedModel] = {
          count: 0,
          totalCost: 0,
          averageQuality: 0,
          averageLatency: 0,
          errorRate: 0,
        };
      }

      modelMetrics[event.selectedModel].count++;
      modelMetrics[event.selectedModel].totalCost += event.costActual || 0;
      modelMetrics[event.selectedModel].averageQuality += event.qualityEstimate || 0;
      modelMetrics[event.selectedModel].averageLatency += event.executionTimeMs || 0;
    }
  }

  // Normalize
  for (const model in modelMetrics) {
    if (modelMetrics[model].count > 0) {
      modelMetrics[model].averageQuality /= modelMetrics[model].count;
      modelMetrics[model].averageLatency /= modelMetrics[model].count;
      modelMetrics[model].costPerRequest = modelMetrics[model].totalCost / modelMetrics[model].count;
    }
  }

  return modelMetrics;
}

/**
 * Generate insights from events
 */
function generateInsights(events: AnalyticsEvent[], feedback: any[]): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  // Insight 1: High error rate
  const errorRate = events.filter(e => e.error).length / events.length;
  if (errorRate > 0.05) {
    insights.push({
      insightId: 'high_error_rate',
      timestamp: Date.now(),
      type: 'warning',
      severity: 'high',
      title: 'High Error Rate Detected',
      description: `${(errorRate * 100).toFixed(1)}% of requests are failing. This may indicate an issue with the API or model selection.`,
      evidence: [{ metric: 'error_rate', current: errorRate * 100 }],
      targetTeam: 'devops',
      recommendedAction: 'Investigate error logs and check API health',
      priority: 9,
      periodStart: events[0]?.timestamp || Date.now(),
      periodEnd: events[events.length - 1]?.timestamp || Date.now(),
    });
  }

  // Insight 2: Low cache hit rate
  const completedEvents = events.filter(e => e.type === 'request_completed');
  const cacheHitRate = completedEvents.filter(e => e.cacheHit).length / completedEvents.length;
  if (cacheHitRate < 0.1) {
    insights.push({
      insightId: 'low_cache_hit',
      timestamp: Date.now(),
      type: 'opportunity',
      severity: 'medium',
      title: 'Low Cache Hit Rate',
      description: 'Only 10% of requests are hitting the cache. Consider increasing cache TTL or improving cache key strategy.',
      evidence: [{ metric: 'cache_hit_rate', current: cacheHitRate * 100 }],
      targetTeam: 'devops',
      recommendedAction: 'Review cache configuration and increase effective TTL',
      estimatedImpact: '10-15% latency improvement',
      priority: 6,
      periodStart: events[0]?.timestamp || Date.now(),
      periodEnd: events[events.length - 1]?.timestamp || Date.now(),
    });
  }

  return insights;
}
