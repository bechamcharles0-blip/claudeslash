# Team Integration Guide

Integration points and responsibilities for ML, QA, and DevOps teams.

---

## ML Team Integration

### 1. Adding New Models

**File:** `src/core/modelRouter.ts` (lines 4-45)

```typescript
const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  // Add new model here:
  fable: {
    name: 'fable',
    apiId: 'claude-fable-5-1',
    costPer1MTok: { input: 10.0, output: 50.0 },
    maxTokens: 1000000,
    speed: 15,
    quality: 10,
    defaultEffort: 'xhigh',
    capabilities: ['text', 'vision', 'reasoning', 'tool-use', 'long-horizon'],
  },
};
```

**Steps:**
1. Define model configuration in `MODEL_CONFIGS`
2. Add model to type: `src/types/index.ts` (ModelTier type)
3. Update routing logic in `selectModel()` method
4. Add model to `ALLOWED_MODELS` in ConfigMap
5. Update dashboard to display new model metrics

**Testing:**
```bash
npm test
npm run cli -- models  # Verify new model appears
```

---

### 2. Model Selection Algorithm

**Current Logic:**
```
1. Start with Haiku (cheapest)
2. Check estimated tokens:
   - If < 50k tokens → use Haiku
   - If < 200k tokens → use Sonnet
   - If < 500k tokens → use Opus
   - Otherwise → use Fable

3. Respect allowedModels parameter (client can restrict)
4. Consider minQuality threshold
5. Escalate if task requires advanced reasoning
```

**To Customize:**

Create `src/core/modelSelector.ts`:

```typescript
interface SelectionContext {
  task: string;
  budget: number;
  minQuality: number;
  previousFailures: string[];
  userPreferences: Record<string, any>;
}

export function selectModelCustom(context: SelectionContext): ModelTier {
  // Add your custom logic here
  // Consider task difficulty, user history, cost constraints
}
```

Then update `modelRouter.ts` to use your selector.

---

### 3. Performance Metrics Integration

**Metrics Available:**

```prometheus
# Model-specific metrics
model_requests_total{model="haiku"}
model_requests_total{model="sonnet"}
model_requests_total{model="opus"}
model_requests_total{model="fable"}

# Quality metrics
model_quality_score{model="haiku"}  # 1-10
model_failure_rate{model="haiku"}

# Cost metrics
model_cost_total{model="haiku"}
```

**Dashboard Access:**

1. Grafana: http://localhost:3001
2. Create custom dashboard showing:
   - Model performance by complexity
   - Quality vs cost tradeoff
   - Failure rate trends
   - User satisfaction metrics

**Integration Steps:**

```bash
# 1. Access Prometheus metrics
curl http://localhost:9090/api/v1/query?query=model_requests_total

# 2. Create Grafana dashboard
# Go to Grafana → Dashboards → New Dashboard
# Add panels for each model metric

# 3. Set up alerts for quality issues
# Configure Prometheus alerting rules
```

---

### 4. A/B Testing Framework

**Implement model testing:**

```typescript
// src/core/abTesting.ts

interface TestConfig {
  name: string;
  modelA: ModelTier;
  modelB: ModelTier;
  splitPercentage: number;  // 0-100 for modelA
  startDate: Date;
  endDate: Date;
}

export function selectModelForTest(
  context: SelectionContext,
  testConfig: TestConfig
): ModelTier {
  const hash = hashUserId(context.userId);
  const useModelA = hash % 100 < testConfig.splitPercentage;
  return useModelA ? testConfig.modelA : testConfig.modelB;
}
```

**Steps:**
1. Define test in `abTesting.ts`
2. Activate via ConfigMap: `AB_TEST_CONFIG="{...}"`
3. Monitor metrics for both variants
4. Analyze results using Prometheus queries

---

## QA Team Integration

### 1. Test Environments Setup

**Local Development (docker-compose):**
```bash
docker-compose up
# All services running: API, Redis, Prometheus, Grafana
```

**Staging (Kubernetes):**
```bash
kubectl get all -n claude-router-staging
# Full production-like environment
```

**Test Databases:**
```bash
# Redis with test data
redis-cli FLUSHDB ASYNC  # Reset between tests
redis-cli RESTORE cache:test:1 0 ...  # Load test data
```

---

### 2. Load Testing Scenarios

**Setup k6 for load testing:**

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 100,        // 100 virtual users
  duration: '1m',  // 1 minute test
};

export default function() {
  let res = http.post('http://localhost:3000/api/route', {
    task: 'Summarize this text',
    budget: 50000,
  });
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  sleep(1);
}
```

**Run tests:**
```bash
k6 run load-test.js

# Or via docker
docker run -i grafana/k6 run - < load-test.js
```

---

### 3. Cache Testing

**Cache Hit Rate Test:**

```bash
# Request same task multiple times
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/route \
    -H "Content-Type: application/json" \
    -d '{
      "task": "Summarize renewable energy benefits",
      "budget": 50000
    }' | grep -o '"cacheHit":[^,]*'
done

# Expected: Increasing cache hits (first: false, rest: true)
```

**Cache Size Monitoring:**

```bash
redis-cli INFO memory
# Check used_memory and max_memory

redis-cli DBSIZE
# Check number of keys
```

---

### 4. Rate Limiting Tests

**Test rate limit enforcement:**

```bash
#!/bin/bash

# User 1: Test 1000 requests in 1 hour
for i in {1..1000}; do
  curl -X POST http://localhost:3000/api/route \
    -H "X-User-ID: testuser1" \
    -H "Content-Type: application/json" \
    -d '{"task":"test"}'
done

# Should fail on request 1001 with 429 Too Many Requests
curl -X POST http://localhost:3000/api/route \
  -H "X-User-ID: testuser1" \
  -H "Content-Type: application/json" \
  -d '{"task":"test"}'
# Expected: 429 Too Many Requests
```

---

### 5. Failover Testing

**Test pod restart:**

```bash
# Get a running pod
POD=$(kubectl get pods -n claude-router -l app=claude-router-api -o jsonpath='{.items[0].metadata.name}')

# Delete the pod
kubectl delete pod $POD -n claude-router

# Monitor recovery
kubectl get pods -n claude-router --watch

# Verify API still responds
curl http://localhost:3000/api/health
```

**Test Redis failover:**

```bash
# Get Redis pod
REDIS_POD=$(kubectl get pods -n claude-router -l app=redis -o jsonpath='{.items[0].metadata.name}')

# Simulate failure
kubectl delete pod $REDIS_POD -n claude-router

# Monitor recovery
kubectl logs -f deployment/claude-router-api -n claude-router

# Verify cache is recreated
redis-cli DBSIZE
```

---

### 6. Security Testing

**SQL/Prompt Injection Test:**

```bash
# These should be blocked
curl -X POST http://localhost:3000/api/route \
  -H "Content-Type: application/json" \
  -d '{"task":"DROP TABLE users; --"}'
# Expected: 400 Bad Request

curl -X POST http://localhost:3000/api/route \
  -H "Content-Type: application/json" \
  -d '{"task":"Ignore previous instructions..."}'
# Expected: 400 Bad Request
```

**Authorization Testing:**

```bash
# Missing API key
curl http://localhost:3000/api/route
# Expected: 401 Unauthorized

# Invalid API key
curl -H "Authorization: Bearer invalid-key" \
  http://localhost:3000/api/route
# Expected: 401 Unauthorized
```

---

## DevOps Team Integration

### 1. CI/CD Pipeline Management

**Pipeline Configuration:**

File: `.github/workflows/ci-cd.yaml`

**Stages:**
1. Lint (TypeScript)
2. Test (unit tests + integration)
3. Build (Docker image)
4. Deploy Staging (on `develop` push)
5. Deploy Production (on `main` push)

**Trigger Deployments:**

```bash
# Automatic on push
git push origin develop    # Deploys to staging
git push origin main       # Deploys to production

# Manual trigger (GitHub Actions)
gh workflow run ci-cd.yaml
```

---

### 2. Secrets Management

**GitHub Secrets Required:**

```
SLACK_WEBHOOK       - For deployment notifications
KUBE_CONFIG         - Kubernetes cluster config (base64)
REGISTRY_USERNAME   - Container registry username
REGISTRY_PASSWORD   - Container registry password
ANTHROPIC_API_KEY   - For production environment
```

**Add Secrets:**

```bash
# Via GitHub CLI
gh secret set SLACK_WEBHOOK --body "https://hooks.slack.com/..."
gh secret set KUBE_CONFIG --body "$(cat ~/.kube/config | base64)"

# Or via GitHub UI:
# Settings → Secrets and variables → Actions
```

---

### 3. Monitoring Setup

**Prometheus Configuration:**

File: `monitoring/prometheus.yml`

**Scrape Jobs:**
- `claude-router-api` - Application metrics
- `redis` - Cache metrics
- `node` - Infrastructure metrics

**Custom Metrics to Add:**

```yaml
- job_name: 'custom-metrics'
  static_configs:
    - targets: ['custom-metrics-exporter:9090']
```

**Grafana Dashboards:**

1. System Dashboard (CPU, Memory, Disk)
2. Application Dashboard (Requests, Errors, Latency)
3. Business Dashboard (Users, Cost, Savings)
4. Cache Dashboard (Hit rate, Memory, Operations)

---

### 4. Auto-Scaling Configuration

**HPA Settings:**

File: `k8s/hpa.yaml`

Current configuration:
```yaml
minReplicas: 3
maxReplicas: 50
CPU Target: 70%
Memory Target: 80%
```

**Adjust Scaling:**

```bash
# View current HPA
kubectl get hpa -n claude-router

# Edit scaling policy
kubectl edit hpa claude-router-api-hpa -n claude-router

# Check scaling activity
kubectl describe hpa claude-router-api-hpa -n claude-router
```

---

### 5. Incident Response

**Alert Notification:**

Alerts are sent to Slack when:
- Error rate > 5%
- Latency P95 > 2 seconds
- Memory usage > 90%
- Redis connection down
- Pod restart rate > 0

**Response Procedure:**

1. **Detection** (Automatic alert)
   - Slack notification to #incidents
   - PagerDuty escalation (if critical)

2. **Initial Response** (5 minutes)
   - Acknowledge alert
   - Check metrics
   - Review logs

3. **Investigation** (10 minutes)
   - Identify root cause
   - Check recent deployments
   - Review config changes

4. **Mitigation** (15 minutes)
   - Scale up if needed
   - Restart failed services
   - Rollback if recent deployment
   - Notify stakeholders

5. **Resolution** (30+ minutes)
   - Monitor metrics
   - Confirm stability
   - Document incident
   - Plan fix

---

### 6. Deployment Runbook

**Pre-Deployment:**

```bash
# 1. Verify tests pass
npm test

# 2. Build Docker image
docker build -t claude-router:latest .

# 3. Run security scan
docker scan claude-router:latest

# 4. Check staging
curl https://staging-api.claude-router.io/api/health
```

**Deployment (Production):**

```bash
# 1. Create deployment
git checkout main
git merge develop
git push origin main
# Automatic deployment via GitHub Actions

# 2. Monitor rollout
kubectl rollout status deployment/claude-router-api -n claude-router

# 3. Check metrics
curl http://localhost:3000/api/stats
```

**Post-Deployment:**

```bash
# 1. Smoke tests
curl -X POST http://localhost:3000/api/route \
  -d '{"task":"test","budget":50000}'

# 2. Monitor for 30 minutes
kubectl logs -f deployment/claude-router-api -n claude-router

# 3. Verify metrics
# Check Grafana dashboard

# 4. Notify team
# Post in Slack #deployments
```

---

### 7. Scaling Exercises

**Load Test to Trigger Scaling:**

```bash
# Use k6 to generate load
k6 run - <<EOF
import http from 'k6/http';

export let options = {
  vus: 500,
  duration: '5m',
};

export default function() {
  http.post('http://localhost:3000/api/route', {
    task: 'Summarize this text',
    budget: 50000,
  });
}
EOF

# Watch pods scale up
kubectl get pods -n claude-router --watch
```

**Expected Scaling:**
- 0-100 requests/sec: 3 pods
- 100-300 requests/sec: 5-10 pods
- 300-1000 requests/sec: 20-30 pods
- 1000+ requests/sec: 40+ pods

---

## Communication Channels

### Daily Standup
- **Time:** 10:00 AM (team time)
- **Format:** Slack thread or Zoom call
- **Topics:** Progress, blockers, priorities

### Weekly Sync
- **Time:** Every Friday 2:00 PM
- **Duration:** 1 hour
- **Topics:** Week review, planning, incidents

### Incident Response
- **Channel:** #incidents (Slack)
- **Notification:** Automated via Prometheus alerts
- **Escalation:** PagerDuty → On-call engineer

### Infrastructure Changes
- **Approval:** Code review (pull request)
- **Testing:** Automated tests + staging deployment
- **Communication:** #infrastructure (Slack)
- **Documentation:** Update DEPLOYMENT.md and INFRASTRUCTURE.md

---

## Success Metrics

### For ML Team
- Model selection accuracy
- Quality scores for different models
- Token usage optimization
- User satisfaction with model choices

### For QA Team
- Test coverage > 80%
- No critical bugs in production
- Performance meets SLO targets
- Failover time < 5 minutes

### For DevOps Team
- Uptime > 99.9%
- Error rate < 1%
- Deployment time < 10 minutes
- MTTR (Mean Time To Recovery) < 15 minutes
- Cost optimization (tokens saved)

---

**Last Updated:** 2026-10-21
