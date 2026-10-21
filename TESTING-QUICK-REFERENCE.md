# Claude Router - Testing Quick Reference Card

**Print this and keep by your desk during production readiness phase**

---

## Daily Development (5 min)

```bash
npm test --watch                 # Watch mode, runs on file change
npm test                         # Run all unit tests
npm test -- --coverage          # Show coverage report
```

**Expected**: ~2 minutes, all tests passing, coverage ≥70%

---

## Before Pushing Code (10 min)

```bash
npm test                        # Unit tests must pass
npm test -- --coverage         # Coverage not decreased
```

**Gate**: No push without passing unit tests

---

## Before Creating PR (30 min)

```bash
export ANTHROPIC_API_KEY="sk-..."
npm test                             # Unit tests
npm test -- src/integration.test.ts # Integration (requires API key)
```

**Gate**: No PR without integration tests passing

---

## Before Deploying to Production (2+ hours)

```bash
export ANTHROPIC_API_KEY="sk-..."

# 1. All unit tests (5 min)
npm test

# 2. All integration tests (30 min)
npm test -- src/integration.test.ts

# 3. Performance tests (45 min)
npm test -- src/performance.test.ts

# 4. Regression tests (5 min)
npm test -- src/regression.test.ts

# 5. Load test heavy (20 min) ← CRITICAL
npm run load-test heavy

# Total: ~1.5 hours
# DO NOT DEPLOY if any test fails
```

---

## Load Testing (Choose One)

```bash
npm run load-test baseline      # 5 min - quick validation
npm run load-test light         # 10 min - normal operation
npm run load-test medium        # 15 min - sustained load
npm run load-test heavy         # 20 min - breaking point
```

**Output**: `load-test-{scenario}-{timestamp}.json`

**Critical Metrics**: P99 latency, error rate, cache hit rate

---

## Regression Testing (Pre-Deployment Only)

```bash
export ANTHROPIC_API_KEY="sk-..."
npm test -- src/regression.test.ts

# FAIL = DO NOT DEPLOY
# 8 critical paths validated:
# ✓ Token accuracy (±5%)
# ✓ Model selection (100%)
# ✓ Cost calculation (±0.01%)
# ✓ Performance P99 (< 200ms)
# ✓ Error handling
# ✓ Cache hit rate (> 50%)
# ✓ Statistics tracking
# ✓ Model configuration
```

---

## What Each Test File Does

### Unit Tests (src/**/*.test.ts)
**Time**: 2 min | **Cost**: $0 | **Frequency**: Every commit
```
✓ modelRouter.test.ts     - 17 tests (token, model, cost, routing)
✓ security.test.ts        - 16 tests (validation, rate limits)
✓ rest.test.ts           - 20 tests (API endpoints)
✓ graphql.test.ts        - 12 tests (GraphQL schema)
```

### Integration Tests (src/integration.test.ts)
**Time**: 30 min | **Cost**: ~$5 | **Frequency**: Before PR, pre-deploy
```
✓ Real API integration
✓ Token count accuracy
✓ Cost calculation accuracy
✓ Model selection correctness
✓ Latency measurement
✓ Multi-request scenarios
✓ Stats accumulation
✓ Error scenarios
```

### Performance Tests (src/performance.test.ts)
**Time**: 45 min | **Cost**: ~$10 | **Frequency**: Before deploy
```
✓ Single request P99 latency (< 100ms)
✓ Concurrent latency - 5 parallel (< 500ms)
✓ Cache hit rate (> 70%)
✓ Error rate at 50 concurrent (< 0.1%)
✓ Throughput scaling (linear)
✓ Memory stability (no leaks)
```

### Load Tests (src/loadTestEnhanced.ts)
**Frequency**: Establish baseline, then before major deploy
```
baseline  → 5 min   → Verify working
light     → 10 min  → Normal operation
medium    → 15 min  → Sustained load
heavy     → 20 min  → Breaking point ← CRITICAL for GC
```

### Regression Tests (src/regression.test.ts)
**Time**: 5 min | **Cost**: ~$5 | **Frequency**: Before every deploy
```
✓ Token accuracy (±5%)
✓ Model selection (100%)
✓ Cost accuracy (±0.01%)
✓ P99 latency (< 200ms threshold)
✓ Error handling
✓ Cache hit rate (> 50%)
✓ Statistics tracking
✓ Model configuration
```

---

## Critical Success Metrics

### Performance SLOs
| Metric | Target | Test Case |
|--------|--------|-----------|
| **P99 Latency** | < 100ms | performance.test.ts |
| **Error Rate** | < 0.1% | performance.test.ts |
| **Cache Hit Rate** | > 70% | performance.test.ts |
| **Throughput** | 100+ req/sec | loadTestEnhanced.ts |

### Correctness SLOs
| Metric | Target | Test Case |
|--------|--------|-----------|
| **Token Accuracy** | ±5% vs API | regression.test.ts |
| **Cost Accuracy** | ±0.01% | regression.test.ts |
| **Model Selection** | 100% | regression.test.ts |

### Reliability SLOs
| Metric | Target | Test Case |
|--------|--------|-----------|
| **Stats Persistence** | 100% | integration.test.ts |
| **Distributed System** | Works | integration.test.ts |
| **Error Handling** | Graceful | integration.test.ts |

---

## Troubleshooting Matrix

| Problem | Command | Solution |
|---------|---------|----------|
| Tests fail with "API key not set" | `export ANTHROPIC_API_KEY="sk-..."` | Set environment variable |
| Specific test too slow | `npm test -- --grep "test name"` | Run just that test |
| Want to see all output | `npm test -- --reporter=verbose` | Verbose reporter |
| Check coverage gaps | `npm test -- --coverage` | See which lines uncovered |
| Load test hangs | Ctrl+C, check load-test*.json | Results saved even if interrupted |
| P99 latency too high | See src/performance.test.ts line X | Profile with Node inspector |
| Cache hit rate < 50% | Verify Redis running | Check cache health |
| Memory growth > 100MB | Check src/performance.test.ts | Potential memory leak |

---

## Production Deployment Checklist

### Pre-Deployment (2 hours)

- [ ] Set API key: `export ANTHROPIC_API_KEY="sk-..."`
- [ ] Unit tests pass: `npm test` (5 min)
- [ ] Integration pass: `npm test -- src/integration.test.ts` (30 min)
- [ ] Performance pass: `npm test -- src/performance.test.ts` (45 min)
- [ ] Regression pass: `npm test -- src/regression.test.ts` (5 min)
- [ ] Heavy load pass: `npm run load-test heavy` (20 min)
- [ ] No code review issues
- [ ] All metrics within SLOs

### Deployment (30 min)

- [ ] Deploy to staging 5% (5 min)
- [ ] Monitor metrics (5 min)
- [ ] Deploy to 20% (5 min)
- [ ] Monitor metrics (5 min)
- [ ] Deploy to 50% (5 min)
- [ ] Deploy to 100% (5 min)

### Post-Deployment (24 hours)

- [ ] Monitor P99 latency < 100ms
- [ ] Monitor error rate < 0.1%
- [ ] Monitor cache hit rate > 70%
- [ ] Check for memory leaks
- [ ] Verify stats accuracy
- [ ] Get user feedback

---

## Environment Variables

```bash
# Required for integration/performance/regression tests
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional for testing
export NODE_ENV="test"
export LOG_LEVEL="info"
export REDIS_URL="redis://localhost:6379"
export DATABASE_URL="postgres://..."
```

---

## Test Cost Calculator

```
Unit tests:              $0
Integration tests:       ~$5 (30 min)
Performance tests:       ~$10 (45 min)
Load baseline:           ~$5 (5 min)
Load light:              ~$5 (10 min)
Load medium:             ~$10 (15 min)
Load heavy:              ~$25 (20 min)
Regression (per run):    ~$5 (5 min)

Full suite cost:         ~$65-100
Full suite time:         ~2 hours
```

---

## Critical Files Reference

| File | Purpose | Check When |
|------|---------|-----------|
| TEST-MATRIX.md | 47+ test specifications | Planning, understanding scope |
| TESTING-COMPREHENSIVE.md | Complete testing guide | Questions about any test |
| PRODUCTION-READINESS-GUIDE.md | 8-week readiness plan | Planning timeline |
| src/performance.test.ts | Performance validation | Before deploy |
| src/loadTestEnhanced.ts | Load testing framework | Establishing baseline |
| src/regression.test.ts | Pre-deploy validation | Before every deploy |

---

## One-Liners

```bash
# Quick sanity check (2 min)
npm test

# Full validation before deploy (2 hours)
npm test && npm test -- src/integration.test.ts && npm test -- src/performance.test.ts && npm test -- src/regression.test.ts && npm run load-test heavy

# Establish baseline
npm run load-test baseline && npm run load-test light && npm run load-test medium

# Heavy stress test (20 min)
npm run load-test heavy

# Watch mode for development
npm test -- --watch

# Coverage report
npm test -- --coverage
```

---

## When Something Breaks

### Unit Tests Fail
1. Check syntax errors: `npm test`
2. Fix obvious issues
3. Run specific test: `npm test -- --grep "test name"`

### Integration Tests Fail
1. Verify API key: `echo $ANTHROPIC_API_KEY`
2. Check API quota (may be rate limited)
3. Run fewer iterations (tests only 5 prompts)

### Performance Tests Fail
1. Close other applications
2. Check if on production environment
3. Verify API not overloaded
4. Run again (may be transient)

### Load Tests Hang
1. Press Ctrl+C (gracefully exits)
2. Check `load-test-{scenario}-{timestamp}.json` (results saved)
3. Try lighter scenario first

### P99 Latency Too High
1. Stop other processes
2. Run on dedicated machine
3. Check for GC pauses (heavy test)
4. Profile with: `node --inspect dist/loadTest.js`

### Memory Leak Detected
1. Run: `npm test -- src/performance.test.ts`
2. Memory growth should be < 5MB for 200 requests
3. If > 100MB: investigate cache/stats storage

---

## Success Indicators

### All tests passing ✅
```
✓ Unit Tests        81/81 passing
✓ Integration       8/8 passing
✓ Performance       6/6 passing
✓ Regression        8/8 passing
✓ Load Tests        All scenarios sustainable
✓ Coverage          ≥70%
```

### Metrics within SLOs ✅
```
✓ P99 Latency       < 100ms (baseline ~48ms)
✓ Error Rate        < 0.1% (target: 0%)
✓ Cache Hit Rate    > 70% (target: ~70%)
✓ Token Accuracy    ±5% (target: ~4%)
✓ Cost Accuracy     ±0.01% (target: ~0.001%)
✓ Memory Stable     No leaks detected
```

### Production Ready ✅
```
✓ All test cases passing
✓ All SLOs met or exceeded
✓ Baseline measurements established
✓ Regression tests passing
✓ Security validation complete
✓ Ready for deployment
```

---

## Questions?

- **What test should I run?** → See "Daily Development" or "Before Deploying"
- **How long will tests take?** → See "Test Cost Calculator"
- **Which test failed?** → Check "Troubleshooting Matrix"
- **How do I fix it?** → See relevant file in "Critical Files Reference"
- **What's the success criteria?** → See "Success Indicators"

---

**Pin this card to your monitor during the 8-week production readiness phase!**
