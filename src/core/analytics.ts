/**
 * Analytics System: Event logging and metrics collection
 * Captures all activity for measurement, analysis, and feedback loops
 * NEW: Integrated data validation with quality metrics
 */

import { AnalyticsEvent, EventType, FeedbackType, UserFeedback, SecurityEventType } from '../types/analytics.js';
import { analyticsValidator, DataQualityMetrics } from './analyticsValidation.js';
import crypto from 'crypto';

export class AnalyticsEngine {
  private eventBuffer: AnalyticsEvent[] = [];
  private feedbackBuffer: UserFeedback[] = [];
  private eventQueue: Promise<void> = Promise.resolve();
  private persistenceAdapter?: EventPersistenceAdapter;

  private bufferSize = 100; // Flush after 100 events
  private flushInterval = 5000; // Flush every 5 seconds
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    this.startAutoFlush();
  }

  /**
   * Set custom persistence adapter (e.g., PostgreSQL, Supabase)
   */
  setPersistenceAdapter(adapter: EventPersistenceAdapter) {
    this.persistenceAdapter = adapter;
  }

  /**
   * Core: Capture an event with validation
   */
  async captureEvent(event: Omit<AnalyticsEvent, 'eventId' | 'timestamp' | 'version'>) {
    const analyticsEvent: AnalyticsEvent = {
      ...event,
      eventId: this.generateId(),
      timestamp: Date.now(),
      version: '1.0.0',
    };

    // NEW: Validate event before buffering
    const validation = analyticsValidator.validate(analyticsEvent);
    if (!validation.valid) {
      console.warn(
        `[ANALYTICS VALIDATION] Invalid event: ${validation.errors?.join('; ')}`,
        { event: analyticsEvent }
      );
      // Log validation failure but don't throw - continue to buffer it
      // This allows debugging while not crashing the system
    }

    this.eventBuffer.push(analyticsEvent);

    // Flush if buffer exceeds size
    if (this.eventBuffer.length >= this.bufferSize) {
      await this.flush();
    }

    return analyticsEvent.eventId;
  }

  /**
   * Capture user feedback on a request
   */
  async captureFeedback(feedback: Omit<UserFeedback, 'feedbackId' | 'timestamp'>) {
    const userFeedback: UserFeedback = {
      ...feedback,
      feedbackId: this.generateId(),
      timestamp: Date.now(),
    };

    this.feedbackBuffer.push(userFeedback);

    // Flush feedback immediately (important signal)
    if (this.feedbackBuffer.length >= 10) {
      await this.flushFeedback();
    }

    return userFeedback.feedbackId;
  }

  /**
   * Capture request lifecycle events
   */
  async captureRequestReceived(
    userId: string,
    task: string,
    budget: number,
    minQuality?: number
  ) {
    const requestId = this.generateId();

    await this.captureEvent({
      requestId,
      userId,
      type: 'request_received',
      task,
      taskLength: task.length,
      budget,
      minQuality,
    });

    return requestId;
  }

  async captureModelSelected(
    requestId: string,
    userId: string,
    model: 'haiku' | 'sonnet' | 'opus' | 'fable',
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max',
    reason: string,
    tokensEstimated: number,
    costEstimated: number,
    costBaseline: number
  ) {
    await this.captureEvent({
      requestId,
      userId,
      type: 'model_selected',
      selectedModel: model,
      selectedEffort: effort,
      selectionReason: reason,
      tokensEstimated,
      costEstimated,
      costBaseline,
      task: '',
      taskLength: 0,
      budget: 0,
    });
  }

  async captureRequestExecuted(
    requestId: string,
    userId: string,
    model: 'haiku' | 'sonnet' | 'opus' | 'fable',
    tokensInput: number,
    tokensOutput: number,
    tokensCached: number,
    executionTimeMs: number,
    costActual: number,
    qualityEstimate: number,
    cacheHit: boolean,
    escalated: boolean,
    escalationReason?: string
  ) {
    const tokensSaved = tokensOutput > 0 ? Math.round(tokensOutput * 0.3) : 0;

    await this.captureEvent({
      requestId,
      userId,
      type: 'request_completed',
      selectedModel: model,
      tokensInput,
      tokensOutput,
      tokensCached,
      executionTimeMs,
      costActual,
      tokensSaved,
      qualityEstimate,
      cacheHit,
      escalated,
      escalationReason,
      task: '',
      taskLength: 0,
      budget: 0,
    });
  }

  async captureSecurityEvent(
    userId: string,
    eventType: SecurityEventType,
    message: string,
    severity: 'low' | 'medium' | 'high'
  ) {
    await this.captureEvent({
      requestId: this.generateId(),
      userId,
      type: 'security_event',
      task: '',
      taskLength: 0,
      budget: 0,
      securityFlags: [eventType],
      error: severity === 'high',
      errorMessage: message,
    });
  }

  async captureError(
    requestId: string,
    userId: string,
    errorCode: string,
    errorMessage: string
  ) {
    await this.captureEvent({
      requestId,
      userId,
      type: 'error_occurred',
      error: true,
      errorCode,
      errorMessage,
      task: '',
      taskLength: 0,
      budget: 0,
    });
  }

  /**
   * Flush events to persistence
   */
  async flush() {
    if (this.eventBuffer.length === 0) {
      return;
    }

    this.eventQueue = this.eventQueue.then(async () => {
      const eventsToFlush = [...this.eventBuffer];
      this.eventBuffer = [];

      if (this.persistenceAdapter) {
        try {
          await this.persistenceAdapter.saveEvents(eventsToFlush);
        } catch (error) {
          console.error('Failed to persist events:', error);
          // Re-add to buffer on failure (simple retry)
          this.eventBuffer.unshift(...eventsToFlush);
        }
      } else {
        // Console logging for development
        console.log(`[ANALYTICS] Flushed ${eventsToFlush.length} events`);
      }
    });

    return this.eventQueue;
  }

  async flushFeedback() {
    if (this.feedbackBuffer.length === 0) {
      return;
    }

    this.eventQueue = this.eventQueue.then(async () => {
      const feedbackToFlush = [...this.feedbackBuffer];
      this.feedbackBuffer = [];

      if (this.persistenceAdapter) {
        try {
          await this.persistenceAdapter.saveFeedback(feedbackToFlush);
        } catch (error) {
          console.error('Failed to persist feedback:', error);
          this.feedbackBuffer.unshift(...feedbackToFlush);
        }
      } else {
        console.log(`[ANALYTICS] Flushed ${feedbackToFlush.length} feedback items`);
      }
    });

    return this.eventQueue;
  }

  private startAutoFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
      this.flushFeedback();
    }, this.flushInterval);
  }

  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
    await this.flushFeedback();
  }

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Query helpers for analysis
   */
  getBufferedEventCount(): number {
    return this.eventBuffer.length;
  }

  getBufferedFeedbackCount(): number {
    return this.feedbackBuffer.length;
  }

  /**
   * NEW: Get data quality metrics
   */
  getDataQualityMetrics(): DataQualityMetrics {
    return analyticsValidator.getQualityMetrics();
  }

  /**
   * NEW: Generate data quality report
   */
  getDataQualityReport(): string {
    return analyticsValidator.generateReport();
  }

  /**
   * NEW: Reset quality metrics
   */
  resetQualityMetrics(): void {
    analyticsValidator.resetMetrics();
  }
}

/**
 * Interface for persistence adapters
 * Implement this to store events in your database of choice
 */
export interface EventPersistenceAdapter {
  saveEvents(events: AnalyticsEvent[]): Promise<void>;
  saveFeedback(feedback: UserFeedback[]): Promise<void>;

  // Query methods for dashboard
  getEvents(filters: {
    startTime?: number;
    endTime?: number;
    userId?: string;
    eventType?: EventType;
    requestId?: string;
  }): Promise<AnalyticsEvent[]>;

  getFeedback(filters: {
    startTime?: number;
    endTime?: number;
    userId?: string;
    feedbackType?: FeedbackType;
  }): Promise<UserFeedback[]>;
}

export const analyticsEngine = new AnalyticsEngine();
