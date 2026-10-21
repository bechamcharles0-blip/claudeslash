# Claude Router Production Kubernetes Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying Claude Router infrastructure to production Kubernetes clusters. The infrastructure is designed for 99.9% SLO with automatic scaling from 100 to 10,000+ users.

## Architecture Components

### 1. **Claude Router API** (3-50 replicas)
- Node.js/Express service with intelligent routing
- Kubernetes Deployment with RollingUpdate strategy
- HPA with 5 metrics (CPU, Memory, RPS, P99 Latency, Redis Queue Depth)
- PodDisruptionBudget to maintain minimum availability

### 2. **Redis Cluster** (6-node, 3 primary + 3 replica)
- StatefulSet deployment with persistent storage
- Production configuration: AOF + RDB persistence
- Auto-initialization job for cluster bootstrap
- 20Gi per node (180Gi total capacity)

### 3. **PostgreSQL** (Analytics database)
- Single deployment with persistent volume (100Gi)
- Pre-initialized schema for events, feedback, performance metrics
- Connection pooling support (20 connections)
- Indexes optimized for analytics queries

### 4. **Monitoring Stack**
- **Prometheus**: 2 replicas, 30-day retention
- **Grafana**: 2 replicas with datasources configured
- **Alertmanager**: 2 replicas with webhook/email integration
- **Jaeger**: Distributed tracing for request flows

### 5. **Network & Security**
- Ingress for external API access (nginx controller)
- NetworkPolicies for pod-to-pod communication restrictions
- Service mesh ready (Linkerd compatible)
- TLS termination via cert-manager

## Deployment Steps

### Prerequisites

```bash
# Kubernetes cluster (1.24+)
kubectl version --short

# RBAC enabled
kubectl auth can-i create deployments --as=system:serviceaccount:default:default

# Storage provisioner (standard, fast, or custom)
kubectl get storageclass

# Ingress controller (nginx recommended)
kubectl get ns ingress-nginx || helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace

# cert-manager for TLS (optional but recommended)
kubectl get crd clusterissuers.cert-manager.io || helm install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace --set installCRDs=true
```

### Step 1: Create Namespaces

```bash
kubectl apply -f k8s/00-namespace.yaml

# Verify
kubectl get ns | grep claude-router
```

### Step 2: Deploy Redis Cluster

```bash
# Deploy Redis Cluster components
kubectl apply -f k8s/01-redis-cluster.yaml

# Wait for all 6 pods to be ready (5-10 minutes)
kubectl rollout status statefulset/redis-cluster -n claude-router --timeout=15m

# Verify cluster status
kubectl exec -it redis-cluster-0 -n claude-router -- redis-cli --no-auth-warning -a "change-this-in-production-use-strong-password" cluster info

# Get cluster nodes
kubectl exec -it redis-cluster-0 -n claude-router -- redis-cli --no-auth-warning -a "change-this-in-production-use-strong-password" cluster nodes
```

### Step 3: Deploy PostgreSQL

```bash
kubectl apply -f k8s/02-postgresql.yaml

# Wait for PostgreSQL to be ready
kubectl rollout status deployment/postgres -n claude-router --timeout=10m

# Verify database initialization
kubectl logs -f deployment/postgres -n claude-router | head -30

# Test connection
kubectl exec -it deployment/postgres -n claude-router -- psql -U postgres -c "SELECT * FROM information_schema.tables WHERE table_schema = 'public';"
```

### Step 4: Update Secrets

**IMPORTANT**: Replace actual credentials before deploying

```bash
# Update k8s/03-claude-router-api.yaml with:
# - ANTHROPIC_API_KEY: your actual Claude API key
# - REDIS_PASSWORD: strong random password
# - POSTGRES_PASSWORD: strong random password

# Create secrets (or use existing values from your infra)
kubectl create secret generic claude-router-secrets \
  -n claude-router \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-actual-key-here' \
  --from-literal=REDIS_PASSWORD='change-to-strong-password' \
  --from-literal=POSTGRES_USER='postgres' \
  --from-literal=POSTGRES_PASSWORD='change-to-strong-password' \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 5: Deploy Claude Router API

```bash
# Update image reference in 03-claude-router-api.yaml
# Change: image: claude-router:latest
# To: image: your-registry/claude-router:v1.0.0

# Deploy
kubectl apply -f k8s/03-claude-router-api.yaml

# Monitor rollout (3 initial replicas)
kubectl rollout status deployment/claude-router-api -n claude-router --timeout=5m

# Verify pods are healthy
kubectl get pods -n claude-router -l app=claude-router-api -w

# Check logs for errors
kubectl logs -f deployment/claude-router-api -n claude-router --tail=100
```

### Step 6: Deploy HPA & Services

```bash
kubectl apply -f k8s/04-hpa.yaml

# Verify HPA is active
kubectl get hpa -n claude-router
kubectl describe hpa claude-router-api-hpa -n claude-router
```

### Step 7: Configure Ingress (Optional)

```bash
# Update k8s/05-ingress.yaml with your domain name
# Change: api.claude-router.example.com
# To: your-actual-domain.com

kubectl apply -f k8s/05-ingress.yaml

# Get external IP
kubectl get ingress -n claude-router
```

### Step 8: Deploy Monitoring Stack

```bash
# Deploy Prometheus
kubectl apply -f k8s/06-monitoring-prometheus.yaml

# Deploy Grafana & Alertmanager
kubectl apply -f k8s/07-monitoring-grafana-alertmanager.yaml

# Verify all monitoring components are running
kubectl get pods -n claude-router-monitoring
```

### Step 9: Access Services

```bash
# Grafana Dashboard (credentials: admin / admin)
kubectl port-forward -n claude-router-monitoring svc/grafana 3000:3000
# Access: http://localhost:3000

# Prometheus UI
kubectl port-forward -n claude-router-monitoring svc/prometheus 9090:9090
# Access: http://localhost:9090

# Jaeger Tracing
kubectl port-forward -n claude-router-monitoring svc/jaeger 16686:16686
# Access: http://localhost:16686

# Claude Router API (internal)
kubectl port-forward -n claude-router svc/claude-router-internal 3000:3000
# Access: http://localhost:3000/api/health
```

## Production Configuration Checklist

- [ ] Update ANTHROPIC_API_KEY with actual API key
- [ ] Update REDIS_PASSWORD with strong password (minimum 32 chars)
- [ ] Update POSTGRES_PASSWORD with strong password
- [ ] Update Ingress hostname to your domain
- [ ] Configure cert-manager ClusterIssuer for TLS
- [ ] Update Alertmanager notification endpoints (Slack, PagerDuty, email)
- [ ] Configure external log aggregation (ELK, Datadog, etc.)
- [ ] Set resource limits based on actual load testing
- [ ] Enable backup strategy for PostgreSQL and Redis
- [ ] Configure network policies to restrict traffic
- [ ] Set up monitoring dashboards in Grafana
- [ ] Test failover scenarios
- [ ] Document runbooks for common incidents

## Scaling Configuration

### Auto-Scaling Behavior

The HPA uses 5 metrics to determine scaling decisions:

1. **CPU Utilization**: 70% target (fast response)
2. **Memory Utilization**: 80% target (prevent OOM)
3. **HTTP Requests/sec**: 1000 RPS per pod target
4. **P99 Latency**: 500ms threshold (SLO indicator)
5. **Redis Queue Depth**: 100 items per pod threshold

**Scale-Up**: Aggressive (0s stabilization)
- Double replicas every 15 seconds OR add 4 pods every 15 seconds
- Takes effect immediately when ANY metric triggers

**Scale-Down**: Conservative (300s stabilization)
- Remove max 50% of pods per 60 seconds OR 2 pods per 30s
- Preserves warm capacity during traffic dips

### Expected Behavior

- **100 users**: 3-5 replicas
- **1,000 users**: 5-10 replicas
- **10,000 users**: 25-50 replicas

## Cost Optimization

See COST_OPTIMIZATION.md for detailed cost analysis and optimization strategies.

### Cost per Request

```
Baseline (100 users):
- Compute: $0.000150/request
- Storage: $0.000002/request
- Network: $0.000001/request
Total: $0.000153/request

Scale (10,000 users):
- Compute: $0.000030/request (5x improvement via consolidation)
- Storage: $0.000001/request (better utilization)
- Network: $0.000001/request
Total: $0.000032/request (78% reduction)
```

## Troubleshooting

### Redis Cluster Issues

```bash
# Check cluster status
kubectl exec -it redis-cluster-0 -n claude-router -- redis-cli cluster info

# Check individual node
kubectl exec -it redis-cluster-1 -n claude-router -- redis-cli ping

# Inspect logs
kubectl logs redis-cluster-0 -n claude-router

# Force rebalance (if slots are unbalanced)
kubectl exec -it redis-cluster-0 -n claude-router -- redis-cli --cluster rebalance localhost:6379
```

### PostgreSQL Connection Issues

```bash
# Check connection pool
kubectl exec -it deployment/postgres -n claude-router -- psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Check table sizes
kubectl exec -it deployment/postgres -n claude-router -- psql -U postgres -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables WHERE schemaname != 'pg_catalog' ORDER BY pg_total_relation_size DESC;"
```

### HPA Not Scaling

```bash
# Check HPA status
kubectl describe hpa claude-router-api-hpa -n claude-router

# Verify metrics are being collected
kubectl top pods -n claude-router

# Check Prometheus for custom metrics
kubectl logs -f deployment/claude-router-api -n claude-router | grep -i metric
```

### High Latency Issues

```bash
# Check if pods are CPU-throttled
kubectl top pods -n claude-router

# Increase replica count manually (temporary)
kubectl scale deployment claude-router-api --replicas=10 -n claude-router

# Check Redis performance
kubectl exec -it redis-cluster-0 -n claude-router -- redis-cli --stat

# Analyze Jaeger traces for bottlenecks
# Access: kubectl port-forward -n claude-router-monitoring svc/jaeger 16686:16686
```

## Disaster Recovery

### Backup Strategy

```bash
# Backup PostgreSQL
kubectl exec -it deployment/postgres -n claude-router -- pg_dump -U postgres claude_router_analytics > backup.sql

# Restore PostgreSQL
kubectl exec -i deployment/postgres -n claude-router -- psql -U postgres claude_router_analytics < backup.sql

# Redis Cluster backup (RDB format enabled by default)
kubectl exec redis-cluster-0 -n claude-router -- redis-cli bgsave
```

### Recovery Procedures

See INCIDENT_RUNBOOKS.md for detailed recovery procedures for:
- Redis Cluster node failure
- PostgreSQL data corruption
- API pod crashes
- Database connection pool exhaustion
- Network partition scenarios

## Next Steps

1. **Load Testing**: Run load tests to validate scaling behavior
2. **Monitoring Dashboards**: Create custom Grafana dashboards for your KPIs
3. **Alert Integration**: Configure Slack/PagerDuty integration for critical alerts
4. **Data Backup**: Set up automated backup pipeline for PostgreSQL
5. **Cost Monitoring**: Track cloud costs and optimize resource allocation
6. **Security Audit**: Review network policies and RBAC settings
7. **Documentation**: Document your specific deployment configuration

## Support & References

- Kubernetes HPA: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
- Redis Cluster: https://redis.io/documentation/administration/replication/
- PostgreSQL on Kubernetes: https://kubernetes.io/docs/tasks/run-application/run-replicated-stateful-application/
- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/
