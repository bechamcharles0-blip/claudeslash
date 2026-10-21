# 🚀 Claude Router - Deployment Guide

Complete guide for deploying Claude Router to production with scaling infrastructure.

---

## Table of Contents

1. [Quick Start (Docker Compose)](#quick-start-docker-compose)
2. [Kubernetes Deployment](#kubernetes-deployment)
3. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
4. [Monitoring and Logging](#monitoring-and-logging)
5. [Scaling Strategy](#scaling-strategy)
6. [Incident Response](#incident-response)
7. [Production Checklist](#production-checklist)

---

## Quick Start (Docker Compose)

### Local Development

```bash
# Clone the repository
git clone <repo>
cd claude-router

# Create .env file
cat > .env << EOF
ANTHROPIC_API_KEY=sk-ant-your-key-here
REDIS_PASSWORD=redis-password-change-this
NODE_ENV=development
LOG_LEVEL=info
EOF

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps

# View logs
docker-compose logs -f api
```

**Access points:**
- API: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- Jaeger Traces: http://localhost:16686

### Stop and Cleanup

```bash
# Stop all services
docker-compose down

# Remove all data
docker-compose down -v
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Container registry access (Docker Hub, GHCR, ECR)
- Persistent volume provisioner (for Redis)

### Step 1: Build and Push Image

```bash
# Build Docker image
docker build -t claude-router:latest .

# Tag for your registry
docker tag claude-router:latest your-registry/claude-router:latest

# Push to registry
docker push your-registry/claude-router:latest
```

### Step 2: Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets (IMPORTANT: Replace with real values)
kubectl create secret generic claude-router-secrets \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-your-key-here' \
  --from-literal=REDIS_PASSWORD='change-me-in-production' \
  -n claude-router

# Or edit k8s/secret.yaml and apply
kubectl apply -f k8s/secret.yaml

# Deploy Redis
kubectl apply -f k8s/redis-deployment.yaml

# Deploy ConfigMap
kubectl apply -f k8s/configmap.yaml

# Deploy API Server
kubectl apply -f k8s/deployment.yaml

# Create Services
kubectl apply -f k8s/service.yaml

# Setup Auto-scaling
kubectl apply -f k8s/hpa.yaml

# Pod Disruption Budget
kubectl apply -f k8s/pdb.yaml
```

### Step 3: Verify Deployment

```bash
# Check all resources
kubectl get all -n claude-router

# Watch deployment rollout
kubectl rollout status deployment/claude-router-api -n claude-router

# Check pod logs
kubectl logs -f deployment/claude-router-api -n claude-router

# Port forward for testing
kubectl port-forward -n claude-router svc/claude-router-api 3000:80

# Test the API
curl http://localhost:3000/api/health
```

### Step 4: Setup Ingress (Optional)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claude-router-ingress
  namespace: claude-router
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.claude-router.io
    secretName: claude-router-tls
  rules:
  - host: api.claude-router.io
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: claude-router-api
            port:
              number: 3000
```

---

## CI/CD Pipeline Setup

### GitHub Actions Workflow

The pipeline is defined in `.github/workflows/ci-cd.yaml`:

**Stages:**
1. **Lint** - TypeScript compilation, code quality
2. **Test** - Run test suite with Redis
3. **Build** - Docker image build and push to registry
4. **Deploy to Staging** - Deploy on `develop` branch
5. **Deploy to Production** - Deploy on `main` branch

### Configure Secrets

Add to GitHub repository settings:

```
SLACK_WEBHOOK        = https://hooks.slack.com/services/...
KUBE_CONFIG          = (base64 encoded kubeconfig)
REGISTRY_USERNAME    = (if using private registry)
REGISTRY_PASSWORD    = (if using private registry)
```

### Trigger Deployments

```bash
# Deploy to staging (automatic on push to develop)
git checkout develop
git commit -m "Feature: new feature"
git push origin develop

# Deploy to production (automatic on push to main)
git checkout main
git merge develop
git push origin main
```

---

## Monitoring and Logging

### Metrics Collection

The deployment automatically collects:
- HTTP request metrics (latency, throughput, errors)
- Resource usage (CPU, memory, disk)
- Application metrics (cache hits, model usage, tokens saved)
- Business metrics (users, requests, cost savings)

### Prometheus Queries

```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Latency (p95)
histogram_quantile(0.95, http_request_duration_seconds_bucket)

# Cache hit rate
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# Model usage distribution
sum by (model) (rate(model_requests_total[5m]))
```

### Grafana Dashboards

Access at http://localhost:3001:

1. **System Dashboard** - Pod CPU/memory, network
2. **Application Dashboard** - Request metrics, errors, latency
3. **Business Dashboard** - Users, cost savings, token usage
4. **Cache Dashboard** - Hit rates, evictions, memory usage

### Alerting

Alerts are configured in `monitoring/alerts.yml`:

- High error rate (>5%)
- High latency (P95 > 2s)
- High resource usage (>90%)
- Redis down
- SLO breach (P99 > 3s for 10m)
- Low cache hit rate (<30%)

### Distributed Tracing

Jaeger is available at http://localhost:16686

**Trace sampling:** 100% in development, 10% in production (adjust in deployment)

---

## Scaling Strategy

### Horizontal Scaling (Adding More Instances)

The HPA automatically scales based on:
- CPU utilization > 70%
- Memory utilization > 80%
- Custom metric: requests/sec > 1000

**Auto-scaling config:**
```yaml
minReplicas: 3      # Always run 3 instances
maxReplicas: 50     # Max 50 instances
scaleUp: 100% every 15s
scaleDown: 50% every 60s
```

### Load Balancing

Kubernetes Service provides round-robin load balancing:

```bash
# Check current replicas
kubectl get pods -n claude-router

# Manually scale (if needed)
kubectl scale deployment claude-router-api --replicas=10 -n claude-router
```

### Database Scaling (Redis)

Current setup: Single Redis instance with persistence

**For higher scale (10k+ concurrent):**
1. Redis Sentinel for high availability
2. Redis Cluster for horizontal sharding
3. Redis Streams for event logging

### Performance Tuning

**Connection pooling:**
- Node.js default: Connection pooling via Keep-Alive
- Redis connection pool: Configured in redis-cache.ts

**Caching strategy:**
- Cache responses for 1 hour (adjustable in ConfigMap)
- Cache size: 500MB max
- LRU eviction policy

**Database indexing:**
- Monitor query patterns with Prometheus
- Add Redis indices based on access patterns

### Cost Optimization

```bash
# Monitor resource requests vs actual usage
kubectl top pods -n claude-router

# Adjust resource limits if needed
kubectl set resources deployment claude-router-api \
  -n claude-router \
  --requests=cpu=200m,memory=200Mi \
  --limits=cpu=800m,memory=512Mi
```

---

## Incident Response

### Health Check Failure

```bash
# 1. Check pod status
kubectl get pods -n claude-router

# 2. View logs
kubectl logs pod/<pod-name> -n claude-router

# 3. Check events
kubectl describe pod/<pod-name> -n claude-router

# 4. Restart pod if needed
kubectl delete pod/<pod-name> -n claude-router
```

### High Error Rate

```bash
# 1. Check metrics
curl http://localhost:3001/metrics | grep error

# 2. View logs for errors
kubectl logs -f deployment/claude-router-api -n claude-router | grep -i error

# 3. Check API rate limits
curl http://localhost:3000/api/stats

# 4. Consider temporary rate limit increase
kubectl patch configmap claude-router-config -n claude-router -p \
  '{"data":{"RATE_LIMIT_PER_HOUR":"2000"}}'
```

### Memory/CPU Exhaustion

```bash
# 1. Check current usage
kubectl top pods -n claude-router

# 2. Check cache size
redis-cli info memory

# 3. Clear cache if needed
redis-cli FLUSHDB

# 4. Temporarily increase resource limits
kubectl set resources deployment claude-router-api \
  -n claude-router \
  --limits=memory=1Gi
```

### Redis Connection Issues

```bash
# 1. Check Redis pod
kubectl get pod -l app=redis -n claude-router

# 2. Test connection
kubectl exec -it redis-0 -n claude-router -- redis-cli ping

# 3. View Redis logs
kubectl logs deployment/redis -n claude-router

# 4. Restart Redis
kubectl rollout restart deployment/redis -n claude-router
```

### Rollback Procedure

```bash
# 1. Check deployment history
kubectl rollout history deployment/claude-router-api -n claude-router

# 2. Rollback to previous version
kubectl rollout undo deployment/claude-router-api -n claude-router

# 3. Monitor rollback
kubectl rollout status deployment/claude-router-api -n claude-router

# 4. If needed, rollback to specific revision
kubectl rollout undo deployment/claude-router-api -n claude-router --to-revision=5
```

---

## Production Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Security scan completed
- [ ] Load test passed (1k concurrent users)
- [ ] Database migrations tested
- [ ] Backup procedure documented
- [ ] Rollback procedure tested
- [ ] Monitoring alerts configured
- [ ] On-call rotation established

### Deployment

- [ ] Blue-green deployment or canary rollout
- [ ] Health checks passing
- [ ] Metrics flowing to Prometheus
- [ ] Logs aggregated and visible
- [ ] Smoke tests passed
- [ ] Performance metrics normal
- [ ] Error rate < 1%

### Post-Deployment

- [ ] Monitor for 24 hours
- [ ] Check user feedback
- [ ] Review cost implications
- [ ] Document any issues
- [ ] Update runbooks
- [ ] Schedule post-mortem if needed

---

## Production Configuration

### Environment Variables

```bash
# .env.production
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn

ANTHROPIC_API_KEY=<secure>
REDIS_URL=redis://:password@redis-cluster:6379
REDIS_PASSWORD=<secure>

RATE_LIMIT_PER_HOUR=2000
RATE_LIMIT_PER_MINUTE=100
CACHE_TTL_SECONDS=3600

METRICS_ENABLED=true
TRACING_SAMPLE_RATE=0.1
JAEGER_AGENT_HOST=jaeger.monitoring
```

### Resource Limits (Recommended)

```yaml
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 1Gi
```

### Database Backup

```bash
# Daily Redis backup (via Kubernetes CronJob)
# Example: backup every 6 hours
schedule: "0 */6 * * *"
command: redis-cli BGSAVE
```

---

## Support and Debugging

### Useful Commands

```bash
# View all resources
kubectl get all -n claude-router

# Stream logs from all pods
kubectl logs -f -l app=claude-router-api -n claude-router --all-containers=true

# Port forward to local machine
kubectl port-forward -n claude-router svc/claude-router-api 3000:3000

# Execute command in pod
kubectl exec -it <pod-name> -n claude-router -- /bin/sh

# Check resource metrics
kubectl top nodes
kubectl top pods -n claude-router

# View events
kubectl get events -n claude-router --sort-by='.lastTimestamp'
```

### Debugging

```bash
# Enable verbose logging
kubectl set env deployment/claude-router-api LOG_LEVEL=debug -n claude-router

# Check configuration
kubectl get configmap claude-router-config -n claude-router -o yaml

# Verify secrets
kubectl get secrets -n claude-router

# Test API endpoint
kubectl exec -it <pod-name> -n claude-router -- curl http://localhost:3000/api/health
```

---

**Last Updated:** 2026-10-21
