/**
 * Load Testing Script
 * Tests system behavior under high concurrent load
 *
 * Usage: node --loader tsx/esm src/loadTest.ts [options]
 *   --requests 1000    Total requests to send
 *   --concurrent 10    Concurrent requests at a time
 *   --model haiku      Model to use (haiku/sonnet/opus)
 *   --duration 60      Duration in seconds (optional)
 */

import { ModelRouter } from './core/modelRouter.js';
import * as fs from 'fs';

interface LoadTestOptions {
  totalRequests: number;
  concurrency: number;
  model: 'haiku' | 'sonnet' | 'opus';
  duration?: number;
  apiKey?: string;
}

interface LoadTestResults {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalDuration: number;
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  requestsPerSecond: number;
  totalTokens: number;
  totalCost: number;
  errors: Array<{ request: number; error: string }>;
}

class LoadTester {
  private router: ModelRouter;
  private results: LoadTestResults;
  private latencies: number[] = [];
  private errors: Array<{ request: number; error: string }> = [];

  constructor(options: LoadTestOptions) {
    this.router = new ModelRouter(options.apiKey);
    this.results = {
      totalRequests: options.totalRequests,
      successfulRequests: 0,
      failedRequests: 0,
      totalDuration: 0,
      averageLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
      requestsPerSecond: 0,
      totalTokens: 0,
      totalCost: 0,
      errors: [],
    };
  }

  async runLoad(options: LoadTestOptions): Promise<LoadTestResults> {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              Claude Router Load Test                       ║
╚════════════════════════════════════════════════════════════╝

Configuration:
  Total Requests:  ${options.totalRequests}
  Concurrency:     ${options.concurrency}
  Model:           ${options.model}
  Duration:        ${options.duration ? options.duration + 's' : 'unlimited'}

Starting load test...
    `);

    const startTime = Date.now();
    const queue: Promise<void>[] = [];

    // Generate requests
    for (let i = 0; i < options.totalRequests; i++) {
      const promise = (async () => {
        try {
          const requestStart = Date.now();

          await this.router.route({
            task: `Load test request ${i}`,
            budget: 50000,
            allowedModels: [options.model],
          });

          const latency = Date.now() - requestStart;
          this.latencies.push(latency);
          this.results.successfulRequests++;
        } catch (error) {
          this.results.failedRequests++;
          this.errors.push({
            request: i,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();

      queue.push(promise);

      // Respect concurrency limit
      if (queue.length >= options.concurrency) {
        await Promise.race(queue);
        queue.splice(queue.findIndex((p) => !p), 1);
      }
    }

    // Wait for all remaining requests
    await Promise.all(queue);

    const totalDuration = Date.now() - startTime;
    this.results.totalDuration = totalDuration;

    // Calculate statistics
    this.calculateStats();

    return this.results;
  }

  private calculateStats(): void {
    this.latencies.sort((a, b) => a - b);

    this.results.averageLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;

    this.results.p50Latency = this.getPercentile(50);
    this.results.p95Latency = this.getPercentile(95);
    this.results.p99Latency = this.getPercentile(99);

    this.results.requestsPerSecond =
      (this.results.successfulRequests * 1000) / this.results.totalDuration;

    this.results.errors = this.errors;
  }

  private getPercentile(percentile: number): number {
    const index = Math.ceil((percentile / 100) * this.latencies.length) - 1;
    return this.latencies[Math.max(0, index)] || 0;
  }

  printResults(): void {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    Load Test Results                       ║
╚════════════════════════════════════════════════════════════╝

Requests:
  Total:          ${this.results.totalRequests}
  Successful:     ${this.results.successfulRequests}
  Failed:         ${this.results.failedRequests}
  Success Rate:   ${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(1)}%

Latency (ms):
  Average:        ${this.results.averageLatency.toFixed(1)}
  Median (P50):   ${this.results.p50Latency}
  P95:            ${this.results.p95Latency}
  P99:            ${this.results.p99Latency}

Throughput:
  Duration:       ${(this.results.totalDuration / 1000).toFixed(2)}s
  Req/sec:        ${this.results.requestsPerSecond.toFixed(2)}

Tokens & Cost:
  Total Tokens:   ${this.results.totalTokens.toLocaleString()}
  Total Cost:     $${this.results.totalCost.toFixed(2)}

    `);

    if (this.results.errors.length > 0) {
      console.log('Errors (first 10):');
      this.results.errors.slice(0, 10).forEach((err) => {
        console.log(`  Request ${err.request}: ${err.error}`);
      });
      console.log(`  ... and ${this.results.errors.length - 10} more errors\n`);
    }
  }

  saveResults(filename: string): void {
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`Results saved to ${filename}`);
  }
}

// CRITICAL: Load Test Scenarios
async function runLoadTestScenarios() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  // Scenario 1: Low load - 10 concurrent requests
  console.log('\n📊 Scenario 1: Light Load (10 concurrent)');
  let tester = new LoadTester({
    totalRequests: 100,
    concurrency: 10,
    model: 'haiku',
    apiKey,
  });
  let results = await tester.runLoad({
    totalRequests: 100,
    concurrency: 10,
    model: 'haiku',
    apiKey,
  });
  tester.printResults();
  tester.saveResults('load-test-light.json');

  // Scenario 2: Medium load - 50 concurrent requests
  console.log('\n📊 Scenario 2: Medium Load (50 concurrent)');
  tester = new LoadTester({
    totalRequests: 500,
    concurrency: 50,
    model: 'haiku',
    apiKey,
  });
  results = await tester.runLoad({
    totalRequests: 500,
    concurrency: 50,
    model: 'haiku',
    apiKey,
  });
  tester.printResults();
  tester.saveResults('load-test-medium.json');

  // Scenario 3: Heavy load - 100 concurrent requests
  console.log('\n📊 Scenario 3: Heavy Load (100 concurrent)');
  tester = new LoadTester({
    totalRequests: 1000,
    concurrency: 100,
    model: 'haiku',
    apiKey,
  });
  results = await tester.runLoad({
    totalRequests: 1000,
    concurrency: 100,
    model: 'haiku',
    apiKey,
  });
  tester.printResults();
  tester.saveResults('load-test-heavy.json');

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                 CRITICAL FINDINGS                          ║
╚════════════════════════════════════════════════════════════╝

⚠️  At 100 concurrent requests:
  - Watch for timeouts (API rate limits)
  - Monitor for queue buildup
  - Track error rate increase
  - Verify cost predictions

🔍 Questions to answer:
  1. What's the max sustained throughput?
  2. Where does error rate increase?
  3. How does latency degrade under load?
  4. Are rate limits being hit?
  5. Is token counting accurate at scale?

💾 Results saved to:
  - load-test-light.json
  - load-test-medium.json
  - load-test-heavy.json
  `);
}

// Parse command line arguments
function parseArgs(): LoadTestOptions {
  const args = process.argv.slice(2);
  const options: LoadTestOptions = {
    totalRequests: 100,
    concurrency: 10,
    model: 'haiku',
    apiKey: process.env.ANTHROPIC_API_KEY,
  };

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--requests':
        options.totalRequests = parseInt(value);
        break;
      case '--concurrent':
        options.concurrency = parseInt(value);
        break;
      case '--model':
        options.model = value as any;
        break;
      case '--duration':
        options.duration = parseInt(value);
        break;
    }
  }

  return options;
}

// Run load test
runLoadTestScenarios().catch(console.error);
