# Measurement System Quick Start

**For:** ML Team, DevOps Team, Product Team, Leadership  
**Read Time:** 5 minutes  
**Purpose:** Understand what data we're capturing, how to use it, and what's being built

---

## What We Measure

### Core KPIs (Targets)

| KPI | Current | Target | Importance |
|-----|---------|--------|-----------|
| Token Savings | Unknown | 25-35% | Critical |
| Cost Savings | Unknown | 30-50% | Critical |
| Model Accuracy | 85% | >85% | Critical |
| User Satisfaction | Unknown | >4.0/5 | High |
| API Latency P95 | Unknown | <2s | High |
| Cache Hit Rate | Unknown | 15-25% | High |
| System Reliability | Unknown | 99.5%+ | High |

### Data We're Capturing

**For Every Request:**
- **Identifiers:** request_id, user_id, timestamp
- **Input:** task text, budget, quality threshold
- **Selection:** which model, effort level, why
- **Execution:** tokens used, execution time, actual cost
- **Outcome:** success/failure, quality score, escalations
- **Feedback:** user satisfaction, preferred model, issues

**Example Event:**
```json
{
  "requestId": "abc123def456",
  "userId": "user-789",
  "timestamp": 1703174400000,
  "task": "Analyze user feedback patterns",
  "taskLength": 1250,
  "selectedModel": "haiku",
  "selectedEffort": "medium",
  "tokensInput": 850,
  "tokensOutput": 320,
  "tokensCached": 45,
  "costActual": 0.0032,
  "costBaseline": 0.0085,
  "tokensSaved": 96,
  "percentSaved": 22.4,
  "qualityEstimate": 8.5,
  "executionTimeMs": 1250,
  "cacheHit": false,
  "escalated": false
}
```

---

## For Different Teams

### ML Team: How Models Are Performing

**Dashboard:** GET `/api/analytics/models`

**You'll See:**
- Which models are selected most often (allocation %)
- Success rate for each model at different task complexities
- Average quality per model
- Cost per request per model
- Whether actual quality matches what we predicted

**Decisions You'll Make:**
- "Haiku success rate on simple tasks is 91%? Let's increase allocation from 40% to 50%"
- "Opus is underperforming on analysis tasks. Investigate why"
- "We need a new model for the 'code generation' category"

**Coming Soon (Sprint 3):**
- Confidence intervals (not just point estimates)
- Automatic recommendations when samples are large enough
- A/B testing framework for new models

---

### DevOps Team: Infrastructure Health

**Dashboard:** GET `/api/analytics/kpis?hours=24`

**You'll See:**
- Current latency (P50, P95, P99)
- Error rates and top error types
- Cache hit rate
- Request volume per second
- Scaling events (when did we add pods?)

**Decisions You'll Make:**
- "P99 latency trending up. Database queries getting slow?"
- "Cache hit rate at 12%. Should we increase Redis memory?"
- "Traffic will hit 500 req/s tomorrow. Scale from 3 → 4 pods"

**Coming Soon (Sprint 2):**
- 24-hour traffic forecast
- Bottleneck root cause analysis (API vs Cache vs DB)
- Automated scaling recommendations

---

### Product Team: User Experience

**Dashboard:** GET `/api/analytics/feedback`

**You'll See:**
- Average satisfaction score (1-5 scale)
- % who would use again
- Top user issues (latency, accuracy, etc.)
- Trends over time
- Cohort comparison (power users vs casual users)

**Decisions You'll Make:**
- "Satisfaction dropped 0.3 points this week. What changed?"
- "Latency is the #1 issue. How can we speed up?"
- "Power users (>10 requests) are 4.5 stars. Casual users are 3.8. Why?"

**Coming Soon (Sprint 3):**
- Retention metrics (% users making 2nd request)
- Feature adoption (which models/models users choose)
- Churn prediction

---

## How to Access the Data

### Via REST API

```bash
# Get top-level KPIs
curl http://localhost:3000/api/analytics/kpis

# Get dashboard data
curl http://localhost:3000/api/analytics/dashboard?period=day

# Get user metrics
curl http://localhost:3000/api/analytics/users?hours=24

# Get model analysis
curl http://localhost:3000/api/analytics/models?hours=24

# Get error analysis
curl http://localhost:3000/api/analytics/errors?hours=24

# Get user feedback summary
curl http://localhost:3000/api/analytics/feedback?hours=24

# Get data quality status
curl http://localhost:3000/api/analytics/data-quality
```

### Via PostgreSQL

```sql
-- Get token savings over last 24 hours
SELECT 
  COUNT(*) as requests,
  SUM(tokens_saved) as total_tokens_saved,
  AVG(tokens_saved::float / (tokens_output + tokens_input)) as avg_percent_saved
FROM analytics_events
WHERE timestamp >= (NOW() - INTERVAL '24 hours')::BIGINT * 1000
  AND type = 'request_completed';

-- Get model success rates
SELECT 
  selected_model,
  COUNT(*) as total,
  COUNT(CASE WHEN error = false THEN 1 END) as successes,
  ROUND(100.0 * COUNT(CASE WHEN error = false THEN 1 END) / COUNT(*), 1) as success_rate
FROM analytics_events
WHERE timestamp >= (NOW() - INTERVAL '24 hours')::BIGINT * 1000
GROUP BY selected_model;

-- Get latency percentiles
SELECT 
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_time_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99
FROM analytics_events
WHERE timestamp >= (NOW() - INTERVAL '24 hours')::BIGINT * 1000
  AND type = 'request_completed';

-- Get user satisfaction
SELECT 
  AVG(satisfaction) as avg_satisfaction,
  STDDEV(satisfaction) as std_dev,
  COUNT(*) as sample_size
FROM user_feedback
WHERE timestamp >= (NOW() - INTERVAL '7 days')::BIGINT * 1000;
```

---

## Current Status

### What's Working ✅
- **Event Capture:** Every request logged (buffered, async)
- **PostgreSQL Schema:** 40+ columns for comprehensive tracking
- **Analytics API:** 7 endpoints for metrics, KPIs, users, models, errors, feedback
- **Redis Cache:** Basic caching layer

### What's Being Built (Sprint 1-3)
- **Data Quality Validation:** Ensure all data is accurate before acting on it
- **Real-Time Metrics:** Pre-aggregated dashboards (<100ms latency)
- **Multi-Dimensional Analysis:** Model × complexity × user cohort
- **Advanced Feedback Loops:** Statistical rigor + A/B testing framework

### What's NOT Yet Built (Sprint 4+, Stretch)
- **Predictive Analytics:** Forecast latency, predict model success
- **Anomaly Detection:** Automatically flag unusual patterns
- **Cost Attribution:** Cost per user, per model, per task type
- **UI Dashboard:** Interactive React components

---

## Common Questions

### Q: How much data are we storing?
**A:** ~100-200MB/day for 10,000 requests/day (raw events). With 90-day retention, that's 9-18GB. Partitioning by month makes old data archivable.

### Q: How accurate is this data?
**A:** We validate on ingest (Sprint 1), so should be >99% accurate. Currently unvalidated. Gaps in current system prevent us from answering this with confidence.

### Q: Can we do real-time dashboards?
**A:** Not yet. Current system queries PostgreSQL on each request (100-500ms). Sprint 2 adds pre-aggregated metrics updated every 5 minutes, served from Redis cache (<100ms).

### Q: What if we need to change the schema?
**A:** PostgreSQL allows schema changes while keeping data. However, we need migration scripts for: (1) new columns, (2) backfill logic, (3) validation updates. Plan ahead.

### Q: How do we prevent data loss?
**A:** Multiple layers:
- Analytics engine buffers events (in-memory)
- Batch flushing to PostgreSQL (transactional)
- Daily backups via PostgreSQL WAL
- Validation: Compare aggregated metrics to raw events daily

### Q: Can we query historical data quickly?
**A:** Not yet. <24 hours is OK (indices on timestamp). >7 days is slow. Sprint 2's materialized views will enable historical queries in <100ms.

---

## What Data Should You NOT Act On (Yet)

❌ **Do NOT use these metrics for decisions (not yet validated):**
- Token savings % (calculation might be wrong)
- Cache hit rate (not comprehensively tracked)
- Model accuracy (no confidence intervals, no significance testing)
- Latency percentiles (not aggregated correctly)

✅ **These are safe to use:**
- Raw request counts
- Error rates (if not rate-limited)
- User feedback (if sufficient samples)
- Costs (trusted from Claude API)

---

## Next Milestones

### Sprint 1 (Week 1): Data Quality Foundation
- [ ] Data validation on ingest
- [ ] Daily quality report
- [ ] Database optimized for scale
- **Your data will be trustworthy**

### Sprint 2 (Week 2): Real-Time Dashboards
- [ ] Pre-aggregated metrics (5-min buckets)
- [ ] Redis caching layer
- [ ] <100ms dashboard latency
- **Your insights will be instantaneous**

### Sprint 3 (Week 3): Team-Specific Dashboards
- [ ] ML team: Model performance + recommendations
- [ ] DevOps team: Latency bottlenecks + scaling forecasts
- [ ] Product team: Satisfaction trends + issue tracking
- **Each team gets actionable insights**

### Sprint 4+ (Stretch): Advanced Features
- [ ] Anomaly detection
- [ ] Predictive analytics
- [ ] Cost attribution
- [ ] Interactive UI
- **Proactive optimization**

---

## How to Contribute

### As an Engineer
1. Ensure all events are captured with correct types
2. Implement validation schemas for new event types
3. Test analytics endpoints in your pull requests
4. Alert if you notice data quality issues

### As an ML Engineer
1. Use `/api/analytics/models` to evaluate performance
2. Provide feedback on model recommendations
3. A/B test new allocation strategies (coming Sprint 3)

### As a DevOps Engineer
1. Monitor `/api/analytics/kpis` for SLO breaches
2. Use latency data to drive scaling decisions
3. Alert if cache hit rate drops below target

### As a Product Manager
1. Review `/api/analytics/feedback` weekly
2. Prioritize features based on user satisfaction data
3. Track cohort metrics to understand user segments

---

## Getting Help

**Understanding the data?**
- Read MEASUREMENT_SYSTEM_AUDIT.md (30 min deep dive)

**Need to add new metrics?**
- Create type in `src/types/analytics.ts`
- Add validation in `src/schemas/analytics.ts`
- Update `PostgresPersistenceAdapter` to store it
- Add query endpoint in `src/api/analytics.ts`

**Questions about Sprint timelines?**
- See SPRINT1_IMPLEMENTATION_GUIDE.md for details

**Want to see the system in action?**
- `docker-compose up` (includes PostgreSQL, Redis, API)
- `curl http://localhost:3000/api/analytics/kpis`

---

## Key Definitions

| Term | Meaning |
|------|---------|
| **Event** | Single atomic action (request received, model selected, completed, error) |
| **Signal** | Real data from the system (tokens used, cost incurred, latency measured) |
| **Metric** | Aggregated/derived value (avg tokens, total cost, p95 latency) |
| **KPI** | Key Performance Indicator (critical metric tracked by leadership) |
| **Dashboard** | Real-time view of metrics for a team |
| **Insight** | Actionable finding ("Haiku success rate increased", "Latency spiking") |
| **Feedback Loop** | ML system learning from outcomes to improve decisions |
| **Data Quality** | Confidence that recorded data matches ground truth |
| **Validation** | Checking that incoming data makes logical sense |
| **Aggregation** | Combining raw events into meaningful summaries |

---

**Version:** 1.0  
**Last Updated:** 2026-10-21  
**Next Review:** 2026-10-28  
**Owner:** Data Analyst (PROFESSOR-level)
