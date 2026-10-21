import { createClient, RedisClientType } from 'redis';
import { RouteResponse, CacheEntry } from '../types/index.js';

export class RedisCache {
  private client: RedisClientType;
  private connected = false;

  constructor(redisUrl?: string) {
    this.client = createClient({
      url: redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      },
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.client.on('connect', () => {
      this.connected = true;
      console.log('Connected to Redis');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.connected = false;
    } catch (error) {
      console.error('Failed to disconnect from Redis:', error);
    }
  }

  /**
   * Cache Claude API responses
   */
  async cacheResponse(
    key: string,
    response: RouteResponse,
    ttlSeconds: number = 3600
  ): Promise<void> {
    if (!this.connected) return;

    try {
      const entry: CacheEntry = {
        key,
        result: response.result,
        model: response.model,
        tokens: response.tokensUsed.input + response.tokensUsed.output,
        timestamp: Date.now(),
        ttl: ttlSeconds,
      };

      await this.client.setEx(
        `cache:response:${key}`,
        ttlSeconds,
        JSON.stringify(entry)
      );
    } catch (error) {
      console.error('Cache write error:', error);
    }
  }

  /**
   * Retrieve cached response
   */
  async getCachedResponse(key: string): Promise<CacheEntry | null> {
    if (!this.connected) return null;

    try {
      const cached = await this.client.get(`cache:response:${key}`);
      if (!cached) return null;

      const entry = JSON.parse(cached) as CacheEntry;
      return entry;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  /**
   * Store rate limit data (distributed)
   */
  async setRateLimit(userId: string, count: number, ttlSeconds: number = 3600): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client.setEx(
        `ratelimit:${userId}`,
        ttlSeconds,
        count.toString()
      );
    } catch (error) {
      console.error('Rate limit write error:', error);
    }
  }

  /**
   * Get rate limit count
   */
  async getRateLimit(userId: string): Promise<number> {
    if (!this.connected) return 0;

    try {
      const count = await this.client.get(`ratelimit:${userId}`);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      console.error('Rate limit read error:', error);
      return 0;
    }
  }

  /**
   * Increment rate limit
   */
  async incrementRateLimit(userId: string, ttlSeconds: number = 3600): Promise<number> {
    if (!this.connected) return 0;

    try {
      const key = `ratelimit:${userId}`;
      const count = await this.client.incr(key);

      // Set expiry if it's a new key
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }

      return count;
    } catch (error) {
      console.error('Rate limit increment error:', error);
      return 0;
    }
  }

  /**
   * Store model selection statistics
   */
  async recordModelUsage(model: string): Promise<void> {
    if (!this.connected) return;

    try {
      const key = `stats:model:${model}`;
      await this.client.incr(key);
    } catch (error) {
      console.error('Model usage record error:', error);
    }
  }

  /**
   * Store token savings
   */
  async recordTokenSavings(tokens: number, cost: number): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client.incrByFloat('stats:tokens_saved', tokens);
      await this.client.incrByFloat('stats:cost_saved', cost);
    } catch (error) {
      console.error('Token savings record error:', error);
    }
  }

  /**
   * Get all statistics
   */
  async getStats(): Promise<Record<string, any>> {
    if (!this.connected) return {};

    try {
      const keys = await this.client.keys('stats:*');
      const stats: Record<string, any> = {};

      for (const key of keys) {
        const value = await this.client.get(key);
        const cleanKey = key.replace('stats:', '');
        stats[cleanKey] = value ? (isNaN(Number(value)) ? value : Number(value)) : 0;
      }

      return stats;
    } catch (error) {
      console.error('Stats retrieval error:', error);
      return {};
    }
  }

  /**
   * Clear cache
   */
  async clearCache(pattern: string = 'cache:*'): Promise<void> {
    if (!this.connected) return;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    if (!this.connected) return false;

    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
let cacheInstance: RedisCache | null = null;

export async function getRedisCache(): Promise<RedisCache> {
  if (!cacheInstance) {
    cacheInstance = new RedisCache();
    await cacheInstance.connect();
  }
  return cacheInstance;
}
