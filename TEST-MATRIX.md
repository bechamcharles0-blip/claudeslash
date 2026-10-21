# Claude Router - Comprehensive Test Matrix

**Version**: 2.0 (Enhanced Production-Ready Testing)  
**Date**: 2026-10-21  
**Target Coverage**: 70%+ across all critical paths  
**Timeline to Production**: 8-10 weeks with proper testing

---

## Executive Summary

Claude Router is a token optimization system that routes requests between Claude models. This test matrix defines comprehensive validation across three dimensions:

1. **Correctness** (20 test cases) - Token counting, model selection, cost calculation, escalation
2. **Performance** (15 test cases) - P99 latency, throughput, cache hit rates, resource efficiency
3. **Reliability** (12 test cases) - Error handling, graceful degradation, recovery, cascading failures

**Total: 47+ test cases** covering all critical paths to production.

---

## Part 1: CORRECTNESS TESTING (20 test cases)

### 1.1 Token Estimation Accuracy

**Criticality**: CRITICAL - All routing decisions depend on token accuracy

| Test ID | Test Case | Input | Expected Output | SLO | Status |
|---------|-----------|-------|-----------------|-----|--------|
| TC-001 | Simple task token estimation | "Hello world" (11 chars) | 3-4 tokens | ±5% vs API | TODO |
| TC-002 | Long text token estimation | 10,000 chars of text | ~2,500 tokens | ±5% vs API | TODO |
| TC-003 | Code snippet estimation | Python function (500 chars) | ~125 tokens | ±5% vs API | TODO |
| TC-004 | Structured data estimation | JSON object (1KB) | ~250 tokens | ±5% vs API | TODO |
| TC-005 | Multi-language estimation | Mixed EN/FR/ZH (1KB) | Varies | ±5% vs API | TODO |
| TC-006 | Token count consistency | Same input, 10 API calls | All match | 100% consistency | TODO |
| TC-007 | Empty string handling | "" (empty) | 0 tokens | No errors | TODO |
| TC-008 | Maximum token limit | Input exceeding 200k tokens | Error/truncate | Handled gracefully | TODO |

**Test File**: `src/core/tokenCounter.test.ts`  
**Implementation**: Unit tests + Integration tests with real API

---

### 1.2 Model Selection Logic

**Criticality**: CRITICAL - Wrong model = wasted tokens and poor quality

| Test ID | Test Case | Input Size | Expected Model | Effort | SLO | Status |
|---------|-----------|-----------|----------------|--------|-----|--------|
| TC-009 | Simple task selection | <10k tokens | Haiku | low | 100% correct | TODO |
| TC-010 | Medium complexity | 10-50k tokens | Sonnet | medium | 100% correct | TODO |
| TC-011 | Complex reasoning | 50-100k tokens | Opus | high | 100% correct | TODO |
| TC-012 | Maximum complexity | >100k tokens | Fable | high | 100% correct | TODO |
| TC-013 | Budget constraint enforcement | Simple task, budget=10k | Haiku or error | <10k tokens | No overages | TODO |
| TC-014 | Quality threshold escalation | Simple task, quality=8 | Escalate to Sonnet | ≥quality 8 | Escalates | TODO |
| TC-015 | Allowed models filtering | Simple task, allowed=['sonnet','opus'] | Sonnet | medium | Respects filter | TODO |
| TC-016 | Model capability matching | Vision task | Sonnet/Opus/Fable | N/A | Vision capable | TODO |

**Test File**: `src/core/modelRouter.test.ts`  
**Test Type**: Unit + Integration

---

### 1.3 Cost Calculation Accuracy

**Criticality**: CRITICAL - Incorrect cost = billing disputes and business intelligence failure

| Test ID | Test Case | Model | Input Tokens | Output Tokens | Expected Cost | SLO | Status |
|---------|-----------|-------|--------------|---------------|---------------|-----|--------|
| TC-017 | Haiku cost calculation | haiku | 1,000,000 | 1,000,000 | $0.80 + $4.00 = $4.80 | ±0.0001$ | TODO |
| TC-018 | Sonnet cost calculation | sonnet | 1,000,000 | 1,000,000 | $3.00 + $15.00 = $18.00 | ±0.0001$ | TODO |
| TC-019 | Opus cost calculation | opus | 1,000,000 | 1,000,000 | $15.00 + $45.00 = $60.00 | ±0.0001$ | TODO |
| TC-020 | Mixed workload cost | Various | 5M input, 2M output | ~$60.00 | Within 0.01% | TODO |

**Test File**: `src/core/modelRouter.test.ts`  
**Validation**: Compare calculated cost vs actual API billing

---

### 1.4 Escalation Logic

**Criticality**: HIGH - Escalation should only happen when necessary

| Test ID | Test Case | Trigger | Expected Action | SLO | Status |
|---------|-----------|---------|-----------------|-----|--------|
| TC-021 | Quality escalation | quality < threshold | Escalate to higher model | Works correctly | TODO |
| TC-022 | No unnecessary escalation | Simple task, quality OK | Stay on current model | No waste | TODO |
| TC-023 | Budget-constrained escalation | Complex task, small budget | Use cheapest model | Respects budget | TODO |

**Test File**: `src/core/complexityAnalyzer.test.ts`

---

## Part 2: PERFORMANCE TESTING (15 test cases)

### 2.1 Latency - Single Request (P99 < 100ms)

**Criticality**: CRITICAL - P99 is what users experience in real scenarios

| Test ID | Test Case | Load | Requests | Expected P99 | SLO | Status |
|---------|-----------|------|----------|--------------|-----|--------|
| TC-024 | P99 baseline latency | 1 concurrent | 1,000+ | < 100ms | Production SLO | TODO |
| TC-025 | P95 latency | 1 concurrent | 1,000+ | < 50ms | Sanity check | TODO |
| TC-026 | P50 latency | 1 concurrent | 1,000+ | < 20ms | Normal case | TODO |
| TC-027 | Max latency outliers | 1 concurrent | 1,000+ | < 1000ms | No infinite loops | TODO |

**Test File**: `src/performance.test.ts`  
**Methodology**: 1000+ requests minimum, sustained for 15+ minutes

---

### 2.2 Latency - Concurrent Requests (Fan-out P99 < 500ms)

**Criticality**: CRITICAL - Real users make parallel requests

| Test ID | Test Case | Concurrency | Requests | Expected P99 | SLO | Notes | Status |
|---------|-----------|-------------|----------|--------------|-----|-------|--------|
| TC-028 | 5 parallel requests | 5 concurrent | 50 iterations | < 500ms | Fan-out | p99(5) ≈ 5x p99(1) | TODO |
| TC-029 | 10 parallel requests | 10 concurrent | 50 iterations | < 1000ms | Fan-out | Each component needs <20ms | TODO |
| TC-030 | 50 parallel requests | 50 concurrent | 50 iterations | < 5000ms | Stress | System breaking point | TODO |

**Test File**: `src/performance.test.ts`  
**Research**: https://www.radview.com/blog/p99-latency-why-matters-how-measure-load-testing/

---

### 2.3 Throughput & Scaling

**Criticality**: HIGH - Must scale with load

| Test ID | Test Case | Scenario | Expected | SLO | Status |
|---------|-----------|----------|----------|-----|--------|
| TC-031 | Light load throughput | 10 req/s, 1 concurrent | 10 req/s | Baseline | TODO |
| TC-032 | Medium load throughput | 100 req/s, 50 concurrent | 95+ req/s | 95% efficiency | TODO |
| TC-033 | Heavy load throughput | 500 req/s, 100 concurrent | 450+ req/s | 90% efficiency | TODO |
| TC-034 | Linear scaling | 1→10 pods | 10x throughput | ±20% variance | TODO |

**Test File**: `src/loadTestEnhanced.ts`  
**Methodology**: 15-20+ minutes sustained load to catch GC pauses

---

### 2.4 Cache Effectiveness

**Criticality**: HIGH - Cache saves 10-15% of tokens

| Test ID | Test Case | Requests | Hit Scenario | Expected Hit Rate | SLO | Status |
|---------|-----------|----------|--------------|-------------------|-----|--------|
| TC-035 | Cache hit rate | 100 identical requests | Same prompt repeated | 70%+ | Production SLO | TODO |
| TC-036 | Cache latency | Cache hit execution | Served from cache | < 10ms P99 | 100x faster | TODO |
| TC-037 | Cache invalidation | TTL expiration | Expired entry | Refreshed from API | Works | TODO |
| TC-038 | Cache under load | 5000 requests, varied | Mix of hits/misses | 50-70% hits | Production | TODO |

**Test File**: `src/core/modelRouter.test.ts`

---

### 2.5 Resource Efficiency

**Criticality**: MEDIUM - Memory leaks kill production

| Test ID | Test Case | Duration | Load | Expected Memory | SLO | Status |
|---------|-----------|----------|------|-----------------|-----|--------|
| TC-039 | Memory stability | 30 minutes | 100 req/s | < 100 MB growth | No leaks | TODO |
| TC-040 | CPU efficiency | 30 minutes | 100 req/s | Linear scaling | No spikes | TODO |
| TC-041 | Network saturation | 1000 req/s | Full load | No drops | Sustainable | TODO |

**Test File**: `src/performance.test.ts`

---

## Part 3: RELIABILITY TESTING (12 test cases)

### 3.1 Error Handling & Graceful Degradation

**Criticality**: CRITICAL - Production must never crash

| Test ID | Test Case | Failure Mode | Expected Behavior | SLO | Status |
|---------|-----------|--------------|-------------------|-----|--------|
| TC-042 | Cache failure | Redis down | Fallback to DB/API | Works, slower | TODO |
| TC-043 | API rate limit | Hit 429 limit | Return error, no crash | Clean error | TODO |
| TC-044 | API timeout | 30s no response | Timeout gracefully | Error, not hang | TODO |
| TC-045 | Database unreachable | DB connection fails | Fallback to in-memory | Degraded mode | TODO |
| TC-046 | Invalid API key | Wrong credentials | Return 401 immediately | No retries | TODO |
| TC-047 | Malformed input | Invalid JSON | Reject with 400 | No processing | TODO |

**Test File**: `src/api/rest.test.ts`  
**Methodology**: Inject failures, verify graceful degradation

---

### 3.2 Rate Limiting & Security

**Criticality**: CRITICAL - Prevent abuse and DoS

| Test ID | Test Case | Limit | Load | Expected Result | SLO | Status |
|---------|-----------|-------|------|-----------------|-----|--------|
| TC-048 | Hourly rate limit | 10k req/hour | 11k requests | Return 429 on excess | Enforced | TODO |
| TC-049 | Per-minute rate limit | 200 req/min | 250 requests | Return 429 on excess | Enforced | TODO |
| TC-050 | Per-day rate limit | 1M req/day | 1.1M requests | Return 429 on excess | Enforced | TODO |
| TC-051 | Rate limit across instances | 2 instances | Distributed load | Shared limits | Distributed | TODO |

**Test File**: `src/core/security.test.ts`

---

### 3.3 Recovery & Resilience

**Criticality**: HIGH - System must recover quickly from failures

| Test ID | Test Case | Failure | Recovery Time | SLO | Status |
|---------|-----------|---------|----------------|-----|--------|
| TC-052 | API recovery | API down 1 min | Service back online | < 5 min | Fast recovery | TODO |
| TC-053 | Pod restart | Single pod crashes | Auto-recovered | < 30 sec | Kubernetes | TODO |
| TC-054 | Connection pool recovery | Connection exhaustion | Pool replenished | < 1 min | Auto-recovery | TODO |

**Test File**: Integration tests + Chaos testing

---

### 3.4 Data Consistency

**Criticality**: CRITICAL - Stats must be accurate across restarts

| Test ID | Test Case | Scenario | Expected | SLO | Status |
|---------|-----------|----------|----------|-----|--------|
| TC-055 | Stats persistence | Server restart | Stats preserved | Zero loss | TODO |
| TC-056 | Distributed stats | 5 instances | Aggregated correctly | Accurate | TODO |
| TC-057 | Cache consistency | Cache + DB | Same results | Always consistent | TODO |

**Test File**: Integration tests

---

## Part 4: LOAD TEST SCENARIOS

### Scenario 1: Light Load (Baseline)
- **Config**: 100 req/s, 1 concurrent, 1000 requests
- **Duration**: 10 seconds
- **Goal**: Establish baseline performance
- **Metrics**: P50, P95, P99 latency; error rate; throughput
- **SLOs**:
  - P99 latency: < 100ms
  - Error rate: < 0.1%
  - Throughput: 100+ req/sec

### Scenario 2: Medium Load
- **Config**: 500 req/s, 50 concurrent, 5000 requests
- **Duration**: 10 seconds sustained
- **Goal**: Validate cache behavior under sustained load
- **Metrics**: P99 latency, cache hit rate, throughput
- **SLOs**:
  - P99 latency: < 100ms
  - Cache hit rate: > 70%
  - Error rate: < 0.1%

### Scenario 3: Heavy Load
- **Config**: 1000+ req/s, 100+ concurrent, 10000 requests
- **Duration**: 20 minutes sustained (catch GC spikes)
- **Goal**: Identify breaking point and GC behavior
- **Metrics**: P99 latency, error rate, memory stability
- **SLOs**:
  - P99 latency: < 500ms (degradation acceptable)
  - Error rate: < 1% (some degradation OK)
  - Memory growth: < 100MB

### Scenario 4: Spike Load (5-10x Normal)
- **Config**: 5000+ req/s, 500+ concurrent
- **Duration**: 5 minutes sustained
- **Goal**: Validate graceful degradation under spike
- **Expected**: Requests queue, latency increases, no crashes
- **SLOs**:
  - Error rate: < 5%
  - No cascading failures
  - Recovery within 2 minutes of load reduction

---

## Part 5: CRITICAL VALIDATION CHECKLIST

### Before Production Deployment ✓

- [ ] **Token Estimation** (TC-001 to TC-008)
  - [ ] Accuracy validated within ±5% of real API
  - [ ] All model types tested
  - [ ] Edge cases handled (empty, huge, mixed language)
  - [ ] Run integration tests with real API

- [ ] **Model Selection** (TC-009 to TC-016)
  - [ ] Simple tasks use Haiku
  - [ ] Complex tasks escalate correctly
  - [ ] Budget constraints enforced
  - [ ] Quality thresholds respected
  - [ ] Allowed models filter works

- [ ] **Cost Calculation** (TC-017 to TC-020)
  - [ ] Matches real API billing exactly
  - [ ] All models tested
  - [ ] Rounding rules verified
  - [ ] No off-by-one errors

- [ ] **Security** (TC-042 to TC-051)
  - [ ] All injection patterns blocked
  - [ ] Rate limits working (hourly, minute, day)
  - [ ] Output sanitization active
  - [ ] CORS restricted to allowed origins
  - [ ] Authentication required

- [ ] **Performance** (TC-024 to TC-041)
  - [ ] P99 latency < 100-500ms depending on scenario
  - [ ] Throughput > 100 req/sec
  - [ ] Error rate < 0.1% at 50 concurrent
  - [ ] Cache hit rate > 70%
  - [ ] Memory stable (no leaks)

- [ ] **Reliability** (TC-042 to TC-057)
  - [ ] Graceful degradation on API errors
  - [ ] Rate limits enforced
  - [ ] Timeouts configured (not indefinite)
  - [ ] Stats persist across restarts
  - [ ] Works with multiple instances

---

## Part 6: TEST EXECUTION COMMANDS

```bash
# Run all unit tests
npm test

# Run with coverage report
npm test -- --coverage

# Run specific test category
npm test -- --grep "Correctness|Performance|Reliability"

# Run integration tests (requires API key)
ANTHROPIC_API_KEY="sk-..." npm test -- src/integration.test.ts

# Run performance tests
npm test -- src/performance.test.ts

# Run enhanced load tests
npm run load-test baseline          # 10 req/s
npm run load-test light             # 100 req/s
npm run load-test medium            # 500 req/s
npm run load-test heavy             # 1000+ req/s

# Watch mode for development
npm test -- --watch

# Visual test UI
npm run test:ui
```

---

## Part 7: BASELINE MEASUREMENTS (To Be Filled)

These measurements establish the SLOs for production deployment.

### Light Load Baseline (100 req/s, 1 concurrent)
```json
{
  "timestamp": "2026-10-21T00:00:00Z",
  "scenario": "light",
  "latencyMetrics": {
    "p50": "TBD",
    "p95": "TBD",
    "p99": "TBD (SLO: < 100ms)",
    "p99_9": "TBD"
  },
  "throughput": "TBD req/sec",
  "errorRate": "TBD %",
  "cacheHitRate": "TBD %"
}
```

### Medium Load Baseline (500 req/s, 50 concurrent)
```json
{
  "timestamp": "2026-10-21T00:00:00Z",
  "scenario": "medium",
  "latencyMetrics": {
    "p50": "TBD",
    "p95": "TBD",
    "p99": "TBD (SLO: < 100ms)",
    "p99_9": "TBD"
  },
  "throughput": "TBD req/sec",
  "errorRate": "TBD %",
  "cacheHitRate": "TBD % (SLO: > 70%)"
}
```

### Heavy Load Baseline (1000+ req/s, 100+ concurrent)
```json
{
  "timestamp": "2026-10-21T00:00:00Z",
  "scenario": "heavy",
  "latencyMetrics": {
    "p50": "TBD",
    "p95": "TBD",
    "p99": "TBD (SLO: < 500ms, degradation acceptable)",
    "p99_9": "TBD"
  },
  "throughput": "TBD req/sec",
  "errorRate": "TBD % (SLO: < 1%)",
  "memoryGrowth": "TBD MB"
}
```

---

## Part 8: SUCCESS CRITERIA

| Category | Metric | Target | Current | Status |
|----------|--------|--------|---------|--------|
| **Coverage** | Test coverage | ≥70% | TBD | TODO |
| **Correctness** | Token accuracy | ±5% vs API | TBD | TODO |
| **Correctness** | Cost accuracy | ±0.01% | TBD | TODO |
| **Correctness** | Model selection accuracy | 100% | TBD | TODO |
| **Performance** | P99 latency (single) | < 100ms | TBD | TODO |
| **Performance** | P99 latency (5 concurrent) | < 500ms | TBD | TODO |
| **Performance** | Cache hit rate | > 70% | TBD | TODO |
| **Performance** | Error rate at 50 concurrent | < 0.1% | TBD | TODO |
| **Reliability** | Stats persistence | 100% | TBD | TODO |
| **Reliability** | Distributed system support | Yes | TBD | TODO |
| **Security** | Injection attack prevention | 100% | TBD | TODO |
| **Security** | Rate limit enforcement | 100% | TBD | TODO |

---

## Part 9: NEXT STEPS

### Week 1-2: Implement Tests
- [ ] Implement TC-001 to TC-008 (Token estimation)
- [ ] Implement TC-009 to TC-016 (Model selection)
- [ ] Implement TC-017 to TC-020 (Cost calculation)
- [ ] Run integration tests, identify gaps

### Week 3-4: Performance Baseline
- [ ] Run light load scenario 10 times, establish baseline
- [ ] Run medium load scenario, validate cache
- [ ] Fill in baseline measurements section
- [ ] Compare against SLOs

### Week 5-6: Heavy Load Testing
- [ ] Run heavy load scenario (20 minutes sustained)
- [ ] Identify bottlenecks
- [ ] Fix memory leaks if found
- [ ] Validate GC behavior

### Week 7-8: Production Readiness
- [ ] Complete reliability testing (TC-042 to TC-057)
- [ ] Verify all 47 test cases passing
- [ ] Code review of critical paths
- [ ] Deploy to staging environment
- [ ] Run full test suite in staging
- [ ] Ready for production deployment

---

## References

1. P99 Latency Importance: https://www.radview.com/blog/p99-latency-why-matters-how-measure-load-testing/
2. Resilient Microservices: https://arxiv.org/html/2512.16959v1
3. Tail Latency Prediction: https://arxiv.org/pdf/2508.01635
4. DeLag: Latency Degradation Detection: https://arxiv.org/pdf/2110.11155
5. Chaos Testing: https://arxiv.org/pdf/2602.06223

---

## Questions & Clarifications Needed

1. **Token Accuracy Target**: Is ±5% acceptable, or do you need ±2%?
2. **Cost Tracking**: Need real-time billing integration with Anthropic?
3. **Distributed Testing**: How many pods/instances will run in production?
4. **Compliance**: Any HIPAA/PCI-DSS requirements?
5. **SLAs**: What's the target uptime? 99.5%? 99.9%? 99.95%?
6. **Rollout Strategy**: Canary deployment with 5% traffic first?
