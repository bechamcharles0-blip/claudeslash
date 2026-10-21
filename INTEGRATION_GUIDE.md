# Integration Guide: Performance Optimizations

This guide shows exactly how to integrate each optimization module into the Claude Router.

---

## 1. Connection Pool Integration

### Problem
Each token counting call creates a new Anthropic SDK client, requiring a 3-way handshake.

### Solution
Reuse single client instance across all requests.

### Implementation

**Before** (current code in `ModelRouter`):
```typescript
constructor(apiKey?: string) {
  this.client = new Anthropic({ apiKey }); // Fine for single instance
  this.tokenCounter = new TokenCounter(apiKey); // Creates new client inside!
  // ...
}
```

**After** (with connection pool):
```typescript
import { getConnectionPool } from './connectionPool.js';

constructor(apiKey?: string) {
  const pool = getConnectionPool(apiKey);
  this.client = pool.getClient();
  this.tokenCounter = new TokenCounter(apiKey, pool); // Pass pool
  // ...
}
```

**In TokenCounter**:
```typescript
export class TokenCounter {
  private client: Anthropic;

  constructor(apiKey?: string, pool?: ConnectionPool) {
    if (pool) {
      this.client = pool.getClient(); // Reuse pooled client
    } else {
      this.client = new Anthropic({ apiKey }); // Fallback
    }
  }
  
  // Rest of class unchanged
}
```

### Validation
```typescript
// After integration, check stats:
const stats = pool.getStats();
console.log(`Reuse ratio: ${stats.reuseRatio}`); // Should be >0.95
```

### Expected Impact
- **Savings**: 50-100ms per request
- **Measurement**: Before/after load test latency comparison

---

## 2. Distributed Tracing Integration

### Problem
Cannot identify which component dominates latency (token counting? API? selection?).

### Solution
Add tracing spans to each operation in the request pipeline.

### Implementation

**In ModelRouter.route()** (current code around line 245):
```typescript
async route(request: RouteRequest): Promise<RouteResponse> {
  const startTime = Date.now();
  const traceId = `route-${Date.now()}-${Math.random()}`;
  
  // ADD: Start trace
  const tracer = getTracer();
  const trace = tracer.createTrace(traceId);
  
  this.stats.totalRequests++;

  // Step 1: Check cache
  let span = tracer.startSpan(traceId, 'cache_lookup', { cache_key: request.cacheKey });
  const cacheKey = request.cacheKey || request.task;
  const cached = cacheManager.get(cacheKey, 'haiku');
  tracer.endSpan(span.spanId, cached ? 'success' : 'miss');
  
  if (cached) return cached; // Early return optimization

  // Step 2: Select model
  span = tracer.startSpan(traceId, 'model_selection');
  const selection = await this.selectModel(request);
  tracer.endSpan(span.spanId, 'success');
  
  const { model, effort, confidence = 0.5 } = selection;
  const config = MODEL_CONFIGS[model];

  // Step 3: Execute request
  span = tracer.startSpan(traceId, 'api_call', { model, method: config.apiId });
  const response = await this.client.messages.create({
    model: config.apiId,
    max_tokens: Math.min(request.budget, config.maxTokens),
    messages: [{ role: 'user', content: request.task }],
  });
  tracer.endSpan(span.spanId, 'success');

  // ... rest of method ...

  // At end: Log trace
  const executionTime = Date.now() - startTime;
  const criticalPath = tracer.getCriticalPath(traceId);
  console.log(`[TRACE] ${traceId}: ${executionTime}ms, critical path:`, 
    criticalPath.map(s => `${s.operation}:${s.duration}ms`).join(' <- '));

  return {
    // ... response object ...
    executionTime,
  };
}
```

**In tokenCounter.countTokens()** (add tracing):
```typescript
async countTokens(
  text: string,
  model: ModelTier,
  forceRefresh: boolean = false,
  traceId?: string,
  parentSpanId?: string
): Promise<{ input: number; output: number }> {
  const tracer = getTracer();
  let span: Span | null = null;
  
  if (traceId) {
    span = tracer.startSpan(traceId, 'token_counting', { 
      model,
      cache_key: this.getCacheKey(text, model),
      parent: parentSpanId
    });
  }

  try {
    const cacheKey = this.getCacheKey(text, model);
    const cached = this.tokenCache.get(cacheKey);

    if (cached && !forceRefresh && Date.now() - cached.timestamp < this.cacheValidityMs) {
      this.stats.cacheHits++;
      if (span) tracer.endSpan(span.spanId, 'success');
      return {
        input: cached.input,
        output: cached.output,
      };
    }

    this.stats.cacheMisses++;

    const response = await (this.client.messages as any).countTokens({
      model: this.getModelId(model),
      messages: [{ role: 'user', content: text }],
    });

    const tokens = {
      input: response.input_tokens || 0,
      output: response.output_tokens || 0,
    };

    this.tokenCache.set(cacheKey, {
      ...tokens,
      timestamp: Date.now(),
    });

    if (span) tracer.endSpan(span.spanId, 'success');
    return tokens;
  } catch (error) {
    if (span) tracer.endSpan(span.spanId, 'error', error as Error);
    // ... fallback ...
  }
}
```

### Validation
```typescript
// Get critical path from trace
const trace = tracer.getTrace(traceId);
const criticalPath = tracer.getCriticalPath(traceId);

// Example output:
// [
//   { operation: 'model_selection', duration: 250 },
//   { operation: 'token_counting', duration: 350 },
//   { operation: 'api_call', duration: 2800 }
// ]
// Shows token counting is bottleneck!
```

### Expected Insight
Identifies which component dominates P99 (usually API call, but may be token counting).

---

## 3. Performance Profiler Integration

### Problem
Need detailed P50/P95/P99/P99.9 measurements per operation.

### Solution
Record latencies at each operation, calculate percentiles on demand.

### Implementation

**In ModelRouter.route()** (around line 246):
```typescript
import { getProfiler } from './performanceProfiler.js';

async route(request: RouteRequest): Promise<RouteResponse> {
  const startTime = Date.now();
  const profiler = getProfiler();
  
  // ... request processing ...

  // Step 1: Token counting
  const tokenStart = Date.now();
  const tokens = await this.countTokens(request.task, 'haiku');
  const tokenLatency = Date.now() - tokenStart;
  profiler.record('token_counting', tokenLatency, { model: 'haiku' });

  // Step 2: Complexity analysis
  const complexStart = Date.now();
  const complexity = this.complexityAnalyzer.analyzeComplexity(request.task, tokens);
  const complexLatency = Date.now() - complexStart;
  profiler.record('complexity_analysis', complexLatency);

  // Step 3: Model selection
  const selectStart = Date.now();
  const selection = await this.selectModel(request);
  const selectLatency = Date.now() - selectStart;
  profiler.record('model_selection', selectLatency);

  // Step 4: API call
  const apiStart = Date.now();
  const response = await this.client.messages.create({...});
  const apiLatency = Date.now() - apiStart;
  profiler.record('api_call', apiLatency, { model: selection.model });

  // Overall
  const totalLatency = Date.now() - startTime;
  profiler.record('route', totalLatency);

  return {
    // ... response ...
    executionTime: totalLatency,
  };
}
```

**Add metrics endpoint** (in `rest.ts`):
```typescript
// GET /api/metrics - Performance metrics
app.get('/metrics', (req: Request, res: Response) => {
  const profiler = getProfiler();
  const stats = profiler.getAllStats();
  
  return res.json({
    timestamp: new Date().toISOString(),
    measurements: profiler.getCount(),
    operations: stats,
    summary: profiler.getSummary(),
  });
});
```

### Validation
```typescript
// After load test, check P99
const profiler = getProfiler();
const routeStats = profiler.getStats('route');
console.log(`Route P99: ${routeStats.p99Ms}ms`); // Should be <100ms after optimizations

// Check individual operations
const tokenStats = profiler.getStats('token_counting');
console.log(`Token counting P99: ${tokenStats.p99Ms}ms`); // Should be <50ms
```

### Expected Output
```
Operation: route
  Count: 1000
  Avg: 2500ms
  P50: 2300ms
  P95: 3200ms
  P99: 4100ms    ← TARGET: <100ms after all optimizations

Operation: token_counting
  Count: 1000
  Avg: 300ms
  P50: 250ms
  P95: 400ms
  P99: 550ms     ← Will improve with batching

Operation: api_call
  Count: 1000
  Avg: 2100ms
  P50: 1900ms
  P95: 2800ms
  P99: 3500ms    ← Bottleneck! (80% of total latency)
```

---

## 4. Circuit Breaker Integration

### Problem
API rate limits or failures cause thundering herd and cascading latency.

### Solution
Implement fast-fail with exponential backoff + jitter.

### Implementation

**In ModelRouter** (for token counting calls):
```typescript
import { CircuitBreaker, retryWithJitter } from './circuitBreaker.js';

export class ModelRouter {
  private tokenCountingBreaker: CircuitBreaker;
  private apiCallBreaker: CircuitBreaker;

  constructor(apiKey?: string) {
    // ... existing code ...
    
    this.tokenCountingBreaker = new CircuitBreaker({
      failureThreshold: 5,
      timeoutMs: 30000,
    });

    this.apiCallBreaker = new CircuitBreaker({
      failureThreshold: 3,
      timeoutMs: 60000,
    });
  }

  async countTokens(task: string, model: ModelTier = 'haiku'): Promise<number> {
    try {
      // Wrap token counting with circuit breaker
      const tokens = await this.tokenCountingBreaker.execute(
        () => this.tokenCounter.countTokens(task, model),
        `token_counting_${model}`
      );
      return tokens.input;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Circuit breaker')) {
        console.warn('Token counting circuit open, using fallback');
        return Math.ceil(task.length / 3.5); // Fallback to estimation
      }
      throw error;
    }
  }

  async route(request: RouteRequest): Promise<RouteResponse> {
    // ... existing code ...

    // Wrap API call with circuit breaker and retry
    const response = await retryWithJitter(
      () => this.apiCallBreaker.execute(
        () => this.client.messages.create({
          model: config.apiId,
          max_tokens: Math.min(request.budget, config.maxTokens),
          messages: [{ role: 'user', content: request.task }],
        }),
        'claude_api_call'
      ),
      {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 5000,
        jitter: true, // Critical: prevents thundering herd
      }
    );

    // ... rest of method ...
  }
}
```

### Validation
```typescript
// Monitor circuit state
const stats = router.apiCallBreaker.getStats();
console.log(stats);
// {
//   state: 'closed',
//   totalRequests: 1000,
//   successfulRequests: 995,
//   failedRequests: 5,
//   successRate: '99.5%'
// }
```

### Expected Impact
- **On normal conditions**: No impact (circuit stays closed)
- **On API rate limit**: Fail fast instead of cascading timeout
- **P99 improvement**: 2600ms → 1400ms (with jitter)

---

## 5. Redis Cache Integration

### Problem
Token counts and model selections are recomputed for every request.

### Solution
Cache results in distributed Redis.

### Implementation

**Update ModelRouter to use Redis**:
```typescript
import { getRedisCache } from './redis-cache.js';

export class ModelRouter {
  private redisCache?: RedisCache;

  async initialize() {
    // Called on startup
    if (process.env.REDIS_URL) {
      this.redisCache = await getRedisCache();
    }
  }

  async countTokens(task: string, model: ModelTier = 'haiku'): Promise<number> {
    // Check Redis first
    if (this.redisCache) {
      const cached = await this.redisCache.getCachedResponse(`tokens:${task}:${model}`);
      if (cached) {
        return cached.tokens;
      }
    }

    // Count tokens
    const tokens = await this.tokenCountingBreaker.execute(
      () => this.tokenCounter.countTokens(task, model),
      `token_counting_${model}`
    );

    // Cache result
    if (this.redisCache) {
      await this.redisCache.cacheResponse(`tokens:${task}:${model}`, {
        result: '',
        model,
        tokensUsed: { input: tokens.input, output: tokens.output },
        cost: 0,
        quality: 0,
        savings: { tokensReduced: 0, percentReduced: 0, estimatedCost: 0 },
        escalated: false,
        executionTime: 0,
        cacheHit: false,
        effort: 'low',
      }, 86400); // 24 hour TTL

      await this.redisCache.recordModelUsage(model);
    }

    return tokens.input;
  }

  async route(request: RouteRequest): Promise<RouteResponse> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    // Check Redis cache for entire response
    if (this.redisCache) {
      const cached = await this.redisCache.getCachedResponse(request.cacheKey || request.task);
      if (cached) {
        return {
          result: cached.result,
          model: cached.model,
          effort: 'low',
          tokensUsed: { input: cached.tokens, output: 0 },
          cost: 0,
          quality: 0,
          savings: { tokensReduced: 0, percentReduced: 0, estimatedCost: 0 },
          escalated: false,
          executionTime: Date.now() - startTime,
          cacheHit: true,
        };
      }
    }

    // ... normal processing ...
  }
}
```

**In server.ts startup**:
```typescript
const router = new ModelRouter(process.env.ANTHROPIC_API_KEY);
await router.initialize(); // Connect to Redis
```

### Expected Impact
- **Token counting cache hit rate**: 60-70%
- **Latency savings**: 300-500ms for cache hits (100% of token counting time)
- **P99 improvement**: ~200ms (if 60% cache hit rate)

---

## 6. Request Batching Integration

### Problem
Token counting for multiple requests is sequential.

### Solution
Batch token counts in 50ms windows.

### Implementation

```typescript
import { RequestBatcher } from './requestBatcher.js';

export class ModelRouter {
  private tokenCountBatcher: RequestBatcher<string, { input: number; output: number }>;

  constructor(apiKey?: string) {
    // ... existing code ...

    // Initialize batcher
    this.tokenCountBatcher = new RequestBatcher({
      batchWindowMs: 50,
      maxBatchSize: 50,
      processor: async (tasks: string[]) => {
        // Process all tasks in parallel
        return Promise.all(
          tasks.map(task =>
            this.tokenCounter.countTokens(task, 'haiku')
              .catch(() => ({ input: Math.ceil(task.length / 3.5), output: 0 }))
          )
        );
      },
    });
  }

  async countTokens(task: string, model: ModelTier = 'haiku'): Promise<number> {
    if (model === 'haiku') {
      // Batch haiku token counting
      const result = await this.tokenCountBatcher.add({
        id: `token:${task}:${model}`,
        payload: task,
        priority: 1,
      });
      return result.input;
    } else {
      // Direct call for other models
      const tokens = await this.tokenCounter.countTokens(task, model);
      return tokens.input;
    }
  }
}
```

### Validation
```typescript
// After load test
const batchStats = router.tokenCountBatcher.getStats();
console.log(batchStats);
// {
//   totalRequests: 1000,
//   totalBatches: 20,
//   batchedRequests: 1000,
//   averageBatchSize: 50,
//   estimatedSavingsPerRequest: '45ms'
// }
```

### Expected Impact
- **Batch efficiency**: Average 50 requests per batch
- **Latency savings**: 20-45ms per request (amortized batching overhead)
- **Throughput improvement**: 5-10% higher RPS

---

## 7. Async Logging Integration

### Problem
Synchronous logging blocks request path.

### Solution
Queue logs asynchronously.

### Implementation

**Replace console.log in ModelRouter**:
```typescript
import { getLogger } from './asyncLogging.js';

export class ModelRouter {
  async route(request: RouteRequest): Promise<RouteResponse> {
    const logger = getLogger();
    const traceId = `trace-${Date.now()}`;

    // Replace synchronous logs
    // BEFORE: console.log(`Route request: ${request.task.substring(0, 50)}`);
    // AFTER:
    logger.log('info', 'router', 'Route request started', {
      taskLength: request.task.length,
      budget: request.budget,
    }, traceId);

    try {
      // ... processing ...
      logger.log('info', 'router', 'Request completed', {
        model: selection.model,
        executionTime: Date.now() - startTime,
      }, traceId);
    } catch (error) {
      logger.log('error', 'router', `Request failed: ${error instanceof Error ? error.message : 'unknown'}`, 
        { taskLength: request.task.length }, traceId);
      throw error;
    }
  }
}
```

**Optional: Add file logging**:
```typescript
import { getLogger, fileHandler } from './asyncLogging.js';

// In server startup
const logger = getLogger();
logger.addHandler(fileHandler('./logs/router.log'));
```

### Expected Impact
- **Latency savings**: 5-10ms per request (removed logging overhead)
- **No blocking**: Request path never waits for log writes

---

## Integration Checklist

- [ ] **Connection Pool**
  - [ ] Integrate into ModelRouter constructor
  - [ ] Integrate into TokenCounter constructor
  - [ ] Verify reuse ratio >0.95

- [ ] **Distributed Tracing**
  - [ ] Add trace creation in route() method
  - [ ] Trace each operation (token counting, selection, API call)
  - [ ] Export critical path analysis
  - [ ] Verify trace details accurate

- [ ] **Performance Profiler**
  - [ ] Record latency per operation
  - [ ] Add /api/metrics endpoint
  - [ ] Verify P50/P95/P99 calculations
  - [ ] Create heatmap endpoint

- [ ] **Circuit Breaker**
  - [ ] Wrap token counting API calls
  - [ ] Wrap Anthropic API calls
  - [ ] Add exponential backoff with jitter
  - [ ] Test failure scenarios

- [ ] **Redis Cache**
  - [ ] Connect to Redis on startup
  - [ ] Cache token counting results
  - [ ] Cache model selection decisions
  - [ ] Monitor cache hit rate

- [ ] **Request Batching**
  - [ ] Create batcher for token counting
  - [ ] Integrate into countTokens()
  - [ ] Monitor batch size and efficiency
  - [ ] Tune batch window (50ms default)

- [ ] **Async Logging**
  - [ ] Replace synchronous console.log calls
  - [ ] Add file handler (optional)
  - [ ] Verify non-blocking behavior
  - [ ] Check log accuracy

- [ ] **Load Testing**
  - [ ] Run baseline before optimizations
  - [ ] Run advanced load test (3 scenarios)
  - [ ] Measure P99 latency improvements
  - [ ] Validate no regressions

---

## Measurement Strategy

### Before Optimization (Baseline)
```bash
npm run load-test
# Capture: P50, P95, P99 for each scenario
# Expected: P99 ~2500-5000ms
```

### After Each Integration
```bash
npm run load-test-advanced
# Compare: P99 before vs after
# Track: Which optimization helped most
# Example: 
#   - After connection pool: P99 2400ms (100ms saved)
#   - After batching: P99 2200ms (200ms saved cumulative)
#   - After Redis: P99 1800ms (600ms saved cumulative)
```

### Final Validation
```bash
# Run for 20 minutes sustained load
npm run load-test-sustained -- --duration 1200 --rps 50

# Success criteria:
# - P99 < 100ms
# - P99.9 < 200ms
# - Error rate < 0.1%
# - No degradation over time
```

---

## Expected Cumulative Impact

| Optimization | Impact | Cumulative |
|---|---|---|
| Baseline | - | 2500ms P99 |
| Connection Pool | -100ms | 2400ms |
| Distributed Tracing | -20ms (insight only) | 2380ms |
| Performance Profiler | 0ms (measurement only) | 2380ms |
| Circuit Breaker | -150ms (error handling) | 2230ms |
| Redis Cache | -400ms (60% hit rate) | 1830ms |
| Request Batching | -300ms (amortized) | 1530ms |
| Async Logging | -10ms | 1520ms |
| **Total** | **-980ms (39% improvement)** | **1520ms** |

**Note**: API call latency (1000-5000ms) is not optimizable at router level—it's Anthropic's API.

---

## Validation Before Production

1. [ ] All integrations compile without errors
2. [ ] Unit tests pass for each module
3. [ ] Load test P99 < target
4. [ ] No regressions in existing functionality
5. [ ] Circuit breaker prevents cascading failures
6. [ ] Cache hit rate > 60%
7. [ ] Error rate < 0.1%
8. [ ] 20+ minute sustained load shows no degradation

---

**Next**: Review specific module implementations and run integration tests.
