# Claude Router - Comprehensive Testing Guide

**Version**: 2.0 (Professor-Level QA)  
**Last Updated**: 2026-10-21  
**Status**: Ready for Implementation  
**Test Infrastructure**: Vitest + Enhanced Load Testing

---

## Table of Contents

1. [Quick Start (5 minutes)](#quick-start-5-minutes)
2. [Complete Test Inventory](#complete-test-inventory)
3. [Running the Full Test Suite](#running-the-full-test-suite)
4. [Load Testing Deep Dive](#load-testing-deep-dive)
5. [Regression Testing](#regression-testing)
6. [Failure Scenario Testing](#failure-scenario-testing)
7. [CI/CD Integration](#cicd-integration)

---

## Quick Start (5 minutes)

### Installation

```bash
# Install dependencies (if not already done)
npm install

# Verify Node version
node --version  # Should be ≥18.0.0
```

### Run All Tests (Fast, Mocked)

```bash
npm test

# Expected output:
# ✓ Unit Tests (33 tests)
# ✓ Security Tests (16 tests)
# ✓ REST API Tests (20 tests)
# ✓ GraphQL Tests (12 tests)
# 
# Total: 81 tests, ~2 minutes
```

### Check Test Coverage

```bash
npm test -- --coverage

# Expected output shows coverage by file
# Target: ≥70% overall
```

---

## Complete Test Inventory

### 1. Unit Tests (Fast, Mocked)

**Files**: `src/**/*.test.ts`  
**Duration**: ~2 minutes  
**Cost**: $0 (no API calls)  
**Coverage**: 70%+ target

#### Core Logic Tests

```bash
# Test token estimation
npm test -- --grep "Token Estimation"
# 8 tests covering:
# - Simple text (11 chars)
# - Long text (10k chars)
# - Code snippets (Python, JavaScript)
# - Structured data (JSON)
# - Mixed languages (EN/FR/ZH)
# - Empty strings
# - Maximum limits
# - Consistency (10 API calls same result)

# Test model selection
npm test -- --grep "Model Selection"
# 8 tests covering:
# - Simple tasks → Haiku
# - Medium complexity → Sonnet
# - Complex reasoning → Opus
# - Maximum complexity → Fable
# - Budget constraints
# - Quality thresholds
# - Allowed models filtering
# - Capability matching

# Test cost calculation
npm test -- --grep "Cost Calculation"
# 4 tests covering:
# - Haiku pricing
# - Sonnet pricing
# - Opus pricing
# - Mixed workload

# Test routing
npm test -- --grep "Routing"
# 6 tests covering:
# - Full request/response flow
# - Token calculation accuracy
# - Cost calculation accuracy
# - Statistics tracking
# - Execution time measurement
# - Savings calculation

# Test statistics
npm test -- --grep "Statistics"
# 3 tests covering:
# - Stats object structure
# - Initial values
# - Hardcoded metrics (known issues)

# Test model configuration
npm test -- --grep "Model Configuration"
# 3 tests covering:
# - All 4 models present
# - Cost hierarchy (Haiku < Sonnet < Opus < Fable)
# - Quality hierarchy
# - API IDs validation
```

#### Security Tests

```bash
npm test -- src/core/security.test.ts
# 16 tests covering:
# - Input validation (SQL injection, XSS, etc)
# - Rate limiting (hourly, minute, day)
# - Anomaly detection
# - Output sanitization
```

#### API Tests

```bash
# REST API tests
npm test -- src/api/rest.test.ts
# 20 tests covering:
# - POST /api/route
# - GET /api/models
# - POST /api/token-estimate
# - GET /api/stats
# - Error handling (400, 429, 403, 500)

# GraphQL API tests
npm test -- src/api/graphql.test.ts
# 12 tests covering:
# - Query: models, stats, estimateTokens
# - Mutation: route
# - Type validation
# - Error handling
```

---

### 2. Integration Tests (Medium, Real API)

**Files**: `src/integration.test.ts`  
**Duration**: ~30 minutes  
**Cost**: ~$5  
**Requires**: `ANTHROPIC_API_KEY` environment variable

```bash
# Set API key
export ANTHROPIC_API_KEY="sk-..."

# Run integration tests
npm test -- src/integration.test.ts

# Tests 8 real scenarios:
# - Real API integration ✓
# - Token count accuracy ✓
# - Cost calculation accuracy ✓
# - Model selection correctness ✓
# - Latency measurement ✓
# - Multi-request scenarios ✓
# - Stats accumulation ✓
# - Error scenarios ✓
```

---

### 3. Performance Tests (Sustained Load)

**Files**: `src/performance.test.ts`  
**Duration**: ~45 minutes  
**Cost**: ~$10  
**Requires**: `ANTHROPIC_API_KEY`

```bash
export ANTHROPIC_API_KEY="sk-..."

# Run performance tests
npm test -- src/performance.test.ts

# Tests 6 critical metrics:
# 1. Single request P99 latency (< 100ms)
# 2. Concurrent P99 latency - 5 parallel (< 500ms)
# 3. Cache hit rate (> 70%)
# 4. Error rate at 50 concurrent (< 0.1%)
# 5. Throughput scaling (linear)
# 6. Memory stability (no leaks)

# Each test runs 50-100 iterations, minimum 1000 requests total
```

---

### 4. Load Tests (Production-Grade)

**Files**: `src/loadTestEnhanced.ts`  
**Duration**: Scenario-dependent (5 min to 30 min)  
**Cost**: $10-50 depending on scenario  
**Requires**: `ANTHROPIC_API_KEY`

```bash
export ANTHROPIC_API_KEY="sk-..."

# Baseline test (quick validation)
npm run load-test baseline
# Duration: 5 minutes
# Requests: 1000 at 1 concurrent
# Cost: ~$5
# Purpose: Verify baseline performance

# Light load (100 req/s, 1 concurrent)
npm run load-test light
# Duration: 10 seconds sustained
# Requests: 1000
# Cost: ~$5
# Purpose: Normal operation baseline

# Medium load (500 req/s, 50 concurrent)
npm run load-test medium
# Duration: 10 seconds sustained
# Requests: 5000
# Cost: ~$10
# Purpose: Validate cache at sustained load

# Heavy load (1000+ req/s, 100+ concurrent)
npm run load-test heavy
# Duration: 20 MINUTES sustained
# Requests: 10000
# Cost: ~$25
# Purpose: Identify breaking point, catch GC spikes
# **CRITICAL**: 20 minute duration catches GC pauses
```

---

### 5. Regression Tests (Pre-Deployment)

**Files**: `src/regression.test.ts`  
**Duration**: ~5 minutes  
**Cost**: ~$5  
**Requires**: `ANTHROPIC_API_KEY`  
**Run**: Before every production deployment

```bash
export ANTHROPIC_API_KEY="sk-..."

npm test -- src/regression.test.ts

# Validates 7 critical paths:
# 1. Token estimation accuracy (±5% vs API)
# 2. Model selection correctness
# 3. Cost calculation accuracy (±0.01%)
# 4. Performance P99 latency (< 200ms regression threshold)
# 5. Error handling (graceful degradation)
# 6. Cache hit rate (> 50%)
# 7. Statistics tracking
# 8. Model configuration

# STOP if any test fails - do NOT deploy
```

---

## Running the Full Test Suite

### Local Development (What to Run Daily)

```bash
# Fast validation (2 minutes)
npm test

# With coverage (3 minutes)
npm test -- --coverage

# Watch mode (continuously on file change)
npm test -- --watch
```

### Integration Testing (What to Run Before PR)

```bash
# Set test API key
export ANTHROPIC_API_KEY="sk-..."

# Run integration tests
npm test -- src/integration.test.ts

# Run performance tests (quick version)
npm test -- src/performance.test.ts

# All tests combined (~45 minutes, ~$15)
npm test && npm test -- src/integration.test.ts && npm test -- src/performance.test.ts
```

### Production Readiness (What to Run Before Deploy)

```bash
# Set production API key
export ANTHROPIC_API_KEY="sk-..."

# 1. All unit tests must pass
npm test

# 2. All integration tests must pass
npm test -- src/integration.test.ts

# 3. Performance tests must pass
npm test -- src/performance.test.ts

# 4. Regression tests must pass
npm test -- src/regression.test.ts

# 5. Run baseline load test
npm run load-test baseline

# 6. Run heavy load test (20 minutes)
npm run load-test heavy

# Total time: ~1.5 hours
# Total cost: ~$30-50
```

---

## Load Testing Deep Dive

### Understanding Load Testing Results

Load test output shows critical metrics for production SLOs:

```
╔════════════════════════════════════════════════════════════╗
║              Load Test Results                             ║
║  Scenario: Light Load (100 req/s)                         ║
╚════════════════════════════════════════════════════════════╝

LATENCY (milliseconds) - P99 is what users experience:
  Min:               5ms
  P50:               15ms (50% of requests)
  P95:               32ms (95% of requests)
  P99:               48ms (99% of requests) ← SLO: < 100ms
  P99.9:             78ms (99.9% of requests)
  Max:               145ms
  Average:           16ms (IGNORE - not representative)

THROUGHPUT:
  Requests/sec:      99.2 (SLO: 100 req/s)
  
TOKEN & COST:
  Input Tokens:      125,000
  Output Tokens:     45,000
  Total Cost:        $0.34

ERRORS:
  Total Errors:      0
  Error Rate:        0.0% (SLO: < 0.1%)

CACHE:
  Hit Rate:          70.0% (SLO: > 70%)
  
MEMORY:
  Start:             45.2 MB
  End:               48.1 MB
  Growth:            2.9 MB (SLO: < 100 MB)
```

### Key Metrics to Watch

| Metric | What It Means | Good | Bad |
|--------|--------------|------|-----|
| **P99 Latency** | 99% of requests finish in X ms | < 100ms | > 500ms |
| **P95 Latency** | 95% of requests finish in X ms | < 50ms | > 200ms |
| **P50 Latency** | Median (50% fastest) finish in X ms | < 20ms | > 100ms |
| **Error Rate** | % of failed requests | < 0.1% | > 1% |
| **Throughput** | Requests per second | 100+ | < 50 |
| **Cache Hit Rate** | % of cached responses | > 70% | < 50% |
| **Memory Growth** | Heap size increase during test | < 100 MB | > 500 MB |

### Why P99 Matters More Than Average

```
Example: 100 requests with latencies
[10, 10, 10, 10, 10, 10, 10, 10, 10, 10,  ← 90% of requests
 11, 11, 11, 11, 11, 11, 11, 11, 11, 11,  ← next 9%
 1000]                                      ← 1 outlier

Average = (90×10 + 10×11 + 1000) / 100 = 19.9 ms
P99 = 11 ms

But the user experience is: "99% fast (11ms), but 1% is SLOW (1000ms)"

This is why P99 is critical for production SLOs.
```

---

## Regression Testing

### When to Run Regression Tests

1. **Before pushing to main branch**
   ```bash
   npm test -- src/regression.test.ts
   ```

2. **Before creating PR**
   ```bash
   npm test -- src/regression.test.ts
   ```

3. **Before deploying to production**
   ```bash
   npm test -- src/regression.test.ts
   ```

4. **After any changes to critical paths**
   - Token estimation
   - Model selection logic
   - Cost calculation
   - Rate limiting

### Regression Test Thresholds

If any of these thresholds are exceeded, DO NOT DEPLOY:

| Test | Threshold | Failure Action |
|------|-----------|----------------|
| Token accuracy | ±5% error | FAIL - fix tokenization |
| Model selection | 100% correct | FAIL - fix logic |
| Cost accuracy | ±0.01% error | FAIL - fix billing |
| P99 latency | < 200ms | FAIL - optimize code |
| Error rate | < 0.1% | FAIL - fix error handling |
| Cache hit rate | > 50% | FAIL - investigate cache |
| Stats tracking | Increments | FAIL - fix tracking |

---

## Failure Scenario Testing

### Chaos Testing - Inject Failures

Test how system handles real-world failures:

```bash
# Create chaos-test.ts
npm test -- --grep "Chaos\|Failure"

# Tests:
# 1. Cache failure (Redis down)
#    → Expected: Fallback to API, slower but works
# 
# 2. API timeout (30s no response)
#    → Expected: Timeout error, no infinite wait
#
# 3. Rate limit hit (429 response)
#    → Expected: Return 429 to client, no retry loop
#
# 4. Database failure (connection lost)
#    → Expected: Degraded mode, stats tracked in-memory
#
# 5. Network flakiness (packet loss)
#    → Expected: Retry and succeed
#
# 6. Low memory (heap pressure)
#    → Expected: No crashes, graceful degradation
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20.x'
      
      - run: npm install
      
      - name: Unit Tests
        run: npm test
        timeout-minutes: 5
      
      - name: Integration Tests
        run: npm test -- src/integration.test.ts
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        timeout-minutes: 45
      
      - name: Regression Tests
        run: npm test -- src/regression.test.ts
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        timeout-minutes: 10
        if: github.event_name == 'pull_request'
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          fail_ci_if_error: true
```

### Pre-Commit Hook

```bash
# .husky/pre-commit
npm test --
```

---

## Testing Checklist for Developers

### Before Committing Code

- [ ] Run `npm test` - all unit tests pass
- [ ] Run `npm test -- --coverage` - coverage not decreased
- [ ] No `console.log` statements left
- [ ] No hardcoded values (use env vars)

### Before Creating Pull Request

- [ ] All unit tests pass
- [ ] Integration tests pass (if touching core logic)
- [ ] Performance tests pass (if changing hot paths)
- [ ] Coverage >= 70% for new code
- [ ] Code review by at least 1 person

### Before Deploying to Production

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Regression tests pass
- [ ] Load test baseline passes (P99 < 100ms)
- [ ] Load test heavy passes (sustained 20 min)
- [ ] Code review approved
- [ ] Product sign-off obtained

---

## Troubleshooting Test Failures

### "ANTHROPIC_API_KEY not set"

```bash
# Set environment variable
export ANTHROPIC_API_KEY="sk-..."

# Or inline
ANTHROPIC_API_KEY="sk-..." npm test -- src/integration.test.ts
```

### "Test timeout exceeded"

Increase timeout for slow tests:

```typescript
it('slow test', async () => {
  // test code
}).timeout(120000) // 2 minutes
```

### "P99 latency too high"

1. Check if other processes running (stop them)
2. Profile with `--inspect` flag
3. Look for memory leaks (`npm test -- src/performance.test.ts`)
4. Check API rate limits

### "Token accuracy ±10% (exceeds SLO)"

1. Verify tokenization implementation
2. Compare against real API responses
3. Check for edge cases (special chars, mixed language)

### "Cache hit rate < 50%"

1. Verify cache is enabled
2. Check TTL settings
3. Monitor cache size
4. Verify key generation is consistent

---

## Test Metrics Dashboard

Track test health over time:

```json
{
  "date": "2026-10-21",
  "unitTests": {
    "total": 81,
    "passed": 81,
    "failed": 0,
    "coverage": 72
  },
  "integrationTests": {
    "total": 8,
    "passed": 8,
    "failed": 0,
    "apiCost": 15.23
  },
  "performanceTests": {
    "p99Latency": 48,
    "p99Target": 100,
    "cacheHitRate": 71,
    "cacheTarget": 70,
    "errorRate": 0.05,
    "errorTarget": 0.1
  },
  "loadTestBaseline": {
    "p99": 48,
    "throughput": 99.2,
    "memoryGrowth": 2.9
  },
  "regressionTests": {
    "passed": true,
    "tokenAccuracy": 4.2,
    "costAccuracy": 0.001
  }
}
```

---

## Next Steps

1. **Today**: Run `npm test` to verify unit tests
2. **This week**: Run integration tests with real API key
3. **Next week**: Establish baseline measurements (light/medium/heavy load)
4. **Week 3**: Run regression tests before first production deployment
5. **Ongoing**: Run regression tests before every deployment

---

## Questions?

Refer to:
- **TEST-MATRIX.md** - Detailed test case specifications
- **PRODUCTION-READINESS-GUIDE.md** - Full production checklist
- **src/performance.test.ts** - Performance test implementation
- **src/loadTestEnhanced.ts** - Load testing framework

---

**Last Section: Success!**

When all tests pass:
- ✅ Unit tests: 81/81 passing
- ✅ Integration tests: 8/8 passing  
- ✅ Performance tests: 6/6 passing
- ✅ Regression tests: 8/8 passing
- ✅ Load tests: Baseline, Light, Medium, Heavy all sustainable
- ✅ Coverage: ≥70%
- ✅ Production ready!
