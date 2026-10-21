# Claude Router - Production Readiness Guide

**Version**: 2.0 (Professor-Level QA)  
**Last Updated**: 2026-10-21  
**Target Go-Live**: Week 8 (2026-12-16)  
**Status**: Testing Infrastructure Ready, Implementation In Progress

---

## Table of Contents

1. [Production Readiness Checklist](#production-readiness-checklist)
2. [How to Run Tests](#how-to-run-tests)
3. [Baseline Measurement Guide](#baseline-measurement-guide)
4. [Failure Scenario Testing](#failure-scenario-testing)
5. [Monitoring & Alerting Setup](#monitoring--alerting-setup)
6. [Rollout Plan](#rollout-plan)

---

## Production Readiness Checklist

### Phase 1: Correctness Validation (Week 1-2)

#### Token Estimation (CRITICAL PATH)
- [ ] **Implement proper tokenization**
  - [ ] Evaluate option A: Anthropic's token counting API
  - [ ] Evaluate option B: js-tiktoken library
  - [ ] Evaluate option C: Claude API tokenization endpoint
  - [ ] Select and implement chosen approach
  - **Owner**: Backend lead
  - **Deadline**: Day 4
  - **Verification**: Run TC-001 to TC-008

- [ ] **Validate accuracy against real API**
  - [ ] Run 100+ prompts through real API
  - [ ] Compare estimated vs actual tokens
  - [ ] Achieve ±5% accuracy target
  - [ ] Document accuracy by prompt type
  - **Verification**: `npm test:integration` passes
  - **Evidence**: accuracy-report.json in project root

#### Model Selection (CRITICAL PATH)
- [ ] **Test all model tiers**
  - [ ] Haiku: Simple tasks (0-10k tokens)
  - [ ] Sonnet: Medium complexity (10-50k tokens)
  - [ ] Opus: Complex reasoning (50-100k tokens)
  - [ ] Fable: Maximum complexity (100k+ tokens)
  - **Verification**: Run TC-009 to TC-016
  - **Test**: `npm test -- --grep "Model Selection"`

- [ ] **Test quality escalation**
  - [ ] Quality threshold=8 triggers escalation
  - [ ] No unnecessary escalations
  - [ ] Budget constraints prevent escalation
  - **Verification**: 100% escalation accuracy

#### Cost Calculation (CRITICAL PATH)
- [ ] **Validate cost accuracy**
  - [ ] Calculate expected cost = (input_tokens/1M × input_rate) + (output_tokens/1M × output_rate)
  - [ ] Compare against actual API response
  - [ ] Verify for all 4 models
  - [ ] Validate rounding (should match billing system)
  - **Verification**: Run TC-017 to TC-020
  - **Evidence**: Cost reconciliation report

- [ ] **Check against real billing**
  - [ ] Run 1000+ requests
  - [ ] Sum calculated costs
  - [ ] Compare against Anthropic invoice
  - [ ] Identify any discrepancies
  - **SLO**: ±0.01% variance

### Phase 2: Performance Validation (Week 3-4)

#### Single Request Latency (CRITICAL SLO)
- [ ] **Establish baseline (1000+ requests minimum)**
  - [ ] Run `npm test -- src/performance.test.ts`
  - [ ] Record P50, P95, P99, P99.9 latencies
  - [ ] Identify any outliers > 1000ms
  - [ ] Document results in baseline-light-load.json
  - **Expected**: P99 < 100ms
  - **Duration**: 15-20 minutes sustained
  - **Command**: `npm run load-test light`

- [ ] **Measure cache impact**
  - [ ] Compare cached vs non-cached requests
  - [ ] Cache hits should be < 10ms P99
  - [ ] Cache miss same as cold request
  - **Verification**: Enable cache monitoring

#### Concurrent Request Latency (FAN-OUT PROBLEM)
- [ ] **Test P99 with 5 parallel requests**
  - [ ] Run 50 iterations of 5 concurrent calls
  - [ ] Measure total time per iteration
  - [ ] Calculate P99 of total times
  - [ ] **Expected**: < 500ms P99
  - [ ] **Formula**: Each component needs < 20ms P99 to keep overall < 100ms
  - **Command**: `npm test -- --grep "Concurrent"`

#### Throughput & Scaling
- [ ] **Light load (100 req/s)**
  - [ ] 1000 requests at 1-10 concurrent
  - [ ] Measure throughput: req/sec
  - [ ] **Expected**: 100+ req/sec
  - [ ] Command: `npm run load-test light`

- [ ] **Medium load (500 req/s)**
  - [ ] 5000 requests at 50 concurrent
  - [ ] Measure throughput: req/sec
  - [ ] **Expected**: 450+ req/sec (90% efficiency)
  - [ ] Cache hit rate should be > 70%
  - [ ] Command: `npm run load-test medium`

- [ ] **Heavy load (1000+ req/s)**
  - [ ] 10000 requests at 100+ concurrent
  - [ ] **20 MINUTES sustained** (critical for GC spikes)
  - [ ] Measure P99 latency degradation
  - [ ] **Expected**: < 500ms P99 (degradation acceptable)
  - [ ] Memory growth < 100MB
  - [ ] Command: `npm run load-test heavy` (takes ~20 min)

### Phase 3: Reliability Validation (Week 5-6)

#### Error Handling & Graceful Degradation
- [ ] **Test all failure modes**
  - [ ] Cache failure → fallback to DB (TC-042)
  - [ ] API rate limit (429) → return error cleanly (TC-043)
  - [ ] API timeout → timeout after 30s, no hang (TC-044)
  - [ ] Database unreachable → fallback mode (TC-045)
  - [ ] Invalid API key → 401 immediately (TC-046)
  - [ ] Malformed input → 400 without processing (TC-047)
  - **Command**: `npm test -- --grep "Error Handling"`
  - **Evidence**: All error scenarios return proper HTTP status codes

#### Rate Limiting (CRITICAL SECURITY)
- [ ] **Test all three limits**
  - [ ] Per-minute: 200 req/min → 429 on 201st (TC-049)
  - [ ] Hourly: 10,000 req/hour → 429 on 10,001st (TC-048)
  - [ ] Daily: 1M req/day → 429 on 1,000,001st (TC-050)
  - **Verification**: All limits enforced
  - [ ] Distributed rate limit (TC-051): Works across multiple instances
  - **Command**: `npm test -- src/core/security.test.ts`

#### Recovery & Resilience
- [ ] **Test service recovery**
  - [ ] Simulate API down 1 minute
  - [ ] Verify service comes back within 5 minutes
  - [ ] No permanent state loss
  - **Command**: Chaos testing (manual)

- [ ] **Test data consistency**
  - [ ] Server restart → stats preserved (TC-055)
  - [ ] Multiple instances → aggregated correctly (TC-056)
  - [ ] Cache + DB → always consistent (TC-057)
  - **Verification**: Run integration tests 3x with restarts

### Phase 4: Security Validation (Week 6)

#### Input Validation
- [ ] **Test injection attack prevention**
  - [ ] SQL injection patterns blocked
  - [ ] Command injection patterns blocked
  - [ ] XSS patterns blocked
  - [ ] Prompt injection patterns blocked
  - **Command**: `npm test -- --grep "Security"`

#### CORS & Authentication
- [ ] **Restrict CORS origins**
  - [ ] Only allow known origins
  - [ ] No Access-Control-Allow-Origin: *
  - [ ] Verify in HTTP response headers

- [ ] **Require API authentication**
  - [ ] All requests need API key or JWT
  - [ ] Invalid keys return 401
  - [ ] Rate limit by API key

#### Output Sanitization
- [ ] **Verify output is safe**
  - [ ] No credentials in logs
  - [ ] No internal paths in error messages
  - [ ] No stack traces sent to client

---

## How to Run Tests

### Quick Start (5 minutes)

```bash
# Install dependencies
npm install

# Run all unit tests (fast, uses mocks)
npm test

# Check test coverage
npm test -- --coverage
```

### Integration Testing (requires API key, costs ~$10)

```bash
# Set API key
export ANTHROPIC_API_KEY="sk-..."

# Run integration tests (slower, hits real API)
npm test -- src/integration.test.ts

# Run performance tests
npm test -- src/performance.test.ts
```

### Load Testing (production-grade)

```bash
# Baseline test (10 req/s, quick)
npm run load-test baseline

# Light load (100 req/s, 10 seconds)
npm run load-test light

# Medium load (500 req/s, 10 seconds)
npm run load-test medium

# Heavy load (1000+ req/s, 20 MINUTES)
npm run load-test heavy
```

### Full Test Matrix (8+ hours)

```bash
# Run all test categories in sequence
npm run test:full-matrix

# Steps:
# 1. Unit tests (5 min)
# 2. Integration tests (30 min, requires API key)
# 3. Performance tests (15 min)
# 4. Load test baseline (5 min)
# 5. Load test light (10 min)
# 6. Load test medium (15 min)
# 7. Load test heavy (20 min)
# 8. Report compilation
```

---

## Baseline Measurement Guide

### Purpose

Establish baseline SLOs before production deployment. These measurements prove the system meets performance requirements.

### Methodology

1. **Run on clean environment**
   - Dedicated test machine, no other workloads
   - Latest code from master branch
   - Production configuration

2. **Run each scenario 3x**
   - Take median of 3 runs
   - Identify any outliers
   - Look for consistency

3. **Measure P99, not average**
   - P99 is what users experience in production
   - Average hides tail latency problems
   - Single outlier can shift P99 by 100s of ms

4. **Sustained load 15-20 minutes**
   - Catches GC pauses
   - Identifies memory leaks
   - Shows degradation under pressure

### Running Baseline Tests

```bash
# Prepare environment
export ANTHROPIC_API_KEY="sk-..."
export NODE_ENV="production"

# Run baseline 3 times
npm run load-test baseline > baseline-run1.log
npm run load-test baseline > baseline-run2.log
npm run load-test baseline > baseline-run3.log

# Review results
cat load-test-baseline-*.json | jq '.latencyMetrics'

# Expected output:
# Run 1: {p99: 45ms, errorRate: 0%}
# Run 2: {p99: 52ms, errorRate: 0%}
# Run 3: {p99: 48ms, errorRate: 0%}
# Median: {p99: 48ms} ← Use this for SLO
```

### Recording Measurements

Create `BASELINE-MEASUREMENTS.md`:

```markdown
# Baseline Measurements - Production Build

**Date**: 2026-10-21  
**Environment**: 
- Node.js v20.x
- Production config
- Redis enabled
- PostgreSQL enabled

## Test 1: Light Load (100 req/s, 1 concurrent)

### Run 1
- P99 Latency: 48ms
- P95 Latency: 32ms
- P50 Latency: 15ms
- Error Rate: 0%
- Throughput: 98 req/sec
- Cache Hit Rate: 68%

### Run 2
- P99 Latency: 52ms
- P95 Latency: 35ms
- P50 Latency: 16ms
- Error Rate: 0%
- Throughput: 99 req/sec
- Cache Hit Rate: 72%

### Run 3
- P99 Latency: 45ms
- P95 Latency: 31ms
- P50 Latency: 14ms
- Error Rate: 0%
- Throughput: 99 req/sec
- Cache Hit Rate: 70%

### MEDIAN (Use for SLO)
- **P99 Latency: 48ms** (SLO: < 100ms) ✓
- P95 Latency: 32ms
- P50 Latency: 15ms
- **Error Rate: 0%** (SLO: < 0.1%) ✓
- **Cache Hit Rate: 70%** (SLO: > 70%) ✓

## Test 2: Medium Load (500 req/s, 50 concurrent)

[Similar format...]

## Test 3: Heavy Load (1000 req/s, 100 concurrent, 20 minutes)

[Similar format...]
```

---

## Failure Scenario Testing

### Test Harness for Injecting Failures

Create `src/chaos-test.ts`:

```typescript
/**
 * Chaos Testing - Inject failures and verify graceful degradation
 */

import { ModelRouter } from './core/modelRouter.js';

class FailureInjector {
  private router: ModelRouter;
  private originalMethods: Map<string, Function> = new Map();

  constructor(apiKey: string) {
    this.router = new ModelRouter(apiKey);
  }

  // Simulate Redis down
  async testCacheFailure() {
    console.log('[CHAOS] Simulating cache failure...');
    // Mock Redis to throw error
    // Verify system uses fallback
    // Verify request still completes
  }

  // Simulate API timeout
  async testApiTimeout() {
    console.log('[CHAOS] Simulating API timeout...');
    // Mock API to timeout after 30s
    // Verify timeout error returned
    // Verify request doesn't hang forever
  }

  // Simulate rate limit
  async testRateLimit() {
    console.log('[CHAOS] Simulating rate limit (429)...');
    // Mock API to return 429
    // Verify error returned to client
    // Verify no retry loop
  }

  // Simulate database failure
  async testDatabaseFailure() {
    console.log('[CHAOS] Simulating database failure...');
    // Mock DB to disconnect
    // Verify degraded mode
    // Verify stats still tracked (in-memory)
  }
}
```

### Failure Scenarios to Test

| Scenario | Injection Method | Expected Behavior | Verify |
|----------|-----------------|-------------------|--------|
| Cache down | Disable Redis | Fallback to API, slower | Works, latency > 100ms |
| API timeout | Mock 30s delay | Return timeout error | No hang, error after 30s |
| Rate limited | Mock 429 response | Return 429 to client | Clean error, no retry |
| DB down | Disable PostgreSQL | Use in-memory stats | Stats still tracked |
| Network flaky | Drop 10% of packets | Retry and succeed | No permanent failures |
| Low memory | Reduce heap size | No crashes | Graceful degradation |

---

## Monitoring & Alerting Setup

### Metrics to Collect

```typescript
// In production, send to monitoring system (DataDog, Prometheus, etc.)

const metrics = {
  router_requests_total: number,
  router_errors_total: number,
  router_latency_p99: number,
  router_latency_p95: number,
  router_tokens_saved_total: number,
  router_cost_total: number,
  router_model_usage_haiku: number,
  router_model_usage_sonnet: number,
  router_model_usage_opus: number,
  router_model_usage_fable: number,
  router_escalation_rate: number,
  router_cache_hit_rate: number,
  router_rate_limit_hits: number,
};
```

### Critical Alerts

| Alert | Threshold | Severity | Action |
|-------|-----------|----------|--------|
| Error rate > 5% | 5% | CRITICAL | Page oncall |
| P99 latency > 1s | 1000ms | HIGH | Investigate degradation |
| Cache hit rate < 50% | 50% | MEDIUM | Check cache health |
| Token accuracy drift > 10% | 10% | HIGH | Validate tokenizer |
| Memory growth > 200 MB/hour | 200 MB | CRITICAL | Investigate leak |
| Rate limit hits increasing | +100% | MEDIUM | Check for abuse |

### Dashboard Setup

Create Prometheus dashboard showing:
- Request rate (req/sec)
- Error rate (%)
- P99 latency (ms) - **CRITICAL**
- Cache hit rate (%)
- Token accuracy (±%)
- Model distribution (pie chart)

---

## Rollout Plan

### Staging Environment (Week 7)

1. **Deploy to staging**
   - Run full test matrix
   - Verify all SLOs met
   - Monitor 24 hours

2. **Canary test (5% traffic)**
   - Route 5% of production traffic to staging
   - Monitor error rate < 0.5%
   - Monitor P99 latency < 200ms

### Production Deployment (Week 8)

1. **Pre-deployment checks**
   - [ ] All 47 test cases passing
   - [ ] Token accuracy ±5%
   - [ ] P99 latency baseline established
   - [ ] Error rate < 0.1%
   - [ ] Cache hit rate > 70%
   - [ ] Security tests passing
   - [ ] Monitoring dashboards ready
   - [ ] Alerts configured
   - [ ] Runbook documented

2. **Canary deployment (5% traffic)**
   - Deploy to 1 of 20 instances
   - Monitor metrics for 30 minutes
   - Check error rate, latency, throughput
   - If all green, proceed

3. **Rolling deployment (20% → 50% → 100%)**
   - 20% traffic (4 instances)
   - 50% traffic (10 instances)
   - 100% traffic (20 instances)
   - Each stage: monitor 15 minutes

4. **Post-deployment (24 hours)**
   - Monitor all critical metrics
   - Check for memory leaks
   - Verify stats accuracy
   - Get user feedback

### Rollback Plan

If production deployment fails:

1. **Quick metrics check** (5 min)
   - Error rate > 5%? Roll back immediately
   - P99 latency > 1s? Roll back immediately
   - Memory leak detected? Roll back immediately

2. **Rollback procedure**
   - Revert to previous version
   - Monitor metrics return to baseline
   - Post-mortem on root cause

---

## Success Criteria (Production Sign-Off)

### Before Go-Live Approval

- [ ] **Test Coverage**: ≥70% across all modules
- [ ] **All 47 test cases**: Passing
- [ ] **Token accuracy**: ±5% vs API (100+ prompts)
- [ ] **Cost accuracy**: ±0.01% vs billing
- [ ] **P99 latency baseline**: Established (light, medium, heavy)
- [ ] **Error rate**: < 0.1% at 50 concurrent
- [ ] **Cache hit rate**: > 70%
- [ ] **Security tests**: 100% passing
- [ ] **Load tests**: All scenarios sustainable
- [ ] **Memory stability**: No leaks detected
- [ ] **Monitoring**: Dashboards and alerts ready
- [ ] **Documentation**: Runbooks and playbooks complete
- [ ] **Team training**: Engineering team trained

### Post-Launch Metrics (Week 4)

- [ ] **Uptime**: 99.9%+ (no unplanned downtime)
- [ ] **Error rate**: < 0.1% (sustained)
- [ ] **P99 latency**: < 100ms (baseline ± 20%)
- [ ] **Token savings**: ≥30% vs baseline (Opus)
- [ ] **User satisfaction**: > 4.5/5
- [ ] **Cost reduction**: Validated
- [ ] **Zero security incidents**: Maintained

---

## Questions Before Production Deployment

**Get answers from product/engineering leadership:**

1. **Token Accuracy**: Is ±5% acceptable, or need ±2%?
2. **Cost Tracking**: Need real-time billing integration with Anthropic?
3. **Scale**: What's the expected peak concurrent users? Geographic distribution?
4. **Compliance**: HIPAA/PCI-DSS/SOC2 requirements?
5. **SLAs**: Target uptime (99.5%/99.9%/99.95%)? Latency SLO (100ms/200ms/500ms)?
6. **Rollout**: Big bang deployment or canary with staged rollout?
7. **Monitoring**: Which monitoring platform (DataDog, Prometheus, CloudWatch)?
8. **Incidents**: PagerDuty integration for critical alerts?
9. **Testing Budget**: How much API testing cost is acceptable ($500? $1000? $5000)?
10. **Timeline**: Hard deadline for production, or flexible?

---

## References

- **Load Testing Methodology**: https://www.radview.com/blog/p99-latency-why-matters-how-measure-load-testing/
- **Resilient Microservices**: https://arxiv.org/html/2512.16959v1
- **Tail Latency Prediction**: https://arxiv.org/pdf/2508.01635
- **Chaos Engineering**: https://arxiv.org/pdf/2602.06223

---

**Next Step**: Start Week 1 with correctness validation (token estimation fixes).
