import { describe, it, expect, beforeEach } from 'vitest';
import { analyticsValidator } from './analyticsValidation.js';
import { AnalyticsEvent } from '../types/analytics.js';

describe('AnalyticsValidator', () => {
  beforeEach(() => {
    analyticsValidator.resetMetrics();
  });

  it('should validate a well-formed event', () => {
    const event: AnalyticsEvent = {
      eventId: 'test-123',
      requestId: 'req-123',
      userId: 'user-123',
      timestamp: Date.now(),
      type: 'request_received',
      version: '1.0.0',
      task: 'Test task',
      taskLength: 10,
      budget: 1000,
    };

    const result = analyticsValidator.validate(event);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should reject event with missing required field', () => {
    const event = {
      eventId: 'test-123',
      userId: 'user-123',
      timestamp: Date.now(),
      type: 'request_received',
      version: '1.0.0',
      task: 'Test task',
      taskLength: 10,
      budget: 1000,
      // Missing requestId
    };

    const result = analyticsValidator.validate(event);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should reject event with invalid task length', () => {
    const event: AnalyticsEvent = {
      eventId: 'test-123',
      requestId: 'req-123',
      userId: 'user-123',
      timestamp: Date.now(),
      type: 'request_received',
      version: '1.0.0',
      task: 'Test task',
      taskLength: 200000, // Exceeds max of 100000
      budget: 1000,
    };

    const result = analyticsValidator.validate(event);
    expect(result.valid).toBe(false);
  });

  it('should validate semantic constraints', () => {
    const event: AnalyticsEvent = {
      eventId: 'test-123',
      requestId: 'req-123',
      userId: 'user-123',
      timestamp: Date.now(),
      type: 'request_completed',
      version: '1.0.0',
      task: 'Test task',
      taskLength: 10,
      budget: 1000,
      selectedModel: 'haiku',
      // Missing selectedEffort when model is selected
    };

    const result = analyticsValidator.validate(event);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('effort level must be provided');
  });

  it('should track validation metrics', () => {
    // Valid event
    analyticsValidator.validate({
      eventId: 'test-1',
      requestId: 'req-1',
      userId: 'user-1',
      timestamp: Date.now(),
      type: 'request_received',
      version: '1.0.0',
      task: 'Task 1',
      taskLength: 10,
      budget: 1000,
    });

    // Invalid event
    analyticsValidator.validate({
      eventId: 'test-2',
      // Missing required fields
    });

    const metrics = analyticsValidator.getQualityMetrics();
    expect(metrics.totalEvents).toBe(2);
    expect(metrics.validEvents).toBe(1);
    expect(metrics.invalidEvents).toBe(1);
    expect(metrics.validationRate).toBe(50);
  });

  it('should generate quality report', () => {
    // Valid event
    analyticsValidator.validate({
      eventId: 'test-1',
      requestId: 'req-1',
      userId: 'user-1',
      timestamp: Date.now(),
      type: 'request_received',
      version: '1.0.0',
      task: 'Task 1',
      taskLength: 10,
      budget: 1000,
    });

    const report = analyticsValidator.generateReport();
    expect(report).toContain('Data Quality Report');
    expect(report).toContain('Validation Rate');
    expect(report).toContain('1');
  });

  it('should accept events with optional fields', () => {
    const event: AnalyticsEvent = {
      eventId: 'test-123',
      requestId: 'req-123',
      userId: 'user-123',
      timestamp: Date.now(),
      type: 'request_received',
      version: '1.0.0',
      task: 'Test task',
      taskLength: 10,
      budget: 1000,
      minQuality: 5,
      selectedModel: 'sonnet',
      selectedEffort: 'high',
      tokensEstimated: 100,
    };

    const result = analyticsValidator.validate(event);
    expect(result.valid).toBe(true);
  });

  it('should reject events with negative execution time', () => {
    const event: AnalyticsEvent = {
      eventId: 'test-123',
      requestId: 'req-123',
      userId: 'user-123',
      timestamp: Date.now(),
      type: 'request_completed',
      version: '1.0.0',
      task: 'Test task',
      taskLength: 10,
      budget: 1000,
      tokensInput: 10,
      tokensOutput: 20,
      executionTimeMs: -100, // Invalid
      costActual: 0.01,
    };

    const result = analyticsValidator.validate(event);
    expect(result.valid).toBe(false);
    // Check that an error was returned (message may vary)
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});
