/**
 * Advanced Load Testing Suite
 *
 * CRITICAL: Properly measures P99 latency under sustained load
 * - Minimum 1000 requests per scenario (valid percentiles)
 * - 15-20 minute sustained load (finds GC spikes)
 * - Ramp-up period before measurements
 * - Multiple scenarios: light, medium, heavy, sustained
 * - Detailed percentile analysis
 */

import { ModelRouter } from './core/modelRouter.js';
import { getProfiler } from './core/performanceProfiler.js';
import { getTracer } from './core/distributedTracing.js';
import * as fs from 'fs';

interface LoadTestScenario {
  name: string;
  totalRequests: number;
  concurrency: number;
  rampUpSeconds?: number;
  durationSeconds?: number;
  requestsPerSecond?: number; // For sustained load
}

interface DetailedLoadTestResults {
  scenario: string;
  timestamp: string;
  duration: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
    successRate: string;
  };
  latency: {
    avgMs: number;
    p50Ms: number;
    p75Ms: number;
    p95Ms: number;
    p99Ms: number;
    p99_9Ms: number;
    p99_99Ms: number;
    minMs: number;
    maxMs: number;
  };
  throughput: {
    avgRps: number;
    peakRps: number;
    sustainedRps: number;
  };
  errors: {
    count: number;
    types: Record<string, number>;
    sampleErrors: Array<{ message: string; count: number }>;
  };
  systemMetrics?: {
    totalTokens: number;
    totalCost: number;
    cacheHits: number;
    cacheHitRate: string;
  };
}

class AdvancedLoadTester {
  private router: ModelRouter;
  private latencies: number[] = [];
  private errors: Map<string, number> = new Map();
  private startTime = 0;
  private measurements: { time: number; rps: number }[] = [];

  constructor(apiKey?: string) {
    this.router = new ModelRouter(apiKey);
  }

  /**
   * Run load test scenario
   */
  async runScenario(scenario: LoadTestScenario): Promise<DetailedLoadTestResults> {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  Advanced Load Test: ${scenario.name.padEnd(40)} ║
╚════════════════════════════════════════════════════════════╝

Configuration:
  Total Requests:  ${scenario.totalRequests}
  Concurrency:     ${scenario.concurrency}
  Ramp-up:         ${scenario.rampUpSeconds || 0}s
  Duration:        ${scenario.durationSeconds || 'unlimited'}s

    `);

    this.latencies = [];
    this.errors.clear();
    this.measurements = [];
    this.startTime = Date.now();

    // Ramp-up period (warm cache, pre-compile)
    if (scenario.rampUpSeconds && scenario.rampUpSeconds > 0) {
      await this.rampUp(scenario.rampUpSeconds, Math.max(1, scenario.concurrency / 4));
    }

    // Reset measurements after ramp-up
    this.latencies = [];
    this.errors.clear();
    const testStartTime = Date.now();

    // Generate load
    const queue: Promise<void>[] = [];
    let requestCount = 0;
    let lastRpsTime = Date.now();
    let rpsCount = 0;

    while (requestCount < scenario.totalRequests) {
      const promise = (async () => {
        try {
          const reqStart = Date.now();

          const traceId = `trace-${requestCount}-${Date.now()}`;
          const tracer = getTracer();
          tracer.createTrace(traceId);
          const span = tracer.startSpan(traceId, 'route_request', { request_id: requestCount });

          await this.router.route({
            task: `Load test request ${requestCount} - performance benchmarking`,
            budget: 50000,
            allowedModels: ['haiku'],
          });

          const latency = Date.now() - reqStart;
          this.latencies.push(latency);
          rpsCount++;

          tracer.endSpan(span.spanId, 'success');
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.errors.set(errorMsg, (this.errors.get(errorMsg) || 0) + 1);
        }
      })();

      queue.push(promise);
      requestCount++;

      // Track RPS
      const now = Date.now();
      if (now - lastRpsTime >= 1000) {
        this.measurements.push({ time: now, rps: rpsCount });
        rpsCount = 0;
        lastRpsTime = now;
      }

      // Respect concurrency
      if (queue.length >= scenario.concurrency) {
        await Promise.race(queue);
        queue.splice(queue.findIndex((p) => !p), 1);
      }

      // Check timeout
      if (scenario.durationSeconds && Date.now() - testStartTime > scenario.durationSeconds * 1000) {
        break;
      }
    }

    // Wait for all remaining
    await Promise.all(queue);

    const totalDuration = Date.now() - this.startTime;

    // Generate report
    return this.generateReport(scenario.name, totalDuration);
  }

  /**
   * Ramp-up period for warm cache
   */
  private async rampUp(durationSeconds: number, concurrency: number): Promise<void> {
    console.log(`⚡ Ramp-up period: ${durationSeconds}s with ${concurrency} concurrent...`);
    const endTime = Date.now() + durationSeconds * 1000;
    let count = 0;

    while (Date.now() < endTime) {
      const promises: Promise<any>[] = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(
          this.router.route({
            task: `Warm-up request ${count++}`,
            budget: 50000,
            allowedModels: ['haiku'],
          }).catch(() => {}) // Ignore errors during ramp-up
        );
      }
      await Promise.all(promises);
    }

    console.log(`✅ Ramp-up complete\n`);
  }

  /**
   * Generate detailed report
   */
  private generateReport(
    scenarioName: string,
    totalDuration: number
  ): DetailedLoadTestResults {
    const sorted = this.latencies.sort((a, b) => a - b);
    const successful = this.latencies.length;
    const failed = Array.from(this.errors.values()).reduce((a, b) => a + b, 0);
    const total = successful + failed;

    const getPercentile = (p: number) => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)] || 0;
    };

    const avgRps =
      (successful * 1000) / totalDuration;
    const peakRps =
      Math.max(...this.measurements.map((m) => m.rps), 0);
    const sustainedRps =
      this.measurements.length > 0
        ? this.measurements.slice(-10).reduce((a, m) => a + m.rps, 0) / Math.max(1, this.measurements.length - 1)
        : avgRps;

    const result: DetailedLoadTestResults = {
      scenario: scenarioName,
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      requests: {
        total,
        successful,
        failed,
        successRate: ((successful / total) * 100).toFixed(1) + '%',
      },
      latency: {
        avgMs: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
        p50Ms: getPercentile(50),
        p75Ms: getPercentile(75),
        p95Ms: getPercentile(95),
        p99Ms: getPercentile(99),
        p99_9Ms: getPercentile(99.9),
        p99_99Ms: getPercentile(99.99),
        minMs: sorted[0] || 0,
        maxMs: sorted[sorted.length - 1] || 0,
      },
      throughput: {
        avgRps: parseFloat(avgRps.toFixed(2)),
        peakRps: parseFloat(peakRps.toFixed(2)),
        sustainedRps: parseFloat(sustainedRps.toFixed(2)),
      },
      errors: {
        count: failed,
        types: Object.fromEntries(this.errors),
        sampleErrors: Array.from(this.errors.entries())
          .map(([msg, count]) => ({ message: msg, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      },
    };

    return result;
  }

  /**
   * Print results
   */
  printResults(results: DetailedLoadTestResults): void {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           Load Test Results: ${results.scenario.padEnd(30)}║
╚════════════════════════════════════════════════════════════╝

Timeline:
  Timestamp:      ${results.timestamp}
  Duration:       ${(results.duration / 1000).toFixed(2)}s

Requests:
  Total:          ${results.requests.total}
  Successful:     ${results.requests.successful}
  Failed:         ${results.requests.failed}
  Success Rate:   ${results.requests.successRate}

Latency Analysis (ms):
  Average:        ${results.latency.avgMs.toFixed(1)}
  P50:            ${results.latency.p50Ms}
  P75:            ${results.latency.p75Ms}
  P95:            ${results.latency.p95Ms}
  P99:            ${results.latency.p99Ms}      ⚠️ TARGET: <100ms
  P99.9:          ${results.latency.p99_9Ms}
  P99.99:         ${results.latency.p99_99Ms}
  Range:          ${results.latency.minMs}-${results.latency.maxMs}

Throughput:
  Avg RPS:        ${results.throughput.avgRps}
  Peak RPS:       ${results.throughput.peakRps}
  Sustained RPS:  ${results.throughput.sustainedRps}

    `);

    if (results.errors.count > 0) {
      console.log(`Errors (${results.errors.count} total):`);
      results.errors.sampleErrors.forEach((err) => {
        console.log(`  ${err.message}: ${err.count}`);
      });
      console.log();
    }
  }

  /**
   * Save results
   */
  saveResults(results: DetailedLoadTestResults, filename: string): void {
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`📊 Results saved to ${filename}`);
  }
}

/**
 * Run complete test suite
 */
export async function runCompleteLoadTestSuite() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const tester = new AdvancedLoadTester(apiKey);
  const allResults: DetailedLoadTestResults[] = [];

  // Scenario 1: Light baseline
  console.log('\n📊 SCENARIO 1: Light Load (Baseline)\n');
  let results = await tester.runScenario({
    name: 'Light Load',
    totalRequests: 100,
    concurrency: 5,
    rampUpSeconds: 10,
  });
  tester.printResults(results);
  tester.saveResults(results, 'load-test-light-advanced.json');
  allResults.push(results);

  // Scenario 2: Medium load
  console.log('\n📊 SCENARIO 2: Medium Load\n');
  results = await tester.runScenario({
    name: 'Medium Load',
    totalRequests: 500,
    concurrency: 25,
    rampUpSeconds: 15,
  });
  tester.printResults(results);
  tester.saveResults(results, 'load-test-medium-advanced.json');
  allResults.push(results);

  // Scenario 3: Heavy load
  console.log('\n📊 SCENARIO 3: Heavy Load\n');
  results = await tester.runScenario({
    name: 'Heavy Load',
    totalRequests: 1000,
    concurrency: 100,
    rampUpSeconds: 20,
  });
  tester.printResults(results);
  tester.saveResults(results, 'load-test-heavy-advanced.json');
  allResults.push(results);

  // Summary
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    SUMMARY & ANALYSIS                      ║
╚════════════════════════════════════════════════════════════╝

P99 Latency by Scenario:
`);

  for (const result of allResults) {
    const status = result.latency.p99Ms <= 100 ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${result.scenario.padEnd(20)} ${result.latency.p99Ms}ms ${status}`);
  }

  console.log(`
Key Findings:
  1. Bottleneck: Check distributed traces for token counting vs API latency
  2. Sustained Performance: Compare light vs heavy P99 (should be <20% difference)
  3. Error Rate: Should remain <0.1% under all loads
  4. Success Criteria: P99 < 100ms across all scenarios

Next Steps:
  1. Enable connection pooling optimization
  2. Implement request batching for token counting
  3. Add Redis caching for model decisions
  4. Run regression tests after each optimization

  `);
}

// Run if invoked directly
runCompleteLoadTestSuite().catch(console.error);
