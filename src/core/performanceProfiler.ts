/**
 * PerformanceProfiler: Detailed latency analysis per request
 *
 * Tracks:
 * - End-to-end latency
 * - Per-stage latency (token counting, complexity, selection, API call)
 * - P50/P95/P99/P99.9 percentiles
 * - Percentile heatmap for time-based analysis
 */

export interface LatencyPoint {
  timestamp: number;
  operationName: string;
  latencyMs: number;
  tags?: Record<string, string | number>;
}

export interface LatencyStats {
  operation: string;
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  p99_9Ms: number;
}

export class PerformanceProfiler {
  private measurements: LatencyPoint[] = [];
  private operationLatencies = new Map<string, number[]>();
  private readonly maxMeasurements = 100000; // Circular buffer

  /**
   * Record latency measurement
   */
  record(
    operationName: string,
    latencyMs: number,
    tags?: Record<string, string | number>
  ): void {
    const point: LatencyPoint = {
      timestamp: Date.now(),
      operationName,
      latencyMs,
      tags,
    };

    this.measurements.push(point);

    // Maintain circular buffer
    if (this.measurements.length > this.maxMeasurements) {
      this.measurements.shift();
    }

    // Track per-operation
    if (!this.operationLatencies.has(operationName)) {
      this.operationLatencies.set(operationName, []);
    }
    this.operationLatencies.get(operationName)!.push(latencyMs);
  }

  /**
   * Get statistics for operation
   */
  getStats(operationName: string): LatencyStats | null {
    const latencies = this.operationLatencies.get(operationName);
    if (!latencies || latencies.length === 0) return null;

    const sorted = [...latencies].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      operation: operationName,
      count,
      minMs: sorted[0],
      maxMs: sorted[count - 1],
      avgMs: sorted.reduce((a, b) => a + b, 0) / count,
      p50Ms: this.getPercentile(sorted, 50),
      p95Ms: this.getPercentile(sorted, 95),
      p99Ms: this.getPercentile(sorted, 99),
      p99_9Ms: this.getPercentile(sorted, 99.9),
    };
  }

  /**
   * Get all statistics
   */
  getAllStats(): LatencyStats[] {
    const stats: LatencyStats[] = [];
    for (const operationName of this.operationLatencies.keys()) {
      const stat = this.getStats(operationName);
      if (stat) stats.push(stat);
    }
    return stats;
  }

  /**
   * Calculate percentile
   */
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  /**
   * Get heatmap of latencies over time (for trend analysis)
   */
  getHeatmap(
    operationName: string,
    bucketSizeMs: number = 60000 // 1 minute buckets
  ): Array<{ timestamp: number; p50: number; p95: number; p99: number; count: number }> {
    const heatmap = new Map<number, number[]>();

    // Group measurements into time buckets
    for (const m of this.measurements) {
      if (m.operationName === operationName) {
        const bucket = Math.floor(m.timestamp / bucketSizeMs) * bucketSizeMs;
        if (!heatmap.has(bucket)) {
          heatmap.set(bucket, []);
        }
        heatmap.get(bucket)!.push(m.latencyMs);
      }
    }

    // Calculate percentiles for each bucket
    const result: Array<{ timestamp: number; p50: number; p95: number; p99: number; count: number }> = [];
    for (const [timestamp, latencies] of heatmap.entries()) {
      const sorted = latencies.sort((a, b) => a - b);
      result.push({
        timestamp,
        p50: this.getPercentile(sorted, 50),
        p95: this.getPercentile(sorted, 95),
        p99: this.getPercentile(sorted, 99),
        count: latencies.length,
      });
    }

    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get percentile over all measurements for operation
   */
  getPercentileLatency(operationName: string, percentile: number): number {
    const latencies = this.operationLatencies.get(operationName);
    if (!latencies || latencies.length === 0) return 0;

    const sorted = [...latencies].sort((a, b) => a - b);
    return this.getPercentile(sorted, percentile);
  }

  /**
   * Check if P99 target is met
   */
  checkTarget(operationName: string, targetP99Ms: number): boolean {
    const p99 = this.getPercentileLatency(operationName, 99);
    return p99 <= targetP99Ms;
  }

  /**
   * Get summary report
   */
  getSummary(): string {
    const stats = this.getAllStats();
    let report = `
╔════════════════════════════════════════════════════════════╗
║         Performance Profiler Summary                       ║
╚════════════════════════════════════════════════════════════╝

Total Measurements: ${this.measurements.length}

Operation Performance:
`;

    for (const stat of stats) {
      report += `
  ${stat.operation}:
    Count:      ${stat.count}
    Avg:        ${stat.avgMs.toFixed(1)}ms
    P50:        ${stat.p50Ms}ms
    P95:        ${stat.p95Ms}ms
    P99:        ${stat.p99Ms}ms
    P99.9:      ${stat.p99_9Ms}ms
    Range:      ${stat.minMs}ms - ${stat.maxMs}ms`;
    }

    return report;
  }

  /**
   * Export measurements
   */
  exportMeasurements(lastNSeconds: number = 3600): LatencyPoint[] {
    const cutoffTime = Date.now() - lastNSeconds * 1000;
    return this.measurements.filter((m) => m.timestamp >= cutoffTime);
  }

  /**
   * Clear measurements
   */
  clear(): void {
    this.measurements = [];
    this.operationLatencies.clear();
  }

  /**
   * Get measurement count
   */
  getCount(operationName?: string): number {
    if (operationName) {
      return this.operationLatencies.get(operationName)?.length || 0;
    }
    return this.measurements.length;
  }
}

// Global profiler instance
let profilerInstance: PerformanceProfiler | null = null;

export function getProfiler(): PerformanceProfiler {
  if (!profilerInstance) {
    profilerInstance = new PerformanceProfiler();
  }
  return profilerInstance;
}
