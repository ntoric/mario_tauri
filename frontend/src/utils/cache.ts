// Simple in-memory cache for frequently accessed data
// Cache is cleared on app startup

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class Cache {
  private storage: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 5 * 60 * 1000; // 5 minutes default TTL

  // Clear all cache (call on app startup)
  clear(): void {
    this.storage.clear();
    console.log('[Cache] Cleared all cached data');
  }

  // Get item from cache
  get<T>(key: string): T | null {
    const entry = this.storage.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.storage.delete(key);
      return null;
    }
    
    console.log(`[Cache] Hit: ${key}`);
    return entry.data as T;
  }

  // Set item in cache
  set<T>(key: string, data: T, ttl?: number): void {
    this.storage.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
    console.log(`[Cache] Set: ${key}`);
  }

  // Delete specific key from cache
  delete(key: string): void {
    this.storage.delete(key);
    console.log(`[Cache] Deleted: ${key}`);
  }

  // Delete multiple keys by prefix
  deleteByPrefix(prefix: string): void {
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
      }
    }
    console.log(`[Cache] Deleted keys with prefix: ${prefix}`);
  }

  // Check if key exists and is not expired
  has(key: string): boolean {
    const entry = this.storage.get(key);
    if (!entry) return false;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.storage.delete(key);
      return false;
    }
    
    return true;
  }

  // Get cache stats
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.storage.size,
      keys: Array.from(this.storage.keys()),
    };
  }
}

// Export singleton instance
export const cache = new Cache();

// Cache key generators
export const cacheKeys = {
  stores: () => 'stores',
  categories: (storeId: string) => `categories:${storeId}`,
  items: (storeId: string) => `items:${storeId}`,
  orders: (storeId: string) => `orders:${storeId}`,
  bills: (storeId: string) => `bills:${storeId}`,
  users: () => 'users',
};
