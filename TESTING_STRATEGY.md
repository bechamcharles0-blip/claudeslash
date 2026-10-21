# Claude Router Testing Strategy & QA Framework

## Executive Summary

Claude Router is a token optimization system with 3 critical paths:
1. **Token Estimation** - Counts tokens before execution (naive 4-char/token, ~60-70% accurate)
2. **Model Selection** - Routes to optimal Claude model (Haiku→Sonnet→Opus→Fable)
3. **Cost Tracking** - Calculates and predicts costs (depends on token accuracy)

**Current Status**: Zero tests, multiple accuracy issues, production-critical bugs.

**Timeline to Production**: 8-10 weeks with proper testing infrastructure.

---

## Critical Issues Found

### 1. Token Estimation (BROKEN)
**Issue**: Uses `Math.ceil(task.length / 4)` - approximately 60-70% accurate
- Expected: Claude's BPE tokenization
- Reality: Character count ÷ 4 = oversimplified
- Impact: Cost predictions off by 30-40%, model selection suboptimal

**Test**: `src/core/modelRouter.test.ts` → "CRITICAL: Should validate against actual Claude API token count"

**Fix Required**:
- [ ] Implement proper BPE tokenization OR
- [ ] Use Anthropic's token counting API (when available)
- [ ] Validate accuracy to within ±5% of real counts

### 2. Hardcoded Savings (BROKEN)
**Issue**: Always reports 30% savings regardless of reality
- Expected: Calculate actual tokens saved vs baseline
- Reality: `savings.percentReduced = 30` (hardcoded)
- Impact: Misleading performance metrics

**Test**: `src/core/modelRouter.test.ts` → "CRITICAL: Savings calculation must be validated"

**Fix Required**:
- [ ] Calculate baseline cost (assume Opus would be used)
- [ ] Compare actual vs baseline
- [ ] Report real savings or zero if no saving

### 3. Fixed Metrics (BROKEN)
**Issue**: `averageQuality` and `escalationRate` are hardcoded
- Expected: Calculate from actual requests
- Reality: Always `7.2` and `0.15`
- Impact: Stats dashboard is misleading

**Test**: `src/core/modelRouter.test.ts` → "CRITICAL: Quality and escalation metrics are hardcoded"

**Fix Required**:
- [ ] Track quality scores from all responses
- [ ] Track escalation events
- [ ] Calculate real averages

### 4. Model API IDs (OUTDATED)
**Issue**: Uses `claude-haiku-5-5` etc, may be outdated
- Expected: Current Claude API model names
- Reality: Hardcoded in `ModelRouter.MODEL_CONFIGS`
- Impact: Requests fail if API changed model names

**Test**: `src/core/modelRouter.test.ts` → "CRITICAL: Model API IDs must match current Claude API"

**Fix Required**:
- [ ] Verify against current Anthropic SDK
- [ ] Use environment variables for model names
- [ ] Add model name validation

### 5. Cache Implementation Missing
**Issue**: `cacheHit` always false, no actual caching
- Expected: Redis-backed prompt caching
- Reality: `tokensUsed.cached = 0` always
- Impact: Cannot achieve claimed 10-15% savings from caching

**Test**: No test exists

**Fix Required**:
- [ ] Implement Redis integration
- [ ] Add cache key generation
- [ ] Implement cache validation
- [ ] Add cache hit verification tests

### 6. In-Memory Only Stats (NOT PRODUCTION-READY)
**Issue**: Stats reset on server restart, not persistent
- Expected: Database persistence for distributed systems
- Reality: Uses JavaScript Map in memory
- Impact: Can't track real performance, scaling breaks

**Test**: `src/api/rest.test.ts` → "CRITICAL: Stats are server-instance only"

**Fix Required**:
- [ ] Add persistent storage (PostgreSQL/MongoDB)
- [ ] Implement stats aggregation
- [ ] Add time-series metrics

### 7. Rate Limiting Incomplete
**Issue**: Only hourly limit enforced, per-minute and per-day ignored
- Expected: All three limits active
- Reality: Code only checks `perHour`
- Impact: API can be abused within hour and day limits

**Test**: `src/core/security.test.ts` → "CRITICAL: Per-minute and per-day limits not enforced"

**Fix Required**:
- [ ] Implement per-minute checking
- [ ] Implement per-day checking
- [ ] Use Redis for distributed rate limiting

### 8. Distributed System Issues
**Issue**: Rate limiting and stats in-memory, won't work with multiple instances
- Expected: Shared state (Redis)
- Reality: Each instance has own state
- Impact: Breaks immediately in production

**Test**: None

**Fix Required**:
- [ ] All rate limit checks use Redis
- [ ] All stats use database
- [ ] Add distributed locking

### 9. Security: CORS Allows All Origins
**Issue**: `cors()` with no configuration
- Expected: Restricted origin validation
- Reality: `Access-Control-Allow-Origin: *`
- Impact: Any website can call your API

**Test**: `src/api/rest.test.ts` → "CRITICAL: Need CORS and authentication review"

**Fix Required**:
- [ ] Add CORS origin whitelist
- [ ] Implement API key authentication
- [ ] Add request signing

### 10. No Health Check Implementation
**Issue**: Health endpoint returns static "ok"
- Expected: Check Anthropic API connectivity, Redis, database
- Reality: No dependency verification
- Impact: Unaware of real outages

**Test**: `src/api/rest.test.ts` → "CRITICAL: Health check should verify dependencies"

**Fix Required**:
- [ ] Add Anthropic API ping
- [ ] Add Redis connectivity check
- [ ] Add database connectivity check

---

## Test Pyramid & Coverage

```
                      E2E Tests (CLI, API)
                    /                    \
                 Integration Tests   Load Tests
              /                        \
        Unit Tests (Mocked)      (Concurrent Requests)
      /              \
Core Logic    Security    APIs
```

### Layer 1: Unit Tests (70% coverage target)
**Files**: `*.test.ts` in each module

**Coverage Required**:
- [ ] `src/core/modelRouter.test.ts` - Core routing logic
  - Token estimation
  - Model selection
  - Cost calculation
  - Statistics tracking
  
- [ ] `src/core/security.test.ts` - Security manager
  - Input validation (all patterns)
  - Rate limiting (hourly, minute, day)
  - Anomaly detection
  - Output sanitization
  
- [ ] `src/api/rest.test.ts` - REST endpoints
  - POST /api/route validation
  - GET /api/models response
  - POST /api/token-estimate accuracy
  - GET /api/stats consistency
  - Error handling (400, 429, 403, 500)
  
- [ ] `src/api/graphql.test.ts` - GraphQL schema
  - Query: models, stats, estimateTokens
  - Mutation: route
  - Type validation
  - Error handling

**Tools**: Vitest + Mocking library

### Layer 2: Integration Tests (50% coverage target)
**File**: `src/integration.test.ts`

**Coverage Required**:
- [ ] Real API integration (requires API key)
  - Token count validation vs actual
  - Cost calculation accuracy
  - Model selection correctness
  - Latency measurement
  
- [ ] Multi-request scenarios
  - Stats accumulation
  - Quality-based escalation
  
- [ ] Error scenarios
  - Invalid API key handling
  - Timeout handling
  - Rate limit hitting
  
- [ ] Performance baselines
  - Latency per model
  - Token accuracy range
  - Cost calculation precision

**Tools**: Vitest with real Anthropic SDK

**Prerequisites**:
- `ANTHROPIC_API_KEY` environment variable
- Test budget (real API costs money)

### Layer 3: Load Tests (Critical paths)
**File**: `src/loadTest.ts`

**Scenarios**:
1. Light Load (10 concurrent, 100 requests)
   - Baseline latency
   - Success rate at normal load
   
2. Medium Load (50 concurrent, 500 requests)
   - Throughput characteristics
   - Error rate behavior
   
3. Heavy Load (100 concurrent, 1000 requests)
   - System breaking point
   - Rate limit hitting
   - Error patterns

**Metrics to Validate**:
- [ ] P50, P95, P99 latencies
- [ ] Requests per second
- [ ] Error rate increases
- [ ] Token count stability
- [ ] Cost tracking accuracy
- [ ] Rate limit enforcement

**Tools**: Custom load tester in `src/loadTest.ts`

### Layer 4: E2E Tests (Manual for now)
**Coverage Required**:
- [ ] CLI commands
  ```bash
  npm run cli route "test prompt"
  npm run cli estimate "test prompt"
  npm run cli models
  npm run cli stats
  ```
  
- [ ] Server API
  ```bash
  npm run dev
  curl -X POST http://localhost:3000/api/route -d '{"task":"test","budget":50000}'
  curl http://localhost:3000/dashboard
  ```
  
- [ ] Error paths
  - Invalid input rejection
  - Rate limit 429 response
  - Malicious input blocking
  - API failure handling

---

## Test Execution

### Run Unit Tests
```bash
npm test
```

### Run with Coverage Report
```bash
npm test -- --coverage
```

### Run Integration Tests (requires API key)
```bash
ANTHROPIC_API_KEY="sk-..." npm test src/integration.test.ts
```

### Run Load Tests
```bash
npm run load-test
# or specific scenario
node --loader tsx/esm src/loadTest.ts --requests 1000 --concurrent 50
```

### Watch Mode (Development)
```bash
npm test -- --watch
```

---

## Critical Path Validation Checklist

### Before Any Production Deployment

- [ ] **Token Estimation**
  - [ ] Accuracy tested against real API
  - [ ] Error < 10% on real requests
  - [ ] All model types tested (haiku, sonnet, opus, fable)
  
- [ ] **Model Selection**
  - [ ] Simple tasks use Haiku
  - [ ] Complex tasks escalate appropriately
  - [ ] Quality constraints respected
  - [ ] Budget constraints enforced
  
- [ ] **Cost Calculation**
  - [ ] Matches real API billing
  - [ ] All models tested
  - [ ] Rounding rules verified
  
- [ ] **Security**
  - [ ] All injection patterns blocked
  - [ ] Rate limits working
  - [ ] Output sanitization active
  - [ ] CORS restricted
  - [ ] Authentication required
  
- [ ] **Performance**
  - [ ] P95 latency < 5 seconds
  - [ ] Throughput > 10 req/sec per instance
  - [ ] Error rate < 0.1% at 50 concurrent
  
- [ ] **Reliability**
  - [ ] Stats persist across restarts
  - [ ] Works with multiple instances
  - [ ] Graceful degradation on API errors
  - [ ] Health checks work

---

## Dependencies to Add

### Package.json Updates
```json
{
  "devDependencies": {
    "vitest": "^1.1.0",           // Already present
    "@vitest/ui": "^1.1.0",       // Test UI
    "supertest": "^6.3.3",        // HTTP testing
    "ts-node": "^10.9.2",         // TypeScript execution
    "@types/supertest": "^2.0.12" // Types
  },
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "test:integration": "vitest src/integration.test.ts",
    "test:watch": "vitest --watch",
    "load-test": "node --loader tsx/esm src/loadTest.ts"
  }
}
```

### Infrastructure Dependencies
- Redis (rate limiting, distributed state)
- PostgreSQL/MongoDB (persistent stats)
- PagerDuty (alerting)
- DataDog/Prometheus (metrics)

---

## Monitoring & Alerting Setup

### Metrics to Track
```
router_requests_total - Total requests routed
router_errors_total - Total errors
router_tokens_saved_total - Cumulative tokens saved
router_cost_total - Cumulative cost
router_latency_p50/p95/p99 - Latency percentiles
router_model_usage - Per-model request count
router_escalation_rate - % of escalations
router_cache_hit_rate - % cache hits
```

### Critical Alerts
1. **Error rate > 5%** - Something broken
2. **Latency P99 > 10s** - API degradation
3. **Rate limit hits increasing** - Abuse or broken client
4. **Token accuracy drift > 10%** - Estimation broken
5. **Stats divergence across instances** - Distributed system issue

### PagerDuty Integration
```typescript
// TODO: Add to security.logSecurityEvent()
if (severity === 'high') {
  await pagerduty.trigger({
    routing_key: process.env.PAGERDUTY_KEY,
    event_action: 'trigger',
    dedup_key: `security-${userId}-${Date.now()}`,
    payload: {
      summary: `Security event: ${event}`,
      severity: 'critical',
      source: 'claude-router',
    },
  });
}
```

---

## Timeline to Production Readiness

### Phase 1: Critical Fixes (2 weeks)
- [ ] Fix token estimation (implement real tokenization)
- [ ] Fix hardcoded metrics (calculate real values)
- [ ] Add model API ID validation
- [ ] Implement Redis for distributed state

**Blockers**: Anthropic API changes, Redis setup

### Phase 2: Security Hardening (2 weeks)
- [ ] Restrict CORS origins
- [ ] Implement API key authentication
- [ ] Complete rate limiting (minute & day)
- [ ] Add comprehensive input validation tests

**Blockers**: Security requirements clarification

### Phase 3: Observability (2 weeks)
- [ ] Add persistent stats storage
- [ ] Implement health checks
- [ ] Add structured logging
- [ ] Setup PagerDuty alerting

**Blockers**: Database setup, PagerDuty integration

### Phase 4: Load Testing & Optimization (1-2 weeks)
- [ ] Run load test scenarios
- [ ] Identify bottlenecks
- [ ] Optimize hot paths
- [ ] Establish performance baselines

**Blockers**: Load testing environment

### Phase 5: Documentation & Training (1 week)
- [ ] API documentation
- [ ] Deployment guide
- [ ] Troubleshooting guide
- [ ] Team training

---

## What ML & DevOps Teams Need to Provide

### ML Team
- [ ] Accurate token counter (or point to Anthropic API)
- [ ] Model cost matrices (input/output per model)
- [ ] Quality metrics definition (how to measure 0-10 quality)
- [ ] Model selection algorithm specifications
- [ ] A/B testing framework for routing decisions

### DevOps Team
- [ ] Redis instance (rate limiting, distributed state)
- [ ] PostgreSQL/MongoDB (stats persistence)
- [ ] PagerDuty integration setup
- [ ] DataDog/Prometheus metrics collection
- [ ] Load testing environment (can generate 1000+ req/s)
- [ ] Staging environment (full production replica)
- [ ] Production deployment process
- [ ] Rollback procedure

### Product/Requirements
- [ ] SLA targets (latency, error rate, availability)
- [ ] Cost targets (what % savings = success?)
- [ ] Security requirements (PCI-DSS? HIPAA?)
- [ ] Compliance needs (audit logging, data retention)

---

## Coverage Targets

| Component | Unit | Integration | Load | Coverage % |
|-----------|------|-------------|------|-----------|
| ModelRouter | ✅ | ✅ | ✅ | 85% |
| SecurityManager | ✅ | ✅ | ✅ | 80% |
| REST API | ✅ | ✅ | ✅ | 90% |
| GraphQL API | ✅ | ✅ | ⚠️ | 75% |
| CLI | ⚠️ | ⚠️ | ❌ | 50% |
| **Overall** | | | | **70%** |

Legend: ✅ Fully tested, ⚠️ Partially tested, ❌ Not tested

---

## Success Metrics

### Technical
- [ ] Test coverage ≥ 70%
- [ ] All critical issues resolved
- [ ] Token accuracy ±5%
- [ ] P95 latency < 5 seconds
- [ ] Error rate < 0.1%
- [ ] 99.9% uptime in staging

### Business
- [ ] Actual token savings ≥ 30%
- [ ] Cost reduction validated
- [ ] Deployment to production
- [ ] Zero security incidents
- [ ] User satisfaction > 4.5/5

---

## Next Steps

1. **Today**: Run existing unit tests (will show failures due to mocks)
2. **Week 1**: Fix token estimation and hardcoded metrics
3. **Week 2**: Add Redis integration
4. **Week 3**: Complete security hardening
5. **Week 4**: Run load tests
6. **Week 5-6**: Fix issues found in load testing
7. **Week 7**: Production readiness review
8. **Week 8**: Deploy to production with monitoring

---

## Questions for Product & Engineering Leadership

1. **Token Accuracy**: Is ±5% acceptable, or need ±2%?
2. **Cost Tracking**: Need real-time billing integration?
3. **Scale**: Target concurrent users? Global deployment?
4. **Security**: HIPAA/PCI-DSS compliance needed?
5. **SLAs**: What latency target? What error budget?
6. **Rollout**: Staged rollout with canary? Or big bang?

