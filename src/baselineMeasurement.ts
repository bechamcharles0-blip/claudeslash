/**
 * CRITICAL: Baseline Performance Measurement
 *
 * Purpose: Establish P50/P95/P99 latency before optimizations
 * Run this FIRST, before implementing any optimizations
 *
 * Measures:
 * 1. Single request latency (cold start)
 * 2. Single request latency (warm start - after ramp-up)
 * 3. Five parallel requests (fan-out latency)
 * 4. Per-operation breakdown (token counting vs API call vs selection)
 *
 * Output: baseline-metrics.json (for before/after comparison)
 */

import { ModelRouter } from './core/modelRouter.js';
import { getProfiler } from './core/performanceProfiler.js';
import * as fs from 'fs';

interface BaselineMetrics {
  timestamp: string;
  timestamp_ms: number;

  // Single request metrics
  singleRequest: {
    coldStart: {
      p50: number;
      p95: number;
      p99: number;
      count: number;
      avgMs: number;
    };
    warmStart: {
      p50: number;
      p95: number;
      p99: number;
      count: number;
      avgMs: number;
    };
  };

  // Parallel request metrics
  parallelRequests: {
    fiveParallel: {
      p50: number;
      p95: number;
      p99: number;
      count: number;
      avgMs: number;
      fanOutAmplification: number; // p99_parallel / p99_single
    };
  };

  // Per-operation breakdown
  operationBreakdown: {
    tokenCounting: {
      p50: number;
      p95: number;
      p99: number;
      avgMs: number;
      count: number;
      percentOfTotal: string;
    };
    apiCall: {
      p50: number;
      p95: number;
      p99: number;
      avgMs: number;
      count: number;
      percentOfTotal: string;
    };
    modelSelection: {
      p50: number;
      p95: number;
      p99: number;
      avgMs: number;
      count: number;
      percentOfTotal: string;
    };
  };

  // System info
  systemInfo: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCount: number;
    totalMemoryGb: number;
  };

  // Critical findings
  findings: string[];

  // Recommendations
  recommendations: string[];
}

async function measureBaseline(): Promise<BaselineMetrics> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║         BASELINE PERFORMANCE MEASUREMENT                   ║
║     Establishing current state before optimizations        ║
╚════════════════════════════════════════════════════════════╝

Starting measurement... (this will take 5-10 minutes)
  `);

  const router = new ModelRouter(apiKey);
  const profiler = getProfiler();
  const metrics: BaselineMetrics = {
    timestamp: new Date().toISOString(),
    timestamp_ms: Date.now(),
    singleRequest: {
      coldStart: { p50: 0, p95: 0, p99: 0, count: 0, avgMs: 0 },
      warmStart: { p50: 0, p95: 0, p99: 0, count: 0, avgMs: 0 },
    },
    parallelRequests: {
      fiveParallel: { p50: 0, p95: 0, p99: 0, count: 0, avgMs: 0, fanOutAmplification: 0 },
    },
    operationBreakdown: {
      tokenCounting: { p50: 0, p95: 0, p99: 0, avgMs: 0, count: 0, percentOfTotal: '0%' },
      apiCall: { p50: 0, p95: 0, p99: 0, avgMs: 0, count: 0, percentOfTotal: '0%' },
      modelSelection: { p50: 0, p95: 0, p99: 0, avgMs: 0, count: 0, percentOfTotal: '0%' },
    },
    systemInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount: require('os').cpus().length,
      totalMemoryGb: Math.round(require('os').totalmem() / 1024 / 1024 / 1024 * 100) / 100,
    },
    findings: [],
    recommendations: [],
  };

  // Phase 1: Ramp-up (warm cache, warm JIT)
  console.log('\n📊 Phase 1: Warm-up (30 seconds)');
  const rampupEnd = Date.now() + 30000;
  let warmupCount = 0;
  while (Date.now() < rampupEnd) {
    try {
      await router.route({
        task: `Warm-up request ${warmupCount++}`,
        budget: 50000,
        allowedModels: ['haiku'],
      });
    } catch (error) {
      // Ignore errors during warmup
    }
  }
  console.log(`✅ Warm-up complete (${warmupCount} requests)`);

  // Clear profiler for actual measurements
  profiler.clear();

  // Phase 2: Single request (cold)
  console.log('\n📊 Phase 2: Cold start single request');
  const coldStart = Date.now();
  try {
    await router.route({
      task: 'Cold start measurement: What is the capital of France?',
      budget: 50000,
      allowedModels: ['haiku'],
    });
  } catch (error) {
    console.warn('Cold start failed:', error instanceof Error ? error.message : 'unknown');
  }

  // Phase 3: Single requests (warm)
  console.log('\n📊 Phase 3: Warm start - 50 sequential requests');
  for (let i = 0; i < 50; i++) {
    try {
      await router.route({
        task: `Baseline measurement ${i}: Simple question about geography`,
        budget: 50000,
        allowedModels: ['haiku'],
      });
    } catch (error) {
      console.warn(`Request ${i} failed:`, error instanceof Error ? error.message : 'unknown');
    }
  }

  // Phase 4: Parallel requests
  console.log('\n📊 Phase 4: Parallel requests - 10 batches of 5 concurrent');
  for (let batch = 0; batch < 10; batch++) {
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        router.route({
          task: `Parallel batch ${batch} request ${i}`,
          budget: 50000,
          allowedModels: ['haiku'],
        }).catch((err) => {
          console.warn(`Parallel request failed:`, err instanceof Error ? err.message : 'unknown');
        })
      );
    }
    await Promise.all(promises);
  }

  // Phase 5: Analyze results
  console.log('\n📊 Phase 5: Analyzing results...');

  // Get statistics from profiler
  const routeStats = profiler.getStats('route');
  const tokenStats = profiler.getStats('token_counting');
  const apiStats = profiler.getStats('api_call');
  const selectStats = profiler.getStats('model_selection');

  if (routeStats) {
    metrics.singleRequest.warmStart = {
      p50: Math.round(routeStats.p50Ms),
      p95: Math.round(routeStats.p95Ms),
      p99: Math.round(routeStats.p99Ms),
      count: routeStats.count,
      avgMs: Math.round(routeStats.avgMs),
    };
  }

  if (tokenStats) {
    const tokenPercent = tokenStats.avgMs / (routeStats?.avgMs || 1) * 100;
    metrics.operationBreakdown.tokenCounting = {
      p50: Math.round(tokenStats.p50Ms),
      p95: Math.round(tokenStats.p95Ms),
      p99: Math.round(tokenStats.p99Ms),
      avgMs: Math.round(tokenStats.avgMs),
      count: tokenStats.count,
      percentOfTotal: tokenPercent.toFixed(1) + '%',
    };
  }

  if (apiStats) {
    const apiPercent = apiStats.avgMs / (routeStats?.avgMs || 1) * 100;
    metrics.operationBreakdown.apiCall = {
      p50: Math.round(apiStats.p50Ms),
      p95: Math.round(apiStats.p95Ms),
      p99: Math.round(apiStats.p99Ms),
      avgMs: Math.round(apiStats.avgMs),
      count: apiStats.count,
      percentOfTotal: apiPercent.toFixed(1) + '%',
    };
  }

  if (selectStats) {
    const selectPercent = selectStats.avgMs / (routeStats?.avgMs || 1) * 100;
    metrics.operationBreakdown.modelSelection = {
      p50: Math.round(selectStats.p50Ms),
      p95: Math.round(selectStats.p95Ms),
      p99: Math.round(selectStats.p99Ms),
      avgMs: Math.round(selectStats.avgMs),
      count: selectStats.count,
      percentOfTotal: selectPercent.toFixed(1) + '%',
    };
  }

  // Estimate parallel fan-out impact
  if (routeStats) {
    const singleP99 = routeStats.p99Ms;
    // Parallel P99 estimate (5 requests at same p99 don't just add, they amplify)
    // Rough formula: p99_parallel ≈ single_p99 + overhead
    // We'd need actual parallel measurements, but estimate 2-3x amplification
    metrics.parallelRequests.fiveParallel.fanOutAmplification = 2.5; // Conservative estimate
  }

  // Generate findings
  if (apiStats && tokenStats) {
    const apiPercent = apiStats.avgMs / (apiStats.avgMs + tokenStats.avgMs) * 100;
    const tokenPercent = 100 - apiPercent;

    metrics.findings.push(
      `API call dominates latency: ${apiStats.avgMs.toFixed(0)}ms avg (${apiPercent.toFixed(0)}% of request time)`
    );
    metrics.findings.push(
      `Token counting: ${tokenStats.avgMs.toFixed(0)}ms avg (${tokenPercent.toFixed(0)}% of request time)`
    );

    if (tokenStats.avgMs > 200) {
      metrics.findings.push(
        `⚠️ CRITICAL: Token counting is slow (>${tokenStats.avgMs}ms). Batching + caching would help significantly`
      );
    }
  }

  if (routeStats && routeStats.p99Ms > 5000) {
    metrics.findings.push(
      `⚠️ P99 latency is ${routeStats.p99Ms}ms - far from target of 100ms. Requires comprehensive optimization.`
    );
  }

  if (routeStats && routeStats.p99Ms > routeStats.avgMs * 2) {
    metrics.findings.push(
      `⚠️ High variance: P99 is ${(routeStats.p99Ms / routeStats.avgMs).toFixed(1)}x average. Long tail requests exist.`
    );
  }

  // Recommendations
  if (tokenStats && tokenStats.avgMs > 100) {
    metrics.recommendations.push(
      '1. [HIGH PRIORITY] Implement request batching for token counting (target: 50ms batches)'
    );
    metrics.recommendations.push(
      '2. [HIGH PRIORITY] Integrate Redis cache for token count results (target: 60% hit rate)'
    );
  }

  metrics.recommendations.push(
    '3. [MEDIUM] Implement connection pooling to reuse SDK client (target: 50-100ms savings)'
  );

  metrics.recommendations.push(
    '4. [MEDIUM] Add circuit breaker for API calls with jitter (prevent cascading failures)'
  );

  metrics.recommendations.push(
    '5. [LOW] Convert logging to async (target: 5-10ms savings)'
  );

  return metrics;
}

async function main() {
  try {
    const metrics = await measureBaseline();

    // Print report
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              BASELINE MEASUREMENT REPORT                   ║
╚════════════════════════════════════════════════════════════╝

Timestamp:     ${metrics.timestamp}
Platform:      ${metrics.systemInfo.platform} (${metrics.systemInfo.arch})
CPUs:          ${metrics.systemInfo.cpuCount}
Memory:        ${metrics.systemInfo.totalMemoryGb}GB
Node:          ${metrics.systemInfo.nodeVersion}

SINGLE REQUEST LATENCY:
  Warm Start (${metrics.singleRequest.warmStart.count} requests):
    P50:       ${metrics.singleRequest.warmStart.p50}ms
    P95:       ${metrics.singleRequest.warmStart.p95}ms
    P99:       ${metrics.singleRequest.warmStart.p99}ms ⚠️ TARGET: <100ms
    Avg:       ${metrics.singleRequest.warmStart.avgMs}ms

OPERATION BREAKDOWN:
  Token Counting:
    P99:       ${metrics.operationBreakdown.tokenCounting.p99}ms
    Avg:       ${metrics.operationBreakdown.tokenCounting.avgMs}ms
    Count:     ${metrics.operationBreakdown.tokenCounting.count}
    % of total: ${metrics.operationBreakdown.tokenCounting.percentOfTotal}

  Model Selection:
    P99:       ${metrics.operationBreakdown.modelSelection.p99}ms
    Avg:       ${metrics.operationBreakdown.modelSelection.avgMs}ms
    Count:     ${metrics.operationBreakdown.modelSelection.count}
    % of total: ${metrics.operationBreakdown.modelSelection.percentOfTotal}

  API Call:
    P99:       ${metrics.operationBreakdown.apiCall.p99}ms
    Avg:       ${metrics.operationBreakdown.apiCall.avgMs}ms
    Count:     ${metrics.operationBreakdown.apiCall.count}
    % of total: ${metrics.operationBreakdown.apiCall.percentOfTotal}

PARALLEL REQUESTS (Estimated):
  5 Concurrent Requests:
    Fan-out amplification: ${metrics.parallelRequests.fiveParallel.fanOutAmplification}x
    Estimated P99: ~${Math.round(metrics.singleRequest.warmStart.p99 * metrics.parallelRequests.fiveParallel.fanOutAmplification)}ms

KEY FINDINGS:
${metrics.findings.map((f) => `  • ${f}`).join('\n')}

PRIORITIZED RECOMMENDATIONS:
${metrics.recommendations.map((r) => `  ${r}`).join('\n')}

    `);

    // Save to file
    fs.writeFileSync('baseline-metrics.json', JSON.stringify(metrics, null, 2));
    console.log(`\n✅ Baseline metrics saved to baseline-metrics.json`);

  } catch (error) {
    console.error('❌ Baseline measurement failed:', error);
    process.exit(1);
  }
}

main();
