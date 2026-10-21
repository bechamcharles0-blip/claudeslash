# Claude Router: Measurement Infrastructure & Feedback Loops

## Executive Summary

This document describes the complete measurement infrastructure for Claude Router, designed to:
- **Measure what matters**: Token savings, cost reduction, model accuracy, user satisfaction
- **Track everything**: Every request logged with full context for analysis
- **Enable feedback loops**: Data flows back to ML team (model selection), DevOps (infrastructure), Product (user needs)
- **Generate insights**: Automated dashboards, alerts, and recommendations

**Key Metrics:**
- Token Savings: Real % savings vs. using Opus for all requests
- Cost Savings: $ and % reduction per request/user
- Model Selection Accuracy: % of times right model was chosen
- User Satisfaction: Feedback-based quality scores
- API Latency: p50/p95/p99 execution times
- Cache Hit Rate: % of requests served from cache
- System Reliability: Uptime and error rates

---

## Architecture Overview

### 1. Event Capture Layer
Every interaction is captured as an **AnalyticsEvent** at 5 key moments:

```
Request Received → Model Selected → Request Executed → Feedback Captured → Insights Generated
     |                |                   |                 |                    |
  task size         model choice       cost/quality    user rating        recommendations
  budget            effort level       tokens used      satisfaction      model changes
  user/task         reasoning          latency         accuracy           infrastructure
```

**Events Captured:**
- `request_received`: Initial request metadata (task, budget, user)
- `model_selected`: Model choice and reasoning
- `request_executed`: Actual execution metrics (cost, tokens, latency, quality)
- `cache_hit`: Cache effectiveness
- `escalation`: When request escalated to higher model
- `feedback_submitted`: User feedback
- `error_occurred`: Any errors with details
- `security_event`: Suspicious patterns, rate limits

### 2. Data Storage Layer

**PostgreSQL Schema:**
```sql
-- analytics_events: 40+ columns capturing full request lifecycle
analytics_events (
  event_id, request_id, user_id, timestamp,
  task, task_length, task_category,
  selected_model, selected_effort, selection_reason,
  tokens_input, tokens_output, tokens_cached,
  cost_actual, cost_baseline, tokens_saved, percent_saved,
  quality_estimate, execution_time_ms,
  error, error_code, escalated, escalation_reason,
  security_flags, ...
);

-- user_feedback: Track user ratings and preferences
user_feedback (
  feedback_id, request_id, user_id, timestamp,
  feedback_type, satisfaction (1-5), accuracy (1-5), speed (1-5),
  preferred_model, issue_category, would_use_again
);

-- aggregated_metrics: Pre-calculated KPIs for fast dashboard
aggregated_metrics (
  metric_id, period_start, period_end, period,
  total_requests, total_tokens_saved, total_cost_saved,
  model_usage, model_quality, error_rate, ...
);
```

**Indexes for Performance:**
- `(user_id, timestamp)` - User timeline queries
- `(request_id)` - Single request lookup
- `(timestamp)` - Time range queries
- `(selected_model)` - Model analysis
- `(type)` - Event type filtering

### 3. Analytics Processing Layer

**Real-time Aggregation:**
- Events buffered in memory (100 events or 5 sec)
- Batch flushed to PostgreSQL
- On-read aggregation for dashboards
- Pre-calculated metrics cached for speed

**Calculation Pipeline:**
```
Raw Events → Filter by Type → Group by Dimension → Aggregate → Return KPI
  (1000s)    (model, time)    (hour, user, model)  (sum, avg, p95)
```

### 4. Insights & Feedback Loop

**Automatic Insights Generated:**
- High error rate detection (>5%)
- Low cache hit rate warnings (<10%)
- Model misselection patterns
- Cost anomalies
- Latency spikes
- User satisfaction trends

**Feedback Targets:**
- **ML Team**: Model selection accuracy, mismatches, feature importance
- **DevOps**: Latency, errors, cache effectiveness, infrastructure load
- **Product**: User satisfaction, feature requests, pain points

---

## Core KPIs (What We Measure)

### 1. Token Savings
**Definition**: Real % of tokens saved by smart routing vs. baseline (using Opus for all)

**Calculation**:
```
tokens_saved = sum(tokens_output) * 0.30  // Approximate for cheaper models
percent_saved = tokens_saved / sum(tokens_total) * 100

Baseline = if all requests used Opus
Actual = actual tokens with smart routing
Savings = (Baseline - Actual) / Baseline * 100
```

**Dashboard**: 
- Total tokens saved (cumulative)
- % saved (real percentage)
- Savings by model (Haiku saves most, Opus saves least)
- Savings per user
- Trend over time

**Target**: 25-35% real token savings

### 2. Cost Savings
**Definition**: Actual dollar savings from smart model selection

**Calculation**:
```
cost_actual = sum(input_tokens/1M * input_rate + output_tokens/1M * output_rate)
cost_baseline = sum with Opus rates
cost_saved = cost_baseline - cost_actual
percent_saved = cost_saved / cost_baseline * 100
```

**Dashboard**:
- Total $ saved
- % saved  
- Cost per request
- Cost trend
- Cost by user, model, task type

**Target**: 30-50% cost reduction

### 3. Model Selection Accuracy
**Definition**: % of time the router picked the right model for the task

**Calculation**:
```
accurate = requests where user confirmed model was appropriate
accuracy = accurate / total_with_feedback * 100

Also tracked:
- User switched to different model (wrong choice)
- User increased quality preference (too cheap)
- User decreased quality preference (overspent)
```

**Dashboard**:
- Overall accuracy %
- Accuracy by model
- Misselection patterns (e.g., "Haiku picked too often for complex tasks")
- User preference alignment

**Target**: >85% accuracy

### 4. User Satisfaction
**Definition**: Aggregated feedback on quality, speed, cost

**Calculation**:
```
satisfaction_score = avg(feedback.satisfaction)  // 1-5 scale
accuracy_score = avg(feedback.accuracy)          // 1-5 scale  
speed_score = avg(feedback.speed)                // 1-5 scale
nps = (promoters - detractors) / total * 100    // Would use again?
```

**Dashboard**:
- Average satisfaction (1-5)
- Accuracy perception
- Speed perception
- Would use again %
- Issues by category (hallucination, incomplete, wrong, slow, expensive)

**Target**: >4.0 satisfaction

### 5. API Latency
**Definition**: Request execution time distribution

**Calculation**:
```
latencies = [execution_time_ms for each request]
avg = mean(latencies)
p50 = percentile(latencies, 0.50)
p95 = percentile(latencies, 0.95)
p99 = percentile(latencies, 0.99)
```

**Dashboard**:
- Average latency
- p50/p95/p99 distribution
- Trend over time
- Latency by model (Haiku fastest, Opus slowest)
- Latency anomalies

**Target**: p95 < 3 seconds

### 6. Cache Hit Rate
**Definition**: % of requests served from cache

**Calculation**:
```
cache_hits = count(requests with cached_tokens > 0)
cache_hit_rate = cache_hits / total_requests * 100
tokens_cached = sum(cached_tokens)
```

**Dashboard**:
- Hit rate %
- Absolute cache hits
- Tokens served from cache
- Cache effectiveness by model
- Cache eviction patterns

**Target**: 15-25% hit rate

### 7. System Reliability
**Definition**: Request success rate and error analysis

**Calculation**:
```
successful = total_requests - error_requests
uptime = successful / total_requests * 100
error_rate = error_requests / total_requests * 100
```

**Dashboard**:
- Uptime %
- Error rate %
- Top errors (codes and frequency)
- Error trend
- Error by model
- MTTR (mean time to resolution)

**Target**: 99.5%+ uptime

---

## Implementation Guide

### Step 1: Install Dependencies

```bash
npm install pg  # PostgreSQL client
npm install dotenv
```

### Step 2: Initialize Database

```bash
# Create PostgreSQL database
createdb claude_router_analytics

# Run schema initialization
node dist/core/persistencePostgres.js --init
```

Or in code:
```typescript
import { PostgresPersistenceAdapter } from './core/persistencePostgres.js';

const adapter = new PostgresPersistenceAdapter(process.env.DATABASE_URL!);
await adapter.initialize();
```

### Step 3: Wire Up Analytics in ModelRouter

```typescript
import { analyticsEngine } from './core/analytics.js';
import { PostgresPersistenceAdapter } from './core/persistencePostgres.js';

// Initialize persistence
const persistence = new PostgresPersistenceAdapter(process.env.DATABASE_URL!);
analyticsEngine.setPersistenceAdapter(persistence);

// In ModelRouter.route():
const requestId = await analyticsEngine.captureRequestReceived(
  userId, task, budget, minQuality
);

const { model, effort } = await this.selectModel(request);
await analyticsEngine.captureModelSelected(
  requestId, userId, model, effort, reason, tokensEst, costEst, costBase
);

// ... execute ...

await analyticsEngine.captureRequestExecuted(
  requestId, userId, model,
  response.usage.input_tokens,
  response.usage.output_tokens,
  cachedTokens,
  executionTime,
  actualCost,
  qualityEstimate,
  cacheHit,
  escalated
);
```

### Step 4: Expose Analytics API

```typescript
import { createAnalyticsAPI } from './api/analytics.js';

app.use('/analytics', createAnalyticsAPI(persistence));

// Now available:
// GET /analytics/kpis
// GET /analytics/metrics
// GET /analytics/dashboard
// GET /analytics/users
// GET /analytics/models
// GET /analytics/feedback
```

### Step 5: Capture User Feedback

Add feedback endpoint to router:
```typescript
app.post('/api/feedback/:requestId', async (req, res) => {
  const { satisfaction, accuracy, speed, comment, preferredModel, issueCategory } = req.body;
  
  await analyticsEngine.captureFeedback({
    requestId: req.params.requestId,
    userId: req.headers['x-user-id'],
    feedbackType: issueCategory ? 'quality_issue' : 'success',
    satisfaction, accuracy, speed,
    comment, preferredModel, issueCategory,
    wouldUseAgain: satisfaction >= 4,
  });
  
  res.json({ status: 'feedback recorded' });
});
```

### Step 6: Build Dashboards

See `DASHBOARDS.md` for comprehensive dashboard designs.

---

## Feedback Loops

### Loop 1: ML Team (Model Selection)

**Data Flow:**
```
Events → Accuracy Analysis → Model Mismatch Patterns → ML Insights → Model Retraining
  ↓
User Feedback (preferred models) → Feature Importance → Input to Selection Algorithm
```

**Weekly Report to ML Team:**
```json
{
  "model_accuracy": {
    "haiku": { "accuracy": 0.88, "mismatches": 47 },
    "sonnet": { "accuracy": 0.92, "mismatches": 12 },
    "opus": { "accuracy": 0.96, "mismatches": 3 }
  },
  "mismatch_patterns": {
    "haiku_too_cheap_for": ["reasoning", "code-gen"],
    "opus_too_expensive_for": ["summarization"]
  },
  "feature_importance": {
    "task_length": 0.45,
    "task_complexity": 0.30,
    "user_quality_preference": 0.25
  },
  "recommendations": [
    "Increase Sonnet usage for general tasks (better cost/quality)",
    "Reserve Haiku for <1K token tasks only"
  ]
}
```

### Loop 2: DevOps Team (Infrastructure)

**Data Flow:**
```
Events → Latency Analysis → Bottleneck Detection → Scaling Decisions
              ↓
         Cache Analysis → TTL Tuning
              ↓
        Error Analysis → Alert Thresholds
```

**Weekly Report to DevOps:**
```json
{
  "latency_analysis": {
    "p95": 2800,
    "bottleneck": "claude_api",
    "recommendation": "API is 2.8s, implementation is 0.1s. This is API latency."
  },
  "cache_effectiveness": {
    "hit_rate": 0.12,
    "potential_ttl_improvement": "Could be 18% with 1h TTL"
  },
  "error_patterns": {
    "rate_limit_errors": 23,
    "auth_errors": 2,
    "timeout_errors": 0,
    "recommendation": "Rate limit errors increasing. Suggest 2x padding."
  },
  "load_metrics": {
    "requests_per_second": 42,
    "peak_hour": "14:00-15:00",
    "capacity_headroom": "60%"
  }
}
```

### Loop 3: Product Team (User Needs)

**Data Flow:**
```
User Feedback → Issue Categories → Feature Requests → Roadmap
    ↓
Task Categories → Usage Patterns → Documentation → Guides
    ↓
Satisfaction Trends → NPS → Release Planning
```

**Weekly Report to Product:**
```json
{
  "satisfaction": {
    "overall_nps": 67,
    "trend": "+5 points from last week",
    "by_segment": {
      "haiku_users": 72,
      "sonnet_users": 68,
      "opus_users": 61
    }
  },
  "top_issues": [
    { "category": "hallucination", "count": 23, "impact": "high" },
    { "category": "incomplete_response", "count": 18, "impact": "medium" },
    { "category": "slow", "count": 9, "impact": "low" }
  ],
  "task_distribution": {
    "summarization": 34,
    "code_generation": 28,
    "analysis": 22,
    "writing": 16
  },
  "recommendations": [
    "Focus documentation on hallucination prevention",
    "Consider higher default quality for code generation",
    "Summarization is 1/3 of usage - optimize for it"
  ]
}
```

---

## Dashboard Views

### 1. Executive Dashboard
**Audience**: Leadership, stakeholders

**KPIs**:
- Token savings (% and absolute)
- Cost savings ($)
- User satisfaction (NPS)
- System reliability (uptime %)
- Month-over-month trend

### 2. Operations Dashboard
**Audience**: DevOps, SRE team

**Metrics**:
- API latency (p50/p95/p99)
- Error rate and top errors
- Cache hit rate
- Request volume and peak times
- Infrastructure load

### 3. Analytics Dashboard
**Audience**: Product, data team

**Insights**:
- Model distribution (pie chart)
- Quality vs. cost scatter
- Accuracy by model
- User satisfaction breakdown
- Task categories

### 4. User Analytics
**Audience**: Product, customer success

**Metrics**:
- Usage by user (top users)
- User retention
- Satisfaction by cohort
- Task preferences by user
- Cost per user

---

## Reporting & Alerts

### Automated Reports

**Daily Summary** (8am to your Slack):
```
📊 Claude Router Daily Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ System: 99.8% uptime
💰 Cost: $234.12 (saved $89.34 vs Opus)
⚡ Latency: p95 = 2.1s
📈 Requests: 1,234 (↑12% from yesterday)
😊 Satisfaction: 4.2/5 (↑0.1)
```

**Weekly Deep-Dive**:
- Model selection accuracy trends
- Top 10 issues reported
- Cost optimization opportunities
- Infrastructure recommendations
- Retention metrics

### Alerts

**Critical (Immediate)**:
- Uptime < 95%
- Error rate > 10%
- Cost spike > 200% of daily average

**Warning**:
- Latency p95 > 4s
- Cache hit rate < 5%
- Accuracy drop > 5%

**Info**:
- New high-volume user detected
- New task type detected
- Daily summary

---

## Cost Analysis

### Cost Structure

**Database**:
- PostgreSQL: ~$50/month (shared or RDS small)
- Storage: ~$5/month (1M+ events)

**Analytics Processing**:
- In-app: Free (included in router service)
- Or: BigQuery for advanced analysis (~$10/month)

**Monitoring**:
- Datadog: ~$30/month
- Or: Self-hosted Prometheus (~$50 for infra)

**Total**: $95-100/month for full analytics

### ROI Example

**Scenario**: 10,000 requests/day on Opus baseline
- **Cost without router**: $20,000/month
- **Cost with router**: $13,000/month (35% savings)
- **Monthly savings**: $7,000
- **Analytics cost**: $100
- **ROI**: 70x

---

## Schema Reference

### AnalyticsEvent (40+ fields)

Core identifiers:
- `eventId`, `requestId`, `userId`, `timestamp`

Event metadata:
- `type` (request_received, model_selected, request_completed, etc.)
- `version` (schema version)

Request context:
- `task`, `taskLength`, `taskCategory`
- `budget`, `minQuality`

Model selection:
- `selectedModel`, `selectedEffort`, `selectionReason`

Execution metrics:
- `tokensEstimated`, `tokensInput`, `tokensOutput`, `tokensCached`
- `executionTimeMs`

Cost metrics:
- `costEstimated`, `costActual`, `costBaseline`
- `tokensSaved`, `percentSaved`

Quality metrics:
- `qualityEstimate`, `cacheHit`, `escalated`

Error tracking:
- `error`, `errorCode`, `errorMessage`

Security:
- `securityScore`, `securityFlags`, `rateLimit`

Metadata:
- `apiVersion`, `userAgent`, `endpoint`, `ipHash`

### UserFeedback

- `feedbackId`, `requestId`, `userId`, `timestamp`
- `feedbackType`, `satisfaction`, `accuracy`, `speed`, `comment`
- `preferredModel`, `preferredSpeed`, `preferredQuality`
- `issueCategory`, `wasRelevant`, `wouldUseAgain`

---

## Next Steps

1. **Week 1**: Set up PostgreSQL, wire up analytics to ModelRouter
2. **Week 2**: Implement basic dashboards (KPIs, metrics)
3. **Week 3**: Add user feedback capture and analysis
4. **Week 4**: Generate automated reports and set up alerts
5. **Month 2**: Advanced dashboards, user cohort analysis, ML team insights

---

## Files Reference

**Analytics System**:
- `src/types/analytics.ts` - Type definitions (AnalyticsEvent, UserFeedback, etc.)
- `src/core/analytics.ts` - Event logging engine
- `src/core/persistencePostgres.ts` - PostgreSQL adapter
- `src/api/analytics.ts` - REST API endpoints

**Integration**:
- Update `src/server.ts` to initialize analytics
- Update `src/core/modelRouter.ts` to capture events
- Add feedback endpoint in `src/api/rest.ts`

**Dashboards**:
- `docs/DASHBOARDS.md` - HTML/React dashboard designs
- `src/dashboard/` - Dashboard server (future)

---

## Questions & Support

For questions on:
- **Setup**: Check integration examples above
- **Data Model**: Review AnalyticsEvent schema in analytics.ts
- **Dashboard**: See DASHBOARDS.md
- **Feedback Loops**: See section above
