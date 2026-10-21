# Claude Router - Testing Quick Start Guide

## Setup

### 1. Install Dependencies
```bash
npm install
```

This installs all testing frameworks:
- `vitest` - Modern test runner
- `@vitest/ui` - Visual test dashboard
- `supertest` - HTTP testing
- Coverage reporters

### 2. Configure Environment
```bash
# Copy example env
cp .env.example .env

# Add your test API key
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_API_KEY_TEST="sk-ant-..."  # Optional: separate test key with lower budget
```

### 3. Build Project
```bash
npm run build
```

---

## Running Tests

### Quick Test Run
```bash
npm test
```

All unit tests will run (many will show "CRITICAL" warnings about issues found).

### Visual Test Dashboard
```bash
npm test:ui
```

Opens interactive dashboard at `http://localhost:51204/__vitest__/`

### Watch Mode (Development)
```bash
npm test:watch
```

Tests rerun when you save files.

### Coverage Report
```bash
npm test:coverage
```

Generates HTML coverage report in `coverage/` directory.

### Integration Tests (requires API key)
```bash
npm test:integration
```

Runs real API tests. Will:
- Make actual Anthropic API calls
- Measure real latency
- Validate token counting accuracy
- Incur real costs

### Load Testing
```bash
npm run load-test
```

Runs three scenarios:
1. **Light Load**: 10 concurrent, 100 requests
2. **Medium Load**: 50 concurrent, 500 requests
3. **Heavy Load**: 100 concurrent, 1000 requests

Results saved to:
- `load-test-light.json`
- `load-test-medium.json`
- `load-test-heavy.json`

---

## Test Structure

```
src/
├── core/
│   ├── modelRouter.test.ts       # Token counting, model selection, routing
│   └── security.test.ts          # Input validation, rate limiting, auth
├── api/
│   ├── rest.test.ts              # REST endpoints testing
│   └── graphql.test.ts           # GraphQL schema testing
└── integration.test.ts           # Full pipeline tests

vitest.config.ts                  # Test configuration
```

---

## Understanding Test Output

### Test Passing
```
✓ src/core/modelRouter.test.ts (6 tests)
  ✓ should estimate tokens based on character count
  ✓ should handle long inputs
```

### Test Failing
```
✗ src/core/modelRouter.test.ts > CRITICAL: Savings calculation must be validated
  Error: Expected 30 to be calculated
```

### CRITICAL Warnings
```
⚠️ TOKEN ESTIMATION: Using naive 4-char/token estimation. 
   Accuracy ~60-70%. Need real API validation.
```

These warnings indicate production issues that must be fixed.

---

## Key Test Files to Review

### 1. Token Estimation Tests
**File**: `src/core/modelRouter.test.ts`

**Key Test**: "CRITICAL: Should validate against actual Claude API token count"

**What it checks**:
- Token counting accuracy
- Handles edge cases
- Consistency across models

**Expected Issues**:
- Will show 30-40% error vs real API
- Need better tokenization algorithm

### 2. Model Selection Tests
**File**: `src/core/modelRouter.test.ts`

**Key Tests**:
- "should select Haiku for small tasks"
- "should select Sonnet for medium tasks"
- "should respect allowed models constraint"

**Expected Behavior**:
- Simple tasks → Haiku
- Medium complexity → Sonnet
- Complex tasks → Opus

### 3. Security Tests
**File**: `src/core/security.test.ts`

**Key Areas**:
- Input validation (injection prevention)
- Rate limiting (hourly, minute, day)
- Output sanitization
- Anomaly detection

**Expected Issues**:
- Per-minute and per-day limits not enforced
- Anomaly detection incomplete
- In-memory only (won't scale)

### 4. REST API Tests
**File**: `src/api/rest.test.ts`

**Endpoints Tested**:
- POST /api/route - Main routing
- POST /api/direct - Direct model
- GET /api/models - List models
- POST /api/token-estimate - Token counting
- GET /api/stats - Statistics
- GET /api/health - Health check

**Expected Issues**:
- Health check doesn't verify dependencies
- CORS allows all origins
- No authentication

### 5. GraphQL API Tests
**File**: `src/api/graphql.test.ts`

**Queries Tested**:
- `query { models { ... } }`
- `query { model(name: "haiku") { ... } }`
- `query { stats { ... } }`
- `query { estimateTokens(...) { ... } }`

**Mutations Tested**:
- `mutation { route(...) { ... } }`

---

## Finding and Understanding Issues

### CRITICAL Issues in Tests

Run any test to see CRITICAL warnings:

```bash
npm test src/core/modelRouter.test.ts
```

Look for lines like:
```
⚠️ TOKEN ESTIMATION: Using naive 4-char/token estimation. 
   Accuracy ~60-70%. Need real API validation.
```

### Mapping Issues to Code

Each CRITICAL warning links to:
1. **Source code location**: `modelRouter.ts line 66`
2. **Impact**: Token accuracy off by 30-40%
3. **What needs fixing**: Implement real tokenization
4. **How to test**: `src/core/modelRouter.test.ts`

### Count of Issues

```bash
npm test 2>&1 | grep "⚠️" | wc -l
```

Should show 10+ critical issues.

---

## Working with Integration Tests

### Prerequisites
```bash
# Set test API key (optional, defaults to ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY_TEST="sk-ant-..."
export ANTHROPIC_API_KEY="sk-ant-..."  # Fallback
```

### Run Integration Tests
```bash
npm test:integration
```

This will:
1. Make real API calls (costs money!)
2. Measure actual latency
3. Validate token accuracy
4. Show real vs estimated comparison

### Example Output
```
Real API Response: {
  model: 'haiku',
  tokens: 150,
  cost: 0.000075
}

Token Accuracy Test: {
  estimated: 135,
  actual: 150,
  estimationError: '10.0%'
}
```

### Cost of Running Tests
- Simple test: ~$0.00005
- 100 integration tests: ~$0.01
- Full load test (1500 requests): ~$0.50

---

## Load Testing

### Run All Load Scenarios
```bash
npm run load-test
```

Generates three test files with detailed metrics:
- Light (10 concurrent)
- Medium (50 concurrent)  
- Heavy (100 concurrent)

### Run Specific Load Scenario
```bash
node --loader tsx/esm src/loadTest.ts \
  --requests 1000 \
  --concurrent 100 \
  --model haiku
```

### Understanding Load Test Results

```json
{
  "totalRequests": 1000,
  "successfulRequests": 980,      // Success rate = 98%
  "failedRequests": 20,           // Failures = 2%
  "averageLatency": 1250,         // Average = 1.25s
  "p50Latency": 1000,             // Median = 1s
  "p95Latency": 3000,             // 95th percentile = 3s
  "p99Latency": 4500,             // 99th percentile = 4.5s
  "requestsPerSecond": 142.8,     // Throughput
  "errors": [...]                 // First 10 errors
}
```

### Load Test Performance Targets
- Success rate: > 99%
- P50 latency: < 2s
- P95 latency: < 5s
- Throughput: > 50 req/sec

---

## Coverage Goals

### Target Coverage
- Unit tests: 70%
- Integration tests: 50%
- Overall: 70%

### View Coverage Report
```bash
npm test:coverage

# Then open in browser
open coverage/index.html
```

### Coverage Report Interpretation
```
Statements: 70%    - 70% of code executed
Branches: 65%      - 65% of conditionals tested
Functions: 70%     - 70% of functions tested
Lines: 70%         - 70% of lines executed
```

Uncovered areas:
- Error paths (catch blocks)
- Edge cases
- Distributed system code (needs special setup)

---

## Debugging Tests

### Run Single Test File
```bash
npm test src/core/modelRouter.test.ts
```

### Run Single Test Case
```bash
npm test -- -t "should estimate tokens"
```

### Run with Verbose Output
```bash
npm test -- --reporter=verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test", "--", "--run"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

Then press F5 to debug.

### Check Test Memory Usage
```bash
node --inspect --loader tsx/esm node_modules/vitest/vitest.mjs run
```

---

## Common Test Issues & Fixes

### "Cannot find module" Error
```bash
# Rebuild TypeScript
npm run build

# Clear cache
rm -rf dist node_modules/.vitest
npm test
```

### "API key not found" Error
```bash
# Set in environment
export ANTHROPIC_API_KEY="sk-ant-..."

# Or in .env file
echo 'ANTHROPIC_API_KEY="sk-ant-..."' >> .env
```

### "Tests timeout" Error
- Default timeout: 30 seconds (vitest.config.ts)
- Increase for slow CI: `--testTimeout=60000`
- Integration tests take longer (API calls)

### Load test fails at high concurrency
- Rate limits hit
- API key quota exceeded
- System resource limits
- Check results JSON for error patterns

---

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3
```

### Pre-commit Hook
```bash
#!/bin/sh
npm test
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

---

## Next Steps

1. **Run tests**: `npm test`
2. **Review critical issues**: Look for `⚠️ CRITICAL` warnings
3. **Read detailed report**: Open `QA_REPORT.md`
4. **Plan fixes**: Follow timeline in `TESTING_STRATEGY.md`
5. **Run integration tests**: `npm test:integration`
6. **Load test**: `npm run load-test`

---

## Getting Help

### Understand a Failing Test
1. Read test name carefully
2. Look for "CRITICAL" warnings
3. Check comments in test file
4. See `QA_REPORT.md` for detailed explanation

### Fix a Issue
1. Find in `TESTING_STRATEGY.md`
2. See code location (e.g., `modelRouter.ts:66`)
3. Apply recommended fix
4. Rerun test to verify

### Report a New Issue
1. Add test case in appropriate `.test.ts` file
2. Document expected vs actual behavior
3. Tag as CRITICAL or HIGH if blocking
4. Add to `QA_REPORT.md`

---

## References

- **Test Framework**: https://vitest.dev/
- **Anthropic SDK**: https://github.com/anthropics/anthropic-sdk-python
- **Express Testing**: https://expressjs.com/en/guide/testing.html
- **GraphQL Testing**: https://graphql.org/graphql-js/

