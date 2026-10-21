# Claude Router: Dashboard Designs

## Executive Dashboard

**Purpose**: Real-time view of Claude Router's impact for leadership

**Layout**: 4 sections across 2 rows

### Section 1: Key Metrics (Top Row - Left 1/3)

```
┌──────────────────────────────────────┐
│  💰 Token Savings                    │
│  ┌──────────────────────────────────┐│
│  │  2.4M tokens                     ││
│  │  ↑ +15% from last week           ││
│  └──────────────────────────────────┘│
│                                      │
│  📊 Real Savings: 28.3%              │
│  (vs using Opus for all)             │
│                                      │
│  Average per request: 234 tokens     │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  💵 Cost Savings                     │
│  ┌──────────────────────────────────┐│
│  │  $12,456                         ││
│  │  ↑ +23% from last week           ││
│  └──────────────────────────────────┘│
│                                      │
│  Savings vs Baseline: 34.2%          │
│                                      │
│  Daily Run Rate: $892/day            │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  😊 User Satisfaction                │
│  ┌──────────────────────────────────┐│
│  │  4.2 / 5.0                       ││
│  │  ↑ +0.3 from last week           ││
│  └──────────────────────────────────┘│
│                                      │
│  NPS: +62                            │
│  (Would recommend: 78%)              │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  ✅ System Reliability               │
│  ┌──────────────────────────────────┐│
│  │  99.8% uptime                    ││
│  │  ↑ 0.1% from last week           ││
│  └──────────────────────────────────┘│
│                                      │
│  Errors: 2 in last 1000 requests     │
│  Last error: 4 hours ago             │
└──────────────────────────────────────┘
```

### Section 2: Trend Charts (Top Row - Right 2/3)

```
┌────────────────────────────────────────────────────────┐
│  📈 7-Day Trend: Token & Cost Savings                  │
│                                                        │
│  Cost Savings ($ - blue line)                          │
│  Token Savings (% - orange line)                       │
│                                                        │
│         $14K |      ●                                  │
│              |     / \        ●                        │
│         $12K |    /   \      / \      ●                │
│              |   /     \    /   \    / \      ●        │
│         $10K |  /       \  /     \  /   \    / \       │
│              | /         \/       \/     \  /   \      │
│          $8K +──────────────────────────────────────   │
│              Mon  Tue  Wed  Thu  Fri  Sat  Sun         │
│                                                        │
│  Token Savings: 26% → 28% → 27% → 30% → 33%           │
│  Cost Savings:  $10K → $11K → $10.5K → $12K → $12.5K  │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  📊 Model Distribution (Last 7 Days)                   │
│                                                        │
│  Haiku   40% ████████████                   │ 4,934    │
│  Sonnet  45% █████████████                  │ 5,560    │
│  Opus    12% ███                            │ 1,481    │
│  Fable    3% █                              │   370    │
│                                                        │
│  Cost breakdown:                                       │
│  Haiku:  $245   Sonnet: $2,120   Opus: $8,932          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  ⚡ Quality vs Cost (Efficiency Frontier)              │
│                                                        │
│  Quality (0-10)                                        │
│       10 |                                   Opus      │
│          |                                  *          │
│        8 |                        Sonnet *             │
│          |                            *                │
│        6 |                    Haiku *                  │
│          |                        *                    │
│        4 |                                             │
│          |                                             │
│        2 |                                             │
│        0 └─────────────────────────────────────────    │
│          0    5    10    15    20    Cost ($)          │
│                                                        │
│  "Smart routing" shows Sonnet as best cost/quality    │
└────────────────────────────────────────────────────────┘
```

### Section 3: Status & Alerts (Bottom Row - Full Width)

```
┌─────────────────────────────────────────────────────────────────────┐
│  🚨 Status & Alerts                                                 │
│                                                                     │
│  ✅ All systems operational                                          │
│  ↳ Last incident: yesterday (resolved in 12 min)                    │
│                                                                     │
│  ⚠️  1 Warning                                                      │
│  ↳ Cache hit rate low (9%) - consider TTL tuning                   │
│  ↳ Accuracy on Haiku dipped (85%) - monitor                        │
│                                                                     │
│  📊 Performance targets:                                             │
│  Target: 30% savings  │  Actual: 34.2%  │  Status: ✅ Exceeded      │
│  Target: >4.0 quality │  Actual: 4.2    │  Status: ✅ On track      │
│  Target: <3s p95      │  Actual: 2.1s   │  Status: ✅ On track      │
│  Target: 99%+ uptime  │  Actual: 99.8%  │  Status: ✅ On track      │
│                                                                     │
│  📍 Last updated: 2 minutes ago                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Operations Dashboard

**Purpose**: Infrastructure, latency, and system health for DevOps

### Section 1: Latency Distribution

```
┌────────────────────────────────────────────────────────┐
│  ⚡ API Latency Distribution (Last Hour)               │
│                                                        │
│  Latency (ms)                                          │
│       5000 |                                           │
│            |                                ▁▂▃        │
│       4000 |                        ▁▂▃▅▆▇████▃▂▁    │
│            |                    ▁▂▃▅▇███████████▅▃▂▁  │
│       3000 |              ▁▂▃▅▇██████████████████▅▃▂  │
│            |          ▁▂▃▅▇███████████████████████▅▃  │
│       2000 |    ▁▂▃▅▇████████████████████████████▇▆▅  │
│            |  ▁▂▃▅▇█████████████████████████████▇▆▅▃  │
│       1000 |▁▂▃▅▇██████████████████████████████▇▆▅▃▁  │
│            |                                           │
│          0 └──────────────────────────────────────────┤
│            P50: 840ms   P95: 2,100ms   P99: 3,400ms   │
│            Avg: 1,240ms Max: 4,800ms                  │
│                                                        │
│  Model breakdown:                                      │
│  Haiku   (50%): avg 620ms                             │
│  Sonnet  (40%): avg 1,850ms                           │
│  Opus    (10%): avg 2,950ms                           │
└────────────────────────────────────────────────────────┘
```

### Section 2: Error Analysis

```
┌────────────────────────────────────────────────────────┐
│  🚨 Error Rate & Top Errors (Last 24 Hours)           │
│                                                        │
│  Error Timeline:                                       │
│  Rate (%):                                             │
│    2% |                                                │
│       |                           ▁                    │
│    1% |    ▁        ▁      ▁      ▄▆▃      ▁ ▁       │
│       | ▂▄▆█▆▃  ▂▅▇█▅  ▂▅▇█▂ ▂▄▆███▃  ▂▄▆█▂▅       │
│    0% └────────────────────────────────────────────    │
│       00:00 06:00 12:00 18:00 24:00                    │
│                                                        │
│  Top Errors:                                           │
│  1. RATE_LIMIT_EXCEEDED   (23 times, 0.3%)            │
│     ↳ User: 'user_123' at 14:00 UTC                   │
│     ↳ Action: Alert triggered, user notified          │
│                                                        │
│  2. TIMEOUT_ERROR         (8 times, 0.1%)             │
│     ↳ Model: Opus (slow requests)                     │
│     ↳ Action: Monitoring                              │
│                                                        │
│  3. INVALID_REQUEST       (2 times, <0.1%)            │
│     ↳ Validation error in input                       │
│     ↳ Action: None (user error)                       │
│                                                        │
│  Uptime: 99.87% (0.13% errors in SLA)                 │
└────────────────────────────────────────────────────────┘
```

### Section 3: Cache Analysis

```
┌────────────────────────────────────────────────────────┐
│  💾 Cache Performance (Last 24 Hours)                  │
│                                                        │
│  Hit Rate:    12.3%  (target: 15-25%)                 │
│  Hits:        1,523                                    │
│  Misses:      10,877                                   │
│  Evictions:   234 (due to size limit)                  │
│                                                        │
│  Cache Size:  847 MB / 1000 MB (85%)                  │
│  TTL Tuning:  Current 30 min → Recommend 60 min       │
│  Potential:   Could improve hit rate to 18% with 1h   │
│                                                        │
│  Top Cached Tasks:                                     │
│  1. "Summarize..." - 234 hits                         │
│  2. "Explain..." - 156 hits                           │
│  3. "List..." - 89 hits                               │
│                                                        │
│  Recommendation:                                       │
│  Increase TTL from 30m to 60m                         │
│  Impact: +6% hit rate, +$850/month savings            │
│  Risk: Low (cache mostly static content)              │
└────────────────────────────────────────────────────────┘
```

### Section 4: Infrastructure Load

```
┌────────────────────────────────────────────────────────┐
│  📊 Request Load & Capacity (Last 24 Hours)           │
│                                                        │
│  Requests/Second:                                      │
│    100 |                      ▂▃▃▃▄▄▅                 │
│        |                 ▁▂▃▄▅▆███▇▆▅▄▃▂▁             │
│     75 |           ▁▂▃▄▅▇███████████▇▆▅▄▂             │
│        |      ▁▂▃▄▅▇████████████████████▇▆▄▂          │
│     50 | ▁▂▃▄▅▆▇█████████████████████████▇▆▄▂         │
│        |                                               │
│     25 |                                               │
│        |                                               │
│      0 └───────────────────────────────────────────────┤
│        00:00  06:00  12:00  18:00  24:00              │
│                                                        │
│  Peak: 98 req/s (14:00 UTC, Wednesday)                │
│  Current: 45 req/s                                    │
│  Capacity: 200 req/s (45% utilized)                   │
│  Headroom: 55% (safe)                                 │
│                                                        │
│  Alert Thresholds:                                    │
│  Warning: 70% (140 req/s) - Scale up alert            │
│  Critical: 90% (180 req/s) - Emergency scale          │
│                                                        │
│  Est. when we'll hit 70%: 6-8 weeks at current growth │
└────────────────────────────────────────────────────────┘
```

---

## Analytics & Insights Dashboard

**Purpose**: Model accuracy, user behavior, cost optimization for Product

### Section 1: Model Selection Accuracy

```
┌────────────────────────────────────────────────────────┐
│  🎯 Model Selection Accuracy (with User Feedback)     │
│                                                        │
│  Overall Accuracy: 88.2%                              │
│  ↑ +2.3% from last week                               │
│                                                        │
│  By Model:                                             │
│  ┌─ Haiku ─────────────────────────────────────────┐  │
│  │ Accuracy: 84.1% (good for simple tasks)         │  │
│  │ Mismatches: 47 (too cheap 32, too expensive 15) │  │
│  │ Recommendation: Keep as-is, refine complexity   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Sonnet ───────────────────────────────────────┐  │
│  │ Accuracy: 91.3% (best overall)                 │  │
│  │ Mismatches: 12 (too cheap 8, too expensive 4)  │  │
│  │ Recommendation: Increase usage (currently 40%) │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─ Opus ──────────────────────────────────────────┐  │
│  │ Accuracy: 96.1% (highest when used correctly)   │  │
│  │ Mismatches: 3 (too cheap 3, too expensive 0)    │  │
│  │ Recommendation: Use for complex only (not all)  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  Decision Tree Accuracy: 92.4%                        │
│  ML Model Accuracy Target: 95% (gap: -2.6%)           │
└────────────────────────────────────────────────────────┘
```

### Section 2: User Satisfaction Breakdown

```
┌────────────────────────────────────────────────────────┐
│  😊 User Satisfaction & NPS (Last 30 Days)            │
│                                                        │
│  Overall NPS: +62                                      │
│  Promoters (9-10): 68%                                │
│  Passives (7-8):   20%                                │
│  Detractors (0-6): 12%                                │
│                                                        │
│  Satisfaction Scores (1-5):                           │
│  ┌─ Overall Quality ─────────────────────────────┐    │
│  │  4.3/5 ████████░ Excellent                   │    │
│  │  Trend: ↑ steady improvement                 │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌─ Accuracy ────────────────────────────────────┐    │
│  │  4.2/5 ████████░ Good                        │    │
│  │  Trend: ↑ +0.3 from last week                │    │
│  │  Issue: Some hallucinations in Haiku         │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌─ Speed ───────────────────────────────────────┐    │
│  │  3.8/5 ███████░░ Good                        │    │
│  │  Trend: ↓ -0.2 (Opus slower)                 │    │
│  │  Impact: Users switching to Sonnet           │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌─ Cost Efficiency ────────────────────────────┐    │
│  │  4.1/5 ████████░ Good                        │    │
│  │  Trend: ↑ +0.4 (major improvement)           │    │
│  │  Win: Users report 30% cost savings          │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  Would Use Again: 82% (↑ from 76% last week)         │
│  Recommendation: Focus on speed for Opus users        │
└────────────────────────────────────────────────────────┘
```

### Section 3: Task Category Analysis

```
┌────────────────────────────────────────────────────────┐
│  📋 Usage & Performance by Task Category               │
│                                                        │
│  Task Category Distribution:                           │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Summarization  35% ███████████                 │  │
│  │ Code Gen       28% ████████                    │  │
│  │ Analysis       22% ███████                     │  │
│  │ Writing        15% █████                       │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  Performance by Category:                              │
│  ┌─ Summarization ──────────────────────────────┐    │
│  │ Volume: 4,320 requests                       │    │
│  │ Model: Haiku 70%, Sonnet 25%, Opus 5%       │    │
│  │ Quality: 4.4/5 (highest satisfaction)       │    │
│  │ Cost/req: $0.08 (lowest)                     │    │
│  │ Insight: Haiku works great here, keep using  │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌─ Code Generation ────────────────────────────┐    │
│  │ Volume: 3,456 requests                       │    │
│  │ Model: Haiku 20%, Sonnet 60%, Opus 20%      │    │
│  │ Quality: 3.9/5 (lowest satisfaction)        │    │
│  │ Cost/req: $0.18 (highest)                    │    │
│  │ Insight: Users prefer higher quality (Opus) │    │
│  │          Consider pushing Sonnet more       │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  Top Issues by Category:                              │
│  Summarization: Occasional incomplete (8%)            │
│  Code Gen:      Hallucinations (12%)                  │
│  Analysis:      Wrong conclusions (5%)                │
│  Writing:       Too formal tone (3%)                  │
└────────────────────────────────────────────────────────┘
```

### Section 4: Opportunities & Recommendations

```
┌────────────────────────────────────────────────────────┐
│  🎯 Optimization Opportunities (ROI Priority)          │
│                                                        │
│  1. INCREASE SONNET USAGE FOR CODE GEN                │
│     Current: 60% Sonnet, 20% Haiku, 20% Opus         │
│     Target: 75% Sonnet, 5% Haiku, 20% Opus           │
│     Impact: +$1,200/month savings (lower cost)        │
│              +0.3 quality improvement                 │
│     Effort: Low (tweak model selection)               │
│     Timeline: 1 week                                  │
│                                                        │
│  2. REDUCE OPUS FOR SUMMARIZATION                    │
│     Current: 70% Haiku, 25% Sonnet, 5% Opus         │
│     Issue: Opus is overkill (Haiku gets 4.4/5)       │
│     Target: 80% Haiku, 20% Sonnet, 0% Opus          │
│     Impact: +$450/month savings (no quality loss)     │
│     Effort: Low (remove Opus escalation)              │
│     Timeline: 1 week                                  │
│                                                        │
│  3. IMPROVE HAIKU QUALITY FOR CODE GEN                │
│     Current: 20% Haiku, satisfaction 3.2/5           │
│     Issue: Hallucinations in Haiku responses          │
│     Target: Better prompt engineering or rule-based   │
│     Impact: Unlock +$800 savings if quality OK        │
│     Effort: Medium (tweak prompts/detection)          │
│     Timeline: 2 weeks                                 │
│                                                        │
│  4. DOCUMENT BEST PRACTICES                           │
│     Issue: Users don't know optimal model per task    │
│     Action: Create guides (Summarization → Haiku)     │
│     Impact: +2% user satisfaction                     │
│     Effort: Low (docs)                                │
│     Timeline: 1 week                                  │
│                                                        │
│  TOTAL POTENTIAL: +$2,450/month (19% additional)      │
│  Most impactful: #1 (Sonnet for code gen)            │
│  Quickest win: #2 (Remove Opus for summaries)        │
└────────────────────────────────────────────────────────┘
```

---

## User Analytics Dashboard

**Purpose**: Per-user metrics and cohort analysis for Customer Success

### Section 1: Top Users

```
┌────────────────────────────────────────────────────────┐
│  👥 Top 20 Users (Last 30 Days)                       │
│                                                        │
│  Rank │ User ID       │ Requests │ Cost  │ Satisfaction│
│  ──────┼──────────────┼──────────┼───────┼─────────────│
│    1  │ org-acme      │   1,240  │$189   │ 4.5/5  ⭐⭐⭐│
│    2  │ user-alice    │   980    │$142   │ 4.2/5  ⭐⭐ │
│    3  │ org-techco    │   856    │$267   │ 3.8/5  ⭐   │
│    4  │ user-bob      │   723    │$98    │ 4.6/5  ⭐⭐⭐│
│    5  │ org-startup   │   654    │$156   │ 4.1/5  ⭐⭐ │
│    6  │ user-carol    │   612    │$201   │ 3.9/5  ⭐   │
│    7  │ org-ent       │   589    │$412   │ 3.5/5  ☆   │
│    8  │ user-dave     │   478    │$67    │ 4.4/5  ⭐⭐⭐│
│    9  │ user-eve      │   456    │$134   │ 4.3/5  ⭐⭐ │
│   10  │ org-startup2  │   423    │$189   │ 4.0/5  ⭐⭐ │
│   11  │ user-frank    │   401    │$79    │ 4.2/5  ⭐⭐ │
│   12  │ org-scale     │   389    │$298   │ 3.7/5  ⭐   │
│   13  │ user-grace    │   378    │$156   │ 4.1/5  ⭐⭐ │
│   14  │ user-henry    │   345    │$92    │ 4.5/5  ⭐⭐⭐│
│   15  │ org-bigcorp   │   334    │$512   │ 3.2/5  ☆   │
│  ... (5 more)                                          │
│                                                        │
│  Insights:                                             │
│  • High volume users (>900 req) are happy (>4.2)      │
│  • org-ent and org-bigcorp need attention (low satisfaction)│
│  • Cost varies: $98-$512 (should be $80-$200 ideal)   │
│                                                        │
│  Actions:                                              │
│  ✅ Call org-ent: Optimizing model selection          │
│  ✅ Call org-bigcorp: Likely using too much Opus      │
│  ✅ Promote user-bob: Best cost+satisfaction ratio    │
└────────────────────────────────────────────────────────┘
```

### Section 2: User Cohorts & Retention

```
┌────────────────────────────────────────────────────────┐
│  📊 User Cohort Analysis (Retention & LTV)            │
│                                                        │
│  Cohort │ Users │ Week 1 │ Week 2 │ Week 3 │ Week 4   │
│  ────────┼──────┼────────┼────────┼────────┼──────────│
│  Jan1    │ 284  │ 100%   │  89%   │  78%   │  72%     │
│  Jan8    │ 312  │ 100%   │  91%   │  82%   │  (→)     │
│  Jan15   │ 298  │ 100%   │  92%   │  (→)   │          │
│  Jan22   │ 267  │ 100%   │  (→)   │        │          │
│                                                        │
│  Interpretation:                                       │
│  • Jan cohorts show 72-82% 4-week retention           │
│  • Improvement: Jan8 cohort better (91% W2)          │
│  • Reason: Better onboarding or product changes       │
│                                                        │
│  User LTV by Signup Date:                             │
│  Jan cohort: $2,840 average (4-week)                  │
│  Feb cohort: $3,120 average (↑10% improvement)        │
│                                                        │
│  Recommendation:                                       │
│  Continue improvements that boosted Feb cohort         │
│  (better quality/documentation/support)               │
│                                                        │
│  Churn Reasons (Jan cohort, 28% churn):              │
│  • "Too expensive" (42%)                              │
│  • "Found alternative" (35%)                          │
│  • "Not meeting needs" (23%)                          │
└────────────────────────────────────────────────────────┘
```

### Section 3: Usage Patterns

```
┌────────────────────────────────────────────────────────┐
│  📅 User Usage Patterns (Time, Frequency, Tasks)       │
│                                                        │
│  Distribution by Hour of Day:                          │
│  Most active: 9am-11am (peak: 10am = 12% of daily)   │
│  Lowest: 2am-4am (2% of daily)                        │
│  Pattern: Standard business hours, US-focused         │
│                                                        │
│  Distribution by Day of Week:                          │
│  Weekday avg: 620 req/day                             │
│  Weekend avg: 240 req/day (61% drop)                  │
│  Insight: Business application (not consumer)         │
│                                                        │
│  Request Frequency Types:                             │
│  Power users (>100 req/day):   15% of users, 68% of volume│
│  Regular users (10-100 req/day): 42% of users, 28% of volume│
│  Light users (<10 req/day):     43% of users,  4% of volume│
│                                                        │
│  Engagement Trend (30-day):                            │
│  Growing:    234 users (↑ activity week-over-week)    │
│  Stable:     156 users (no change)                    │
│  Declining:  89 users (↓ activity, churn risk)        │
│                                                        │
│  Intervention needed:                                  │
│  • 89 declining users: Check satisfaction, offer help  │
│  • 234 growing users: Upgrade to higher tier?         │
└────────────────────────────────────────────────────────┘
```

---

## Implementation

### Backend (Express + GraphQL)

```typescript
// Analytics API endpoints
app.get('/analytics/metrics', async (req, res) => {
  const metrics = await persistence.getMetrics(req.query);
  res.json(metrics);
});

app.get('/analytics/kpis', async (req, res) => {
  const kpis = await persistence.getKPIs(req.query);
  res.json(kpis);
});

app.get('/analytics/dashboard', async (req, res) => {
  const data = await persistence.getDashboardData(req.query);
  res.json(data);
});
```

### Frontend (React + Recharts for Charts)

```typescript
// Dashboard component
import { LineChart, BarChart, PieChart } from 'recharts';

export function ExecutiveDashboard() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    fetch('/analytics/dashboard')
      .then(r => r.json())
      .then(setMetrics);
  }, []);

  return (
    <div className="dashboard">
      <KPICard title="Cost Savings" value="$12.5K" trend="+23%" />
      <KPICard title="Token Savings" value="2.4M" trend="+15%" />
      <LineChart data={metrics?.trends} />
      <PieChart data={metrics?.distribution} />
    </div>
  );
}
```

### Automated Reports (Cron Job)

```typescript
// Daily summary at 8am
schedule.scheduleJob('0 8 * * *', async () => {
  const summary = await analyticsEngine.generateDailySummary();
  await slack.sendMessage('#analytics', summary);
});

// Weekly deep-dive every Monday at 9am
schedule.scheduleJob('0 9 ? * MON', async () => {
  const report = await analyticsEngine.generateWeeklyReport();
  await slack.sendMessage('#product', report);
  await slack.sendMessage('#ml-team', report);
  await slack.sendMessage('#devops', report);
});
```

---

## Metrics Query Examples

### Get KPIs (JSON Response)

```bash
curl 'http://localhost:3000/analytics/kpis?hours=24'
```

```json
{
  "tokenSavings": {
    "totalSaved": 2400000,
    "percent": 28.3,
    "requestsAnalyzed": 12345
  },
  "costSavings": {
    "saved": 12456,
    "percent": 34.2,
    "actual": 24000,
    "baseline": 36456
  },
  "modelAccuracy": {
    "score": 88.2,
    "totalFeedback": 1234
  },
  "userSatisfaction": {
    "score": 4.2,
    "scale": "1-5",
    "totalFeedback": 1234
  },
  "apiLatency": {
    "average": 1240,
    "p50": 840,
    "p95": 2100,
    "p99": 3400,
    "max": 4800
  },
  "cacheHitRate": {
    "rate": 12.3,
    "hits": 1523,
    "total": 12345
  },
  "systemReliability": {
    "uptime": 99.8,
    "errors": 25,
    "total": 12345
  }
}
```

### Get Model Analysis

```bash
curl 'http://localhost:3000/analytics/models?hours=24'
```

```json
{
  "period": { "hours": 24 },
  "models": {
    "haiku": {
      "count": 4934,
      "totalCost": 245,
      "averageQuality": 6.2,
      "averageLatency": 620,
      "costPerRequest": 0.05
    },
    "sonnet": {
      "count": 5560,
      "totalCost": 2120,
      "averageQuality": 7.1,
      "averageLatency": 1850,
      "costPerRequest": 0.38
    },
    // ...
  }
}
```

---

## Quick Start

1. **Deploy this dashboard code** to your frontend
2. **Wire up the Analytics API** as shown in MEASUREMENT_INFRASTRUCTURE.md
3. **Create scheduled reports** (Slack integration)
4. **Set up alerts** for critical thresholds
5. **Train teams** on interpreting the dashboards

Each dashboard is designed to be **self-updating** (refresh every 5-10 minutes) and **interactive** (drill-down into details).
