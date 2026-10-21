import { SecurityContext } from '../types/index.js';

const DANGEROUS_PATTERNS = [
  /ignore.*previous|ignore.*instruction/i,
  /system.*prompt|system.*message/i,
  /execute.*code|eval|exec/i,
  /sql.*injection|drop.*table|delete.*from/i,
  /<script|javascript:|onerror=/i,
  /\.\.\//i, // path traversal
  /base64.*decode|atob/i,
  /fetch|http.*request|curl/i,
];

const RATE_LIMITS = {
  perHour: 1000,
  perDay: 10000,
  perMinute: 50,
};

export class SecurityManager {
  private userLimits = new Map<string, SecurityContext>();

  /**
   * Validate and sanitize input
   */
  validateInput(input: string): { valid: boolean; reason?: string } {
    if (!input || typeof input !== 'string') {
      return { valid: false, reason: 'Input must be a non-empty string' };
    }

    if (input.length > 50000) {
      return { valid: false, reason: 'Input exceeds maximum length (50k chars)' };
    }

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(input)) {
        return { valid: false, reason: 'Suspicious input pattern detected' };
      }
    }

    return { valid: true };
  }

  /**
   * Check rate limits for user
   */
  checkRateLimit(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const context = this.userLimits.get(userId) || {
      userId,
      rateLimit: RATE_LIMITS.perHour,
      requestsThisHour: 0,
      lastRequestTime: now,
      isSuspicious: false,
    };

    // Reset hourly counter
    if (now - context.lastRequestTime > 3600000) {
      context.requestsThisHour = 0;
    }

    // Check rate limit
    if (context.requestsThisHour >= RATE_LIMITS.perHour) {
      return { allowed: false, reason: 'Rate limit exceeded (1000/hour)' };
    }

    context.requestsThisHour++;
    context.lastRequestTime = now;
    this.userLimits.set(userId, context);

    return { allowed: true };
  }

  /**
   * Detect anomalies
   */
  detectAnomalies(userId: string, task: string): string | null {
    const context = this.userLimits.get(userId);
    if (!context) return null;

    // High request frequency
    if (context.requestsThisHour > 500) {
      return 'Unusual request frequency detected';
    }

    // Repeated identical tasks (possible probing)
    const hashedTask = this.simpleHash(task);
    const recentHashes = this.getRecentTaskHashes(userId);
    if (recentHashes.filter((h) => h === hashedTask).length > 10) {
      return 'Repeated task pattern detected';
    }

    return null;
  }

  /**
   * Simple hash for task comparison
   */
  private simpleHash(str: string): string {
    return Math.abs(
      str.split('').reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
      }, 0)
    ).toString();
  }

  /**
   * Get recent task hashes for user
   */
  private getRecentTaskHashes(userId: string): string[] {
    // Placeholder - would use Redis in production
    return [];
  }

  /**
   * Sanitize output before returning
   */
  sanitizeOutput(output: string): string {
    // Remove potentially sensitive patterns
    return output
      .replace(/api[_-]?key[:\s]*['"]?[a-z0-9]+['"]?/gi, '[REDACTED_KEY]')
      .replace(/password[:\s]*['"]?[^'"\s]+['"]?/gi, '[REDACTED_PASS]')
      .replace(/token[:\s]*['"]?[a-z0-9]+['"]?/gi, '[REDACTED_TOKEN]')
      .replace(/secret[:\s]*['"]?[^'"\s]+['"]?/gi, '[REDACTED_SECRET]');
  }

  /**
   * Log security events
   */
  logSecurityEvent(userId: string, event: string, severity: 'low' | 'medium' | 'high') {
    console.warn(`[SECURITY] ${severity.toUpperCase()} - User: ${userId} - Event: ${event}`);

    if (severity === 'high') {
      // Alert or block user
      const context = this.userLimits.get(userId);
      if (context) {
        context.isSuspicious = true;
      }
    }
  }
}

export const securityManager = new SecurityManager();
