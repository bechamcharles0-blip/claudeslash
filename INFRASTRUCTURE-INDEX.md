# Infrastructure Documentation Index

Complete navigation guide for all DevOps infrastructure files.

---

## Documentation Files (Read First)

### 1. DEVOPS-SUMMARY.md ⭐ START HERE
**Overview of entire infrastructure setup**
- What's been delivered
- Architecture overview
- Scaling capacity
- Quick start checklist
- What each team needs to know
- **Read Time:** 10 minutes

### 2. DEPLOYMENT.md
**Step-by-step deployment guide**
- Quick start with Docker Compose
- Kubernetes deployment (detailed walkthrough)
- CI/CD pipeline setup
- Monitoring & logging
- Scaling strategy
- Incident response procedures
- Production checklist
- **Read Time:** 20 minutes

### 3. INFRASTRUCTURE.md
**Complete architecture and design**
- System architecture diagrams
- Data flow diagrams
- Scaling phases (100 → 500 → 2k → 10k users)
- Database strategy (Redis)
- Load testing results
- Cost breakdown by phase
- Security architecture
- Disaster recovery
- Monitoring metrics & SLI/SLO
- Integration requirements
- Timeline to production
- **Read Time:** 30 minutes

### 4. TEAM-INTEGRATION.md
**Integration points for different teams**
- ML Team: Adding models, performance metrics, A/B testing
- QA Team: Test environments, load testing, security testing
- DevOps Team: CI/CD, secrets, monitoring, auto-scaling
- Communication channels
- Success metrics
- **Read Time:** 20 minutes

### 5. INCIDENT-RESPONSE.md
**Incident response playbooks**
- Severity levels (SEV-1 to SEV-4)
- Alert runbooks with diagnosis & remediation
- Escalation matrix
- Post-incident review process
- Contact information
- **Read Time:** 15 minutes

### 6. QUICK-REFERENCE.md
**Fast lookup for common commands**
- Docker commands
- Kubernetes commands
- Redis commands
- Monitoring queries
- Troubleshooting tips
- Performance tuning
- **Read Time:** 5 minutes (as needed)

---

## Configuration Files (Copy to Deployment)

### Docker Configuration

| File | Purpose | Location |
|------|---------|----------|
| `Dockerfile` | Production container image | Root |
| `docker-compose.yml` | Local development setup | Root |
| `.dockerignore` | Exclude files from build | Root |

**Status:** ✅ Production-ready

---

### Kubernetes Configuration

| File | Purpose | Location |
|------|---------|----------|
| `k8s/namespace.yaml` | Kubernetes namespace | `k8s/` |
| `k8s/configmap.yaml` | Configuration data | `k8s/` |
| `k8s/secret.yaml` | Secrets (API keys) | `k8s/` |
| `k8s/deployment.yaml` | API deployment (3-50 replicas) | `k8s/` |
| `k8s/redis-deployment.yaml` | Redis cache deployment | `k8s/` |
| `k8s/service.yaml` | LoadBalancer & ClusterIP services | `k8s/` |
| `k8s/hpa.yaml` | Horizontal Pod Autoscaler | `k8s/` |
| `k8s/pdb.yaml` | Pod Disruption Budget | `k8s/` |

**Status:** ✅ Production-ready

**Deploy with:**
```bash
kubectl apply -f k8s/
```

---

### CI/CD Pipeline

| File | Purpose | Location |
|------|---------|----------|
| `.github/workflows/ci-cd.yaml` | GitHub Actions pipeline | `.github/workflows/` |

**Stages:**
1. Lint (TypeScript check)
2. Test (unit + integration)
3. Build (Docker image)
4. Deploy Staging (on develop)
5. Deploy Production (on main)
6. Notify (Slack)

**Status:** ✅ Ready to use (add GitHub secrets)

**Setup:**
```bash
gh secret set SLACK_WEBHOOK --body "..."
gh secret set KUBE_CONFIG --body "$(cat ~/.kube/config | base64)"
```

---

### Monitoring Configuration

| File | Purpose | Location |
|------|---------|----------|
| `monitoring/prometheus.yml` | Prometheus scrape config | `monitoring/` |
| `monitoring/alerts.yml` | Alert rules | `monitoring/` |
| `monitoring/grafana/provisioning/` | Grafana dashboards | `monitoring/grafana/` |

**Status:** ✅ Included in docker-compose

**Included Alerts:**
- High error rate (>5%)
- High latency (P95 > 2s)
- High resource usage (>90%)
- Redis down
- SLO breach (P99 > 3s)
- Low cache hit rate (<30%)

---

## Source Code Changes

### New File: Redis Cache Integration

**File:** `src/core/redis-cache.ts`

**Features:**
- Response caching with TTL
- Distributed rate limiting
- Session state management
- Statistics aggregation
- Health checks

**Usage:**
```typescript
import { getRedisCache } from './src/core/redis-cache.js';
const cache = await getRedisCache();
```

**Status:** ✅ Ready to integrate

---

## Recommended Reading Order

### For Managers/Leadership
1. DEVOPS-SUMMARY.md (overview)
2. INFRASTRUCTURE.md (architecture & cost)
3. TEAM-INTEGRATION.md (team responsibilities)

### For DevOps Engineers
1. DEVOPS-SUMMARY.md (overview)
2. DEPLOYMENT.md (setup & operations)
3. INFRASTRUCTURE.md (architecture)
4. INCIDENT-RESPONSE.md (operations)
5. QUICK-REFERENCE.md (daily reference)

### For ML Engineers
1. DEVOPS-SUMMARY.md (overview)
2. TEAM-INTEGRATION.md (ML section)
3. INFRASTRUCTURE.md (monitoring metrics)

### For QA Engineers
1. DEVOPS-SUMMARY.md (overview)
2. TEAM-INTEGRATION.md (QA section)
3. DEPLOYMENT.md (testing environments)

### For First-Time Deployers
1. DEVOPS-SUMMARY.md (quick start checklist)
2. DEPLOYMENT.md (step-by-step)
3. QUICK-REFERENCE.md (common commands)

---

## Key Sections by Topic

### Scaling & Performance
- **INFRASTRUCTURE.md** → "Scaling Phases" section
- **INFRASTRUCTURE.md** → "Load Testing Results" section
- **DEPLOYMENT.md** → "Scaling Strategy" section

### Monitoring & Observability
- **INFRASTRUCTURE.md** → "Monitoring Metrics" section
- **DEPLOYMENT.md** → "Monitoring and Logging" section
- **QUICK-REFERENCE.md** → "Monitoring Queries" section

### Incident Response
- **INCIDENT-RESPONSE.md** → "Alert Runbooks" section
- **QUICK-REFERENCE.md** → "Incident Response" section
- **DEPLOYMENT.md** → "Incident Response" section

### Cost Management
- **INFRASTRUCTURE.md** → "Cost Breakdown" section
- **INFRASTRUCTURE.md** → "Scaling Phases" section
- **QUICK-REFERENCE.md** → "Cost Monitoring" section

### Security
- **INFRASTRUCTURE.md** → "Security Architecture" section
- **TEAM-INTEGRATION.md** → "Security Testing" section
- **QUICK-REFERENCE.md** → "Security" section

### Testing
- **TEAM-INTEGRATION.md** → "QA Team Integration" section
- **DEPLOYMENT.md** → "Testing" section
- **QUICK-REFERENCE.md** → "Testing" section

---

## Feature Flags & Configuration

**ConfigMap Location:** `k8s/configmap.yaml`

**Common Adjustments:**

```yaml
# Model selection
DEFAULT_MODEL: "haiku"              # Change default
ALLOWED_MODELS: "haiku,sonnet,opus"  # Restrict available models

# Rate limiting
RATE_LIMIT_PER_HOUR: "1000"         # Per-user limit
RATE_LIMIT_PER_MINUTE: "50"

# Caching
CACHE_TTL_SECONDS: "3600"           # Cache duration
CACHE_MAX_SIZE_MB: "500"            # Cache size

# Monitoring
LOG_LEVEL: "info"                   # Logging level
METRICS_ENABLED: "true"
TRACING_ENABLED: "true"
```

**To update:**
```bash
kubectl edit configmap claude-router-config -n claude-router
```

---

## Deployment Checklist

### Phase 1: Local Development
- [ ] Read DEVOPS-SUMMARY.md
- [ ] Run `docker-compose up`
- [ ] Verify API at `http://localhost:3000`
- [ ] Review DEPLOYMENT.md Quick Start section
- [ ] Test dashboard and metrics

### Phase 2: Kubernetes Cluster
- [ ] Create Kubernetes cluster (3+ nodes)
- [ ] Configure kubeconfig
- [ ] Follow DEPLOYMENT.md → "Kubernetes Deployment"
- [ ] Deploy: `kubectl apply -f k8s/`
- [ ] Verify all pods running

### Phase 3: CI/CD Pipeline
- [ ] Configure GitHub repository
- [ ] Add secrets via `gh secret set`
- [ ] Push to develop branch
- [ ] Verify staging deployment
- [ ] Push to main branch
- [ ] Verify production deployment

### Phase 4: Monitoring
- [ ] Verify Prometheus metrics
- [ ] Access Grafana dashboards
- [ ] Configure Slack notifications
- [ ] Test alert firing

### Phase 5: Load Testing
- [ ] Read TEAM-INTEGRATION.md → "Load Testing"
- [ ] Run k6 load tests
- [ ] Verify auto-scaling works
- [ ] Document performance

### Phase 6: Production
- [ ] Complete pre-deployment checklist (DEPLOYMENT.md)
- [ ] Set up on-call rotation
- [ ] Run security audit
- [ ] Deploy with monitoring
- [ ] Conduct post-deployment verification

---

## File Statistics

| Document | Size | Sections | Audience |
|----------|------|----------|----------|
| DEVOPS-SUMMARY.md | 400 lines | 15 | Everyone |
| DEPLOYMENT.md | 300 lines | 12 | DevOps, Operators |
| INFRASTRUCTURE.md | 400 lines | 18 | Architects, DevOps |
| TEAM-INTEGRATION.md | 400 lines | 9 | All teams |
| INCIDENT-RESPONSE.md | 400 lines | 10 | DevOps, On-call |
| QUICK-REFERENCE.md | 200 lines | 15 | Daily reference |

**Total:** 2,100+ lines of documentation

---

## Key Metrics

### Performance Targets
- **Availability:** 99.9%
- **Latency P95:** < 500ms
- **Latency P99:** < 2s
- **Error Rate:** < 1%
- **Cache Hit Rate:** > 30%

### Scaling Targets
- **100 users:** 1 pod, $500/month
- **500 users:** 3 pods, $2,000/month
- **2,000 users:** 10 pods, $5,000/month
- **10,000 users:** 50 pods, $10,000+/month

### SLO Targets
- **Request Success Rate:** > 99.9%
- **API Availability:** > 99.9%
- **Cache Hit Rate:** > 30%

---

## Quick Links

**Start Here:**
- 👉 [DEVOPS-SUMMARY.md](./DEVOPS-SUMMARY.md) - Overview of everything

**Deploy Now:**
- 👉 [DEPLOYMENT.md](./DEPLOYMENT.md) - Step-by-step guide

**Understand Architecture:**
- 👉 [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) - Design & scaling

**Manage Incidents:**
- 👉 [INCIDENT-RESPONSE.md](./INCIDENT-RESPONSE.md) - Playbooks

**Daily Operations:**
- 👉 [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) - Common commands

**Team Integration:**
- 👉 [TEAM-INTEGRATION.md](./TEAM-INTEGRATION.md) - For all teams

---

## Support Resources

### Documentation
- All `.md` files in repository root
- Comments in `.yaml` files
- Inline code comments in TypeScript files

### External Resources
- Kubernetes docs: https://kubernetes.io/docs/
- Docker docs: https://docs.docker.com/
- Prometheus docs: https://prometheus.io/docs/
- Redis docs: https://redis.io/docs/

### Internal Contacts
- DevOps Lead: [Name]
- ML Team Lead: [Name]
- QA Lead: [Name]
- VP Engineering: [Name]

---

## Glossary

| Term | Definition |
|------|-----------|
| **Haiku** | Fastest, cheapest Claude model |
| **Sonnet** | Balanced Claude model |
| **Opus** | Most capable Claude model |
| **HPA** | Horizontal Pod Autoscaler (auto-scaling) |
| **SLO** | Service Level Objective (target availability) |
| **RTO** | Recovery Time Objective (max downtime) |
| **RPO** | Recovery Point Objective (max data loss) |
| **TTL** | Time To Live (cache expiration) |
| **P95/P99** | 95th/99th percentile latency |
| **SEV** | Severity level (1=critical, 4=low) |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-10-21 | Initial infrastructure design |

---

## File Location Map

```
claude-router/
├── 📄 DEVOPS-SUMMARY.md           ← Start here
├── 📄 DEPLOYMENT.md               ← Setup guide
├── 📄 INFRASTRUCTURE.md           ← Architecture
├── 📄 TEAM-INTEGRATION.md         ← Team guides
├── 📄 INCIDENT-RESPONSE.md        ← Incidents
├── 📄 QUICK-REFERENCE.md          ← Commands
├── 📄 INFRASTRUCTURE-INDEX.md     ← This file
│
├── 🐳 Dockerfile
├── 🐳 docker-compose.yml
├── 🐳 .dockerignore
│
├── ☸️ k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── deployment.yaml
│   ├── redis-deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   └── pdb.yaml
│
├── 🔧 .github/workflows/
│   └── ci-cd.yaml
│
├── 📊 monitoring/
│   ├── prometheus.yml
│   ├── alerts.yml
│   └── grafana/provisioning/
│
└── 💾 src/core/
    └── redis-cache.ts
```

---

**Navigation Created:** 2026-10-21
**Total Infrastructure Docs:** 2,100+ lines
**Configuration Files:** 8 Kubernetes manifests
**Pipeline Files:** 1 GitHub Actions workflow
**Code Changes:** 1 new Redis integration file
