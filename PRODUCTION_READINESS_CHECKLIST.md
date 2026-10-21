# Claude Router - Production Readiness Checklist

**Target Completion**: Week 8 (Oct 21 + 56 days = Dec 16, 2026)

---

## Phase 1: Foundation (Week 1-2)

### Token Estimation Fix
- [ ] Review current algorithm (Math.ceil(length/4))
- [ ] Select tokenization approach:
  - [ ] Option A: Use Anthropic token counting API
  - [ ] Option B: Implement js-tiktoken library
  - [ ] Option C: Use Claude API tokenization endpoint
- [ ] Implement new estimateTokens() method
- [ ] Test against 100+ real prompts
- [ ] Achieve ±5% accuracy target
- [ ] Update modelRouter.test.ts assertions
- [ ] **Deadline**: Day 3-4
- [ ] **Owner**: Backend lead
- [ ] **Test**: `npm test src/core/modelRouter.test.ts`

### Hardcoded Metrics Fixes
- [ ] Fix savings calculation (no more hardcoded 30%)
  - [ ] Calculate actual baseline cost (assume Opus)
  - [ ] Compare actual vs baseline tokens
  - [ ] Report real savings percentage
  - [ ] Test: `npm test -- -t "savings calculation"`
  
- [ ] Fix quality metric (no more hardcoded 7.2)
  - [ ] Track quality score from each response
  - [ ] Calculate running average
  - [ ] Return actual metric
  - [ ] Test: `npm test -- -t "quality metrics"`

- [ ] Fix escalation rate (no more hardcoded 0.15)
  - [ ] Count escalation events
  - [ ] Calculate escalation rate
  - [ ] Return actual metric
  - [ ] Test: `npm test -- -t "escalation rate"`

- [ ] **Deadline**: Day 5-6
- [ ] **Owner**: Backend lead
- [ ] **Test**: `npm test src/core/modelRouter.test.ts`

### Model API IDs Validation
- [ ] Check current Anthropic SDK for model names
- [ ] Verify all 4 model IDs:
  - [ ] Haiku: claude-haiku-5-5 ✓ or ✗
  - [ ] Sonnet: claude-sonnet-5-5 ✓ or ✗
  - [ ] Opus: claude-opus-5-5 ✓ or ✗
  - [ ] Fable: claude-fable-5-1 ✓ or ✗
- [ ] Update if incorrect
- [ ] Make configurable via .env:
  ```env
  CLAUDE_HAIKU_MODEL=claude-haiku-5-5
  CLAUDE_SONNET_MODEL=claude-sonnet-5-5
  CLAUDE_OPUS_MODEL=claude-opus-5-5
  CLAUDE_FABLE_MODEL=claude-fable-5-1
  ```
- [ ] **Deadline**: Day 2-3
- [ ] **Owner**: Backend lead
- [ ] **Test**: `npm test:integration` (verify real API calls work)

### Phase 1 Sign-Off
- [ ] All three fixes committed
- [ ] Tests passing
- [ ] Code review approved
- [ ] Ready to proceed to Phase 2

---

## Phase 2: Infrastructure (Week 2-3)

### Redis Setup (Rate Limiting & Cache)
- [ ] Provision Redis instance
  - [ ] Development: Local or Redis Cloud
  - [ ] Staging: Managed instance
  - [ ] Production: Managed with replication
- [ ] Add redis npm package
- [ ] Implement distributed rate limiting:
  - [ ] checkRateLimit() uses Redis instead of in-memory Map
  - [ ] Support per-minute limit
  - [ ] Support per-hour limit
  - [ ] Support per-day limit
- [ ] Test rate limiting:
  - [ ] `npm test src/core/security.test.ts`
  - [ ] Verify all three limits enforced
- [ ] Implement cache (future use):
  - [ ] Cache key generation
  - [ ] Cache invalidation logic
- [ ] **Deadline**: Day 10-12
- [ ] **Owner**: DevOps + Backend
- [ ] **Test**: `npm test src/core/security.test.ts`

### Database Setup (Stats Persistence)
- [ ] Choose database: PostgreSQL or MongoDB
- [ ] Provision instance
- [ ] Create schema/collections:
  ```sql
  -- PostgreSQL example
  CREATE TABLE router_stats (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    total_requests INT,
    tokens_saved INT,
    cost_saved DECIMAL,
    model_distribution JSONB,
    average_quality DECIMAL,
    escalation_rate DECIMAL
  );
  
  CREATE TABLE router_requests (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP,
    user_id VARCHAR,
    task TEXT,
    model VARCHAR,
    tokens INT,
    cost DECIMAL,
    latency_ms INT,
    success BOOLEAN
  );
  ```
- [ ] Implement stats persistence:
  - [ ] Save stats every N minutes
  - [ ] Query stats across instances
  - [ ] Aggregate metrics
- [ ] Test persistence:
  - [ ] Restart server, verify stats preserved
  - [ ] `npm test src/integration.test.ts`
- [ ] **Deadline**: Day 12-14
- [ ] **Owner**: DevOps + Backend
- [ ] **Test**: Verify stats survive restart

### Phase 2 Sign-Off
- [ ] Redis running and accessible
- [ ] Database created and accessible
- [ ] Rate limiting tests passing
- [ ] Stats persistence tests passing
- [ ] Ready for Phase 3

---

## Phase 3: Security (Week 3-4)

### CORS Security
- [ ] Review current CORS configuration
- [ ] Create allowlist of valid origins
- [ ] Implement restricted CORS:
  ```typescript
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(','),
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
  }));
  ```
- [ ] Test CORS:
  - [ ] From allowed origin: ✓ request succeeds
  - [ ] From unknown origin: ✗ CORS error
  - [ ] Preflight requests: ✓ handled
- [ ] **Deadline**: Day 15
- [ ] **Owner**: Backend lead
- [ ] **Test**: Manual with curl/Postman

### API Key Authentication
- [ ] Design API key system
  - [ ] User registration/provisioning
  - [ ] Key generation
  - [ ] Key rotation
  - [ ] Key revocation
- [ ] Implement middleware:
  ```typescript
  app.use('/api', (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!validateApiKey(apiKey)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });
  ```
- [ ] Implement API key validation
- [ ] Add to all API routes (except /health)
- [ ] Test authentication:
  - [ ] With valid key: ✓ request succeeds
  - [ ] Without key: ✗ 401 error
  - [ ] With invalid key: ✗ 401 error
- [ ] **Deadline**: Day 16-17
- [ ] **Owner**: Backend lead + Security
- [ ] **Test**: `npm test src/api/rest.test.ts`

### Health Check Implementation
- [ ] Add comprehensive health check:
  ```typescript
  GET /api/health returns {
    status: "ok" | "degraded" | "down",
    timestamp: ISO8601,
    checks: {
      anthropic_api: { status, latency_ms },
      redis: { status, latency_ms },
      database: { status, latency_ms }
    }
  }
  ```
- [ ] Test each dependency:
  - [ ] Ping Anthropic API
  - [ ] Ping Redis
  - [ ] Ping database
- [ ] Handle timeout gracefully
- [ ] Test health checks:
  - [ ] All up: returns "ok"
  - [ ] One down: returns "degraded"
  - [ ] Multiple down: returns "down"
- [ ] **Deadline**: Day 18
- [ ] **Owner**: Backend lead
- [ ] **Test**: `npm test src/api/rest.test.ts`

### Complete Rate Limiting
- [ ] Ensure all three limits enforced:
  - [ ] Per-minute limit: 50
  - [ ] Per-hour limit: 1000
  - [ ] Per-day limit: 10000
- [ ] Test each limit:
  - [ ] Hit minute limit: get 429 error
  - [ ] Hit hour limit: get 429 error
  - [ ] Hit day limit: get 429 error
- [ ] Verify limits reset:
  - [ ] Minute: resets every 60 seconds
  - [ ] Hour: resets every 3600 seconds
  - [ ] Day: resets every 86400 seconds
- [ ] **Deadline**: Day 19
- [ ] **Owner**: Backend lead
- [ ] **Test**: `npm test src/core/security.test.ts`

### Phase 3 Sign-Off
- [ ] CORS restricted to allowlist
- [ ] API key authentication working
- [ ] Health check implemented with all dependencies
- [ ] All rate limits enforced
- [ ] Security tests passing
- [ ] Ready for Phase 4

---

## Phase 4: Load Testing (Week 4)

### Run Load Tests
```bash
npm run load-test
```

This generates 3 JSON files:
- `load-test-light.json` (10 concurrent, 100 requests)
- `load-test-medium.json` (50 concurrent, 500 requests)
- `load-test-heavy.json` (100 concurrent, 1000 requests)

### Analyze Results

#### Success Rate Target: > 99%
- [ ] Light: ___ % (target > 99%)
- [ ] Medium: ___ % (target > 99%)
- [ ] Heavy: ___ % (target > 99%)

#### Latency Targets
- [ ] P50 < 2 seconds
  - Light: ___ ms
  - Medium: ___ ms
  - Heavy: ___ ms
- [ ] P95 < 5 seconds
  - Light: ___ ms
  - Medium: ___ ms
  - Heavy: ___ ms
- [ ] P99 < 10 seconds
  - Light: ___ ms
  - Medium: ___ ms
  - Heavy: ___ ms

#### Throughput Target: > 50 req/sec
- [ ] Light: ___ req/sec (target > 50)
- [ ] Medium: ___ req/sec (target > 50)
- [ ] Heavy: ___ req/sec (target > 50)

### Fix Issues Found
- [ ] Identify breaking points
- [ ] Optimize hot paths
- [ ] Add caching if needed
- [ ] Increase timeouts if needed
- [ ] Rerun tests
- [ ] Verify improvements

### Phase 4 Sign-Off
- [ ] All load tests passing
- [ ] Latency targets met
- [ ] Success rate > 99%
- [ ] Ready for Phase 5

---

## Phase 5: Cache Implementation (Week 5)

### Add Cache to Router
- [ ] Implement cache key generation:
  ```typescript
  function getCacheKey(task: string, model: ModelTier): string {
    const hash = crypto.createHash('sha256').update(`${task}:${model}`).digest('hex');
    return `cache:${hash}`;
  }
  ```

- [ ] Check cache before routing:
  ```typescript
  const cached = await redis.get(getCacheKey(task, model));
  if (cached) {
    return JSON.parse(cached);
  }
  ```

- [ ] Save to cache after routing:
  ```typescript
  await redis.setex(getCacheKey(task, model), 86400, JSON.stringify(result));
  ```

- [ ] Set cache TTL:
  - [ ] Default: 24 hours
  - [ ] Configurable via env

- [ ] Test cache:
  - [ ] First request: miss (not cached)
  - [ ] Second identical request: hit (cached)
  - [ ] Verify 10-15% token reduction
  - [ ] Verify cost savings

### Phase 5 Sign-Off
- [ ] Cache implementation tested
- [ ] 10-15% token savings verified
- [ ] Load test re-run shows improvement
- [ ] Cache invalidation working

---

## Phase 6: Monitoring & Alerting (Week 6)

### Metrics Setup
- [ ] Expose Prometheus metrics:
  ```
  router_requests_total
  router_errors_total
  router_tokens_saved_total
  router_cost_total
  router_latency_p50/p95/p99
  router_cache_hit_ratio
  router_rate_limit_hits_total
  ```

- [ ] Setup metrics collection
  - [ ] DataDog OR Prometheus
  - [ ] Scrape every 60 seconds

### Alerting Setup
- [ ] Setup PagerDuty integration
- [ ] Create alerts for:
  - [ ] Error rate > 5%
  - [ ] P99 latency > 10s
  - [ ] Cache hit ratio < 5%
  - [ ] Rate limit hits increasing
  - [ ] API dependency down

### Dashboards
- [ ] Create Grafana/DataDog dashboard
  - [ ] Real-time metrics
  - [ ] Historical trends
  - [ ] Error breakdown
  - [ ] Model distribution
  - [ ] Cost tracking

### Phase 6 Sign-Off
- [ ] Metrics collection working
- [ ] Alerts functioning
- [ ] Dashboard created
- [ ] Team trained on monitoring

---

## Phase 7: Testing & Validation (Week 7)

### Test Coverage
- [ ] Run coverage report:
  ```bash
  npm test:coverage
  ```
  
- [ ] Verify targets met:
  - [ ] Statements: ≥ 70% (current: ___ %)
  - [ ] Branches: ≥ 65% (current: ___ %)
  - [ ] Functions: ≥ 70% (current: ___ %)
  - [ ] Lines: ≥ 70% (current: ___ %)

### Integration Testing
- [ ] Run full integration test suite:
  ```bash
  npm test:integration
  ```

- [ ] Verify all tests pass
- [ ] Document any API changes
- [ ] Create runbook for common issues

### Staging Validation
- [ ] Deploy to staging environment
- [ ] Run smoke tests:
  ```bash
  npm test
  npm test:integration
  npm run load-test
  ```

- [ ] Verify all endpoints work
- [ ] Verify monitoring working
- [ ] Verify alerting functional
- [ ] Performance acceptable

### Documentation
- [ ] API documentation complete
- [ ] Deployment runbook created
- [ ] Troubleshooting guide written
- [ ] Team training completed

### Phase 7 Sign-Off
- [ ] 70% test coverage achieved
- [ ] All tests passing
- [ ] Integration tests passing
- [ ] Load tests passing
- [ ] Staging environment validated
- [ ] Documentation complete
- [ ] Team trained
- [ ] Ready for production

---

## Phase 8: Production Deployment (Week 8)

### Pre-Deployment Review
- [ ] Security review: ✓ Passed
- [ ] Code review: ✓ Approved
- [ ] Load test: ✓ Passed
- [ ] Documentation: ✓ Complete
- [ ] Monitoring: ✓ Active
- [ ] Rollback plan: ✓ Documented

### Deployment
- [ ] Set feature flag (if using)
- [ ] Deploy to 1% of traffic (canary)
- [ ] Monitor for 1 hour
- [ ] No critical errors: proceed
- [ ] Deploy to 10% of traffic
- [ ] Monitor for 1 hour
- [ ] No issues: deploy to 100%
- [ ] Monitor continuously

### Post-Deployment
- [ ] Verify metrics looking good
- [ ] Check alerts not firing
- [ ] Verify token accuracy
- [ ] Verify cost calculations
- [ ] Monitor for 24 hours
- [ ] Gather user feedback
- [ ] Log successful deployment

### Phase 8 Sign-Off
- [ ] ✅ Successfully deployed to production
- [ ] ✅ All systems operational
- [ ] ✅ No critical issues
- [ ] ✅ Metrics acceptable
- [ ] ✅ Team confident
- [ ] ✅ Ready for use

---

## Critical Decision Points

### Week 1: Token Algorithm
- **Decision**: Which tokenization approach?
  - [ ] Use Anthropic API (if available)
  - [ ] Use js-tiktoken library
  - [ ] Build custom implementation
- **Impact**: Affects all downstream accuracy
- **Deadline**: Day 3
- **Owner**: ML + Backend lead

### Week 2: Database Choice
- **Decision**: PostgreSQL or MongoDB?
  - [ ] PostgreSQL (relational, good for structured data)
  - [ ] MongoDB (document, more flexible)
- **Impact**: Schema design, query patterns
- **Deadline**: Day 10
- **Owner**: Backend lead + DBA

### Week 3: Monitoring Platform
- **Decision**: DataDog, Prometheus, or other?
  - [ ] DataDog (enterprise, all-in-one)
  - [ ] Prometheus (open source, lightweight)
  - [ ] Other: ___
- **Impact**: Infrastructure costs, team familiarity
- **Deadline**: Day 15
- **Owner**: DevOps lead

### Week 4: Performance Optimization
- **Decision**: What to optimize if not meeting targets?
  - [ ] Caching strategy
  - [ ] Model selection algorithm
  - [ ] Request batching
  - [ ] Connection pooling
- **Impact**: Architecture changes
- **Deadline**: Day 28
- **Owner**: Backend lead + ML

---

## Success Metrics (Week 8)

### Technical Metrics
- [ ] ✅ Test coverage ≥ 70%
- [ ] ✅ Token accuracy ±5%
- [ ] ✅ P95 latency < 5 seconds
- [ ] ✅ Error rate < 0.1%
- [ ] ✅ Success rate > 99%
- [ ] ✅ All critical issues fixed
- [ ] ✅ Load test passing (100+ concurrent)

### Business Metrics
- [ ] ✅ Actual token savings ≥ 30% (validated)
- [ ] ✅ Cost reduction validated
- [ ] ✅ Zero security incidents
- [ ] ✅ Deployed to production
- [ ] ✅ User satisfaction > 4.5/5

### Operational Metrics
- [ ] ✅ Monitoring & alerting active
- [ ] ✅ Runbooks documented
- [ ] ✅ Team trained
- [ ] ✅ Incident response plan ready
- [ ] ✅ 24/7 on-call schedule

---

## Weekly Sign-Off Template

```markdown
## Week X - Phase Y
**Completed**:
- [ ] Feature 1
- [ ] Feature 2
- [ ] Testing

**Blockers**:
- None / (describe)

**Metrics**:
- Test Coverage: X%
- Load Test P95: Y ms
- Error Rate: Z%

**Next Week**:
- Task 1
- Task 2

**Owner**: [Name]
**Approver**: [Manager]
```

---

## Emergency Procedures

### If Token Estimation Still Inaccurate (Week 2)
1. Reduce accuracy target to ±10%
2. Add disclaimer to UI
3. Plan for Phase 2 improvement
4. Document accuracy limitations

### If Load Test Failing (Week 4)
1. Identify bottleneck (CPU? Memory? I/O?)
2. Profile application
3. Implement fix
4. Rerun tests
5. If still failing, increase resource allocation

### If Security Issue Found (Any Week)
1. Stop deployment immediately
2. Assess severity (critical/high/medium)
3. Plan fix (schedule & owner)
4. Implement fix with testing
5. Resume deployment when clear

### If Database Goes Down (Production)
1. Fallback to in-memory stats (existing behavior)
2. Page on-call engineer
3. Restore database
4. Verify data consistency
5. Post-incident review

---

## Resources & Contacts

### Team Leads
- **Backend**: [Name] - Backend logic, API implementation
- **DevOps**: [Name] - Infrastructure, monitoring
- **ML**: [Name] - Token counting, model selection
- **Security**: [Name] - Security review, compliance
- **QA**: Claude (Haiku 4.5) - Testing strategy, validation

### External Dependencies
- Anthropic Support: [contact]
- PagerDuty: [account info]
- DataDog: [account info]
- Redis: [instance info]
- PostgreSQL: [instance info]

### Escalation Path
1. Issue → Relevant team lead
2. Blocker → Engineering manager
3. Critical → VP Engineering
4. Production incident → On-call

---

## Final Notes

This checklist is comprehensive but flexible. Adjust based on:
- Team capacity
- Dependencies availability
- Business priorities
- Unexpected issues

Review and update weekly during standup.

**Good luck! 🚀**

