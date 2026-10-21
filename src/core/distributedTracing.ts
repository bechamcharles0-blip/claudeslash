/**
 * DistributedTracing: Per-hop latency analysis (Jaeger-like)
 *
 * Impact: Identifies true bottleneck (token counting? API? complexity analysis?)
 * - Trace spans for each operation
 * - Calculate critical path
 * - Export traces for analysis
 */

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string | number | boolean>;
  logs: Array<{ timestamp: number; message: string }>;
  status: 'pending' | 'success' | 'error';
}

export interface Trace {
  traceId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  spans: Span[];
  root?: Span;
}

export class DistributedTracer {
  private traces = new Map<string, Trace>();
  private spans = new Map<string, Span>();
  private spanStack: Span[] = []; // Stack for nested spans
  private stats = {
    totalTraces: 0,
    totalSpans: 0,
    operationTimes: new Map<string, { count: number; totalMs: number; p99Ms: number }>(),
  };

  /**
   * Create new trace
   */
  createTrace(traceId: string): Trace {
    const trace: Trace = {
      traceId,
      startTime: Date.now(),
      spans: [],
    };
    this.traces.set(traceId, trace);
    this.stats.totalTraces++;
    return trace;
  }

  /**
   * Start new span (operation)
   */
  startSpan(traceId: string, operation: string, tags: Record<string, any> = {}): Span {
    const parentSpan = this.spanStack[this.spanStack.length - 1];
    const span: Span = {
      traceId,
      spanId: this.generateId(),
      parentSpanId: parentSpan?.spanId,
      operation,
      startTime: Date.now(),
      tags,
      logs: [],
      status: 'pending',
    };

    this.spans.set(span.spanId, span);
    this.spanStack.push(span);

    const trace = this.traces.get(traceId);
    if (trace) {
      trace.spans.push(span);
      if (!trace.root && !parentSpan) {
        trace.root = span;
      }
    }

    this.stats.totalSpans++;
    return span;
  }

  /**
   * End span with success or error
   */
  endSpan(spanId: string, status: 'success' | 'error' = 'success', error?: Error): Span | null {
    const span = this.spans.get(spanId);
    if (!span) return null;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    if (error) {
      span.logs.push({
        timestamp: Date.now(),
        message: error.message,
      });
    }

    // Update operation statistics
    this.updateOperationStats(span.operation, span.duration);

    // Pop from stack
    if (this.spanStack[this.spanStack.length - 1]?.spanId === spanId) {
      this.spanStack.pop();
    }

    return span;
  }

  /**
   * Log message in current span
   */
  log(spanId: string, message: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        message,
      });
    }
  }

  /**
   * Update operation statistics
   */
  private updateOperationStats(operation: string, durationMs: number): void {
    let stats = this.stats.operationTimes.get(operation);
    if (!stats) {
      stats = { count: 0, totalMs: 0, p99Ms: 0 };
    }

    stats.count++;
    stats.totalMs += durationMs;
    this.stats.operationTimes.set(operation, stats);
  }

  /**
   * Get trace
   */
  getTrace(traceId: string): Trace | null {
    const trace = this.traces.get(traceId);
    if (trace && !trace.endTime && trace.spans.length > 0) {
      trace.endTime = Math.max(...trace.spans.map((s) => s.endTime || s.startTime));
      trace.duration = trace.endTime - trace.startTime;
    }
    return trace || null;
  }

  /**
   * Get critical path (longest chain of dependent spans)
   */
  getCriticalPath(traceId: string): Span[] {
    const trace = this.traces.get(traceId);
    if (!trace || !trace.root) return [];

    const path: Span[] = [trace.root];
    let current = trace.root;

    while (true) {
      // Find longest child span
      const children = trace.spans.filter((s) => s.parentSpanId === current.spanId);
      if (children.length === 0) break;

      const longestChild = children.reduce((a, b) =>
        ((a.duration || 0) > (b.duration || 0) ? a : b)
      );

      path.push(longestChild);
      current = longestChild;
    }

    return path;
  }

  /**
   * Export trace for visualization
   */
  exportTrace(traceId: string): Record<string, any> {
    const trace = this.getTrace(traceId);
    if (!trace) return {};

    return {
      traceId: trace.traceId,
      duration: trace.duration,
      spans: trace.spans.map((s) => ({
        spanId: s.spanId,
        operation: s.operation,
        duration: s.duration,
        status: s.status,
        tags: s.tags,
      })),
      criticalPath: this.getCriticalPath(traceId).map((s) => ({
        operation: s.operation,
        duration: s.duration,
      })),
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    const operationStats: Record<string, any> = {};

    for (const [op, stats] of this.stats.operationTimes.entries()) {
      operationStats[op] = {
        count: stats.count,
        averageMs: (stats.totalMs / stats.count).toFixed(2),
        totalMs: stats.totalMs,
      };
    }

    return {
      totalTraces: this.stats.totalTraces,
      totalSpans: this.stats.totalSpans,
      operationStats,
      activeSpans: this.spanStack.length,
    };
  }

  /**
   * Clear traces older than TTL
   */
  clearOldTraces(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleared = 0;

    for (const [traceId, trace] of this.traces.entries()) {
      if (now - trace.startTime > maxAgeMs) {
        this.traces.delete(traceId);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }
}

// Global tracer instance
let tracerInstance: DistributedTracer | null = null;

export function getTracer(): DistributedTracer {
  if (!tracerInstance) {
    tracerInstance = new DistributedTracer();
  }
  return tracerInstance;
}
