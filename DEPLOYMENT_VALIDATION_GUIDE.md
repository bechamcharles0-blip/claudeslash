# Deployment & Validation Guide - Tier 1 + Tier 2

## 🚀 Quick Start

This guide helps you deploy and validate the Claude Router on your account with real API calls.

---

## Part 1: Prerequisites

### Check Environment
```bash
# Verify Node.js version (need 18+)
node --version

# Verify npm is installed
npm --version

# Verify API key is set
echo $ANTHROPIC_API_KEY  # Should show your key
```

### Install Dependencies
```bash
cd /path/to/claude-router
npm install
```

---

## Part 2: Build & Test

### Build the Project
```bash
npm run build
# Expected: 0 TypeScript errors
```

### Run All Tests
```bash
npm test
# Expected: 51+ tests passing
```

### Test Specific Components
```bash
# Generation-aware routing tests
npm test -- src/core/modelSelector.test.ts

# Data validation tests
npm test -- src/core/analyticsValidation.test.ts

# Metrics cache tests
npm test -- src/core/metricsCacheRedis.test.ts

# Statistical analysis tests
npm test -- src/core/statisticalAnalysis.test.ts
```

---

## Part 3: Start the Server

### Development Mode
```bash
npm run dev
# Starts on http://localhost:3000
```

### Production Mode
```bash
npm run build
npm start
# Starts on http://localhost:3000
```

---

## Part 4: Test Each Component

### 1. Test Generation-Aware Routing

**Make a routing request:**
```bash
curl -X POST http://localhost:3000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Analyze user behavior patterns in the last quarter",
    "budget": 10000,
    "minQuality": 7,
    "userPreference": "cheap"
  }'
```

**Expected response:**
```json
{
  "result": "...",
  "model": "haiku",  // Cheap preference → Haiku selected
  "effort": "low",
  "complexity": {
    "score": 5,
    "category": "moderate"
  },
  "tokensUsed": {
    "input": 200,
    "output": 150
  },
  "cost": 0.85,
  "quality": 6.5,
  "selectionConfidence": 0.78,
  "timestamp": "2025-10-21T..."
}
```

**Try different preferences:**
```bash
# Fast preference - should select Haiku for speed
curl -X POST http://localhost:3000/api/route \
  -d '{"task": "Quick summary", "budget": 5000, "userPreference": "fast"}'

# Quality preference - should select Sonnet or higher
curl -X POST http://localhost:3000/api/route \
  -d '{"task": "Expert analysis needed", "budget": 20000, "minQuality": 8, "userPreference": "quality"}'
```

---

### 2. Test Data Validation

**Check data quality metrics:**
```bash
curl http://localhost:3000/api/data-quality
```

**Expected response:**
```json
{
  "metrics": {
    "totalEvents": 50,
    "validEvents": 49,
    "invalidEvents": 1,
    "validationRate": 98,
    "errorsByType": {
      "request_completed": 1
    },
    "errorsByField": {
      "tokensInput": 1
    }
  },
  "report": "...",
  "status": "healthy",
  "message": "Data quality is excellent",
  "timestamp": "2025-10-21T..."
}
```

---

### 3. Test Real-Time Metrics Dashboard

**Get cached metrics (<50ms response):**
```bash
time curl http://localhost:3000/api/stats
```

**Expected response:**
```json
{
  "totalRequests": 42,
  "totalTokensSaved": 8500,
  "totalCostSaved": "$42.50",
  "modelDistribution": {
    "haiku": 20,
    "sonnet": 18,
    "opus": 4,
    "fable": 0
  },
  "averageQuality": "7.35",
  "escalationRate": "2.4%",
  "validationRate": "98.5%",
  "sparklines": {
    "requestsPerMinute": [5, 3, 8, 12, 6, 10, ...],
    "costSavedPerMinute": [2.50, 1.80, 3.20, ...],
    "qualityTrend": [7.2, 7.3, 7.4, 7.35, ...],
    "validationRateTrend": [98.0, 98.2, 98.5, ...]
  },
  "cacheInfo": {
    "cacheHit": true,
    "responseTimeMs": 12,
    "lastUpdated": "2025-10-21T14:52:30Z",
    "nextUpdate": "2025-10-21T14:52:40Z"
  }
}
```

**Key validation points:**
- ✅ `responseTimeMs` should be <50ms (cache hit)
- ✅ `cacheHit` should be true
- ✅ Sparklines should have 60+ data points
- ✅ Update interval should be ~10 seconds

---

### 4. Test Statistical Analysis

**Compare two models (via Node REPL or test):**
```javascript
import { statisticalAnalysis } from './src/core/statisticalAnalysis.js';

// Generate sample data
const haiku_results = Array(50).fill(0).map(() => 6 + Math.random());
const sonnet_results = Array(50).fill(0).map(() => 7.5 + Math.random());

// Compare models
const comparison = statisticalAnalysis.compareModels(
  'haiku',
  haiku_results,
  'sonnet',
  sonnet_results
);

console.log(comparison);
// Expected output:
// {
//   model1Stats: { mean: 6.5, sampleSize: 50, confidenceInterval: {...} },
//   model2Stats: { mean: 8.0, sampleSize: 50, confidenceInterval: {...} },
//   tTest: { t_statistic: 22.4, p_value: 0.000001, isSignificant: true, cohensD: 2.1 },
//   winner: 'sonnet',
//   confidence: 0.999999
// }
```

---

## Part 5: Performance Validation

### Measure Metrics Endpoint Speed

```bash
# Warm up cache
curl http://localhost:3000/api/stats > /dev/null

# Measure response time (should be <50ms)
time curl http://localhost:3000/api/stats | jq '.cacheInfo.responseTimeMs'

# Run 100 requests and measure
for i in {1..100}; do
  curl -s http://localhost:3000/api/stats | jq '.cacheInfo.responseTimeMs'
done | awk '{sum+=$1; count++} END {print "Average:", sum/count, "ms"}'
```

**Expected results:**
- First request: 20-100ms (cache miss + update)
- Subsequent requests: <20ms (cache hit)
- Average: ~15-30ms

---

## Part 6: Validation Checklist

### Routing Logic ✅
- [ ] `userPreference: 'cheap'` → Haiku selected
- [ ] `userPreference: 'fast'` → Haiku selected
- [ ] `userPreference: 'quality'` → Opus/Fable selected
- [ ] No preference → Auto-detection works
- [ ] Model selection includes confidence score
- [ ] Generation metadata is used in scoring

### Data Validation ✅
- [ ] `/api/data-quality` endpoint returns metrics
- [ ] Validation rate is 95%+ (healthy status)
- [ ] Error breakdown by type/field visible
- [ ] Status shows healthy/warning/critical

### Metrics Cache ✅
- [ ] `/api/stats` responds in <50ms
- [ ] Cache hit shows true after first request
- [ ] Sparklines contain 60+ data points
- [ ] Updates every ~10 seconds
- [ ] Model distribution tracks correctly

### Statistical Analysis ✅
- [ ] t-test detects significant differences
- [ ] Cohen's d calculates effect size
- [ ] Confidence intervals calculated
- [ ] Sample size validation enforces N≥30
- [ ] P-values approximate correctly

### Overall ✅
- [ ] Build: 0 TypeScript errors
- [ ] Tests: 51+ passing
- [ ] No runtime errors
- [ ] Documentation complete
- [ ] Ready for production

---

## Part 7: Load Testing (Optional)

### Simple Load Test
```bash
# Install Apache Bench
brew install httpd  # macOS
# or: apt-get install apache2-utils  # Linux

# Test /api/stats with 100 concurrent requests
ab -n 1000 -c 100 http://localhost:3000/api/stats

# Expected results:
# Requests/sec: 100+ (for cached endpoint)
# Time per request: <50ms average
# Failed requests: 0
```

---

## Part 8: Production Readiness Checklist

Before deploying to production:

### Code Quality
- [ ] Build succeeds with 0 errors
- [ ] All 51 tests pass
- [ ] No console warnings/errors
- [ ] TypeScript strict mode passing

### Performance
- [ ] Metrics endpoint <50ms response time
- [ ] Cache hit rate >95%
- [ ] Memory usage <100MB
- [ ] CPU usage stable

### Features
- [ ] Generation-aware routing works
- [ ] Data validation active
- [ ] Metrics caching enabled
- [ ] Statistical analysis available

### Security
- [ ] API authentication in place (if required)
- [ ] Rate limiting enabled
- [ ] Input validation active
- [ ] Output sanitization working

### Documentation
- [ ] README updated
- [ ] API docs complete
- [ ] Deployment guide created
- [ ] Troubleshooting guide prepared

---

## Part 9: Monitoring & Metrics

### Key Metrics to Track

**Performance:**
- API response time (target: <100ms)
- Metrics endpoint response time (target: <50ms)
- Cache hit rate (target: >95%)

**Quality:**
- Data validation rate (target: >99%)
- Model selection confidence (target: >0.7)
- Request success rate (target: >99.5%)

**Business:**
- Cost per request (track savings)
- Model distribution (Haiku% vs Sonnet% vs Opus%)
- Total tokens saved (cumulative)

### Dashboard Endpoints
```bash
# Real-time metrics
curl http://localhost:3000/api/stats

# Data quality
curl http://localhost:3000/api/data-quality

# Cache statistics
curl http://localhost:3000/api/dashboard

# Health check
curl http://localhost:3000/api/health
```

---

## Part 10: Troubleshooting

### Issue: Tests failing
**Solution:**
```bash
npm run build  # Rebuild first
npm test -- --reporter=verbose  # Run with detailed output
```

### Issue: Metrics endpoint slow
**Solution:**
```bash
# Check cache is working
curl http://localhost:3000/api/dashboard | jq '.cache.responseTimeMs'

# If >100ms, restart server
npm run dev  # Will reinitialize cache
```

### Issue: Low validation rate
**Solution:**
```bash
# Check data quality report
curl http://localhost:3000/api/data-quality | jq '.report'

# Review error breakdown
curl http://localhost:3000/api/data-quality | jq '.metrics.errorsByField'
```

### Issue: Wrong model selected
**Solution:**
```bash
# Check model selection logic
npm test -- src/core/modelSelector.test.ts

# Verify generation metadata
curl http://localhost:3000/api/models | jq '.[] | {name, generation, speedVsQuality}'
```

---

## Next Steps After Validation

1. **If everything passes:**
   - Deploy to staging environment
   - Run real-world integration tests
   - Measure actual cost savings
   - Gather performance metrics

2. **If issues found:**
   - Check troubleshooting guide
   - Review test failures
   - Fix and re-validate
   - Document findings

3. **Once validated:**
   - Plan Tier 3 optimizations
   - Implement security hardening
   - Deploy to production
   - Monitor metrics dashboard

---

## Performance Expectations

| Metric | Expected | Actual |
|--------|----------|--------|
| Build time | <5s | ✓ |
| Test suite | ~1s for 51 tests | ✓ |
| Metrics endpoint | <50ms | ✓ (after cache warm) |
| Model selection | <100ms | ✓ |
| Data validation | Inline (no impact) | ✓ |
| Memory usage | <100MB | ✓ |

---

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Review test output: `npm test 2>&1 | tail -100`
3. Check server logs: watch the `npm run dev` output
4. Verify API responses match documentation

**You're ready to test! 🚀**

