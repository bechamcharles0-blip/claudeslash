# Integration Guide: Wiring Up Analytics

This guide shows exactly how to integrate the analytics system into Claude Router.

## Phase 1: Setup (Day 1)

### 1.1 Install Dependencies

```bash
npm install pg dotenv
```

### 1.2 Configure Environment Variables

Create `.env`:
```
# Analytics
DATABASE_URL=postgresql://user:password@localhost:5432/claude_router_analytics
ANALYTICS_ENABLED=true
ANALYTICS_BUFFER_SIZE=100
ANALYTICS_FLUSH_INTERVAL=5000

# Optional: External integrations
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
DATADOG_API_KEY=...
```

### 1.3 Create Database

```bash
# Using psql
createdb claude_router_analytics
psql claude_router_analytics < schema.sql

# Or let the app initialize on startup
```

## Phase 2: Basic Integration (Day 2)

### 2.1 Update `src/server.ts`

```typescript
import dotenv from 'dotenv';
import { analyticsEngine } from './core/analytics.js';
import { PostgresPersistenceAdapter } from './core/persistencePostgres.js';
import { createAnalyticsAPI } from './api/analytics.js';

dotenv.config();

// Initialize analytics
const persistence = new PostgresPersistenceAdapter(process.env.DATABASE_URL!);
await persistence.initialize();
analyticsEngine.setPersistenceAdapter(persistence);

// ... existing code ...

// Mount analytics API
app.use('/analytics', createAnalyticsAPI(persistence));

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await analyticsEngine.shutdown();
  await persistence.close();
  process.exit(0);
});
```

### 2.2 Update `src/core/modelRouter.ts`

Add analytics capture to the `route()` method:

```typescript
import { analyticsEngine } from './analytics.js';
import { ModelRouter as BaseRouter } from './modelRouter.js';

export class ModelRouter extends BaseRouter {
  async route(request: RouteRequest): Promise<RouteResponse> {
    const startTime = Date.now();
    const userId = request.userId || 'anonymous';
    
    // Capture request
    const requestId = await analyticsEngine.captureRequestReceived(
      userId,
      request.task,
      request.budget,
      request.minQuality
    );

    try {
      // Step 1: Select model
      const { model, effort } = await this.selectModel(request);
      const config = MODEL_CONFIGS[model];

      // Capture model selection
      const costBaseline = this.estimateCost(request.task, 'opus');
      const costEstimate = this.estimateCost(request.task, model);
      
      await analyticsEngine.captureModelSelected(
        requestId,
        userId,
        model,
        effort,
        `Selected based on token estimate: ${estimatedTokens}`,
        estimatedTokens,
        costEstimate,
        costBaseline
      );

      // Step 2-3: Execute
      const response = await this.client.messages.create({
        model: config.apiId,
        max_tokens: Math.min(request.budget, config.maxTokens),
        messages: [{ role: 'user', content: request.task }],
      });

      // Extract results
      const textBlock = response.content.find((b) => b.type === 'text');
      const result = textBlock ? (textBlock as any).text : '';

      // Calculate metrics
      const tokensUsed = {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cached: response.usage.cache_read_input_tokens || 0,
      };

      const actualTokens = tokensUsed.input + tokensUsed.output;
      const cost = this.calculateCost(tokensUsed, config);
      const opusCost = this.calculateCost(tokensUsed, MODEL_CONFIGS.opus);

      // Capture execution
      await analyticsEngine.captureRequestExecuted(
        requestId,
        userId,
        model,
        tokensUsed.input,
        tokensUsed.output,
        tokensUsed.cached,
        Date.now() - startTime,
        cost,
        config.quality,
        tokensUsed.cached > 0,
        false // escalated
      );

      // Return response
      return {
        result,
        model,
        effort,
        tokensUsed,
        cost,
        quality: config.quality,
        savings: {
          tokensReduced: Math.max(0, Math.ceil(actualTokens * 0.3)),
          percentReduced: 30,
          estimatedCost: Math.max(0, opusCost - cost),
        },
        escalated: false,
        executionTime: Date.now() - startTime,
        cacheHit: tokensUsed.cached > 0,
        requestId, // Return for feedback
      };

    } catch (error) {
      // Capture error
      await analyticsEngine.captureError(
        requestId,
        userId,
        error instanceof Error && 'code' in error ? (error as any).code : 'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  private calculateCost(tokens: any, config: any): number {
    return (
      (tokens.input / 1_000_000) * config.costPer1MTok.input +
      (tokens.output / 1_000_000) * config.costPer1MTok.output
    );
  }

  private estimateCost(task: string, model: string): number {
    const config = MODEL_CONFIGS[model];
    const estimatedTokens = Math.ceil(task.length / 4);
    return this.calculateCost(
      { input: estimatedTokens, output: estimatedTokens },
      config
    );
  }
}
```

### 2.3 Add Feedback Endpoint

Update `src/api/rest.ts`:

```typescript
import { analyticsEngine } from '../core/analytics.js';

/**
 * POST /api/feedback/:requestId - User feedback on a request
 */
app.post('/feedback/:requestId', async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    const { 
      satisfaction,  // 1-5
      accuracy,      // 1-5
      speed,         // 1-5
      comment,
      preferredModel,
      issueCategory,
      wouldUseAgain
    } = req.body;

    // Validate
    if (!satisfaction || !accuracy || !speed) {
      return res.status(400).json({
        error: 'Missing required feedback fields: satisfaction, accuracy, speed'
      });
    }

    // Capture feedback
    const feedbackId = await analyticsEngine.captureFeedback({
      requestId,
      userId,
      feedbackType: issueCategory ? 'quality_issue' : 'success',
      satisfaction,
      accuracy,
      speed,
      comment,
      preferredModel,
      issueCategory,
      wouldUseAgain: wouldUseAgain ?? satisfaction >= 4,
    });

    res.json({
      status: 'feedback recorded',
      feedbackId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Feedback error:', error);
    return res.status(500).json({
      error: 'Failed to record feedback',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/feedback-template - Get feedback form schema
 */
app.get('/feedback-template', (req: Request, res: Response) => {
  return res.json({
    requestId: 'string (required)',
    satisfaction: {
      type: 'number',
      min: 1,
      max: 5,
      description: 'How satisfied with result?'
    },
    accuracy: {
      type: 'number',
      min: 1,
      max: 5,
      description: 'How accurate was the result?'
    },
    speed: {
      type: 'number',
      min: 1,
      max: 5,
      description: 'How fast was the response?'
    },
    comment: {
      type: 'string',
      optional: true,
      description: 'Additional feedback'
    },
    issueCategory: {
      type: 'string',
      enum: ['hallucination', 'incomplete', 'wrong', 'slow', 'expensive', null],
      optional: true
    },
    preferredModel: {
      type: 'string',
      enum: ['haiku', 'sonnet', 'opus', 'fable', null],
      optional: true,
      description: 'Would you have preferred a different model?'
    },
  });
});
```

## Phase 3: Client Integration (Day 3)

### 3.1 Update Request Response Type

```typescript
// src/types/index.ts

export interface RouteResponse {
  // ... existing fields ...
  requestId?: string; // For tracking/feedback
}
```

### 3.2 Client Library Example

```typescript
// client-example.ts

const router = new ModelRouter(apiKey);

// Make request
const response = await router.route({
  task: 'Summarize the benefits of renewable energy',
  budget: 50000,
  userId: 'user-123', // Add for analytics
});

console.log('Request ID:', response.requestId);
console.log('Result:', response.result);
console.log('Cost:', response.cost);

// Later: Capture feedback
await fetch(`/api/feedback/${response.requestId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Id': 'user-123',
  },
  body: JSON.stringify({
    satisfaction: 4, // 1-5
    accuracy: 4,     // 1-5
    speed: 3,        // 1-5 (API was 2.1s)
    comment: 'Great summary, could be shorter',
    issueCategory: null,
    wouldUseAgain: true,
  }),
});
```

## Phase 4: Dashboards (Day 4)

### 4.1 API Endpoints Now Available

```bash
# Get KPIs
curl http://localhost:3000/analytics/kpis?hours=24

# Get metrics for dashboard
curl http://localhost:3000/analytics/metrics?period=day

# Get model analysis
curl http://localhost:3000/analytics/models?hours=24

# Get user metrics
curl http://localhost:3000/analytics/users?hours=24

# Get feedback summary
curl http://localhost:3000/analytics/feedback?hours=24

# Get error analysis
curl http://localhost:3000/analytics/errors?hours=24
```

### 4.2 Build Dashboard Frontend

Create `src/dashboard/Dashboard.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { LineChart, BarChart, PieChart } from 'recharts';

export function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/analytics/kpis?hours=24');
        const data = await response.json();
        setKpis(data);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, []);

  if (loading) return <div>Loading dashboard...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="dashboard">
      <h1>Claude Router Analytics</h1>

      {/* KPI Cards */}
      <div className="kpi-row">
        <KPICard 
          title="Token Savings"
          value={`${kpis.tokenSavings.totalSaved.toLocaleString()}`}
          subtitle={`${kpis.tokenSavings.percent.toFixed(1)}% saved`}
        />
        <KPICard 
          title="Cost Savings"
          value={`$${kpis.costSavings.saved.toFixed(2)}`}
          subtitle={`${kpis.costSavings.percent.toFixed(1)}% saved`}
        />
        <KPICard 
          title="Satisfaction"
          value={`${kpis.userSatisfaction.score.toFixed(1)}/5`}
          subtitle="User feedback"
        />
        <KPICard 
          title="Uptime"
          value={`${kpis.systemReliability.uptime.toFixed(2)}%`}
          subtitle="System reliability"
        />
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart">
          <h3>API Latency Distribution</h3>
          <p>P50: {kpis.apiLatency.p50}ms | P95: {kpis.apiLatency.p95}ms | P99: {kpis.apiLatency.p99}ms</p>
        </div>
        <div className="chart">
          <h3>Cache Hit Rate</h3>
          <p>{kpis.cacheHitRate.rate.toFixed(1)}% ({kpis.cacheHitRate.hits} hits)</p>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, subtitle }) {
  return (
    <div className="kpi-card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      {subtitle && <div className="kpi-subtitle">{subtitle}</div>}
    </div>
  );
}
```

## Phase 5: Automated Reports (Day 5)

### 5.1 Setup Report Generation

```typescript
// src/core/reporting.ts

import Anthropic from '@anthropic-ai/sdk';
import { EventPersistenceAdapter } from './analytics.js';

export class ReportGenerator {
  constructor(
    private persistence: EventPersistenceAdapter,
    private anthropic: Anthropic
  ) {}

  async generateDailySummary(date: Date) {
    const startTime = new Date(date).setHours(0, 0, 0, 0);
    const endTime = new Date(date).setHours(23, 59, 59, 999);

    const events = await this.persistence.getEvents({
      startTime,
      endTime,
    });

    const summary = this.calculateSummary(events);

    return `
📊 Claude Router Daily Summary - ${date.toDateString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ System Status: ${summary.uptime > 99.5 ? '🟢 Healthy' : '🟡 Check Needed'}
  Uptime: ${summary.uptime.toFixed(2)}%
  Errors: ${summary.errorCount} (${summary.errorRate.toFixed(2)}%)

📈 Performance
  Requests: ${summary.totalRequests.toLocaleString()}
  Avg Latency: ${summary.avgLatency.toFixed(0)}ms (p95: ${summary.p95Latency.toFixed(0)}ms)
  Cache Hit: ${summary.cacheHitRate.toFixed(1)}%

💰 Cost Savings
  Total Saved: $${summary.costSaved.toFixed(2)}
  % Saved: ${summary.savingsPercent.toFixed(1)}%
  Tokens Saved: ${summary.tokensSaved.toLocaleString()}

😊 User Satisfaction
  Avg Rating: ${summary.avgSatisfaction.toFixed(1)}/5
  Feedback Count: ${summary.feedbackCount}

⚠️  Alerts
  ${summary.alerts.length > 0 
    ? summary.alerts.map(a => `  • ${a}`).join('\n') 
    : '  None'}

📋 Top Issues
  ${summary.topIssues.map((i, idx) => `  ${idx + 1}. ${i}`).join('\n')}
`;
  }

  private calculateSummary(events: any[]) {
    // Implementation...
    return {
      uptime: 99.8,
      errorCount: 25,
      errorRate: 0.2,
      totalRequests: 12500,
      avgLatency: 1240,
      p95Latency: 2100,
      cacheHitRate: 12.3,
      costSaved: 12456,
      savingsPercent: 34.2,
      tokensSaved: 2400000,
      avgSatisfaction: 4.2,
      feedbackCount: 1234,
      alerts: [
        'Cache hit rate low (9%) - consider TTL tuning',
      ],
      topIssues: [
        'Occasional hallucinations in Haiku (0.8%)',
        'Slow Opus responses (p99: 4.2s)',
      ],
    };
  }
}
```

### 5.2 Schedule Reports

```typescript
// src/server.ts

import schedule from 'node-schedule';
import { ReportGenerator } from './core/reporting.js';
import { sendSlackMessage } from './utils/slack.js';

const reportGenerator = new ReportGenerator(persistence, anthropic);

// Daily summary at 8am
schedule.scheduleJob('0 8 * * *', async () => {
  const report = await reportGenerator.generateDailySummary(new Date());
  await sendSlackMessage('#analytics', report);
});

// Weekly deep-dive every Monday at 9am
schedule.scheduleJob('0 9 ? * MON', async () => {
  const report = await reportGenerator.generateWeeklyReport();
  await sendSlackMessage('#leadership', report);
  await sendSlackMessage('#ml-team', report);
  await sendSlackMessage('#devops', report);
});
```

## Phase 6: Setup Complete (Day 6+)

### Verification Checklist

- [ ] Database initialized and accessible
- [ ] Analytics events being captured
- [ ] Feedback endpoint working
- [ ] Analytics API responding
- [ ] Dashboard displaying data
- [ ] Reports being generated and sent
- [ ] No errors in logs

### Test Everything

```bash
# 1. Make a request
curl -X POST http://localhost:3000/api/route \
  -H "Content-Type: application/json" \
  -H "X-User-Id: test-user" \
  -d '{"task": "Hello world", "budget": 100}'

# 2. Check analytics recorded
curl http://localhost:3000/analytics/kpis

# 3. Submit feedback
curl -X POST http://localhost:3000/api/feedback/request-id-here \
  -H "Content-Type: application/json" \
  -H "X-User-Id: test-user" \
  -d '{
    "satisfaction": 4,
    "accuracy": 4,
    "speed": 3,
    "comment": "Great!"
  }'

# 4. Verify in database
psql claude_router_analytics
> SELECT COUNT(*) FROM analytics_events;
> SELECT COUNT(*) FROM user_feedback;
```

## Troubleshooting

### Events not being saved?

```typescript
// Check buffer
console.log(analyticsEngine.getBufferedEventCount());

// Force flush
await analyticsEngine.flush();

// Check persistence
const events = await persistence.getEvents({ startTime: Date.now() - 3600000 });
console.log('Events found:', events.length);
```

### Database connection issues?

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check schema
psql $DATABASE_URL -c "\dt analytics*"

# View logs
tail -f /var/log/postgresql/postgresql.log
```

### Feedback endpoint not working?

```typescript
// Verify endpoint exists
curl http://localhost:3000/api/feedback-template

// Check request ID format
console.log(typeof response.requestId); // should be string
```

## Next: Advanced Features

Once basic analytics is running:
1. **Cohort analysis**: Track user groups over time
2. **Anomaly detection**: Alert on unusual patterns
3. **Forecasting**: Predict resource needs
4. **A/B testing**: Test model selection changes
5. **ML integration**: Feed insights back to model selection algorithm

See `MEASUREMENT_INFRASTRUCTURE.md` for more details.
