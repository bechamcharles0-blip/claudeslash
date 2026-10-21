/**
 * PostgreSQL Persistence Adapter for Analytics
 * Stores events and feedback in PostgreSQL for analysis and dashboards
 */

import { Pool } from 'pg';
import { AnalyticsEvent, EventType, UserFeedback, FeedbackType } from '../types/analytics.js';
import { EventPersistenceAdapter } from './analytics.js';

export class PostgresPersistenceAdapter implements EventPersistenceAdapter {
  private pool: Pool;
  private initialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /**
   * Initialize database schema (run once)
   */
  async initialize() {
    if (this.initialized) return;

    const client = await this.pool.connect();
    try {
      // Create events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          event_id VARCHAR(32) PRIMARY KEY,
          request_id VARCHAR(32) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          timestamp BIGINT NOT NULL,
          type VARCHAR(50) NOT NULL,
          version VARCHAR(10),

          -- Request data
          task TEXT,
          task_length INT,
          task_category VARCHAR(100),
          budget INT,
          min_quality DECIMAL(3,1),

          -- Model selection
          selected_model VARCHAR(20),
          selected_effort VARCHAR(20),
          selection_reason TEXT,

          -- Execution metrics
          tokens_estimated INT,
          tokens_input INT,
          tokens_output INT,
          tokens_cached INT,
          execution_time_ms INT,

          -- Cost metrics
          cost_estimated DECIMAL(10,6),
          cost_actual DECIMAL(10,6),
          cost_baseline DECIMAL(10,6),
          tokens_saved INT,
          percent_saved DECIMAL(5,2),

          -- Quality
          quality_estimate DECIMAL(3,1),
          cache_hit BOOLEAN,
          escalated BOOLEAN,
          escalation_reason TEXT,

          -- Error tracking
          error BOOLEAN,
          error_code VARCHAR(50),
          error_message TEXT,

          -- Security
          security_score DECIMAL(3,0),
          security_flags TEXT[],
          rate_limit INT,
          request_count_this_hour INT,

          -- Metadata
          api_version VARCHAR(20),
          user_agent VARCHAR(500),
          endpoint VARCHAR(255),
          ip_hash VARCHAR(64),
          response_preview TEXT,

          -- Indexes for fast queries
          INDEX idx_user_id_timestamp (user_id, timestamp),
          INDEX idx_request_id (request_id),
          INDEX idx_timestamp (timestamp),
          INDEX idx_model (selected_model),
          INDEX idx_type (type),
          INDEX idx_user_request_count (user_id, request_id)
        );
      `);

      // Create feedback table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_feedback (
          feedback_id VARCHAR(32) PRIMARY KEY,
          request_id VARCHAR(32) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          timestamp BIGINT NOT NULL,

          feedback_type VARCHAR(50) NOT NULL,
          satisfaction INT,
          accuracy INT,
          speed INT,
          comment TEXT,

          preferred_model VARCHAR(20),
          preferred_speed VARCHAR(20),
          preferred_quality VARCHAR(20),

          issue_category VARCHAR(100),
          was_relevant BOOLEAN,
          would_use_again BOOLEAN,

          INDEX idx_user_id_timestamp (user_id, timestamp),
          INDEX idx_request_id (request_id),
          INDEX idx_feedback_type (feedback_type)
        );
      `);

      // Create aggregated metrics table for faster dashboard queries
      await client.query(`
        CREATE TABLE IF NOT EXISTS aggregated_metrics (
          metric_id VARCHAR(32) PRIMARY KEY,
          period_start BIGINT NOT NULL,
          period_end BIGINT NOT NULL,
          period VARCHAR(10) NOT NULL,

          total_requests INT,
          successful_requests INT,
          failed_requests INT,
          success_rate DECIMAL(5,2),

          total_tokens_used BIGINT,
          total_tokens_cached BIGINT,
          total_tokens_saved BIGINT,
          cache_hit_rate DECIMAL(5,2),

          total_cost_actual DECIMAL(12,6),
          total_cost_baseline DECIMAL(12,6),
          total_cost_saved DECIMAL(12,6),
          savings_percent DECIMAL(5,2),

          model_usage JSONB,
          model_costs JSONB,
          model_quality JSONB,

          average_quality DECIMAL(3,1),
          average_satisfaction DECIMAL(3,1),
          average_execution_time_ms INT,
          escalation_rate DECIMAL(5,2),
          error_rate DECIMAL(5,2),

          INDEX idx_period (period_start, period_end)
        );
      `);

      this.initialized = true;
      console.log('✅ PostgreSQL schema initialized');
    } catch (error) {
      console.error('Failed to initialize schema:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save events to database
   */
  async saveEvents(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const event of events) {
        await client.query(
          `INSERT INTO analytics_events (
            event_id, request_id, user_id, timestamp, type, version,
            task, task_length, task_category, budget, min_quality,
            selected_model, selected_effort, selection_reason,
            tokens_estimated, tokens_input, tokens_output, tokens_cached, execution_time_ms,
            cost_estimated, cost_actual, cost_baseline, tokens_saved, percent_saved,
            quality_estimate, cache_hit, escalated, escalation_reason,
            error, error_code, error_message,
            security_score, security_flags, rate_limit, request_count_this_hour,
            api_version, user_agent, endpoint, ip_hash, response_preview
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
            $32, $33, $34, $35, $36, $37, $38, $39, $40
          )`,
          [
            event.eventId, event.requestId, event.userId, event.timestamp, event.type, event.version,
            event.task, event.taskLength, event.taskCategory, event.budget, event.minQuality,
            event.selectedModel, event.selectedEffort, event.selectionReason,
            event.tokensEstimated, event.tokensInput, event.tokensOutput, event.tokensCached, event.executionTimeMs,
            event.costEstimated, event.costActual, event.costBaseline, event.tokensSaved, event.percentSaved,
            event.qualityEstimate, event.cacheHit, event.escalated, event.escalationReason,
            event.error, event.errorCode, event.errorMessage,
            event.securityScore, event.securityFlags, event.rateLimit, event.requestCountThisHour,
            event.apiVersion, event.userAgent, event.endpoint, event.ipHash, event.responsePreview,
          ]
        );
      }

      await client.query('COMMIT');
      console.log(`✅ Saved ${events.length} events`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to save events:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save feedback to database
   */
  async saveFeedback(feedback: UserFeedback[]): Promise<void> {
    if (feedback.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of feedback) {
        await client.query(
          `INSERT INTO user_feedback (
            feedback_id, request_id, user_id, timestamp,
            feedback_type, satisfaction, accuracy, speed, comment,
            preferred_model, preferred_speed, preferred_quality,
            issue_category, was_relevant, would_use_again
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            item.feedbackId, item.requestId, item.userId, item.timestamp,
            item.feedbackType, item.satisfaction, item.accuracy, item.speed, item.comment,
            item.preferredModel, item.preferredSpeed, item.preferredQuality,
            item.issueCategory, item.wasRelevant, item.wouldUseAgain,
          ]
        );
      }

      await client.query('COMMIT');
      console.log(`✅ Saved ${feedback.length} feedback items`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to save feedback:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Query events with filters
   */
  async getEvents(filters: {
    startTime?: number;
    endTime?: number;
    userId?: string;
    eventType?: EventType;
    requestId?: string;
  }): Promise<AnalyticsEvent[]> {
    let query = 'SELECT * FROM analytics_events WHERE 1=1';
    const params: any[] = [];

    if (filters.startTime) {
      query += ` AND timestamp >= $${params.length + 1}`;
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(filters.endTime);
    }
    if (filters.userId) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(filters.userId);
    }
    if (filters.eventType) {
      query += ` AND type = $${params.length + 1}`;
      params.push(filters.eventType);
    }
    if (filters.requestId) {
      query += ` AND request_id = $${params.length + 1}`;
      params.push(filters.requestId);
    }

    query += ' ORDER BY timestamp DESC LIMIT 10000';

    const result = await this.pool.query(query, params);
    return this.mapRowsToEvents(result.rows);
  }

  /**
   * Query feedback with filters
   */
  async getFeedback(filters: {
    startTime?: number;
    endTime?: number;
    userId?: string;
    feedbackType?: FeedbackType;
  }): Promise<UserFeedback[]> {
    let query = 'SELECT * FROM user_feedback WHERE 1=1';
    const params: any[] = [];

    if (filters.startTime) {
      query += ` AND timestamp >= $${params.length + 1}`;
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(filters.endTime);
    }
    if (filters.userId) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(filters.userId);
    }
    if (filters.feedbackType) {
      query += ` AND feedback_type = $${params.length + 1}`;
      params.push(filters.feedbackType);
    }

    query += ' ORDER BY timestamp DESC LIMIT 10000';

    const result = await this.pool.query(query, params);
    return this.mapRowsToFeedback(result.rows);
  }

  private mapRowsToEvents(rows: any[]): AnalyticsEvent[] {
    return rows.map((row) => ({
      eventId: row.event_id,
      requestId: row.request_id,
      userId: row.user_id,
      timestamp: row.timestamp,
      type: row.type,
      version: row.version,
      task: row.task,
      taskLength: row.task_length,
      taskCategory: row.task_category,
      budget: row.budget,
      minQuality: row.min_quality,
      selectedModel: row.selected_model,
      selectedEffort: row.selected_effort,
      selectionReason: row.selection_reason,
      tokensEstimated: row.tokens_estimated,
      tokensInput: row.tokens_input,
      tokensOutput: row.tokens_output,
      tokensCached: row.tokens_cached,
      executionTimeMs: row.execution_time_ms,
      costEstimated: row.cost_estimated,
      costActual: row.cost_actual,
      costBaseline: row.cost_baseline,
      tokensSaved: row.tokens_saved,
      percentSaved: row.percent_saved,
      qualityEstimate: row.quality_estimate,
      cacheHit: row.cache_hit,
      escalated: row.escalated,
      escalationReason: row.escalation_reason,
      error: row.error,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      securityScore: row.security_score,
      securityFlags: row.security_flags,
      rateLimit: row.rate_limit,
      requestCountThisHour: row.request_count_this_hour,
      apiVersion: row.api_version,
      userAgent: row.user_agent,
      endpoint: row.endpoint,
      ipHash: row.ip_hash,
      responsePreview: row.response_preview,
    }));
  }

  private mapRowsToFeedback(rows: any[]): UserFeedback[] {
    return rows.map((row) => ({
      feedbackId: row.feedback_id,
      requestId: row.request_id,
      userId: row.user_id,
      timestamp: row.timestamp,
      feedbackType: row.feedback_type,
      satisfaction: row.satisfaction,
      accuracy: row.accuracy,
      speed: row.speed,
      comment: row.comment,
      preferredModel: row.preferred_model,
      preferredSpeed: row.preferred_speed,
      preferredQuality: row.preferred_quality,
      issueCategory: row.issue_category,
      wasRelevant: row.was_relevant,
      wouldUseAgain: row.would_use_again,
    }));
  }

  async close() {
    await this.pool.end();
  }
}
