# Sprint 1 Implementation Guide: Foundation & Data Quality

**Duration:** 5 days  
**Team Size:** 3-4 engineers  
**Objective:** Establish data quality baseline and prepare PostgreSQL for high-throughput production workloads

---

## Overview

This sprint focuses on three critical tasks that must be completed BEFORE moving to real-time metrics (Sprint 2):

1. **Schema Validation** - Ensure every event is validated before persistence
2. **PostgreSQL Optimization** - Prepare database for 1000+ req/s
3. **Data Quality Framework** - Automated daily checks and alerting

By end of Sprint 1:
- Every event is validated (Zod schemas)
- Database can handle 5000+ writes/sec
- Daily data quality report running
- Zero data quality blindspots

---

## Task 1: Event Validation on Ingest (2 Days)

### File 1.1: Create Strict Validation Schemas
**File:** `src/schemas/analytics.ts` (NEW)

```typescript
import { z } from 'zod';

/**
 * Validation schemas for all analytics events
 * Applied on ingest - events that fail validation are logged and skipped
 */

// Base event fields that ALL events must have
const BaseEventSchema = z.object({
  eventId: z.string().regex(/^[a-f0-9]{32}$/),
  requestId: z.string().regex(/^[a-f0-9]{32}$/),
  userId: z.string().min(1).max(255),
  timestamp: z.number().int().positive().max(Date.now() + 60000),
  type: z.enum([
    'request_received', 'model_selected', 'request_completed',
    'cache_hit', 'cache_miss', 'escalation', 'feedback_submitted',
    'error_occurred', 'security_event'
  ]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

// Request metadata (optional but typed)
const RequestMetadataSchema = z.object({
  task: z.string().max(10000),
  taskLength: z.number().int().min(0).max(100000),
  taskCategory: z.enum(['analysis', 'generation', 'summarization', 'classification', 'other']).optional(),
  budget: z.number().int().min(1),
  minQuality: z.number().min(0).max(10).optional(),
}).partial();

// Model selection (present only in model_selected and request_completed events)
const ModelSelectionSchema = z.object({
  selectedModel: z.enum(['haiku', 'sonnet', 'opus', 'fable']),
  selectedEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  selectionReason: z.string().max(500).optional(),
}).partial();

// Execution metrics (present only in request_completed events)
const ExecutionMetricsSchema = z.object({
  tokensEstimated: z.number().int().min(0),
  tokensInput: z.number().int().min(0),
  tokensOutput: z.number().int().min(0),
  tokensCached: z.number().int().min(0),
  executionTimeMs: z.number().int().min(0).max(300000), // Max 5 minutes
}).partial();

// Cost metrics
const CostMetricsSchema = z.object({
  costEstimated: z.number().min(0),
  costActual: z.number().min(0),
  costBaseline: z.number().min(0),
  tokensSaved: z.number().int().min(0),
  percentSaved: z.number().min(0).max(100),
}).partial();

// Quality and escalation
const QualitySchema = z.object({
  qualityEstimate: z.number().min(0).max(10),
  cacheHit: z.boolean(),
  escalated: z.boolean(),
  escalationReason: z.string().max(500).optional(),
}).partial();

// Error tracking
const ErrorSchema = z.object({
  error: z.boolean(),
  errorCode: z.string().regex(/^[A-Z_0-9]+$/).optional(),
  errorMessage: z.string().max(1000).optional(),
}).partial();

// Complete analytics event schema with cross-field validation
export const AnalyticsEventSchema = BaseEventSchema
  .merge(RequestMetadataSchema)
  .merge(ModelSelectionSchema)
  .merge(ExecutionMetricsSchema)
  .merge(CostMetricsSchema)
  .merge(QualitySchema)
  .merge(ErrorSchema)
  .refine(
    (e) => {
      // If request_completed, must have tokens
      if (e.type === 'request_completed') {
        return e.tokensInput !== undefined && e.tokensOutput !== undefined;
      }
      return true;
    },
    { message: 'request_completed events must have tokensInput and tokensOutput' }
  )
  .refine(
    (e) => {
      // tokens_saved cannot exceed tokens_output
      if (e.tokensSaved !== undefined && e.tokensOutput !== undefined) {
        return e.tokensSaved <= e.tokensOutput;
      }
      return true;
    },
    { message: 'tokensSaved cannot exceed tokensOutput' }
  )
  .refine(
    (e) => {
      // If cost_baseline exists, cost_actual should be <= cost_baseline
      if (e.costBaseline !== undefined && e.costActual !== undefined) {
        return e.costActual <= e.costBaseline * 1.1; // Allow 10% margin for rounding
      }
      return true;
    },
    { message: 'costActual should not significantly exceed costBaseline' }
  );

export type AnalyticsEventValidated = z.infer<typeof AnalyticsEventSchema>;

// User feedback schema
export const UserFeedbackSchema = z.object({
  feedbackId: z.string().regex(/^[a-f0-9]{32}$/),
  requestId: z.string().regex(/^[a-f0-9]{32}$/),
  userId: z.string().min(1).max(255),
  timestamp: z.number().int().positive(),
  feedbackType: z.enum(['success', 'partial', 'failure', 'quality_issue', 'latency_issue']),
  satisfaction: z.number().int().min(1).max(5).optional(),
  accuracy: z.number().int().min(1).max(5).optional(),
  speed: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(5000).optional(),
  preferredModel: z.enum(['haiku', 'sonnet', 'opus', 'fable']).optional(),
  preferredSpeed: z.enum(['faster', 'slower', 'ok']).optional(),
  preferredQuality: z.enum(['lower', 'higher', 'ok']).optional(),
  issueCategory: z.string().max(100).optional(),
  wasRelevant: z.boolean().optional(),
  wouldUseAgain: z.boolean().optional(),
});

export type UserFeedbackValidated = z.infer<typeof UserFeedbackSchema>;
```

---

### File 1.2: Data Quality Logging Table
**File:** `src/core/persistencePostgres.ts` (UPDATE initialize())

Add this after creating main tables:

```typescript
async initialize() {
  // ... existing code ...

  // Create data quality tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS data_quality_issues (
      issue_id VARCHAR(32) PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      event_data JSONB,
      validation_errors TEXT[],
      error_message TEXT,
      severity VARCHAR(20),
      
      INDEX idx_timestamp (timestamp),
      INDEX idx_severity (severity)
    );
  `);

  // Create daily aggregation results table
  await client.query(`
    CREATE TABLE IF NOT EXISTS data_quality_daily (
      date DATE PRIMARY KEY,
      total_events BIGINT,
      valid_events BIGINT,
      invalid_events BIGINT,
      validation_rate DECIMAL(5,2),
      anomalous_events BIGINT,
      data_loss_percent DECIMAL(5,2),
      
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  this.initialized = true;
}
```

---

### File 1.3: Enhanced Persistence Adapter with Validation
**File:** `src/core/persistencePostgres.ts` (UPDATE saveEvents())

```typescript
import { AnalyticsEventSchema, UserFeedbackSchema } from '../schemas/analytics.js';

export class PostgresPersistenceAdapter implements EventPersistenceAdapter {
  private dataQualityStats = {
    totalProcessed: 0,
    validEvents: 0,
    invalidEvents: 0,
    validationErrors: new Map<string, number>(),
  };

  /**
   * Save events with validation
   */
  async saveEvents(events: any[]): Promise<void> {
    if (events.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const validEvents: any[] = [];
      const invalidEvents: any[] = [];

      // Validate each event
      for (const event of events) {
        const result = AnalyticsEventSchema.safeParse(event);
        
        if (result.success) {
          validEvents.push(result.data);
          this.dataQualityStats.validEvents++;
        } else {
          invalidEvents.push({
            event: event,
            errors: result.error.errors.map(e => e.message)
          });
          this.dataQualityStats.invalidEvents++;
          
          // Log validation error
          for (const error of result.error.errors) {
            const key = error.code;
            this.dataQualityStats.validationErrors.set(
              key,
              (this.dataQualityStats.validationErrors.get(key) || 0) + 1
            );
          }
        }
      }

      this.dataQualityStats.totalProcessed += events.length;

      // Log invalid events to quality tracking table
      if (invalidEvents.length > 0) {
        for (const invalid of invalidEvents) {
          await client.query(
            `INSERT INTO data_quality_issues 
             (issue_id, timestamp, event_data, validation_errors, severity)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              generateId(),
              Date.now(),
              JSON.stringify(invalid.event),
              invalid.errors,
              'warning'
            ]
          );
        }

        console.warn(
          `[DATA QUALITY] ${invalidEvents.length} events failed validation. ` +
          `Valid: ${validEvents.length}, Invalid: ${invalidEvents.length}`
        );
      }

      // Insert valid events only
      for (const event of validEvents) {
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
            $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
            $32, $33, $34, $35, $36, $37, $38, $39, $40)`,
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
      
      console.log(
        `✅ Saved ${validEvents.length} events. ` +
        `Validation rate: ${((validEvents.length / events.length) * 100).toFixed(1)}%`
      );
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to save events:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get data quality statistics
   */
  getDataQualityStats() {
    return {
      totalProcessed: this.dataQualityStats.totalProcessed,
      validEvents: this.dataQualityStats.validEvents,
      invalidEvents: this.dataQualityStats.invalidEvents,
      validationRate: this.dataQualityStats.totalProcessed > 0 
        ? (this.dataQualityStats.validEvents / this.dataQualityStats.totalProcessed) * 100
        : 0,
      topErrors: Array.from(this.dataQualityStats.validationErrors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([code, count]) => ({ code, count }))
    };
  }
}
```

---

### File 1.4: Add Data Quality Endpoint to Analytics API
**File:** `src/api/analytics.ts` (ADD new endpoint)

```typescript
/**
 * GET /analytics/data-quality - Data quality metrics
 */
app.get('/data-quality', async (req: Request, res: Response) => {
  try {
    // Get validation stats from persistence adapter
    const stats = (persistence as any).getDataQualityStats?.();

    // Query database for anomalies
    const anomalies = await persistence.pool?.query(`
      SELECT 
        DATE(to_timestamp(timestamp/1000)) as date,
        COUNT(*) as total_events,
        COUNT(CASE WHEN error = false THEN 1 END) as valid_events,
        COUNT(CASE WHEN tokens_saved > tokens_output THEN 1 END) as impossible_token_savings,
        COUNT(CASE WHEN cost_actual > cost_baseline * 1.1 THEN 1 END) as cost_anomalies
      FROM analytics_events
      WHERE timestamp >= (EXTRACT(EPOCH FROM now()) - 7 * 86400) * 1000
      GROUP BY DATE(to_timestamp(timestamp/1000))
      ORDER BY date DESC
      LIMIT 7;
    `);

    return res.json({
      period: { days: 7 },
      validationStats: stats || { message: 'Stats not available' },
      dailyAnomalies: anomalies?.rows || [],
      status: stats?.validationRate >= 95 ? 'HEALTHY' : 'DEGRADED',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get data quality metrics' });
  }
});
```

---

## Task 2: PostgreSQL Optimization for High Throughput (2 Days)

### File 2.1: Database Performance Tuning
**File:** `scripts/postgres-tuning.sql` (NEW)

```sql
-- Production PostgreSQL tuning for 1000+ req/s writes
-- Apply these settings to your PostgreSQL instance

-- ============================================
-- WAL (Write-Ahead Logging) Optimization
-- ============================================

-- Increase checkpoint frequency for faster recovery
ALTER SYSTEM SET checkpoint_timeout = '5min';
ALTER SYSTEM SET max_wal_size = '4GB';
ALTER SYSTEM SET min_wal_size = '1GB';

-- Enable fast writes with less fsync overhead
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET wal_writer_delay = '200ms';

-- ============================================
-- Memory and Buffer Configuration
-- ============================================

-- Increase shared buffers (25% of system RAM, capped at 40GB)
ALTER SYSTEM SET shared_buffers = '8GB';

-- Increase effective cache size for query planning
ALTER SYSTEM SET effective_cache_size = '24GB';

-- Memory for sorting/aggregation per operation
ALTER SYSTEM SET work_mem = '256MB';

-- Memory for parallel work
ALTER SYSTEM SET maintenance_work_mem = '1GB';

-- ============================================
-- Connection and Concurrency
-- ============================================

-- Increase max connections for load
ALTER SYSTEM SET max_connections = 400;
ALTER SYSTEM SET max_prepared_transactions = 200;

-- Reserve superuser connections
ALTER SYSTEM SET superuser_reserved_connections = 10;

-- ============================================
-- Query Performance
-- ============================================

-- Enable parallel query execution
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;
ALTER SYSTEM SET max_worker_processes = 8;

-- Increase max table scans if needed
ALTER SYSTEM SET random_page_cost = 1.1;  -- SSD-tuned

-- ============================================
-- Logging and Monitoring
-- ============================================

-- Log slow queries (>1 second in production)
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = 'off';

-- Log checkpoints for monitoring
ALTER SYSTEM SET log_checkpoints = 'on';

-- ============================================
-- Index and Autovacuum Tuning
-- ============================================

-- More aggressive autovacuum for high-write tables
ALTER SYSTEM SET autovacuum_vacuum_scale_factor = 0.01;
ALTER SYSTEM SET autovacuum_analyze_scale_factor = 0.005;
ALTER SYSTEM SET autovacuum_naptime = '10s';

-- Per-table tuning (run after applying above)
ALTER TABLE analytics_events SET (
  autovacuum_vacuum_scale_factor = 0.005,
  autovacuum_analyze_scale_factor = 0.002,
  fillfactor = 90
);

-- ============================================
-- Apply changes (reload config)
-- ============================================

SELECT pg_reload_conf();

-- Verify settings applied (run in new session)
-- SHOW shared_buffers;
-- SHOW effective_cache_size;
-- SHOW work_mem;
```

---

### File 2.2: Implement Batch Event Insertion
**File:** `src/core/persistencePostgres.ts` (UPDATE saveEvents())

```typescript
/**
 * Optimized batch insertion for high throughput
 */
async saveEvents(events: any[]): Promise<void> {
  if (events.length === 0) return;

  const client = await this.pool.connect();
  try {
    // Validate first
    const validEvents = events.map(e => {
      const result = AnalyticsEventSchema.safeParse(e);
      return result.success ? result.data : null;
    }).filter(Boolean);

    if (validEvents.length === 0) {
      console.warn('No valid events to save');
      return;
    }

    // Use multi-row INSERT instead of individual statements
    const placeholders = validEvents
      .map((_, i) => {
        const offset = i * 40;
        return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13}, $${offset+14}, $${offset+15}, $${offset+16}, $${offset+17}, $${offset+18}, $${offset+19}, $${offset+20}, $${offset+21}, $${offset+22}, $${offset+23}, $${offset+24}, $${offset+25}, $${offset+26}, $${offset+27}, $${offset+28}, $${offset+29}, $${offset+30}, $${offset+31}, $${offset+32}, $${offset+33}, $${offset+34}, $${offset+35}, $${offset+36}, $${offset+37}, $${offset+38}, $${offset+39}, $${offset+40})`;
      })
      .join(', ');

    const values = validEvents.flatMap(e => [
      e.eventId, e.requestId, e.userId, e.timestamp, e.type, e.version,
      e.task, e.taskLength, e.taskCategory, e.budget, e.minQuality,
      e.selectedModel, e.selectedEffort, e.selectionReason,
      e.tokensEstimated, e.tokensInput, e.tokensOutput, e.tokensCached, e.executionTimeMs,
      e.costEstimated, e.costActual, e.costBaseline, e.tokensSaved, e.percentSaved,
      e.qualityEstimate, e.cacheHit, e.escalated, e.escalationReason,
      e.error, e.errorCode, e.errorMessage,
      e.securityScore, e.securityFlags, e.rateLimit, e.requestCountThisHour,
      e.apiVersion, e.userAgent, e.endpoint, e.ipHash, e.responsePreview,
    ]);

    await client.query('BEGIN');

    const query = `
      INSERT INTO analytics_events (
        event_id, request_id, user_id, timestamp, type, version,
        task, task_length, task_category, budget, min_quality,
        selected_model, selected_effort, selection_reason,
        tokens_estimated, tokens_input, tokens_output, tokens_cached, execution_time_ms,
        cost_estimated, cost_actual, cost_baseline, tokens_saved, percent_saved,
        quality_estimate, cache_hit, escalated, escalation_reason,
        error, error_code, error_message,
        security_score, security_flags, rate_limit, request_count_this_hour,
        api_version, user_agent, endpoint, ip_hash, response_preview
      ) VALUES ${placeholders}
    `;

    await client.query(query, values);
    await client.query('COMMIT');

    console.log(`✅ Batch inserted ${validEvents.length} events`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Batch insertion failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
```

---

### File 2.3: Implement Table Partitioning
**File:** `scripts/postgres-partitioning.sql` (NEW)

```sql
-- Create partitioned version of analytics_events table
-- Partition by month to improve query performance and enable archival

-- Step 1: Create parent table (if not exists)
CREATE TABLE IF NOT EXISTS analytics_events_partitioned (
  -- Same columns as original analytics_events
  event_id VARCHAR(32) NOT NULL,
  request_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  timestamp BIGINT NOT NULL,
  -- ... all other columns ...
  
  PRIMARY KEY (event_id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Step 2: Create partitions for each month
-- Run this monthly to create new partitions
DO $$
DECLARE
  start_date TIMESTAMP;
  end_date TIMESTAMP;
  partition_name TEXT;
  start_ts BIGINT;
  end_ts BIGINT;
BEGIN
  -- Create partitions for current month and next 2 months
  FOR i IN 0..2 LOOP
    start_date := DATE_TRUNC('month', NOW() + (i || ' months')::INTERVAL);
    end_date := DATE_TRUNC('month', NOW() + ((i+1) || ' months')::INTERVAL);
    
    partition_name := 'analytics_events_' || TO_CHAR(start_date, 'YYYY_MM');
    start_ts := EXTRACT(EPOCH FROM start_date)::BIGINT * 1000;
    end_ts := EXTRACT(EPOCH FROM end_date)::BIGINT * 1000;
    
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF analytics_events_partitioned
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_ts, end_ts
    );
  END LOOP;
END $$;

-- Step 3: Create indexes on partitions
-- (indexes on parent table automatically created on children)
CREATE INDEX IF NOT EXISTS idx_ae_user_timestamp
  ON analytics_events_partitioned (user_id, timestamp)
  WHERE timestamp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ae_model
  ON analytics_events_partitioned (selected_model)
  WHERE selected_model IS NOT NULL;

-- Step 4: After migration, archive old partitions
-- Move to cold storage (AWS S3, GCS, etc.)
-- SELECT pg_catalog.pg_partition_detach('analytics_events_2026_09');
```

---

## Task 3: Data Quality Framework & Automated Checks (1 Day)

### File 3.1: Daily Data Quality Report Job
**File:** `src/jobs/data-quality-report.ts` (NEW)

```typescript
/**
 * Daily data quality report
 * Run at 00:05 UTC every day
 */

import { Pool } from 'pg';
import { PostgresPersistenceAdapter } from '../core/persistencePostgres.js';

export async function runDailyDataQualityReport(
  pool: Pool
) {
  const client = await pool.connect();
  
  try {
    console.log('[DATA QUALITY] Starting daily report...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const reportDate = yesterday.toISOString().split('T')[0];

    // Query raw event counts
    const yesterday_start = new Date(reportDate).getTime();
    const yesterday_end = new Date(yesterday_start + 86400000).getTime();

    const rawQuery = await client.query(`
      SELECT
        COUNT(*) as total_events,
        COUNT(CASE WHEN error = false THEN 1 END) as success_events,
        COUNT(CASE WHEN error = true THEN 1 END) as error_events,
        COUNT(CASE WHEN tokens_saved > tokens_output THEN 1 END) as impossible_tokens,
        COUNT(CASE WHEN cost_actual > cost_baseline * 1.2 THEN 1 END) as cost_anomalies,
        COUNT(CASE WHEN execution_time_ms > 300000 THEN 1 END) as timeout_events
      FROM analytics_events
      WHERE timestamp >= $1 AND timestamp < $2
    `, [yesterday_start, yesterday_end]);

    const rawData = rawQuery.rows[0];

    // Check validation issues
    const issuesQuery = await client.query(`
      SELECT
        severity,
        COUNT(*) as count
      FROM data_quality_issues
      WHERE timestamp >= $1 AND timestamp < $2
      GROUP BY severity
    `, [yesterday_start, yesterday_end]);

    const validationIssues = Object.fromEntries(
      issuesQuery.rows.map(row => [row.severity, row.count])
    );

    // Calculate metrics
    const validityRate = rawData.total_events > 0
      ? ((rawData.success_events / rawData.total_events) * 100).toFixed(2)
      : 'N/A';

    const anomalyRate = rawData.total_events > 0
      ? (((rawData.impossible_tokens + rawData.cost_anomalies) / rawData.total_events) * 100).toFixed(2)
      : '0.00';

    // Insert report
    await client.query(`
      INSERT INTO data_quality_daily
      (date, total_events, valid_events, invalid_events, validation_rate, anomalous_events, data_loss_percent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      reportDate,
      rawData.total_events,
      rawData.success_events,
      rawData.error_events,
      validityRate,
      rawData.impossible_tokens + rawData.cost_anomalies,
      anomalyRate
    ]);

    // Log report
    const report = {
      date: reportDate,
      totalEvents: rawData.total_events,
      successEvents: rawData.success_events,
      errorEvents: rawData.error_events,
      validityRate: `${validityRate}%`,
      anomalies: {
        impossibleTokenSavings: rawData.impossible_tokens,
        costAnomalies: rawData.cost_anomalies,
        timeoutEvents: rawData.timeout_events,
        totalAnomalies: rawData.impossible_tokens + rawData.cost_anomalies,
        anomalyRate: `${anomalyRate}%`
      },
      validationIssues,
      status: validityRate >= 95 && anomalyRate <= 1 ? 'HEALTHY' : 'DEGRADED'
    };

    console.log('[DATA QUALITY] Daily Report:', JSON.stringify(report, null, 2));

    // Alert if unhealthy
    if (report.status === 'DEGRADED') {
      console.error('[ALERT] Data quality degraded:', report);
      // TODO: Send to Slack/email
    }

    return report;
  } catch (error) {
    console.error('[DATA QUALITY] Report failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Scheduled execution (add to server startup)
// Every day at 00:05 UTC
export function scheduleDataQualityReport(pool: Pool) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 5, 0, 0);
  
  const delay = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    runDailyDataQualityReport(pool);
    // Repeat daily
    setInterval(() => runDailyDataQualityReport(pool), 24 * 60 * 60 * 1000);
  }, delay);
}
```

---

### File 3.2: Validation Test Suite
**File:** `src/core/analytics.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AnalyticsEventSchema, UserFeedbackSchema } from '../schemas/analytics.js';

describe('Analytics Validation', () => {
  
  describe('AnalyticsEventSchema', () => {
    
    it('accepts valid request_received event', () => {
      const event = {
        eventId: 'a'.repeat(32),
        requestId: 'b'.repeat(32),
        userId: 'user123',
        timestamp: Date.now(),
        type: 'request_received' as const,
        version: '1.0.0',
        task: 'Analyze this document',
        taskLength: 50,
        budget: 100000,
        minQuality: 5,
      };
      
      const result = AnalyticsEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects invalid timestamp (future)', () => {
      const event = {
        eventId: 'a'.repeat(32),
        requestId: 'b'.repeat(32),
        userId: 'user123',
        timestamp: Date.now() + 100000, // 100 seconds in future
        type: 'request_received' as const,
        version: '1.0.0',
        task: 'Test',
        taskLength: 5,
        budget: 100000,
      };
      
      const result = AnalyticsEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects event where tokens_saved > tokens_output', () => {
      const event = {
        eventId: 'a'.repeat(32),
        requestId: 'b'.repeat(32),
        userId: 'user123',
        timestamp: Date.now(),
        type: 'request_completed' as const,
        version: '1.0.0',
        task: 'Test',
        taskLength: 5,
        budget: 100000,
        tokensInput: 100,
        tokensOutput: 50,
        tokensSaved: 100,  // ERROR: Can't save more than output!
        executionTimeMs: 500,
        costActual: 0.01,
        costBaseline: 0.02,
      };
      
      const result = AnalyticsEventSchema.safeParse(event);
      expect(result.success).toBe(false);
      expect(result.error?.errors[0]?.message).toContain('tokensSaved');
    });

    it('rejects cost_actual > cost_baseline * 1.1', () => {
      const event = {
        eventId: 'a'.repeat(32),
        requestId: 'b'.repeat(32),
        userId: 'user123',
        timestamp: Date.now(),
        type: 'request_completed' as const,
        version: '1.0.0',
        task: 'Test',
        taskLength: 5,
        budget: 100000,
        tokensInput: 100,
        tokensOutput: 50,
        tokensSaved: 10,
        executionTimeMs: 500,
        costActual: 0.03,      // ERROR: 50% more than baseline!
        costBaseline: 0.02,
      };
      
      const result = AnalyticsEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('UserFeedbackSchema', () => {
    
    it('accepts valid feedback', () => {
      const feedback = {
        feedbackId: 'a'.repeat(32),
        requestId: 'b'.repeat(32),
        userId: 'user123',
        timestamp: Date.now(),
        feedbackType: 'success' as const,
        satisfaction: 5,
        accuracy: 4,
        speed: 5,
      };
      
      const result = UserFeedbackSchema.safeParse(feedback);
      expect(result.success).toBe(true);
    });

    it('rejects satisfaction > 5', () => {
      const feedback = {
        feedbackId: 'a'.repeat(32),
        requestId: 'b'.repeat(32),
        userId: 'user123',
        timestamp: Date.now(),
        feedbackType: 'success' as const,
        satisfaction: 6,  // ERROR: Max is 5
      };
      
      const result = UserFeedbackSchema.safeParse(feedback);
      expect(result.success).toBe(false);
    });
  });
});
```

---

## Acceptance Criteria

### Day 1-2: Schema Validation
- [ ] Validation schemas deployed (src/schemas/analytics.ts)
- [ ] Event validation working in persistencePostgres.ts
- [ ] Data quality issues table created and populating
- [ ] Validation rate metric >99%
- [ ] No data loss (all invalid events logged)

### Day 3: PostgreSQL Optimization
- [ ] Performance tuning SQL applied
- [ ] Batch insertion working (reduce 40 queries → 1 query)
- [ ] Database handles 5000+ writes/sec (verified with load test)
- [ ] Partitioning strategy designed and documented
- [ ] Partition creation automation running

### Day 4-5: Data Quality Framework
- [ ] Daily report job scheduled and running
- [ ] Data quality endpoint live (GET /analytics/data-quality)
- [ ] Validation test suite passing
- [ ] Anomaly detection working (impossible tokens, cost anomalies)
- [ ] Alert system defined for degraded data

### By End of Sprint 1
- [ ] All events validated on ingest
- [ ] Database can handle 5000+ events/sec
- [ ] Daily data quality report automated
- [ ] Dashboard only shows validated data
- [ ] Zero data quality blindspots documented

---

## Testing & Validation

### Load Test: Event Ingestion
```bash
# Simulates 1000 req/s for 5 minutes
npm run load-test -- --duration 5m --rps 1000 --validate-data-quality
```

### Verify Data Quality
```bash
curl http://localhost:3000/api/analytics/data-quality?hours=24
```

Expected response:
```json
{
  "validationRate": 99.8,
  "totalProcessed": 432000,
  "validEvents": 431136,
  "invalidEvents": 864,
  "status": "HEALTHY"
}
```

---

**Next Sprint:** Sprint 2 - Real-Time Metrics & Advanced Caching
