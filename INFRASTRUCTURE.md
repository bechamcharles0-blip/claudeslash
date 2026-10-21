# Infrastructure Architecture & Scaling Strategy

Complete infrastructure design for Claude Router scaling from 100 to 10,000 users.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USERS (100 → 10K)                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼─────┐    ┌──────▼──────┐    ┌──────▼──────┐
   │  REST    │    │  GraphQL    │    │   CLI/SDK   │
   │  API     │    │  API        │    │   Integration
   └────┬─────┘    └──────┬──────┘    └──────┬──────┘
        │                 │                   │
        └─────────────────┼───────────────────┘
                          │
        ┌─────────────────┴──────────────────┐
        │                                     │
   ┌────▼────────────────────────────────────▼───┐
   │     KUBERNETES INGRESS / LOAD BALANCER     │
   │  (Nginx / AWS ALB / GCP LB / Azure LB)     │
   └────┬────────────────────────────────────────┘
        │
   ┌────▼──────────────────────────────────────┐
   │  API SERVER POOL (3-50 pods)               │
   │  ┌──────────────────────────────────────┐  │
   │  │ Pod 1: Express Server + Node.js      │  │
   │  │ - REST/GraphQL endpoints             │  │
   │  │ - Model routing logic                │  │
   │  │ - Request validation                 │  │
   │  └──────────────────────────────────────┘  │
   │  ┌──────────────────────────────────────┐  │
   │  │ Pod 2, 3, 4... (Replicated)          │  │
   │  └──────────────────────────────────────┘  │
   │                                             │
   │  Horizontal Pod Autoscaler                 │
   │  - Trigger: CPU > 70%, Memory > 80%        │
   │  - Scale up: +100% every 15s              │
   │  - Scale down: -50% every 60s             │
   │  - Min: 3 pods, Max: 50 pods              │
   └────┬──────────────────────────────────────┘
        │
   ┌────┴──────────────────────────────────────┐
   │          CACHING & STATE LAYER             │
   │                                             │
   │  ┌────────────────────────────────────┐   │
   │  │  REDIS CLUSTER (HA)                │   │
   │  │  ├─ Cache responses (1h TTL)       │   │
   │  │  ├─ Rate limit counters (dist.)    │   │
   │  │  ├─ Session state                  │   │
   │  │  ├─ Model statistics               │   │
   │  │  └─ Distributed locks              │   │
   │  │                                    │   │
   │  │  Persistence: RDB + AOF            │   │
   │  │  Replication: Master-Replica       │   │
   │  │  Memory: 32GB (adjustable)         │   │
   │  └────────────────────────────────────┘   │
   └─────────────────────────────────────────────┘
        │
   ┌────┴──────────────────────────────────────┐
   │       EXTERNAL SERVICES                    │
   │                                             │
   │  ┌────────────────────────────────────┐   │
   │  │  ANTHROPIC API                     │   │
   │  │  - Claude Haiku                    │   │
   │  │  - Claude Sonnet                   │   │
   │  │  - Claude Opus                     │   │
   │  │  - Claude Fable                    │   │
   │  │  Rate limit: 50k tokens/min        │   │
   │  └────────────────────────────────────┘   │
   └─────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Prometheus   │  │  Grafana     │  │  Jaeger      │              │
│  │ - Metrics    │  │  - Dashboard │  │  - Tracing   │              │
│  │ - Alerting   │  │  - Alerting  │  │  - Spans     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ ELK Stack    │  │  LogQL       │  │  DataDog     │              │
│  │ - Logs       │  │  - Analysis  │  │  - APM       │              │
│  │ - Analysis   │  │              │  │  - Profiling │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │  Kubernetes      │  │  Cloud Storage   │  │  CDN / DDoS     │   │
│  │  Cluster         │  │  - Backups       │  │  - CloudFlare   │   │
│  │  (3-10 nodes)    │  │  - Logs          │  │  - AWS Shield   │   │
│  │                  │  │                  │  │                 │   │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
┌──────────┐
│  Client  │  (REST/GraphQL/SDK)
└────┬─────┘
     │ HTTP/HTTPS
     ▼
┌─────────────────────────────┐
│  API Gateway / LoadBalancer │  Rate limit, Auth, WAF
└────┬────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│  Claude Router Pod          │
│  ┌───────────────────────┐  │
│  │ 1. Validate Input     │  │
│  │ 2. Check Auth         │  │
│  │ 3. Rate Limit Check   │◄──┐
│  │ 4. Cache Lookup       │◄──┤── Redis Cache
│  └───────┬───────────────┘  │
│          │                  │
│    ┌─────▼────────────────┐ │
│    │ 5. Select Model      │ │
│    │ (Haiku/Sonnet/Opus)  │ │
│    └─────┬────────────────┘ │
│          │                  │
│    ┌─────▼────────────────┐ │
│    │ 6. Call Anthropic    │ │
│    │    API               │ │
│    └─────┬────────────────┘ │
│          │                  │
│    ┌─────▼────────────────┐ │
│    │ 7. Process Response  │ │
│    │ 8. Calculate Metrics │ │
│    │ 9. Update Cache      │ │
│    └─────┬────────────────┘ │
│          │                  │
│    ┌─────▼────────────────┐ │
│    │ 10. Log Metrics      │──┐
│    │ 11. Return Response  │  └── Prometheus/OpenTelemetry
│    └─────────────────────┘  │
└──────────────────────────────┘
     │
     ▼
┌──────────┐
│  Client  │  (Result + Stats)
└──────────┘
```

---

## Scaling Phases

### Phase 1: 100-500 Users
- **Infrastructure:** Single Kubernetes node
- **API Instances:** 1-3 replicas
- **Redis:** Single instance (16GB)
- **Cost:** ~$500/month

**Features:**
- Basic monitoring (Prometheus + Grafana)
- Manual scaling if needed
- No cross-region failover

### Phase 2: 500-2,000 Users
- **Infrastructure:** 3-5 Kubernetes nodes
- **API Instances:** 3-10 replicas (auto-scaling enabled)
- **Redis:** Sentinel (high availability)
- **Cost:** ~$2,000/month

**Features:**
- Full auto-scaling
- Redis persistence + backup
- Distributed rate limiting
- Metrics-driven scaling

### Phase 3: 2,000-10,000 Users
- **Infrastructure:** 10-20 Kubernetes nodes (multi-zone)
- **API Instances:** 10-50 replicas
- **Redis:** Redis Cluster (horizontal sharding)
- **Backup:** Automated daily + point-in-time recovery
- **Cost:** ~$10,000/month

**Features:**
- Multi-region failover
- Advanced metrics & profiling
- Cost optimization
- Dedicated support

---

## Database Strategy

### Redis for Caching

**Use Cases:**
1. **Response Caching**
   - Cache Claude API responses for 1 hour
   - Key: `cache:response:{hash(task)}`
   - Value: JSON encoded response
   - Hit rate target: 30-50%

2. **Distributed Rate Limiting**
   - Track requests per user per hour
   - Key: `ratelimit:{userId}`
   - Value: request count
   - TTL: 3600 seconds

3. **Session State**
   - Store user preferences
   - Key: `session:{sessionId}`
   - Value: JSON encoded preferences

4. **Statistics**
   - Track model usage
   - Track tokens saved
   - Track cost savings
   - Keys: `stats:model:{name}`

### Persistence Strategy

```yaml
# RDB Snapshots (Redis backup)
save 900 1      # Save every 15 min if 1+ keys changed
save 300 10     # Save every 5 min if 10+ keys changed
save 60 10000   # Save every 60 sec if 10k+ keys changed

# AOF (Append Only File)
appendonly yes
appendfsync everysec  # Sync every second
```

### Eviction Policy

```
maxmemory-policy allkeys-lru
# When memory limit reached:
# 1. Remove least recently used keys
# 2. Only applies to keys with TTL
# 3. Fallback to removing all keys if needed
```

---

## Load Testing Results

Expected performance at different scales:

### Single Pod (No scaling)
- Throughput: ~200 req/s
- Latency P95: 500ms
- Latency P99: 1000ms
- CPU: 60-80%
- Memory: 300MB

### 3 Pods (Minimum)
- Throughput: ~600 req/s
- Latency P95: 300ms
- Latency P99: 600ms
- CPU: 30-40% per pod
- Memory: 300MB per pod

### 10 Pods (Typical)
- Throughput: ~2,000 req/s
- Latency P95: 200ms
- Latency P99: 400ms
- CPU: 25-35% per pod
- Memory: 300MB per pod

### 50 Pods (Maximum)
- Throughput: ~10,000 req/s
- Latency P95: 150ms
- Latency P99: 300ms
- CPU: 20-30% per pod
- Memory: 300MB per pod

---

## Cost Breakdown

### Development ($500/month)
- Kubernetes cluster: $100
- Redis instance: $50
- Monitoring (Prometheus/Grafana): $50
- Backups: $20
- Observability: $100
- Misc: $80

### Staging ($1,500/month)
- Kubernetes cluster (HA): $300
- Redis Sentinel: $150
- Monitoring & alerting: $300
- Backups & recovery: $100
- Observability: $300
- Support & tooling: $350

### Production ($10,000/month)
- Kubernetes cluster (multi-zone): $2,000
- Redis Cluster (high availability): $1,000
- Monitoring & alerting: $1,000
- Backups & recovery: $500
- Observability & tracing: $1,500
- Support & managed services: $2,000
- Network & DDoS protection: $1,500
- Data transfer & storage: $500

### Anthropic API Costs
- Haiku: $0.10/1M input, $0.50/1M output
- Sonnet: $2.00/1M input, $10/1M output
- Opus: $4.00/1M input, $20/1M output
- Fable: $10/1M input, $50/1M output

**Example:** 10,000 users × 10 requests/day × avg 5,000 tokens
- Monthly tokens: 500B
- Average cost per token: $0.003
- Monthly API cost: $1,500

---

## Security Architecture

```
┌─────────────────────────────────────────┐
│  DDoS Protection (CloudFlare)            │
│  - Rate limiting                         │
│  - Bot detection                         │
│  - WAF rules                             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  API Gateway / Load Balancer             │
│  - TLS/SSL termination                  │
│  - Request validation                   │
│  - Authentication (API key / OAuth)     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Kubernetes Security                     │
│  - Network policies                      │
│  - RBAC (Role-based access control)     │
│  - Pod security policies                │
│  - Secrets encryption at rest           │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Application Security                    │
│  - Input validation                      │
│  - Output sanitization                   │
│  - SQL injection prevention              │
│  - CORS configuration                    │
│  - Rate limiting (per user/IP)           │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Data Security                           │
│  - Encryption in transit (TLS)          │
│  - Encryption at rest (Redis persistence)
│  - Backup encryption                     │
│  - Secrets management                    │
└──────────────────────────────────────────┘
```

---

## Disaster Recovery

### RTO/RPO Targets
- **RTO** (Recovery Time Objective): 15 minutes
- **RPO** (Recovery Point Objective): 5 minutes

### Backup Strategy

```yaml
# Daily backups
schedule: "0 2 * * *"  # 2 AM daily
retention: 30 days

# Hourly snapshots (last 7 days)
schedule: "0 * * * *"  # Every hour
retention: 7 days

# Transaction logs
enabled: true
retention: 30 days
```

### Failover Procedure

1. **Detection** (~1-2 minutes)
   - Health check fails
   - Prometheus alert triggered
   - PagerDuty notified

2. **Failover** (~5 minutes)
   - Kubernetes automatically restarts failed pods
   - Load balancer removes failed instances
   - Auto-scaling provides additional capacity

3. **Recovery** (~15 minutes)
   - Data restored from Redis persistence
   - Connections re-established
   - Normal operations resumed

---

## Monitoring Metrics

### Application Metrics
```
- http_requests_total (counter)
- http_request_duration_seconds (histogram)
- http_requests_active (gauge)
- model_requests_total (counter, by model)
- tokens_used_total (counter)
- cost_spent_total (counter)
```

### Cache Metrics
```
- cache_hits_total
- cache_misses_total
- cache_evictions_total
- cache_memory_bytes
```

### Infrastructure Metrics
```
- pod_cpu_usage_seconds_total
- pod_memory_usage_bytes
- disk_usage_bytes
- network_bytes_sent_total
- network_bytes_received_total
```

### SLI/SLO

```
SLI: Request success rate
Target: 99.9%
Warning: < 99.95%
Critical: < 99.5%

SLI: Latency (P99)
Target: < 3 seconds
Warning: > 2 seconds
Critical: > 5 seconds

SLI: Cache hit rate
Target: > 30%
Warning: < 35%
Critical: < 20%
```

---

## Integration Requirements for Other Teams

### ML Team Integration Points

1. **Model Selection Logic** (`src/core/modelRouter.ts`)
   - Add new models when available
   - Adjust complexity thresholds
   - Custom routing rules

2. **Performance Metrics**
   - Receive metrics via Prometheus
   - Monitor model quality scores
   - Identify model bottlenecks

3. **Testing**
   - Pre-production model testing
   - A/B testing framework
   - Canary deployments

### QA Team Integration Points

1. **Test Environments**
   - Staging environment with full stack
   - Production-like Redis cluster
   - Load testing tools (k6, JMeter)

2. **Test Data**
   - Synthetic load generation
   - Cache warming
   - Rate limit testing

3. **Test Scenarios**
   - High concurrency (10k users)
   - Cache hit scenarios
   - Failover scenarios
   - Rate limit breaches

### DevOps Team Integration Points

1. **CI/CD Pipeline**
   - Review and approve deployments
   - Configure secrets and credentials
   - Set up incident response

2. **Monitoring**
   - Configure alert routing
   - Set up on-call rotation
   - Create runbooks

3. **Capacity Planning**
   - Monitor cost trends
   - Right-size resources
   - Plan for growth

---

## Timeline to Production

**Week 1-2:** Infrastructure Setup
- [ ] Kubernetes cluster creation
- [ ] Redis cluster setup
- [ ] Monitoring stack deployment
- [ ] CI/CD pipeline configuration

**Week 3:** Testing & Validation
- [ ] Load testing (1k concurrent)
- [ ] Failover testing
- [ ] Security audit
- [ ] Performance optimization

**Week 4:** Production Deployment
- [ ] Blue-green deployment
- [ ] Smoke testing
- [ ] Production traffic gradual ramp
- [ ] Monitoring & incident response

---

**Architecture Version:** 1.0
**Last Updated:** 2026-10-21
