# Quick Reference - Claude Router Infrastructure

Fast lookup guide for common tasks.

---

## Common Commands

### Docker & Local Development

```bash
# Start local environment
docker-compose up

# Stop local environment
docker-compose down

# View logs
docker-compose logs -f api

# Build production image
docker build -t claude-router:latest .

# Push to registry
docker tag claude-router:latest your-registry/claude-router:latest
docker push your-registry/claude-router:latest

# Run image
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=xxx claude-router:latest
```

### Kubernetes Deployment

```bash
# Deploy all resources
kubectl apply -f k8s/

# Check deployment status
kubectl get all -n claude-router

# Watch rollout
kubectl rollout status deployment/claude-router-api -n claude-router

# View logs
kubectl logs -f deployment/claude-router-api -n claude-router

# Port forward
kubectl port-forward -n claude-router svc/claude-router-api 3000:80

# Scale manually
kubectl scale deployment claude-router-api --replicas=10 -n claude-router

# Restart deployment
kubectl rollout restart deployment/claude-router-api -n claude-router

# Rollback
kubectl rollout undo deployment/claude-router-api -n claude-router

# Delete all
kubectl delete -f k8s/
```

### Redis

```bash
# Connect to Redis
redis-cli -h localhost

# Check memory
redis-cli INFO memory

# Clear all data
redis-cli FLUSHDB

# Check number of keys
redis-cli DBSIZE

# Monitor slow queries
redis-cli SLOWLOG GET 10

# Inside Kubernetes
kubectl exec -it redis-0 -n claude-router -- redis-cli
```

### Monitoring

```bash
# Prometheus queries
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Grafana
# Visit: http://localhost:3001 (admin/admin)

# Jaeger traces
# Visit: http://localhost:16686
```

### Testing

```bash
# Run tests
npm test

# Run specific test
npm test -- modelRouter

# Build project
npm run build

# Type check only
npx tsc --noEmit

# CLI commands
npm run cli -- models
npm run cli -- stats
npm run cli -- estimate "your task"
npm run cli -- route "your task"
```

---

## Kubernetes Resource Management

### Check Resource Usage

```bash
# CPU and memory by pod
kubectl top pods -n claude-router

# By node
kubectl top nodes

# Check requests vs actual
kubectl describe node <node-name>
```

### Update Resources

```bash
# Set request/limit
kubectl set resources deployment claude-router-api \
  -n claude-router \
  --requests=cpu=500m,memory=512Mi \
  --limits=cpu=1000m,memory=1Gi

# View current
kubectl get deployment claude-router-api -n claude-router -o json | \
  jq '.spec.template.spec.containers[].resources'
```

### Environment Variables

```bash
# Set single variable
kubectl set env deployment/claude-router-api \
  LOG_LEVEL=debug \
  -n claude-router

# Set from ConfigMap
kubectl set env deployment/claude-router-api \
  --from=configmap/claude-router-config \
  -n claude-router
```

---

## Troubleshooting

### Pod Not Starting

```bash
# Check status
kubectl describe pod <pod-name> -n claude-router

# View events
kubectl get events -n claude-router --sort-by='.lastTimestamp'

# View logs
kubectl logs <pod-name> -n claude-router

# View previous logs (if crashed)
kubectl logs <pod-name> -n claude-router --previous
```

### High CPU/Memory

```bash
# Find heavy pods
kubectl top pods -n claude-router | sort -k3 -rn

# Increase limit
kubectl set resources deployment/claude-router-api \
  -n claude-router \
  --limits=memory=2Gi

# Check for memory leak
# Monitor memory trend in Grafana
```

### Connection Issues

```bash
# Test DNS
kubectl exec -it <pod> -n claude-router -- nslookup redis.claude-router.svc.cluster.local

# Test connection
kubectl exec -it <pod> -n claude-router -- curl redis:6379

# Check network policy
kubectl get networkpolicy -n claude-router

# Check service
kubectl get svc -n claude-router
kubectl get endpoints -n claude-router
```

### Redis Issues

```bash
# Check Redis health
kubectl exec -it redis-0 -n claude-router -- redis-cli ping

# View Redis logs
kubectl logs deployment/redis -n claude-router

# Check memory
kubectl exec -it redis-0 -n claude-router -- redis-cli INFO memory

# Restart Redis
kubectl delete pod redis-0 -n claude-router

# Clear cache
kubectl exec -it redis-0 -n claude-router -- redis-cli FLUSHDB
```

---

## Monitoring Queries

### Application Metrics

```promql
# Request rate (requests/second)
rate(http_requests_total[5m])

# Error rate (%)
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Latency (p95)
histogram_quantile(0.95, http_request_duration_seconds_bucket)

# Latency (p99)
histogram_quantile(0.99, http_request_duration_seconds_bucket)

# Active requests
http_requests_active

# Requests by model
sum by (model) (rate(model_requests_total[5m]))
```

### Infrastructure Metrics

```promql
# CPU usage by pod
rate(container_cpu_usage_seconds_total[5m])

# Memory usage by pod
container_memory_usage_bytes

# Disk usage
node_filesystem_avail_bytes

# Network bytes in/out
rate(container_network_receive_bytes_total[5m])
rate(container_network_transmit_bytes_total[5m])
```

### Cache Metrics

```promql
# Cache hit rate
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# Cache size
redis_memory_used_bytes

# Cache evictions
rate(redis_evicted_keys_total[5m])
```

---

## Deployment

### GitHub Actions

```bash
# Check workflow status
gh workflow list

# View workflow runs
gh run list

# View specific run
gh run view <run-id>

# Trigger workflow manually
gh workflow run ci-cd.yaml

# View logs
gh run view <run-id> --log
```

### Deploy to Production

```bash
# Push to main (automatic deployment)
git checkout main
git merge develop
git push origin main

# Monitor deployment
kubectl rollout status deployment/claude-router-api -n claude-router

# Check health
curl http://localhost:3000/api/health
```

---

## Performance Tuning

### Cache Optimization

```bash
# Increase TTL for better hit rate
kubectl set env deployment/claude-router-api \
  CACHE_TTL_SECONDS=7200 \
  -n claude-router

# Monitor hit rate
curl http://localhost:9090/api/v1/query?query=cache_hit_rate

# Clear problematic cache
redis-cli KEYS "cache:*" | head -100 | xargs redis-cli DEL
```

### Model Selection Tuning

```bash
# Check model distribution
curl http://localhost:3000/api/stats | jq .modelDistribution

# Change default model
kubectl set env deployment/claude-router-api \
  DEFAULT_MODEL=sonnet \
  -n claude-router

# Check model usage trend
# Query: sum by (model) (rate(model_requests_total[1h]))
```

### Scaling Tuning

```bash
# Adjust HPA parameters
kubectl edit hpa claude-router-api-hpa -n claude-router

# Current settings:
# minReplicas: 3
# maxReplicas: 50
# CPU target: 70%
# Memory target: 80%

# View HPA status
kubectl describe hpa claude-router-api-hpa -n claude-router
```

---

## Incident Response

### Quick Diagnosis

```bash
# Check pod health
kubectl get pods -n claude-router

# Check recent restarts
kubectl get pods -n claude-router -o json | \
  jq '.items[].status.containerStatuses[] | {name, restartCount}'

# Check error rate
curl 'http://localhost:9090/api/v1/query?query=error_rate'

# Check latency
curl 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,http_request_duration_seconds)'

# Check resource usage
kubectl top pods -n claude-router

# View latest logs
kubectl logs -f deployment/claude-router-api -n claude-router | tail -50
```

### Emergency Scale Up

```bash
# Immediately scale to 30 pods
kubectl scale deployment claude-router-api --replicas=30 -n claude-router

# Monitor rollout
kubectl get pods -n claude-router --watch
```

### Emergency Scale Down

```bash
# Scale to minimum (careful!)
kubectl scale deployment claude-router-api --replicas=3 -n claude-router

# Only use if resource constrained
```

### Clear Cache (Emergency)

```bash
# Clear all cache
kubectl exec -it redis-0 -n claude-router -- redis-cli FLUSHDB

# Monitor impact
curl 'http://localhost:9090/api/v1/query?query=cache_hit_rate'
```

---

## Accessing Services

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| API Health | http://localhost:3000/api/health |
| API Stats | http://localhost:3000/api/stats |
| API Dashboard | http://localhost:3000/dashboard |
| GraphQL | http://localhost:3000/graphql |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Jaeger | http://localhost:16686 |

---

## Feature Flags (ConfigMap)

```bash
# View all config
kubectl get configmap claude-router-config -n claude-router -o yaml

# Edit config
kubectl edit configmap claude-router-config -n claude-router

# Update single value
kubectl patch configmap claude-router-config -n claude-router \
  -p '{"data":{"LOG_LEVEL":"debug"}}'

# Reset to default
kubectl delete configmap claude-router-config -n claude-router
kubectl apply -f k8s/configmap.yaml
```

---

## Cost Monitoring

```bash
# Get current resource usage
kubectl describe nodes

# Estimate monthly cost
# Nodes × Hours × HourlyRate + Data Transfer

# Example: 5 nodes × 730 hours × $0.10 = $365/month

# Optimize costs:
# 1. Lower resource limits
# 2. Reduce min replicas (if traffic allows)
# 3. Use spot instances (if available)
# 4. Schedule scale-down during low traffic
```

---

## Security

### View Secrets

```bash
# List secrets
kubectl get secrets -n claude-router

# View secret (base64 encoded)
kubectl get secret claude-router-secrets -n claude-router -o jsonpath='{.data.ANTHROPIC_API_KEY}' | base64 -d

# Update secret
kubectl create secret generic claude-router-secrets \
  --from-literal=ANTHROPIC_API_KEY='new-key' \
  -n claude-router \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Network Policies

```bash
# View network policies
kubectl get networkpolicy -n claude-router

# Allow only internal traffic
# (Add to k8s/network-policy.yaml if needed)
```

---

## Logs & Debugging

### Tail Logs in Real-time

```bash
# All pods
kubectl logs -f deployment/claude-router-api -n claude-router

# Specific pod
kubectl logs -f <pod-name> -n claude-router

# Last N lines
kubectl logs deployment/claude-router-api -n claude-router --tail=100

# Previous pod logs
kubectl logs <pod-name> -n claude-router --previous
```

### Filter Logs

```bash
# Errors only
kubectl logs deployment/claude-router-api -n claude-router | grep -i error

# Specific timeframe
kubectl logs deployment/claude-router-api -n claude-router --since=1h

# By label
kubectl logs -l app=claude-router-api -n claude-router
```

---

## Backup & Restore

### Redis Backup

```bash
# Trigger manual backup
kubectl exec redis-0 -n claude-router -- redis-cli BGSAVE

# Check backup status
kubectl exec redis-0 -n claude-router -- redis-cli LASTSAVE

# View backup file
kubectl exec redis-0 -n claude-router -- ls -la /data/

# Restore from backup (if needed)
kubectl exec redis-0 -n claude-router -- redis-cli SHUTDOWN
kubectl delete pod redis-0 -n claude-router
# Pod restarts and reloads from dump.rdb
```

---

## Health Checks

```bash
# API health
curl http://localhost:3000/api/health

# Detailed stats
curl http://localhost:3000/api/stats | jq .

# List models
curl http://localhost:3000/api/models | jq .

# Redis health
redis-cli PING

# Kubernetes health
kubectl get all -n claude-router
```

---

## Update Procedures

```bash
# Pull latest code
git pull origin main

# Build new image
docker build -t claude-router:$(date +%s) .

# Push to registry
docker push your-registry/claude-router:latest

# Kubernetes auto-pulls and restarts pods
# (If using :latest tag with imagePullPolicy: Always)

# Manual deployment trigger
kubectl rollout restart deployment/claude-router-api -n claude-router

# Verify rollout
kubectl rollout status deployment/claude-router-api -n claude-router
```

---

**Last Updated:** 2026-10-21
