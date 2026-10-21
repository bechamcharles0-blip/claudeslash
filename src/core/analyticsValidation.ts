/**
 * Analytics Event Validation
 * Ensures data quality by validating all events before persistence
 *
 * Uses Zod for runtime type checking and validation
 */

import { z } from 'zod';
import { AnalyticsEvent, EventType, FeedbackType, SecurityEventType } from '../types/analytics.js';

// Validation schemas for each field
const EventTypeSchema = z.enum([
  'request_received',
  'model_selected',
  'request_executed',
  'request_completed',
  'cache_hit',
  'cache_miss',
  'escalation',
  'feedback_submitted',
  'error_occurred',
  'security_event',
]);

const ModelSchema = z.enum(['haiku', 'sonnet', 'opus', 'fable']);
const EffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
const SecurityEventTypeSchema = z.enum([
  'rate_limit_exceeded',
  'anomaly_detected',
  'injection_attempt',
  'invalid_input',
  'suspicious_pattern',
]);

// Core analytics event schema with validation rules
export const AnalyticsEventSchema = z
  .object({
    // Identifiers (required)
    eventId: z.string().min(1).max(256),
    requestId: z.string().min(1).max(256),
    userId: z.string().min(1).max(256),
    timestamp: z.number().int().positive(),

    // Event metadata (required)
    type: EventTypeSchema,
    version: z.string().min(1).max(32),

    // Request context
    task: z.string().max(50000), // Up to 50k chars
    taskLength: z.number().int().nonnegative().max(100000), // Up to 100k tokens
    taskCategory: z.string().max(64).optional(),
    budget: z.number().int().nonnegative().max(500000),
    minQuality: z.number().int().min(0).max(10).optional(),

    // Model selection
    selectedModel: ModelSchema.optional(),
    selectedEffort: EffortSchema.optional(),
    selectionReason: z.string().max(500).optional(),

    // Execution metrics
    tokensEstimated: z.number().int().nonnegative().optional(),
    tokensInput: z.number().int().nonnegative().optional(),
    tokensOutput: z.number().int().nonnegative().optional(),
    tokensCached: z.number().int().nonnegative().optional(),
    executionTimeMs: z.number().int().nonnegative().max(300000).optional(), // Max 5 min

    // Cost metrics
    costEstimated: z.number().nonnegative().max(10000).optional(),
    costActual: z.number().nonnegative().max(10000).optional(),
    costBaseline: z.number().nonnegative().max(10000).optional(),
    tokensSaved: z.number().int().nonnegative().optional(),
    percentSaved: z.number().int().min(0).max(100).optional(),

    // Quality metrics
    qualityEstimate: z.number().min(0).max(10).optional(),
    cacheHit: z.boolean().optional(),
    escalated: z.boolean().optional(),
    escalationReason: z.string().max(500).optional(),

    // Error tracking
    error: z.boolean().optional(),
    errorCode: z.string().max(64).optional(),
    errorMessage: z.string().max(500).optional(),

    // Security
    securityScore: z.number().int().min(0).max(100).optional(),
    securityFlags: z.array(SecurityEventTypeSchema).optional(),
  })
  .strict(); // Reject unknown fields

// Validation result type
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Data Quality Metrics
 */
export interface DataQualityMetrics {
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  validationRate: number; // 0-100%
  errorsByType: Record<EventType, number>;
  errorsByField: Record<string, number>;
  warnings: string[];
  timestamp: number;
}

/**
 * Validator: Validates analytics events
 */
export class AnalyticsValidator {
  private qualityMetrics: DataQualityMetrics = {
    totalEvents: 0,
    validEvents: 0,
    invalidEvents: 0,
    validationRate: 100,
    errorsByType: {} as Record<EventType, number>,
    errorsByField: {},
    warnings: [],
    timestamp: Date.now(),
  };

  /**
   * Validate an analytics event
   */
  validate(event: unknown): ValidationResult {
    this.qualityMetrics.totalEvents++;

    try {
      // Parse and validate with Zod
      const validated = AnalyticsEventSchema.parse(event);

      // Run semantic validations
      const semanticIssues = this.validateSemantics(validated);

      if (semanticIssues.length > 0) {
        this.qualityMetrics.invalidEvents++;
        semanticIssues.forEach(issue => {
          const field = issue.split(':')[0] || 'unknown';
          this.qualityMetrics.errorsByField[field] = (this.qualityMetrics.errorsByField[field] || 0) + 1;
        });

        return {
          valid: false,
          errors: semanticIssues,
        };
      }

      this.qualityMetrics.validEvents++;
      this.updateValidationRate();

      return { valid: true };
    } catch (error) {
      this.qualityMetrics.invalidEvents++;

      // Track error by type if available
      if (typeof event === 'object' && event !== null && 'type' in event) {
        const eventType = (event as any).type;
        if (typeof eventType === 'string') {
          this.qualityMetrics.errorsByType[eventType as EventType] =
            (this.qualityMetrics.errorsByType[eventType as EventType] || 0) + 1;
        }
      }

      const errorMessage = error instanceof z.ZodError
        ? error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
        : String(error);

      this.updateValidationRate();

      return {
        valid: false,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Semantic validations (logical rules beyond type checking)
   */
  private validateSemantics(event: any): string[] {
    const issues: string[] = [];

    // If model is selected, effort should be provided
    if (event.selectedModel && !event.selectedEffort) {
      issues.push('selectedModel: effort level must be provided when model is selected');
    }

    // If tokens were executed, input/output should be positive
    if (event.type === 'request_executed' || event.type === 'request_completed') {
      if (event.tokensInput === undefined || event.tokensInput <= 0) {
        issues.push('tokensInput: must be positive for executed requests');
      }
      if (event.tokensOutput === undefined || event.tokensOutput <= 0) {
        issues.push('tokensOutput: must be positive for executed requests');
      }
    }

    // Token saved should not exceed tokens used
    if (event.tokensSaved && event.tokensInput && event.tokensOutput) {
      const totalTokens = event.tokensInput + event.tokensOutput;
      if (event.tokensSaved > totalTokens) {
        issues.push('tokensSaved: cannot exceed total tokens used');
      }
    }

    // Cost actual should be set for completed requests
    if (event.type === 'request_completed' && !event.costActual) {
      issues.push('costActual: must be provided for completed requests');
    }

    // Escalation reason should be provided if escalated
    if (event.escalated && !event.escalationReason) {
      issues.push('escalationReason: must be provided if escalated is true');
    }

    // Error message should be provided if error is true
    if (event.error && !event.errorMessage) {
      issues.push('errorMessage: must be provided if error is true');
    }

    // Execution time should be reasonable (not negative, not too large)
    if (event.executionTimeMs !== undefined) {
      if (event.executionTimeMs < 0) {
        issues.push('executionTimeMs: cannot be negative');
      }
      if (event.executionTimeMs > 300000) {
        issues.push('executionTimeMs: cannot exceed 5 minutes');
      }
    }

    return issues;
  }

  /**
   * Update validation rate percentage
   */
  private updateValidationRate(): void {
    if (this.qualityMetrics.totalEvents === 0) {
      this.qualityMetrics.validationRate = 100;
    } else {
      this.qualityMetrics.validationRate = Math.round(
        (this.qualityMetrics.validEvents / this.qualityMetrics.totalEvents) * 100
      );
    }
  }

  /**
   * Get current quality metrics
   */
  getQualityMetrics(): DataQualityMetrics {
    return {
      ...this.qualityMetrics,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.qualityMetrics = {
      totalEvents: 0,
      validEvents: 0,
      invalidEvents: 0,
      validationRate: 100,
      errorsByType: {} as Record<EventType, number>,
      errorsByField: {},
      warnings: [],
      timestamp: Date.now(),
    };
  }

  /**
   * Generate data quality report
   */
  generateReport(): string {
    const metrics = this.getQualityMetrics();
    const report = `
=== Data Quality Report ===
Timestamp: ${new Date(metrics.timestamp).toISOString()}

Summary:
  Total Events: ${metrics.totalEvents}
  Valid Events: ${metrics.validEvents}
  Invalid Events: ${metrics.invalidEvents}
  Validation Rate: ${metrics.validationRate}%

Errors by Type:
${Object.entries(metrics.errorsByType)
  .map(([type, count]) => `  ${type}: ${count}`)
  .join('\n') || '  (none)'}

Errors by Field:
${Object.entries(metrics.errorsByField)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10)
  .map(([field, count]) => `  ${field}: ${count}`)
  .join('\n') || '  (none)'}

Status: ${metrics.validationRate >= 99 ? '✅ HEALTHY' : metrics.validationRate >= 95 ? '⚠️ WARNING' : '❌ CRITICAL'}
    `;

    return report.trim();
  }
}

export const analyticsValidator = new AnalyticsValidator();
