# Claude Router Infrastructure - Team Integration Checklist

This document defines integration points for ML, QA, and Data teams.

## Quick Reference

| Team | System | Integration Point | Status | Owner |
|------|--------|------------------|--------|-------|
| **ML Team** | Model Selection | API /model/select endpoint, metrics export | ⚠️ Blocked | ML team |
| **QA Team** | Load Testing | k8s/loadTest.ts, Grafana dashboards | ✅ Ready | QA team |
| **Data Team** | Analytics | PostgreSQL analytics schema, S3 backups | ⚠️ Blocked | Data team |
| **DevOps** | Infrastructure | All manifests in k8s/ directory | ✅ Ready | DevOps |
| **Platform** | Observability | Prometheus, Grafana, Alertmanager | ✅ Ready | Platform |

---

## ML Team Integration

### Dependency: Model Selection Logic

**Current Status:** ⚠️ BLOCKED - Needs ML team implementation

**Integration Points:**

```
API Request Flow:
┌─────────────────────────────────────────────────────────────┐
│ 1. Client sends request to /api/complete                    │
│    {task: "...", budget: 100, min_quality: 7.0}             │
│                          │                                   │
│                          ▼                                   │
│ 2. ComplexityAnalyzer estimates:                            │
│    {complexity: 0.7, estimated_tokens: 1200}                │
│                          │                                   │
│                          ▼                                   │
│ 3. ModelSelector chooses model:                             │
│    - haiku (fast, cheap, low quality)                       │
│    - sonnet (balanced)                                       │
│    - opus (slow, expensive, high quality)                   │
│    - fable (new experimental)                               │
│                          │                                   │
│                          ▼                                   │
│ 4. FeedbackLoop (optional) updates selection algorithm      │
│    based on previous requests                               │
│                          │                                   │
│                          ▼                                   │
│ 5. ModelRouter routes to Claude API                         │
│                          │                                   │
│                          ▼                                   │
│ 6. Response recorded in PostgreSQL analytics_events         │
│    for ML training and evaluation                           │
└─────────────────────────────────────────────────────────────┘
```

### Required ML Team Actions

#### 1. Implement/Refine Model Selection Algorithm

**File:** `src/core/modelSelector.ts`

Current stub implementation exists. ML team should:

```typescript
// Current: Simple heuristic
if (complexity < 0.3) return 'haiku';
if (complexity < 0.7) return 'sonnet';
return 'opus';

// Required: ML-based scoring
// Option A: Use ML model trained on feedback data
// Option B: Use bandit algorithm (Thompson sampling)
// Option C: Use reinforcement learning (overkill for MVP)
// Option D: Use cost-quality tradeoff curve
```

**Metrics to Optimize:**

```
1. Cost per request (primary KPI)
   - Minimize: tokens_used × token_price[model]
   - Current: baseline $0.000158/request
   - Target: $0.000032/request (78% reduction)

2. Quality score (constraint)
   - Maintain: average quality >= 8.0/10
   - Monitor: user_feedback.quality_rating

3. Latency (SLO constraint)
   - Maintain: P99 < 500ms
   - Monitor: http_request_duration_seconds[0.99]

4. Token savings (marketing metric)
   - Calculate: (cost_baseline - cost_actual) / cost_baseline
   - Target: 30%+ savings
```

#### 2. Implement Feedback Loop

**File:** `src/core/feedbackLoop.ts`

Current stub exists. ML team should implement:

```typescript
interface FeedbackLoop {
  // Called after each request with actual outcome
  recordFeedback(event: AnalyticsEvent, feedback: UserFeedback): Promise<void>;
  
  // Called when selecting next request
  // Should improve model selection based on historical feedback
  getAdjustedScores(task: string): Promise<ModelScores>;
}

// Feedback data structure (from PostgreSQL):
interface UserFeedback {
  event_id: string;
  quality_rating: 1-10;           // User's satisfaction
  latency_satisfactory: boolean;  // Was response fast enough?
  model_suggestion: string;       // User's preferred model
  notes: string;                  // Optional feedback text
}
```

**Implementation Suggestions:**

```
Option 1: Offline training (daily batch)
- Query PostgreSQL analytics_events + user_feedback
- Train ML model on feedback data
- Update model selection logic
- Deploy new version weekly

Option 2: Online learning (streaming)
- Use streaming metrics from Prometheus
- Update model weights in real-time
- Requires careful design to avoid instability
- Better for rapid feedback

Option 3: Hybrid approach (recommended)
- Stream real-time metrics for quick adjustments
- Daily batch training for stability
- Weekly model updates
```

#### 3. Metrics ML Team Should Monitor

**Prometheus Queries (available in Grafana):**

```
# Cost per request over time
rate(sum(cost_actual)[1h]) / rate(count(requests)[1h])

# Average quality by model
avg(quality_estimate) by (selected_model)

# Token savings by model
sum(tokens_saved) by (selected_model)

# Model usage distribution
sum(rate(requests[1h])) by (selected_model)

# Feedback quality rating by model
avg(user_feedback.quality_rating) by (model_suggestion)
```

**PostgreSQL Queries (available for analysis):**

```sql
-- Token savings analysis
SELECT 
  selected_model,
  COUNT(*) as requests,
  AVG(tokens_saved) as avg_tokens_saved,
  AVG(cost_actual) as avg_cost,
  AVG(quality_estimate) as avg_quality
FROM analytics_events
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY selected_model
ORDER BY avg_tokens_saved DESC;

-- Feedback correlation
SELECT 
  ae.selected_model,
  AVG(uf.quality_rating) as avg_user_rating,
  COUNT(uf.feedback_id) as feedback_count
FROM analytics_events ae
LEFT JOIN user_feedback uf ON ae.event_id = uf.event_id
WHERE ae.timestamp > NOW() - INTERVAL '7 days'
GROUP BY ae.selected_model;

-- Model performance by task complexity
SELECT 
  task_category,
  selected_model,
  AVG(execution_time_ms) as avg_time,
  AVG(quality_estimate) as avg_quality,
  AVG(CAST(tokens_saved AS FLOAT)) as avg_savings
FROM analytics_events
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY task_category, selected_model;
```

#### 4. Testing & Validation

**Before deploying model selection changes:**

1. **Offline testing** (no production impact)
   ```bash
   npm run test          # Unit tests
   npm run test:integration  # Integration tests
   ```

2. **Load testing** (controlled environment)
   ```bash
   npm run load-test     # Simulates 1000 RPS
   # Monitor: Does model selection improve cost while maintaining quality?
   ```

3. **Canary deployment** (5% traffic)
   ```bash
   kubectl set image deployment/claude-router-api \
     claude-router=your-registry/claude-router:v1.1.0-ml-update \
     -n claude-router
   
   # Monitor: Compare new model selection vs old
   # Check Prometheus: Cost per request, quality score, latency
   ```

4. **Full rollout** (100% traffic)
   ```bash
   # If canary successful, fully deploy
   kubectl rollout resume deployment/claude-router-api -n claude-router
   ```

### ML Team Deliverables (Timeline)

- **Week 1**: Model selection algorithm (baseline ML model or heuristic)
- **Week 2**: Feedback loop implementation
- **Week 3**: Integration testing + load test validation
- **Week 4**: Production canary deployment (5% traffic)
- **Week 5+**: Monitor metrics, iterate on model

### ML Team Success Criteria

```
✅ Cost per request reduced by 30%+ (current: $0.000158 → target: $0.000032)
✅ Avg quality score maintained >= 8.0/10
✅ P99 latency remains < 500ms
✅ Model selection logic deployed and working
✅ Feedback loop collecting data successfully
✅ Weekly analysis reports showing improvements
```

---

## QA Team Integration

### Dependency: Load Testing & SLO Validation

**Current Status:** ✅ READY - QA team can start immediately

### Load Testing Framework

**Available Test Suite:**

```bash
# Located: src/loadTest.ts
# Usage: npm run load-test

# What it does:
# - Simulates 1000 concurrent requests per second
# - Tests various endpoints: /api/complete, /graphql
# - Measures: latency, error rate, throughput
# - Outputs: Prometheus metrics, latency distributions
```

### QA Team Required Actions

#### 1. Define SLO Tests

**Test File:** Create `tests/slo-validation.test.ts`

```typescript
describe('SLO Validation - 99.9%', () => {
  // Availability SLO: 99.9% (8.6 hours downtime/month)
  test('API availability >= 99.9%', async () => {
    const results = await loadTest({ duration: 3600 }); // 1 hour
    expect(results.successRate).toBeGreaterThan(0.999);
  });

  // Latency SLO: P99 < 500ms
  test('P99 latency < 500ms', async () => {
    const results = await loadTest({ concurrency: 100 });
    expect(results.latencyP99).toBeLessThan(500);
  });

  // Latency SLO: P95 < 200ms
  test('P95 latency < 200ms', async () => {
    const results = await loadTest({ concurrency: 100 });
    expect(results.latencyP95).toBeLessThan(200);
  });

  // Error rate: < 0.1%
  test('Error rate < 0.1%', async () => {
    const results = await loadTest({ duration: 3600 });
    expect(results.errorRate).toBeLessThan(0.001);
  });
});
```

**Run SLO tests:**

```bash
npm run test:integration -- --grep "SLO"
```

#### 2. Scaling Validation Tests

**Test different load levels:**

```bash
# Test at 100 RPS (baseline)
npm run load-test -- --rps 100 --duration 300

# Test at 1000 RPS (10x spike)
npm run load-test -- --rps 1000 --duration 300

# Test at 5000 RPS (sustained peak)
npm run load-test -- --rps 5000 --duration 600

# Monitor Prometheus during tests:
# - HPA: scaling from 3 → 50 replicas
# - API: latency under load
# - Redis: connection count, evictions
# - Database: connection pool utilization
```

**Validate HPA behavior:**

```bash
# Before load test
kubectl get hpa -n claude-router
# minReplicas: 3

# During load test (watch in another terminal)
kubectl get deployment claude-router-api -n claude-router -w
# Should scale up to 20-50 replicas within 60 seconds

# After load test (wait 5 min)
kubectl get deployment claude-router-api -n claude-router -w
# Should scale down to 3 replicas
```

#### 3. Chaos Engineering Tests

**Test failure scenarios (after infrastructure stable):**

```bash
# Test pod failure
kubectl delete pod -l app=claude-router-api -n claude-router
# Verify: pod restarts, no request errors

# Test node failure (if multi-node cluster)
kubectl drain <node> --ignore-daemonsets
# Verify: API continues working, pods reschedule

# Test Redis connection loss (temporary)
kubectl exec -it redis-cluster-0 -n claude-router -- redis-cli shutdown
# Verify: API handles connection error gracefully
# Note: Redis will auto-restart, other nodes take over

# Test database connection pool exhaustion
# Run: npm run advancedLoadTest -- --connection-pool-test
# Verify: API gracefully degrades (queues requests)
```

#### 4. Create QA Dashboard (Grafana)

**Dashboard metrics:**

```
1. Real-time metrics
   - Request rate (RPS)
   - Error rate (%)
   - Latency percentiles (P50, P95, P99)
   - Pod count (active replicas)

2. SLO tracking
   - Availability: should show > 99.9%
   - Latency: should show P99 < 500ms
   - Error rate: should show < 0.1%

3. Capacity metrics
   - CPU utilization
   - Memory utilization
   - Disk utilization
   - Network I/O

4. Component health
   - API pods: running/total
   - Redis cluster: 6 nodes connected
   - PostgreSQL: connections in use
```

### QA Test Plan Template

```
TEST CASE: Scale Test - 100 to 10,000 RPS
OBJECTIVE: Verify HPA scales correctly under increasing load
DURATION: 30 minutes
PROCEDURE:
  1. Start baseline (100 RPS)
  2. Increase by 1000 RPS every 5 minutes
  3. Hold at peak (10,000 RPS) for 5 minutes
  4. Decrease by 1000 RPS every 5 minutes back to baseline
EXPECTED RESULTS:
  - Pod count scales from 3 → 50 within 60s of load increase
  - P99 latency maintains < 500ms throughout
  - No errors (0% error rate)
  - Pod count scales down to 3 within 300s of load decrease
PASS/FAIL CRITERIA:
  - ✅ Pass if all expected results met
  - ❌ Fail if any SLO violated
```

### QA Team Success Criteria

```
✅ SLO validation suite created and passing
✅ Load test validates scaling 10x spikes within 60s
✅ Chaos tests validate failure handling
✅ QA dashboard created in Grafana
✅ Regression tests integrated in CI/CD
✅ Weekly SLO reports generated
```

---

## Data Team Integration

### Dependency: Analytics Data Pipeline

**Current Status:** ⚠️ BLOCKED - Needs Data team implementation

### Analytics Schema

**PostgreSQL schema is pre-created in `02-postgresql.yaml`:**

```sql
analytics_events         -- Main event store (every request)
├─ event_id (PK)
├─ request_id
├─ user_id
├─ timestamp
├─ type (request_complete, error, etc.)
├─ task, task_length, task_category
├─ selected_model, selected_effort
├─ tokens_estimated, tokens_input, tokens_output, tokens_cached
├─ cost_estimated, cost_actual, cost_baseline, tokens_saved
├─ quality_estimate, cache_hit, escalated, error
├─ execution_time_ms
├─ security_score, rate_limit, request_count_this_hour
└─ created_at (TIMESTAMP)

user_feedback            -- User quality ratings
├─ feedback_id (PK)
├─ event_id (FK → analytics_events)
├─ quality_rating (1-10)
├─ latency_satisfactory (boolean)
├─ model_suggestion
└─ created_at

model_performance_hourly -- Hourly aggregates
├─ model
├─ hour
├─ total_requests
├─ avg_tokens_saved
├─ avg_cost_saved
├─ avg_execution_time_ms
├─ cache_hit_rate
└─ error_rate

route_performance        -- API route metrics
├─ route_name
├─ method
├─ hour
├─ total_requests
├─ avg_response_time_ms
├─ p99_response_time_ms
├─ error_count
└─ success_rate
```

### Data Team Required Actions

#### 1. Implement Backup Pipeline

**Goal:** Daily backup of PostgreSQL to S3

```bash
# Deploy backup CronJob
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-daily-backup
  namespace: claude-router
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -h postgres -U postgres -d claude_router_analytics | \
              gzip | \
              aws s3 cp - s3://claude-router-backups/postgres/$(date +%Y%m%d-%H%M%S).sql.gz
            env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: postgres-password
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: access_key
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: secret_key
          restartPolicy: OnFailure
EOF
```

**Retention policy:**
- Keep last 30 daily backups (30 days retention)
- Copy weekly backups to glacier (long-term)

#### 2. Implement Data Warehouse ETL

**Goal:** Load analytics data into data warehouse (Redshift, Snowflake, BigQuery)

```python
# pseudocode for daily ETL job
import psycopg2
from datetime import datetime, timedelta

def load_analytics_to_warehouse():
    # 1. Query PostgreSQL for yesterday's data
    pg_conn = psycopg2.connect("postgresql://postgres@postgres:5432/claude_router_analytics")
    
    # 2. Aggregate metrics
    query = """
    SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        selected_model as model,
        COUNT(*) as total_requests,
        AVG(tokens_saved) as avg_tokens_saved,
        AVG(cost_actual) as avg_cost,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99_latency,
        AVG(quality_estimate) as avg_quality,
        SUM(CASE WHEN error THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as error_rate
    FROM analytics_events
    WHERE created_at >= %s AND created_at < %s
    GROUP BY DATE_TRUNC('hour', created_at), selected_model
    """
    
    # 3. Load into warehouse
    warehouse.insert(query_results)
    
    # 4. Update derived metrics
    warehouse.execute("""
    SELECT * FROM model_performance_daily
    WHERE date = %s
    """)
```

#### 3. Implement Data Quality Checks

**Goal:** Monitor data quality and alert on anomalies

```sql
-- Data quality checks (run hourly)

-- 1. Check for gaps in data
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as count
FROM analytics_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
HAVING COUNT(*) < 100  -- Alert if < 100 events per hour
ORDER BY hour DESC;

-- 2. Check for outliers
SELECT 
  event_id,
  cost_actual,
  tokens_saved,
  execution_time_ms
FROM analytics_events
WHERE execution_time_ms > 60000  -- Alert if > 60 seconds
OR tokens_saved > 100000        -- Alert if > 100k tokens
OR cost_actual > 10.0           -- Alert if > $10 per request
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check model distribution
SELECT 
  selected_model,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM analytics_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY selected_model
ORDER BY count DESC;
```

#### 4. Create Data Lineage Documentation

**Document data flow:**

```
Claude Router API
       │
       ├─ In-process cache (Redis)
       │
       └─ PostgreSQL (analytics_events table)
              │
              ├─ Daily ETL job
              │   └─ Data warehouse (Redshift/Snowflake)
              │       └─ BI dashboards (Tableau/Looker)
              │
              └─ S3 backup (daily snapshots)
                  └─ Long-term archive (Glacier)
```

#### 5. Set Up Data Governance

**Metadata catalog:**

```
analytics_events table:
├─ Owner: Data Team
├─ SLA: 4-hour latency from event to warehouse
├─ Quality: > 99% of events recorded
├─ Retention: 1 year hot, 3 years cold
├─ PII fields: user_id (hashed recommended)
└─ Access: Data scientists, analytics engineers

user_feedback table:
├─ Owner: ML Team + Data Team
├─ SLA: Manual input, no real-time requirement
├─ Quality: > 1% of events get feedback (target)
├─ Retention: 1 year
└─ Access: ML team, analysts
```

### Data Team Success Criteria

```
✅ Daily automated backups to S3 (verified)
✅ ETL pipeline loads data to warehouse daily
✅ Data quality checks passing (> 99% success)
✅ Documentation of all analytics tables
✅ BI dashboards created for business metrics
✅ Data lineage documented
✅ PII handling implemented (if applicable)
```

---

## Dependencies & Critical Path

### Critical Path (Blocking Items)

```
Week 1:
  ✅ DevOps deploys infrastructure
     ├─ Kubernetes manifests deployed
     ├─ Redis cluster running (6 nodes)
     ├─ PostgreSQL with schema initialized
     └─ API deployed (generic model selection)

Week 2:
  ⏳ ML Team: Model selection algorithm
     └─ Blocks: Production optimization (30% cost savings)
  ⏳ QA Team: Load testing validation
     └─ Blocks: SLO sign-off
  ⏳ Data Team: Backup pipeline
     └─ Blocks: Data safety certification

Week 3:
  ⏳ Integration testing (all teams)
     └─ Blocks: Production deployment

Week 4+:
  ⏳ Production deployment + monitoring
```

### Dependency Graph

```
┌─ ML Team ─────────────────────┐
│                               │
│ Model Selection Algorithm     │   Feedback Loop
│ (Week 1-2)                    │   (Week 2-3)
│                               │
└─────────────┬─────────────────┘
              │
              ▼
        ┌─────────────┐
        │  API Deployment (READY)
        └─────┬───────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌────────┐          ┌──────────┐
│ QA     │          │ Data     │
│ Load   │          │ Backup   │
│ Tests  │          │ Pipeline │
└────────┘          └──────────┘
```

### Communication Plan

**Weekly Sync (30 min):**
- DevOps: Infrastructure status
- ML: Model selection progress
- QA: Test coverage progress
- Data: Backup/ETL progress

**Blockers Discussion:**
- Thursday standup: Flag any blockers for Friday EOD resolution
- Monday: Resolve blocker, adjust week plan

**Deployment Readiness:**
- Week 4: Sign-off from all teams required before production
- Week 4: Final integration test run-through

---

## Escalation & Support

### Issue Resolution SLA

| Priority | Issue Type | Response Time | Resolution Time |
|----------|-----------|----------------|-----------------|
| P0 | Production down | 15 min | 1 hour |
| P1 | Major feature broken | 30 min | 4 hours |
| P2 | Minor issue | 1 hour | 1 day |
| P3 | Documentation/polish | 1 day | 1 week |

### Contact Information

- **Infrastructure Issues**: @devops-team (Slack: #devops)
- **API/SDK Issues**: @api-team (Slack: #api-dev)
- **ML/Optimization Issues**: @ml-team (Slack: #ml)
- **QA/Testing Issues**: @qa-team (Slack: #qa)
- **Data/Analytics Issues**: @data-team (Slack: #data)
- **On-Call Engineer**: Check PagerDuty for current oncall

---

## Sign-Off Checklist

**ML Team:**
- [ ] Model selection algorithm implemented
- [ ] Feedback loop integrated and tested
- [ ] SLO metrics monitored (cost, quality, latency)
- [ ] Ready for canary deployment

**QA Team:**
- [ ] SLO validation tests passing
- [ ] Load test validates 10x spike handling
- [ ] Chaos tests validate failure recovery
- [ ] SLO dashboard created

**Data Team:**
- [ ] Backup pipeline automated and verified
- [ ] ETL pipeline running daily
- [ ] Data quality checks passing
- [ ] PII/security review completed

**DevOps:**
- [ ] All infrastructure deployed and healthy
- [ ] Monitoring & alerting configured
- [ ] Runbooks documented
- [ ] Network policies enforced
- [ ] Secrets management verified

---

**Next Review Date:** [4 weeks from deployment]
**Last Updated:** [Deployment date]
**Status:** ⏳ IN PROGRESS
