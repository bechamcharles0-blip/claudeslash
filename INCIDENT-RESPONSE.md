# Incident Response Playbook

Procedures for responding to production incidents.

---

## Incident Severity Levels

### SEV-1 (Critical)
- **Definition:** Service completely down or unusable
- **SLA:** Response < 5 min, Resolution < 15 min
- **Examples:** API not responding, data loss, security breach
- **Actions:** Full escalation, all hands on deck

### SEV-2 (High)
- **Definition:** Significant degradation, partial outage
- **SLA:** Response < 15 min, Resolution < 1 hour
- **Examples:** High error rate (>10%), high latency (>5s)
- **Actions:** Escalate to senior engineer

### SEV-3 (Medium)
- **Definition:** Service working with issues
- **SLA:** Response < 1 hour, Resolution < 4 hours
- **Examples:** Memory leak, slow queries, cache issues
- **Actions:** Assign to on-call engineer

### SEV-4 (Low)
- **Definition:** Minor issues, cosmetic bugs
- **SLA:** Response < 8 hours, Resolution < 2 days
- **Examples:** Documentation typos, minor UI issues
- **Actions:** Add to backlog, handle in normal sprint

---

## Alert Runbook

### Alert: High Error Rate (>5%)

**Trigger:**
```promql
(sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)) 
/ (sum(rate(http_requests_total[5m])) by (job)) > 0.05
```

**Severity:** SEV-2

**Diagnosis:**

```bash
# 1. Check pod status
kubectl get pods -n claude-router
kubectl describe pod <pod-name> -n claude-router

# 2. Check logs for errors
kubectl logs -f deployment/claude-router-api -n claude-router | grep -i error

# 3. Check Prometheus metrics
# Query: errors_total{job="claude-router-api"}
# Query: error_rate{job="claude-router-api"}

# 4. Check recent deployments
kubectl rollout history deployment/claude-router-api -n claude-router

# 5. Check API endpoint directly
curl http://localhost:3000/api/health
curl http://localhost:3000/api/models
```

**Root Causes:**

- **API key expired or invalid**
  - Check: `echo $ANTHROPIC_API_KEY`
  - Fix: `kubectl set env deployment/claude-router-api ANTHROPIC_API_KEY=<new-key> -n claude-router`

- **Anthropic API rate limited**
  - Check: Prometheus metric `anthropic_api_rate_limit_remaining`
  - Fix: Temporarily reduce load or increase cache TTL

- **Redis connection down**
  - Check: `kubectl logs deployment/redis -n claude-router`
  - Fix: Restart Redis or check network connectivity

- **Recent deployment issue**
  - Check: Last deployment timestamp vs error start time
  - Fix: Rollback: `kubectl rollout undo deployment/claude-router-api -n claude-router`

**Mitigation Steps:**

```bash
# 1. Increase replicas temporarily
kubectl scale deployment claude-router-api --replicas=20 -n claude-router

# 2. Check cache hit rate
redis-cli INFO stats | grep keyspace_hits

# 3. Clear problematic cache entries
redis-cli KEYS "cache:*" | xargs redis-cli DEL

# 4. Monitor metrics
watch -n 1 'curl -s http://localhost:9090/api/v1/query?query=error_rate | jq .data.result'

# 5. Escalate if not resolved in 5 minutes
# PagerDuty: Escalate to on-call senior engineer
```

**Resolution:**

```bash
# Once issue is identified:

# For API key issue
kubectl set env deployment/claude-router-api ANTHROPIC_API_KEY=<valid-key> -n claude-router

# For rate limiting
kubectl set env deployment/claude-router-api CACHE_TTL_SECONDS=7200 -n claude-router

# For Redis issue
kubectl rollout restart deployment/redis -n claude-router

# Verify fix
kubectl logs -f deployment/claude-router-api -n claude-router
curl http://localhost:3000/api/health
```

---

### Alert: High Latency (P95 > 2s)

**Trigger:**
```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2
```

**Severity:** SEV-2

**Diagnosis:**

```bash
# 1. Check resource utilization
kubectl top pods -n claude-router

# 2. Check if pods are throttled
kubectl describe node

# 3. Check Redis performance
redis-cli SLOWLOG GET 10

# 4. Check network latency
kubectl exec -it <pod-name> -n claude-router -- ping redis.claude-router.svc.cluster.local

# 5. Check Prometheus queries
# Query: http_request_duration_seconds_bucket
# Query: redis_command_duration_seconds_bucket
```

**Root Causes:**

- **High load, insufficient replicas**
  - Check: HPA status
  - Fix: Scale up manually if HPA not working

- **Redis slow queries**
  - Check: `redis-cli SLOWLOG GET`
  - Fix: Clear cache or analyze slow patterns

- **Anthropic API slow responses**
  - Check: Check external service status
  - Fix: Use lower-tier models temporarily

- **Network issues**
  - Check: Pod networking and DNS resolution
  - Fix: Restart pods and check CNI plugin

**Mitigation Steps:**

```bash
# 1. Increase resources temporarily
kubectl set resources deployment claude-router-api \
  -n claude-router \
  --limits=cpu=2000m,memory=1Gi

# 2. Scale up pods
kubectl scale deployment claude-router-api --replicas=30 -n claude-router

# 3. Clear Redis cache
redis-cli FLUSHDB

# 4. Monitor latency
watch -n 1 'curl -s "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,http_request_duration_seconds)" | jq'
```

**Resolution:**

Once identified, apply appropriate fix:

```bash
# For resource constraints
kubectl patch deployment claude-router-api -n claude-router -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"claude-router","resources":{"requests":{"cpu":"500m","memory":"512Mi"}}}]}}}}'

# For Anthropic API slowness
kubectl set env deployment/claude-router-api \
  DEFAULT_MODEL=haiku \  # Use faster model
  -n claude-router

# For Redis issues
kubectl rollout restart deployment/redis -n claude-router
```

---

### Alert: Pod Restarting Too Often

**Trigger:**
```promql
rate(kube_pod_container_status_restarts_total[1h]) > 0
```

**Severity:** SEV-2

**Diagnosis:**

```bash
# 1. Check pod restart count
kubectl get pods -n claude-router -o json | jq '.items[].status.containerStatuses[] | {name, restartCount}'

# 2. Check pod events
kubectl describe pod <pod-name> -n claude-router

# 3. Check logs
kubectl logs <pod-name> -n claude-router --previous  # Previous container log
kubectl logs <pod-name> -n claude-router -c claude-router

# 4. Check for OOMKilled
kubectl get events -n claude-router | grep -i oomkilled
```

**Root Causes:**

- **Out of Memory (OOMKilled)**
  - Check: `kubectl get events | grep OOMKilled`
  - Fix: Increase memory limits or reduce cache size

- **Readiness probe failing**
  - Check: Pod logs, health check endpoint
  - Fix: Adjust probe settings or fix health check

- **Application crash**
  - Check: Error logs, stack traces
  - Fix: Fix application bug or rollback

**Mitigation Steps:**

```bash
# 1. Increase memory if OOMKilled
kubectl set resources deployment claude-router-api \
  -n claude-router \
  --limits=memory=2Gi

# 2. Check health endpoint
curl http://localhost:3000/api/health

# 3. Adjust readiness probe timing
kubectl patch deployment claude-router-api -n claude-router --type='json' -p='[
  {
    "op": "replace",
    "path": "/spec/template/spec/containers/0/readinessProbe/initialDelaySeconds",
    "value": 30
  }
]'

# 4. Monitor for stability
kubectl get pods -n claude-router --watch
```

---

### Alert: Redis Down

**Trigger:**
```promql
up{job="redis"} == 0
```

**Severity:** SEV-1

**Diagnosis:**

```bash
# 1. Check Redis pod
kubectl get pods -n claude-router -l app=redis

# 2. Check pod status
kubectl describe pod <redis-pod> -n claude-router

# 3. Check logs
kubectl logs <redis-pod> -n claude-router

# 4. Test connection
kubectl exec -it <api-pod> -n claude-router -- redis-cli -h redis ping

# 5. Check Redis memory
redis-cli INFO memory
```

**Root Causes:**

- **Pod crashed**
  - Check: Logs and events
  - Fix: Investigate crash and restart

- **Memory exhausted**
  - Check: `redis-cli INFO memory | grep used_memory_human`
  - Fix: Increase memory limit or clear cache

- **Network connectivity**
  - Check: DNS resolution, network policies
  - Fix: Check service and network config

**Mitigation Steps:**

```bash
# 1. IMMEDIATE: Try graceful restart
kubectl rollout restart deployment/redis -n claude-router

# 2. Check health
kubectl wait --for=condition=ready pod -l app=redis -n claude-router --timeout=60s

# 3. Test connection
kubectl exec -it <api-pod> -n claude-router -- redis-cli -h redis ping

# 4. If still failing, restore from backup
kubectl exec -it <redis-pod> -n claude-router -- redis-cli BGREWRITEAOF

# 5. Scale up API instances to reduce Redis load
kubectl scale deployment claude-router-api --replicas=50 -n claude-router
```

---

### Alert: SLO Breach (P99 > 3 seconds)

**Trigger:**
```promql
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 3
```

**Severity:** SEV-1 (if sustained), SEV-2 (if occasional)

**Diagnosis:**

```bash
# 1. Check error rate
curl http://localhost:9090/api/v1/query?query=error_rate

# 2. Check resource usage
kubectl top pods -n claude-router

# 3. Check Anthropic API status
# Visit: https://status.anthropic.com

# 4. Check recent changes
git log --oneline -20

# 5. Review slow request logs
kubectl logs deployment/claude-router-api -n claude-router | grep "duration"
```

**Root Causes:**

- **Anthropic API slow**
  - Check: External service status
  - Mitigation: Route to local cache or fallback model

- **Infrastructure overloaded**
  - Check: Node resources
  - Mitigation: Scale up cluster or pods

- **Inefficient queries**
  - Check: Cache hit rate
  - Mitigation: Optimize cache key generation

**Mitigation Steps:**

```bash
# 1. Scale up immediately
kubectl scale deployment claude-router-api --replicas=40 -n claude-router

# 2. Increase cache TTL
kubectl set env deployment/claude-router-api \
  CACHE_TTL_SECONDS=7200 \
  -n claude-router

# 3. Route to faster models
kubectl set env deployment/claude-router-api \
  DEFAULT_MODEL=haiku \
  -n claude-router

# 4. Monitor recovery
watch -n 2 'curl -s "http://localhost:9090/api/v1/query?query=histogram_quantile(0.99,http_request_duration_seconds)" | jq'
```

---

## Escalation Matrix

```
Incident → Severity Check → On-Call Assignment → Escalation Path

SEV-1 (Critical)
├─ Immediate: All hands on deck
├─ Notify: Team lead + VP Engineering
├─ Escalate after 10 min if unresolved: VP Engineering + CTO
└─ Communication: Update status every 5 minutes

SEV-2 (High)
├─ 15 min: Senior engineer takes ownership
├─ Notify: Team lead
├─ Escalate after 30 min if unresolved: VP Engineering
└─ Communication: Update status every 15 minutes

SEV-3 (Medium)
├─ 1 hour: Assign to available engineer
├─ Notify: Team lead (at end of day)
├─ Escalate after 4 hours: Team lead
└─ Communication: Daily standup update

SEV-4 (Low)
├─ Add to backlog
├─ Plan for next sprint
└─ No immediate action required
```

---

## Post-Incident Review

After any SEV-1 or SEV-2 incident:

1. **Timeline** (30 min after resolution)
   - Document exact incident timeline
   - Note detection time vs actual failure time
   - Identify detection gaps

2. **Root Cause Analysis** (next business day)
   - What actually failed?
   - Why did it fail?
   - Why wasn't it caught earlier?

3. **Action Items** (same day)
   - What can prevent this in future?
   - Who owns each action?
   - Timeline for completion

4. **Communication**
   - Send to team Slack channel
   - Include in weekly standup
   - Share learnings across teams

**Template:**

```
# Incident Report: <Date> <Time>

## Summary
<Brief description of what happened>

## Impact
- Duration: X minutes
- Users affected: X
- Error rate: X%
- Revenue impact: $X

## Timeline
- 14:30 - Alert triggered
- 14:35 - On-call engineer acknowledged
- 14:40 - Root cause identified
- 14:50 - Fix deployed
- 15:00 - Service recovered

## Root Cause
<Technical explanation of what failed>

## Why We Didn't Catch It
<Detection/monitoring gaps>

## Action Items
- [ ] Action 1 (Owner, Deadline)
- [ ] Action 2 (Owner, Deadline)
- [ ] Action 3 (Owner, Deadline)

## Lessons Learned
1. <Learning>
2. <Learning>
3. <Learning>
```

---

## Contact Information

**On-Call Schedule:** [PagerDuty Link]

**Emergency Contacts:**
- DevOps Lead: +1-XXX-XXX-XXXX
- Engineering Manager: +1-XXX-XXX-XXXX
- VP Engineering: +1-XXX-XXX-XXXX

**Channels:**
- #incidents - Real-time incident discussion
- #infrastructure - Infrastructure updates
- #deployments - Deployment notifications

---

**Last Updated:** 2026-10-21
