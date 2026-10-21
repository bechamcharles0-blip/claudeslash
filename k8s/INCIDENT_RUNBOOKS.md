# Claude Router Incident Runbooks

Production runbooks for common failure scenarios. All procedures assume `kubectl` access to the production cluster.

## Table of Contents

1. [Redis Cluster Node Failure](#redis-cluster-node-failure)
2. [PostgreSQL Data Corruption](#postgresql-data-corruption)
3. [API Pod Cascading Failures](#api-pod-cascading-failures)
4. [Database Connection Pool Exhaustion](#database-connection-pool-exhaustion)
5. [Network Partition / Connectivity Loss](#network-partition--connectivity-loss)
6. [HPA Stuck or Not Scaling](#hpa-stuck-or-not-scaling)
7. [High Request Latency](#high-request-latency)
8. [Out of Memory (OOM) Killer](#out-of-memory-oom-killer)
9. [Storage Volume Full](#storage-volume-full)
10. [Cluster Upgrade Gone Wrong](#cluster-upgrade-gone-wrong)

---

## 1. Redis Cluster Node Failure

### Severity: HIGH (impacts cache layer, potential 5-10% request failures)

### Detection

```bash
# Alert: RedisClusterNodeDown (Prometheus alert fires when nodes < 6)
# OR manual check:
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "$(kubectl get secret redis-cluster-secret -n claude-router -o jsonpath='{.data.redis-password}' | base64 -d)" \
  cluster info | grep cluster_state

# Should show: cluster_state:ok
# If cluster_state:fail → node down
```

### Diagnosis

```bash
# Check which node is down
kubectl get pods -n claude-router -l app=redis-cluster

# Check pod events
kubectl describe pod redis-cluster-N -n claude-router

# Check logs
kubectl logs redis-cluster-N -n claude-router

# Check Redis cluster status
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" cluster nodes | grep fail

# Check replication status
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" info replication
```

### Resolution

#### Option 1: Automatic Pod Restart (Recommended - 90% success rate)

```bash
# Delete the failed pod (StatefulSet will restart it automatically)
kubectl delete pod redis-cluster-N -n claude-router

# Monitor recovery (typically 2-5 minutes)
kubectl logs -f redis-cluster-N -n claude-router
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" cluster info | grep cluster_state

# Verify all 6 nodes connected
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" cluster nodes | wc -l
# Should show 6 lines (6 nodes)
```

#### Option 2: Manual Node Recovery (if automatic restart fails)

```bash
# Check if PVC is still intact
kubectl get pvc -n claude-router | grep redis-cluster-N

# If PVC missing, recreate:
kubectl delete statefulset redis-cluster -n claude-router
kubectl apply -f k8s/01-redis-cluster.yaml
# WARNING: All Redis data will be lost! Ensure PostgreSQL backup exists.

# If PVC exists, scale up StatefulSet
kubectl scale statefulset redis-cluster --replicas=0 -n claude-router
sleep 30
kubectl scale statefulset redis-cluster --replicas=6 -n claude-router

# Monitor startup logs
kubectl logs -f redis-cluster-0 -n claude-router
```

#### Option 3: Replace Failed Node Completely

```bash
# For corrupted node (not just restart)
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" cluster forget <node-id>

# Delete PVC to force recreation
kubectl delete pvc redis-data-redis-cluster-N -n claude-router

# Pod will restart with clean state
kubectl delete pod redis-cluster-N -n claude-router

# Wait for PVC to be recreated
kubectl get pvc -n claude-router | grep redis-cluster-N

# Wait for pod to join cluster (should happen automatically)
sleep 60
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" cluster nodes | grep redis-cluster-N
```

### Prevention

```bash
# Monitor node restarts
kubectl get pods -n claude-router -l app=redis-cluster -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].restartCount}{"\n"}{end}'

# If restart count > 2 in 1 hour → investigate storage or network issues
# Check PVC capacity
kubectl get pvc redis-data-* -n claude-router

# Check node resource pressure
kubectl describe nodes | grep -A 5 "Pressure\|Allocatable"
```

### SLA Impact

- **Impact**: 5-10% request failures during failover
- **Duration**: 2-5 minutes (automatic recovery)
- **User-facing**: Errors in cache operations, but API continues
- **Recovery time objective (RTO)**: 5 minutes
- **Recovery point objective (RPO)**: 0 (no data loss)

---

## 2. PostgreSQL Data Corruption

### Severity: CRITICAL (potential data loss)

### Detection

```bash
# Monitoring alerts:
# - Postgres crash restarts
# - pg_dump fails
# - SELECT queries timeout

# Manual check
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "SELECT datname FROM pg_database;" 

# If connection fails: data corruption likely

# Check WAL integrity
kubectl exec -it deployment/postgres -n claude-router -- \
  pg_controldata /var/lib/postgresql/data/pgdata | grep "Database cluster state"
# Should show: in production
# If shows: shut down in recovery → corruption suspected
```

### Diagnosis

```bash
# Check PostgreSQL logs for errors
kubectl logs deployment/postgres -n claude-router | tail -100 | grep -i "error\|corrupt\|fatal"

# Try to connect and query
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "\d" 2>&1 | head -20

# Check disk space
kubectl exec -it deployment/postgres -n claude-router -- \
  df -h /var/lib/postgresql/data

# Check PVC status
kubectl get pvc postgres-pvc -n claude-router -o yaml
```

### Resolution

#### Option 1: Restart PostgreSQL (if safe)

```bash
# This may auto-recover from corruption in some cases
kubectl delete pod -l app=postgres -n claude-router

# Monitor startup
kubectl logs -f deployment/postgres -n claude-router | head -50

# Test connection
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "SELECT 1"
```

#### Option 2: Restore from Backup

```bash
# Find latest backup
ls -lt backups/postgres* | head -5

# Copy backup into pod
kubectl cp ./backup.sql postgres-pod:/tmp/ -n claude-router

# Restore
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -f /tmp/backup.sql

# Verify
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "SELECT count(*) FROM analytics_events;"
```

#### Option 3: Full PVC Replacement (Last Resort)

```bash
# Delete deployment and PVC
kubectl delete deployment postgres -n claude-router
kubectl delete pvc postgres-pvc -n claude-router

# Create from backup (if automated backup exists)
# OR re-initialize from k8s manifest
kubectl apply -f k8s/02-postgresql.yaml

# WARNING: All recent data since last backup is lost
```

### Prevention

```bash
# Schedule daily backups
kubectl create cronjob postgres-backup --image=postgres:15-alpine \
  --schedule="0 2 * * *" \
  -- /bin/sh -c 'pg_dump -U postgres postgresql://postgres/claude_router_analytics > /backup/$(date +%Y%m%d-%H%M%S).sql'

# Backup to S3 with retention
aws s3 cp backup.sql s3://claude-router-backups/postgres/

# Enable PostgreSQL checksum verification
# (Requires DB restart: fsync=on, full_page_writes=on)

# Monitor WAL archiving
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "SHOW wal_level;" # Should be 'replica' or higher
```

### SLA Impact

- **Impact**: Complete API outage (cannot write analytics)
- **Duration**: 15-60 minutes (depending on backup size)
- **User-facing**: API may still work, but analytics not recorded
- **RTO**: 30 minutes
- **RPO**: Last 24-hour backup (potentially 24h data loss)

---

## 3. API Pod Cascading Failures

### Severity: CRITICAL (API completely down)

### Detection

```bash
# Alert: HighErrorRate (>5% errors) OR PodRestartingTooOften
# Manual check
kubectl get pods -n claude-router -l app=claude-router-api

# If all pods CrashLoopBackOff or Pending:
# Check pod events
kubectl describe pod claude-router-api-XXX -n claude-router

# Check logs for common errors
kubectl logs claude-router-api-XXX -n claude-router --tail=50
# Look for: "Cannot connect to Redis", "ECONNREFUSED", "OutOfMemory"
```

### Diagnosis

```bash
# Check why pods aren't starting
kubectl get events -n claude-router --sort-by='.lastTimestamp' | tail -20

# Check pod resource requests vs node availability
kubectl top nodes
kubectl top pods -n claude-router

# Check Redis connectivity
kubectl exec -it redis-cluster-0 -n claude-router -- redis-cli ping

# Check PostgreSQL connectivity
kubectl exec -it deployment/postgres -n claude-router -- psql -U postgres -c "SELECT 1"

# Check for OOM
kubectl get pods -n claude-router -o json | jq '.items[].status.containerStatuses[] | select(.lastState.terminated.reason=="OOMKilled")'

# Check for init container failures
kubectl describe pod claude-router-api-0 -n claude-router | grep -A 10 "Init Containers"
```

### Resolution

#### Option 1: Address Underlying Cause

```bash
# If Redis not available:
kubectl get pods -n claude-router -l app=redis-cluster
# If Redis down, refer to Section 1 (Redis Cluster Node Failure)

# If PostgreSQL not available:
kubectl get pods -n claude-router -l app=postgres
# If Postgres down, refer to Section 2 (PostgreSQL Data Corruption)

# If insufficient cluster resources:
kubectl describe nodes | grep -B 5 "MemoryPressure\|DiskPressure"
# Add more nodes or scale down other workloads
```

#### Option 2: Force Pod Restart

```bash
# Delete all pods (Deployment will recreate)
kubectl delete pods -n claude-router -l app=claude-router-api

# Monitor restart
kubectl get pods -n claude-router -l app=claude-router-api -w

# Check if healthy
kubectl exec -it claude-router-api-0 -n claude-router -- curl -s http://localhost:3000/api/health
```

#### Option 3: Rollback to Previous Version

```bash
# Check rollout history
kubectl rollout history deployment/claude-router-api -n claude-router

# Rollback to previous version
kubectl rollout undo deployment/claude-router-api -n claude-router

# Verify
kubectl rollout status deployment/claude-router-api -n claude-router
```

#### Option 4: Emergency Bypass (Temporary)

```bash
# If API depends on Redis and Redis is totally broken:
# Set environment variable to use in-process cache instead
kubectl set env deployment/claude-router-api \
  REDIS_DISABLED=true \
  -n claude-router

# This is temporary! In-process cache will be lost on pod restart.
# Fix underlying Redis issue while API is up.
```

### Prevention

```bash
# Set resource requests correctly
# Current: 512Mi memory request, 500m CPU request
# If seeing crashes, increase:
kubectl set resources deployment claude-router-api \
  -n claude-router \
  -c=claude-router \
  --requests=memory=768Mi,cpu=750m

# Enable liveness probe to restart unhealthy pods
# Already configured in 03-claude-router-api.yaml

# Monitor pod restart rate
# Alert if restarts > 1 per hour
```

### SLA Impact

- **Impact**: Complete API outage
- **Duration**: 5-30 minutes (depending on root cause)
- **User-facing**: 100% request failures
- **RTO**: 15 minutes
- **RPO**: N/A (stateless service)

---

## 4. Database Connection Pool Exhaustion

### Severity: HIGH (slow requests, timeouts)

### Detection

```bash
# Alert: PostgresConnectionPoolExhausted (>80% of max connections)
# Prometheus query:
# pg_stat_activity_count / pg_settings_max_connections > 0.8

# Manual check
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# If returning ~90+ (default max_connections=100):
# Connection pool is near limit

# Check idle connections (candidates for killing)
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT pid, usename, application_name, state, state_change 
  FROM pg_stat_activity 
  WHERE state='idle' 
  ORDER BY state_change DESC 
  LIMIT 20;"
```

### Diagnosis

```bash
# Check which app is consuming connections
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT application_name, count(*) as conn_count 
  FROM pg_stat_activity 
  GROUP BY application_name 
  ORDER BY conn_count DESC;"

# Check for long-running queries holding connections
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT pid, usename, query_start, query 
  FROM pg_stat_activity 
  WHERE state != 'idle' 
  ORDER BY query_start ASC;"

# Check API replica count (indicates concurrent requests)
kubectl get deployment claude-router-api -n claude-router -o wide
```

### Resolution

#### Option 1: Kill Idle Connections

```bash
# Kill idle connections older than 10 minutes
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE state='idle' 
  AND state_change < NOW() - INTERVAL '10 minutes'
  AND application_name != 'pg_dumpall';"

# Monitor impact
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

#### Option 2: Increase Connection Pool Size

```bash
# In deployment, increase connection pool size
kubectl set env deployment/claude-router-api \
  POSTGRES_POOL_SIZE=50 \
  -n claude-router

# Also increase PostgreSQL max_connections
# This requires PostgreSQL restart
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "ALTER SYSTEM SET max_connections = 200;"

# Restart PostgreSQL
kubectl delete pod -l app=postgres -n claude-router

# Verify change persisted
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "SHOW max_connections;"
```

#### Option 3: Enable Connection Pooling (PgBouncer)

```bash
# Deploy PgBouncer as sidecar or separate pod
# PgBouncer multiplexes connections to PostgreSQL
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pgbouncer
  namespace: claude-router
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pgbouncer
  template:
    metadata:
      labels:
        app: pgbouncer
    spec:
      containers:
      - name: pgbouncer
        image: pgbouncer:1.17
        ports:
        - containerPort: 6432
        env:
        - name: DATABASES_HOST
          value: postgres
        - name: DATABASES_PORT
          value: "5432"
        - name: DATABASES_USER
          value: postgres
        - name: DATABASES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: postgres-password
---
apiVersion: v1
kind: Service
metadata:
  name: pgbouncer
  namespace: claude-router
spec:
  selector:
    app: pgbouncer
  ports:
  - port: 6432
    targetPort: 6432
EOF

# Update API to use PgBouncer
kubectl set env deployment/claude-router-api \
  POSTGRES_HOST=pgbouncer \
  POSTGRES_PORT=6432 \
  -n claude-router
```

### Prevention

```bash
# Monitor connection count trend
# Create Prometheus query:
# rate(pg_stat_activity_count[5m])

# Alert on:
# - Connection count > 80% of max
# - Connection growth rate > 10 connections/min

# Review and optimize slow queries
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT query, mean_time, calls 
  FROM pg_stat_statements 
  ORDER BY mean_time DESC 
  LIMIT 10;"

# Add indexes for slow queries (if missing)
```

### SLA Impact

- **Impact**: Slow requests, request timeouts
- **Duration**: 5-30 minutes (until manual intervention)
- **User-facing**: Degraded API performance
- **RTO**: 15 minutes
- **RPO**: N/A (data consistent)

---

## 5. Network Partition / Connectivity Loss

### Severity: CRITICAL (potential data inconsistency)

### Detection

```bash
# Alert: High error rate + API unable to reach Redis/Postgres
# Manual check
kubectl exec -it claude-router-api-0 -n claude-router -- \
  curl -v redis-cluster:6379 2>&1 | grep -i "connection"

# Check network policies
kubectl get networkpolicy -n claude-router

# Check service DNS resolution
kubectl exec -it claude-router-api-0 -n claude-router -- \
  nslookup postgres.claude-router.svc.cluster.local

# Check network connectivity
kubectl exec -it claude-router-api-0 -n claude-router -- \
  ping -c 3 postgres.claude-router.svc.cluster.local
```

### Diagnosis

```bash
# Check if pods are on different nodes
kubectl get pods -n claude-router -o wide | grep -E "claude-router-api|redis|postgres"

# If all on same node → unlikely to be network partition
# If spread across nodes → check inter-node connectivity

# Check node network status
kubectl get nodes -o wide
# Look for NotReady nodes

# Check iptables rules (might be blocking traffic)
kubectl exec -it <node> -- iptables -L -n | grep -i docker

# Check security groups (if on AWS)
aws ec2 describe-security-groups --filters Name=group-name,Values=cluster-sg

# Check network policies
kubectl get networkpolicy -n claude-router -o yaml | grep -A 10 "ingress\|egress"
```

### Resolution

#### Option 1: Restart Networking (if single node issue)

```bash
# If only one pod can't reach others:
kubectl delete pod <pod-name> -n claude-router
# Pod will restart and potentially get different network config

# Verify networking
kubectl exec -it <new-pod> -n claude-router -- \
  ping postgres.claude-router.svc.cluster.local
```

#### Option 2: Relax Network Policies (temporary)

```bash
# List current policies
kubectl get networkpolicy -n claude-router

# If too restrictive, delete problematic policy
kubectl delete networkpolicy <policy-name> -n claude-router

# This is temporary! Re-enable after verification

# See 05-ingress.yaml for proper network policies
```

#### Option 3: Restart Nodes (if persistent partition)

```bash
# If network partition persists across pods:
# Restart affected node (causes 30-60s downtime)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Restart node (via cloud console or SSH)
# Wait for node to rejoin

# Undrain node
kubectl uncordon <node-name>

# Verify clustering
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli cluster info
```

#### Option 4: Rebuild Cluster Network

```bash
# Last resort - restart cluster networking
# This is disruptive - only for critical issues

# Restart CNI plugin (varies by CNI):
# For Calico:
kubectl restart deployment -n calico-system

# For Flannel:
kubectl restart daemonset -n kube-flannel

# Monitor pod restarts during network restart
watch kubectl get pods -n claude-router
```

### Prevention

```bash
# Use node affinity to keep critical components on different nodes
# Already configured in deployments

# Monitor network latency
# Add metric: ping latency between nodes

# Test network resilience regularly
# Chaos engineering: simulate network partitions
# Tools: Gremlin, Chaos Monkey, kube-chaosmonkey

# Review security groups/firewalls before deploying
```

### SLA Impact

- **Impact**: API timeouts, potential data loss
- **Duration**: 5-60 minutes (depending on partition type)
- **User-facing**: Complete outage or severe degradation
- **RTO**: 30 minutes
- **RPO**: Potential 5-minute data loss (in-flight requests)

---

## 6. HPA Stuck or Not Scaling

### Severity: MEDIUM (unable to handle load spike)

### Detection

```bash
# Alert: HPA not responding to load increase
# Manual check
kubectl get hpa -n claude-router

# Example output shows TARGETS:
# If showing <unknown> → metrics not available

kubectl describe hpa claude-router-api-hpa -n claude-router

# Check recent scaling events
kubectl get events -n claude-router --sort-by='.lastTimestamp' | grep -i "scaling\|hpa"
```

### Diagnosis

```bash
# Check if metrics are available
kubectl get hpa claude-router-api-hpa -n claude-router -o yaml | grep -A 10 "metrics:"

# Verify Prometheus has the custom metrics
kubectl port-forward -n claude-router-monitoring svc/prometheus 9090:9090
# Visit: http://localhost:9090
# Search for: http_requests_per_second, http_request_duration_seconds

# Check HPA status
kubectl describe hpa claude-router-api-hpa -n claude-router | grep -A 20 "Conditions:"

# Increase log verbosity (temporary)
kubectl set env deployment/claude-router-api \
  LOG_LEVEL=debug \
  -n claude-router
```

### Resolution

#### Option 1: Ensure Metrics Are Available

```bash
# If custom metrics missing, verify pod is exporting metrics
kubectl exec -it claude-router-api-0 -n claude-router -- \
  curl -s http://localhost:3000/metrics | head -20

# If /metrics endpoint is empty or missing:
# - Check app code has Prometheus client library
# - Check app is exporting http_requests_per_second metric
# - Restart pod to reload code

# Verify Prometheus scrape config
kubectl get configmap prometheus-config -n claude-router-monitoring -o yaml | grep -A 20 "claude-router-api"

# Restart Prometheus to reload config
kubectl delete pod -l app=prometheus -n claude-router-monitoring
```

#### Option 2: Manually Trigger Scaling

```bash
# While HPA is stuck, manually scale to handle load
kubectl scale deployment claude-router-api --replicas=20 -n claude-router

# Monitor latency/errors while scaled up
kubectl logs -f deployment/claude-router-api -n claude-router | grep -i "error\|latency"

# Once fixed, reset to minReplicas
kubectl scale deployment claude-router-api --replicas=3 -n claude-router
```

#### Option 3: Restart HPA

```bash
# Delete HPA object
kubectl delete hpa claude-router-api-hpa -n claude-router

# Reapply
kubectl apply -f k8s/04-hpa.yaml

# Verify
kubectl get hpa -n claude-router -w
```

#### Option 4: Lower Scaling Thresholds (Temporary)

```bash
# If HPA is scaling too slowly:
# Edit HPA and lower metric thresholds

kubectl edit hpa claude-router-api-hpa -n claude-router

# Change: averageUtilization: 70 → 50
# (This makes it scale more aggressively)

# Save and exit editor
# HPA will immediately re-evaluate
```

### Prevention

```bash
# Monitor HPA status continuously
# Prometheus query: kube_hpa_status_desired_replicas

# Alert if HPA frequently at maxReplicas (indicates undersizing)
# Alert if HPA metrics unavailable for >5 minutes

# Test HPA under load
# Run: npm run load-test
# Verify replicas scale up within 30 seconds
# Verify replicas scale down within 300 seconds

# Review HPA policy (k8s/04-hpa.yaml) periodically
# Update thresholds based on actual metrics
```

### SLA Impact

- **Impact**: Unable to scale during traffic spike
- **Duration**: 5-30 minutes (manual scaling)
- **User-facing**: Slow requests during spike, potential timeout
- **RTO**: 15 minutes (manual fix)
- **RPO**: N/A (stateless service)

---

## 7. High Request Latency

### Severity: HIGH (SLO violation, P99 > 1s)

### Detection

```bash
# Alert: HighLatency (P99 > 1s)
# Prometheus query:
# histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 1.0

# Manual check - Grafana dashboard:
# - P50, P95, P99 latency trends
# - Latency by endpoint
# - Latency by model selection
```

### Diagnosis

```bash
# Check if API pods are resource-constrained
kubectl top pods -n claude-router -l app=claude-router-api

# Check HPA status (if scaling)
kubectl get hpa claude-router-api-hpa -n claude-router

# Check Redis latency
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli --latency -i 1 -a "password"

# Check PostgreSQL query latency
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT mean_time, calls, query 
  FROM pg_stat_statements 
  WHERE mean_time > 100 
  ORDER BY mean_time DESC 
  LIMIT 10;"

# Check Claude API latency (upstream)
# Look at API logs for Claude API response times
kubectl logs deployment/claude-router-api -n claude-router | grep -i "claude\|upstream\|latency"

# Check network latency between nodes
kubectl exec -it claude-router-api-0 -n claude-router -- \
  ping -c 10 postgres.claude-router.svc.cluster.local | tail -5
```

### Resolution

#### Option 1: Scale Up (if CPU/Memory constrained)

```bash
# Manually increase replicas
kubectl scale deployment claude-router-api --replicas=10 -n claude-router

# Monitor latency improvement
kubectl port-forward -n claude-router-monitoring svc/grafana 3000:3000
# Check P99 latency dashboard

# If latency improves, HPA may be too conservative
# Increase HPA scaling thresholds
kubectl edit hpa claude-router-api-hpa -n claude-router
# Reduce averageUtilization from 70 to 60
```

#### Option 2: Optimize Database Queries

```bash
# Identify slow queries in PostgreSQL
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT query, mean_time 
  FROM pg_stat_statements 
  WHERE mean_time > 100 
  ORDER BY mean_time DESC 
  LIMIT 5;"

# Add missing indexes (if identified)
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "
  CREATE INDEX CONCURRENTLY idx_analytics_created_at_user 
  ON analytics_events(created_at, user_id);"

# Monitor impact
# Wait 5 minutes for index creation to complete
```

#### Option 3: Optimize Redis Cache Usage

```bash
# Check Redis memory usage
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" info memory | grep "used_memory_human"

# If near capacity, enable eviction
kubectl exec -it redis-cluster-0 -n claude-router -- \
  redis-cli -a "password" CONFIG SET maxmemory-policy allkeys-lru

# Verify cache hit rate
# Query Prometheus: redis_cache_hits / (redis_cache_hits + redis_cache_misses)

# If low (<50%), review caching strategy
```

#### Option 4: Check Claude API Latency

```bash
# If all internal systems are healthy but latency high:
# Issue likely in Claude API upstream

# Check if errors are happening
kubectl logs deployment/claude-router-api -n claude-router | grep -i "error\|timeout" | tail -20

# If seeing upstream timeouts, check:
# - Is ANTHROPIC_API_KEY correct?
# - Is account rate-limited?
# - Is network to api.anthropic.com responsive?

# Verify connectivity to Claude API
kubectl exec -it claude-router-api-0 -n claude-router -- \
  curl -i https://api.anthropic.com/health 2>&1 | head -5

# If cannot reach, check:
# - Network policies (allow egress to 443)
# - Firewall rules
# - DNS (can resolve api.anthropic.com)
```

### Prevention

```bash
# Set up continuous monitoring
# Prometheus dashboard showing:
# - P50, P95, P99 latency trends
# - Latency by endpoint
# - Latency by model

# Alert on latency anomalies
# Use: anomaly_detector query to alert if latency > baseline + 30%

# Regular load testing
# Run: npm run load-test at least weekly
# Verify SLO (P99 < 1s) is maintained

# Query optimization
# Weekly review of slow query log
# Create indexes for queries in top 10

# Capacity planning
# Monitor trend: replicas needed per 1000 RPS
# Ensure cluster has headroom
```

### SLA Impact

- **Impact**: SLO violation (P99 latency > 1s)
- **Duration**: 10-60 minutes
- **User-facing**: Slow API responses, timeouts
- **RTO**: 30 minutes
- **RPO**: N/A (data consistent)

---

## 8. Out of Memory (OOM) Killer

### Severity: CRITICAL (pods killed randomly)

### Detection

```bash
# Alert: OOMKilled pods
# Manual check
kubectl get pods -n claude-router -o json | \
  jq '.items[] | select(.status.containerStatuses[].lastState.terminated.reason=="OOMKilled")'

# Check if pods restarting due to OOM
kubectl get pods -n claude-router -o wide | grep -i "restart\|crash"

# Check memory usage
kubectl top pods -n claude-router --sort-by=memory
```

### Diagnosis

```bash
# Check memory limit vs actual usage
kubectl describe pod claude-router-api-0 -n claude-router | grep -A 10 "Limits\|Requests"

# Identify memory leak candidates
kubectl exec -it claude-router-api-0 -n claude-router -- \
  ps aux | head -10

# Check memory trend over time
# Query Prometheus:
# rate(container_memory_usage_bytes[1h])

# Check if specific endpoints cause memory spike
# Review logs for memory-intensive operations
kubectl logs deployment/claude-router-api -n claude-router | grep -i "memory\|heap\|gc"
```

### Resolution

#### Option 1: Increase Memory Limit

```bash
# Update resource limits
kubectl set resources deployment claude-router-api \
  -n claude-router \
  -c=claude-router \
  --limits=memory=1.5Gi,cpu=2500m

# Restart pods to apply
kubectl rollout restart deployment/claude-router-api -n claude-router

# Monitor memory usage
kubectl top pods -n claude-router -w
```

#### Option 2: Identify Memory Leak

```bash
# If memory grows continuously (not just startup spike):
# Likely memory leak in code

# Increase garbage collection aggressiveness
kubectl set env deployment/claude-router-api \
  NODE_OPTIONS="--max-old-space-size=512" \
  -n claude-router

# Or enable heap snapshot on OOM
kubectl set env deployment/claude-router-api \
  NODE_OPTIONS="--abort-on-uncaught-exception" \
  -n claude-router

# Restart and collect heap snapshot before OOM
```

#### Option 3: Use Smaller Base Image

```bash
# If OOM persists after optimization:
# Use Alpine instead of full Node image

# In Dockerfile:
# FROM node:18-alpine (instead of node:18-bullseye)

# Rebuild image and redeploy
docker build -f Dockerfile -t claude-router:v1.0.1-alpine .
docker push <registry>/claude-router:v1.0.1-alpine

kubectl set image deployment/claude-router-api \
  claude-router=<registry>/claude-router:v1.0.1-alpine \
  -n claude-router

# Typical memory reduction: 30-40%
```

#### Option 4: Scale Horizontally Instead

```bash
# Instead of increasing per-pod memory:
# Add more pods with smaller memory

# Current: 3 replicas × 1Gi = 3Gi
# New: 10 replicas × 256Mi = 2.5Gi (also faster!)

kubectl set resources deployment claude-router-api \
  -n claude-router \
  -c=claude-router \
  --requests=memory=256Mi,cpu=250m \
  --limits=memory=512Mi,cpu=1000m

# Scale to 10 replicas
kubectl scale deployment claude-router-api --replicas=10 -n claude-router

# Update HPA minReplicas
kubectl patch hpa claude-router-api-hpa -n claude-router \
  -p '{"spec":{"minReplicas":5}}'
```

### Prevention

```bash
# Monitor memory trends continuously
# Alert if memory > 80% of limit

# Profile application memory usage
# Use: node --inspect to get heap dumps
# Use: clinic.js for continuous profiling

# Add memory pressure alerts
# Prometheus: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9

# Regular memory reviews
# Weekly: check top 3 memory-consuming pods
# Monthly: check for memory leaks in logs
```

### SLA Impact

- **Impact**: Pod restarts, request failures during restart
- **Duration**: 1-5 minutes per OOM (continuous if leak)
- **User-facing**: Intermittent failures
- **RTO**: 5 minutes per pod restart
- **RPO**: N/A (stateless)

---

## 9. Storage Volume Full

### Severity: HIGH (data cannot be written)

### Detection

```bash
# Alert: VolumeFull (disk usage > 85%)
# Manual check
kubectl exec -it deployment/postgres -n claude-router -- df -h

# Check PVC capacity
kubectl get pvc -n claude-router

# Check actual usage
kubectl exec -it deployment/postgres -n claude-router -- du -sh /var/lib/postgresql/data

# Check which tables are largest
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "
  SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables 
  WHERE schemaname != 'pg_catalog' 
  ORDER BY pg_total_relation_size DESC 
  LIMIT 10;"
```

### Diagnosis

```bash
# Identify largest tables
# (Already done above)

# Check if table has many old rows (candidates for archival)
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "
  SELECT 
    DATE_TRUNC('month', created_at) as month, 
    count(*) as rows 
  FROM analytics_events 
  GROUP BY DATE_TRUNC('month', created_at) 
  ORDER BY month;"

# Check dead tuples (deleted but not vacuumed)
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "
  SELECT schemaname, tablename, n_dead_tup 
  FROM pg_stat_user_tables 
  WHERE n_dead_tup > 1000 
  ORDER BY n_dead_tup DESC;"
```

### Resolution

#### Option 1: Vacuum Database (Free Dead Space)

```bash
# Run VACUUM to reclaim space
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "VACUUM ANALYZE;"

# This is blocking - takes 5-30 minutes
# For large tables, use VACUUM FULL
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "VACUUM FULL analytics_events;"

# Monitor space reclaimed
kubectl exec -it deployment/postgres -n claude-router -- \
  du -sh /var/lib/postgresql/data
```

#### Option 2: Archive Old Data

```bash
# Export old data to S3
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "
  \COPY (SELECT * FROM analytics_events WHERE created_at < NOW() - INTERVAL '90 days') 
  TO STDOUT (FORMAT csv)" \
  | aws s3 cp - s3://claude-router-archive/analytics-2024-01.csv

# Delete old data
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -d claude_router_analytics -c "
  DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '90 days';"

# Space reclaimed: ~70% typical for analytics table
```

#### Option 3: Expand Volume

```bash
# Expand PVC (requires storage class to support expansion)
kubectl patch pvc postgres-pvc -n claude-router \
  -p '{"spec":{"resources":{"requests":{"storage":"200Gi"}}}}'

# PostgreSQL will automatically use new space
# Monitor mount point
kubectl exec -it deployment/postgres -n claude-router -- df -h

# May take 5-15 minutes for storage provisioner
```

#### Option 4: Enable Automated Cleanup

```bash
# Create periodic cleanup job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-archive
  namespace: claude-router
spec:
  schedule: "0 2 * * SUN"  # Weekly on Sunday 2am
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: postgres
          containers:
          - name: archive
            image: postgres:15-alpine
            command:
            - /bin/sh
            - -c
            - |
              psql -h postgres -U postgres -d claude_router_analytics -c \
              "DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '90 days';"
          restartPolicy: OnFailure
EOF
```

### Prevention

```bash
# Monitor disk usage trend
# Alert if growth rate > 10GB/day

# Monitor table sizes
# Alert if largest table > 80% of allocated storage

# Implement automated archival
# Weekly: archive events older than 90 days
# Monthly: delete events older than 1 year

# Enable PostgreSQL autovacuum
# Already enabled, but can tune:
kubectl exec -it deployment/postgres -n claude-router -- \
  psql -U postgres -c "SHOW autovacuum;"
```

### SLA Impact

- **Impact**: Database write failures
- **Duration**: 15-60 minutes (manual intervention)
- **User-facing**: API returns errors for write operations
- **RTO**: 30 minutes
- **RPO**: Potential data loss of in-flight writes

---

## 10. Cluster Upgrade Gone Wrong

### Severity: CRITICAL (potential cluster outage)

### Detection

```bash
# After `kubectl apply` or helm upgrade

# Check if all pods are healthy
kubectl get pods -n claude-router --all-namespaces
# If seeing CrashLoopBackOff, ImagePullBackOff → upgrade issue

# Check cluster events
kubectl get events -n claude-router --sort-by='.lastTimestamp' | tail -20

# Check API server logs
kubectl logs -n kube-system -l component=kube-apiserver | tail -20
```

### Diagnosis

```bash
# Check what changed in the upgrade
git diff HEAD~1 k8s/

# Check if image exists/is accessible
kubectl describe pod <failed-pod> -n claude-router | grep -A 10 "Events:"

# If ImagePullBackOff:
# - Image name wrong
# - Registry credentials missing
# - Image doesn't exist in registry

# Check manifest syntax
kubectl apply --dry-run=client -f k8s/*.yaml

# Check for incompatible API versions
kubectl api-resources | grep -i deployment
# Verify apiVersion: apps/v1 is still valid
```

### Resolution

#### Option 1: Rollback Deployment

```bash
# If using Deployment strategy:
kubectl rollout undo deployment/claude-router-api -n claude-router
kubectl rollout undo deployment/postgres -n claude-router
kubectl rollout undo statefulset/redis-cluster -n claude-router

# Verify rollback
kubectl rollout status deployment/claude-router-api -n claude-router

# Check service health
kubectl exec -it claude-router-api-0 -n claude-router -- \
  curl http://localhost:3000/api/health
```

#### Option 2: Fix and Re-apply Manifest

```bash
# If issue is in manifest (typo, wrong image, etc.):

# Edit the problematic manifest
vim k8s/03-claude-router-api.yaml

# Check syntax
kubectl apply --dry-run=client -f k8s/03-claude-router-api.yaml

# Apply fix
kubectl apply -f k8s/03-claude-router-api.yaml

# Monitor rollout
kubectl rollout status deployment/claude-router-api -n claude-router
```

#### Option 3: Fix Image Issue

```bash
# If image doesn't exist:

# Rebuild image
docker build -f Dockerfile -t claude-router:v1.0.1 .

# Push to registry
docker push <registry>/claude-router:v1.0.1

# Update deployment
kubectl set image deployment/claude-router-api \
  claude-router=<registry>/claude-router:v1.0.1 \
  -n claude-router

# Monitor rollout
kubectl rollout status deployment/claude-router-api -n claude-router
```

#### Option 4: Force Recreate (Last Resort)

```bash
# If rollback doesn't work:

# Backup current state
kubectl get all -n claude-router -o yaml > backup-2024-01-XX.yaml

# Delete affected resources
kubectl delete deployment claude-router-api -n claude-router
sleep 10

# Recreate from known-good manifest
kubectl apply -f k8s/03-claude-router-api.yaml

# Verify health
kubectl get pods -n claude-router -w
```

### Prevention

```bash
# Always test upgrades first
# Use dry-run:
kubectl apply --dry-run=server -f k8s/*.yaml

# Review changes before applying
git diff k8s/
# Understand EVERY change

# Stage upgrades
# Upgrade dev/test first → staging → production

# Maintain git history
# Every k8s manifest change in git with commit message
git log --oneline k8s/

# Have rollback plan
# Maintain multiple manifest versions
# Document rollback procedure
```

### SLA Impact

- **Impact**: Cluster unavailability or degradation
- **Duration**: 10-60 minutes (depending on issue)
- **User-facing**: Complete outage or partial degradation
- **RTO**: 30 minutes (rollback)
- **RPO**: N/A (data consistent, stateless service)

---

## General Troubleshooting Commands

```bash
# Quick status check
kubectl get all -n claude-router -o wide

# Check pod logs
kubectl logs <pod> -n claude-router --tail=100

# Follow logs in real-time
kubectl logs -f <pod> -n claude-router

# Get pod events
kubectl describe pod <pod> -n claude-router

# Execute command in pod
kubectl exec -it <pod> -n claude-router -- <command>

# Port forward for debugging
kubectl port-forward pod/<pod> 3000:3000 -n claude-router

# Get pod metrics
kubectl top pods -n claude-router

# Restart deployment
kubectl rollout restart deployment/<name> -n claude-router

# Check HPA status
kubectl describe hpa <name> -n claude-router

# Get events sorted by time
kubectl get events -n claude-router --sort-by='.lastTimestamp'
```

## Contact & Escalation

- **On-call engineer**: Check PagerDuty alert
- **Database team**: For PostgreSQL issues
- **Kubernetes team**: For cluster/networking issues
- **ML team**: For model selection issues (low priority, doesn't affect SLA)

## Post-Incident Review

After any major incident:

1. Document timeline of events
2. Identify root cause
3. Implement prevention (if possible)
4. Update runbook with lessons learned
5. Schedule blameless postmortem
6. Track action items to completion
