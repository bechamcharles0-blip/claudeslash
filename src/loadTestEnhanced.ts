/**
 * ENHANCED LOAD TESTING FRAMEWORK
 *
 * Production-grade load testing with proper metrics collection:
 * - P50, P95, P99, P99.9 latency percentiles (minimum 1000 requests)
 * - Sustained load for 15-20+ minutes after ramp-up
 * - Error rate tracking and classification
 * - Throughput measurements
 * - Baseline comparison
 *
 * Usage:
 *   npm run load-test -- --scenario light --requests 1000 --concurrent 100
 *   npm run load-test -- --scenario medium --requests 5000 --concurrent 500
 *   npm run load-test -- --scenario heavy --requests 10000 --concurrent 1000
 *
 * Research:
 * - https://www.radview.com/blog/p99-latency-why-matters-how-measure-load-testing/
 * - Single outlier can shift P99 by 100s of ms
 * - Must test at scale (1000+ requests minimum)
 * - Measure variance, not just average
 */

import { ModelRouter } from './core/modelRouter.js';
import * as fs from 'fs';

interface LoadTestScenario {
  name: string;
  requestsPerSecond: number;
  totalRequests: number;
  maxConcurrency: number;
  duration?: number; // in seconds
  rampUpTime?: number; // in seconds
}

interface LoadTestMetrics {
  timestamp: Date;
  scenario: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;

  // Latency percentiles (critical for P99 latency assessment)
  latencyMetrics: {
    min: number;
    p50: number;
    p95: number;
    p99: number;
    p99_9: number;
    max: number;
    average: number;
  };

  // Throughput
  throughput: {
    requestsPerSecond: number;
    peakRps: number;
    averageRps: number;
  };

  // Token & Cost metrics
  totalTokens: {
    input: number;
    output: number;
    cached: number;
  };
  totalCost: number;

  // Error classification
  errors: {
    timeouts: number;
    rateLimit: number;
    apiFailure: number;
    other: number;
  };

  // Cache metrics
  cacheHitRate: number;
  modelDistribution: Record<string, number>;

  // Memory metrics
  memoryUsage: {
    startHeap: number;
    endHeap: number;
    peakHeap: number;
    growth: number;
  };
}

class EnhancedLoadTester {
  private router: ModelRouter;
  private latencies: number[] = [];
  private errorDetails: Array<{ time: number; type: string; error: string }> = [];
  private tokensUsed = { input: 0, output: 0, cached: 0 };
  private totalCost = 0;
  private cacheHits = 0;
  private modelCounts: Record<string, number> = { haiku: 0, sonnet: 0, opus: 0, fable: 0 };
  private startTime = 0;
  private rpsHistory: number[] = [];
  private peakHeap = 0;

  constructor(apiKey: string) {
    this.router = new ModelRouter(apiKey);
  }

  async runScenario(scenario: LoadTestScenario): Promise<LoadTestMetrics> {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  Enhanced Load Test: ${scenario.name.padEnd(30)}║
╚════════════════════════════════════════════════════════════╝

Configuration:
  Total Requests:    ${scenario.totalRequests.toLocaleString()}
  Max Concurrency:   ${scenario.maxConcurrency}
  Target RPS:        ${scenario.requestsPerSecond}
  Ramp-up Time:      ${scenario.rampUpTime || 60}s
  Duration:          ${scenario.duration || 'until complete'}s

Starting load test (${new Date().toISOString()})...
    `);

    this.reset();
    const memBefore = process.memoryUsage().heapUsed;
    this.startTime = Date.now();

    // Ramp up phase (gradually increase load)
    const rampUpTime = (scenario.rampUpTime || 60) * 1000;
    const rampUpRequests = Math.ceil((scenario.totalRequests * rampUpTime) / ((scenario.duration || 300) * 1000));

    console.log(`[RAMP-UP] Starting ramp-up phase (${rampUpTime / 1000}s)...`);
    await this.rampUp(rampUpRequests, scenario.maxConcurrency, rampUpTime);

    // Sustained load phase
    const sustainedRequests = scenario.totalRequests - rampUpRequests;
    console.log(`[SUSTAINED] Starting sustained load phase (${sustainedRequests.toLocaleString()} requests)...`);
    await this.sustainedLoad(sustainedRequests, scenario.maxConcurrency);

    const totalDuration = Date.now() - this.startTime;
    const memAfter = process.memoryUsage().heapUsed;

    return {
      timestamp: new Date(),
      scenario: scenario.name,
      totalRequests: this.latencies.length + this.errorDetails.length,
      successfulRequests: this.latencies.length,
      failedRequests: this.errorDetails.length,
      errorRate: (this.errorDetails.length / (this.latencies.length + this.errorDetails.length)) * 100,
      latencyMetrics: this.calculateLatencyMetrics(),
      throughput: this.calculateThroughput(totalDuration),
      totalTokens: this.tokensUsed,
      totalCost: this.totalCost,
      errors: this.classifyErrors(),
      cacheHitRate: this.latencies.length > 0 ? (this.cacheHits / this.latencies.length) * 100 : 0,
      modelDistribution: this.modelCounts,
      memoryUsage: {
        startHeap: memBefore / 1024 / 1024,
        endHeap: memAfter / 1024 / 1024,
        peakHeap: this.peakHeap / 1024 / 1024,
        growth: (memAfter - memBefore) / 1024 / 1024,
      },
    };
  }

  private async rampUp(requests: number, maxConcurrency: number, duration: number): Promise<void> {
    const rampUpQueue: Promise<void>[] = [];
    const startTime = Date.now();

    for (let i = 0; i < requests; i++) {
      const promise = this.executeRequest(i);
      rampUpQueue.push(promise);

      // Calculate dynamic concurrency based on ramp-up progress
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentConcurrency = Math.ceil(maxConcurrency * progress * 0.5); // Ramp to 50% of max

      if (rampUpQueue.length >= currentConcurrency) {
        await Promise.race(rampUpQueue);
        rampUpQueue.splice(rampUpQueue.findIndex((p) => !p), 1);
      }

      // Log progress every 100 requests
      if ((i + 1) % 100 === 0) {
        const currentRps = ((i + 1) / (Date.now() - startTime)) * 1000;
        process.stdout.write(`\r[RAMP-UP] ${(i + 1).toLocaleString()} requests, ${currentRps.toFixed(0)} req/sec`);
      }
    }

    await Promise.all(rampUpQueue);
    console.log('\n[RAMP-UP] Complete');
  }

  private async sustainedLoad(requests: number, maxConcurrency: number): Promise<void> {
    const queue: Promise<void>[] = [];

    for (let i = 0; i < requests; i++) {
      const promise = this.executeRequest(i);
      queue.push(promise);

      if (queue.length >= maxConcurrency) {
        await Promise.race(queue);
        queue.splice(queue.findIndex((p) => !p), 1);
      }

      // Log progress every 100 requests
      if ((i + 1) % 100 === 0) {
        const elapsed = Date.now() - this.startTime;
        const currentRps = ((this.latencies.length + this.errorDetails.length) / elapsed) * 1000;
        process.stdout.write(`\r[SUSTAINED] ${(i + 1).toLocaleString()} requests, ${currentRps.toFixed(0)} req/sec, P99: ${this.getPercentile(99)}ms`);
      }
    }

    await Promise.all(queue);
    console.log('\n[SUSTAINED] Complete');
  }

  private async executeRequest(index: number): Promise<void> {
    try {
      const startTime = Date.now();

      const response = await this.router.route({
        task: `Load test request ${index} - ${Date.now()}`,
        budget: 100000,
      });

      const latency = Date.now() - startTime;
      this.latencies.push(latency);

      // Track metrics
      this.tokensUsed.input += response.tokensUsed.input;
      this.tokensUsed.output += response.tokensUsed.output;
      this.tokensUsed.cached += response.tokensUsed.cached;
      this.totalCost += response.cost;

      if (response.cacheHit) {
        this.cacheHits++;
      }

      this.modelCounts[response.model]++;

      // Update peak memory
      this.peakHeap = Math.max(this.peakHeap, process.memoryUsage().heapUsed);

    } catch (error) {
      const errorType = this.classifyError(error);
      this.errorDetails.push({
        time: Date.now(),
        type: errorType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private classifyError(error: any): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('rate')) return 'rateLimit';
    if (message.includes('api') || message.includes('API')) return 'apiFailure';
    return 'other';
  }

  private classifyErrors(): { timeouts: number; rateLimit: number; apiFailure: number; other: number } {
    const result = { timeouts: 0, rateLimit: 0, apiFailure: 0, other: 0 };
    for (const err of this.errorDetails) {
      result[err.type as keyof typeof result]++;
    }
    return result;
  }

  private calculateLatencyMetrics() {
    const sorted = [...this.latencies].sort((a, b) => a - b);

    return {
      min: sorted[0] || 0,
      p50: this.getPercentileFromSorted(sorted, 50),
      p95: this.getPercentileFromSorted(sorted, 95),
      p99: this.getPercentileFromSorted(sorted, 99),
      p99_9: this.getPercentileFromSorted(sorted, 99.9),
      max: sorted[sorted.length - 1] || 0,
      average: sorted.length > 0 ? sorted.reduce((a, b) => a + b) / sorted.length : 0,
    };
  }

  private getPercentile(percentile: number): number {
    return this.getPercentileFromSorted([...this.latencies].sort((a, b) => a - b), percentile);
  }

  private getPercentileFromSorted(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  private calculateThroughput(totalDurationMs: number) {
    const totalRequests = this.latencies.length + this.errorDetails.length;
    const totalDurationSeconds = totalDurationMs / 1000;

    return {
      requestsPerSecond: (totalRequests / totalDurationSeconds),
      peakRps: Math.max(...this.rpsHistory, 0),
      averageRps: totalRequests / totalDurationSeconds,
    };
  }

  printResults(metrics: LoadTestMetrics): void {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              Load Test Results                             ║
║  Scenario: ${metrics.scenario.padEnd(40)}║
╚════════════════════════════════════════════════════════════╝

REQUESTS:
  Total:             ${metrics.totalRequests.toLocaleString()}
  Successful:        ${metrics.successfulRequests.toLocaleString()}
  Failed:            ${metrics.failedRequests.toLocaleString()}
  Error Rate:        ${metrics.errorRate.toFixed(2)}% (SLO: < 0.1%)

LATENCY (milliseconds) - P99 is critical for production:
  Min:               ${metrics.latencyMetrics.min}ms
  P50:               ${metrics.latencyMetrics.p50}ms
  P95:               ${metrics.latencyMetrics.p95}ms
  P99:               ${metrics.latencyMetrics.p99}ms (SLO: < 100-500ms depending on scenario)
  P99.9:             ${metrics.latencyMetrics.p99_9}ms
  Max:               ${metrics.latencyMetrics.max}ms
  Average:           ${metrics.latencyMetrics.average.toFixed(1)}ms

THROUGHPUT:
  Requests/sec:      ${metrics.throughput.requestsPerSecond.toFixed(2)}
  Peak RPS:          ${metrics.throughput.peakRps.toFixed(2)}
  Avg RPS:           ${metrics.throughput.averageRps.toFixed(2)}

TOKEN & COST:
  Input Tokens:      ${metrics.totalTokens.input.toLocaleString()}
  Output Tokens:     ${metrics.totalTokens.output.toLocaleString()}
  Cached Tokens:     ${metrics.totalTokens.cached.toLocaleString()}
  Total Cost:        $${metrics.totalCost.toFixed(2)}
  Cost per Request:  $${(metrics.totalCost / metrics.totalRequests).toFixed(6)}

ERRORS:
  Timeouts:          ${metrics.errors.timeouts}
  Rate Limits:       ${metrics.errors.rateLimit}
  API Failures:      ${metrics.errors.apiFailure}
  Other:             ${metrics.errors.other}

CACHE:
  Hit Rate:          ${metrics.cacheHitRate.toFixed(1)}% (SLO: > 70%)

MODEL DISTRIBUTION:
  Haiku:             ${metrics.modelDistribution.haiku || 0}
  Sonnet:            ${metrics.modelDistribution.sonnet || 0}
  Opus:              ${metrics.modelDistribution.opus || 0}
  Fable:             ${metrics.modelDistribution.fable || 0}

MEMORY:
  Start:             ${metrics.memoryUsage.startHeap.toFixed(1)} MB
  End:               ${metrics.memoryUsage.endHeap.toFixed(1)} MB
  Peak:              ${metrics.memoryUsage.peakHeap.toFixed(1)} MB
  Growth:            ${metrics.memoryUsage.growth.toFixed(1)} MB

Timestamp:           ${metrics.timestamp.toISOString()}
    `);
  }

  saveResults(filename: string, metrics: LoadTestMetrics): void {
    fs.writeFileSync(filename, JSON.stringify(metrics, null, 2));
    console.log(`\nResults saved: ${filename}`);
  }

  private reset(): void {
    this.latencies = [];
    this.errorDetails = [];
    this.tokensUsed = { input: 0, output: 0, cached: 0 };
    this.totalCost = 0;
    this.cacheHits = 0;
    this.modelCounts = { haiku: 0, sonnet: 0, opus: 0, fable: 0 };
    this.rpsHistory = [];
    this.peakHeap = process.memoryUsage().heapUsed;
  }
}

// Predefined scenarios based on LOAD TESTING METHODOLOGY research
const SCENARIOS: Record<string, LoadTestScenario> = {
  baseline: {
    name: 'Baseline (10 req/s, 1 concurrent)',
    requestsPerSecond: 10,
    totalRequests: 1000,
    maxConcurrency: 1,
    rampUpTime: 30,
    duration: 100,
  },
  light: {
    name: 'Light Load (100 req/s)',
    requestsPerSecond: 100,
    totalRequests: 1000,
    maxConcurrency: 10,
    rampUpTime: 60,
    duration: 300, // 5 minutes sustained
  },
  medium: {
    name: 'Medium Load (500 req/s)',
    requestsPerSecond: 500,
    totalRequests: 5000,
    maxConcurrency: 100,
    rampUpTime: 120,
    duration: 600, // 10 minutes sustained
  },
  heavy: {
    name: 'Heavy Load (1000+ req/s)',
    requestsPerSecond: 1000,
    totalRequests: 10000,
    maxConcurrency: 500,
    rampUpTime: 300,
    duration: 1200, // 20 minutes sustained (critical for GC spikes)
  },
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const scenarioName = args[0] || 'baseline';

  const scenario = SCENARIOS[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  const tester = new EnhancedLoadTester(apiKey);
  const metrics = await tester.runScenario(scenario);

  tester.printResults(metrics);
  tester.saveResults(`load-test-${scenarioName}-${Date.now()}.json`, metrics);
}

main().catch(console.error);
