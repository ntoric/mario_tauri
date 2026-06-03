import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cache, cacheKeys } from './cache';

beforeEach(() => {
  cache.clear();
});

describe('Cache', () => {
  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', { name: 'test' });
      expect(cache.get('key1')).toEqual({ name: 'test' });
    });

    it('should return null for missing key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should store string values', () => {
      cache.set('str', 'hello');
      expect(cache.get('str')).toBe('hello');
    });

    it('should store array values', () => {
      cache.set('arr', [1, 2, 3]);
      expect(cache.get('arr')).toEqual([1, 2, 3]);
    });

    it('should overwrite existing values', () => {
      cache.set('key', 'first');
      cache.set('key', 'second');
      expect(cache.get('key')).toBe('second');
    });
  });

  describe('TTL expiration', () => {
    it('should return null for expired entries', () => {
      vi.useFakeTimers();
      cache.set('expiring', 'data', 1000); // 1 second TTL

      vi.advanceTimersByTime(1001);
      expect(cache.get('expiring')).toBeNull();

      vi.useRealTimers();
    });

    it('should return value before TTL expires', () => {
      vi.useFakeTimers();
      cache.set('fresh', 'data', 5000);

      vi.advanceTimersByTime(4999);
      expect(cache.get('fresh')).toBe('data');

      vi.useRealTimers();
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired key', () => {
      cache.set('exists', 'val');
      expect(cache.has('exists')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(cache.has('missing')).toBe(false);
    });

    it('should return false for expired key', () => {
      vi.useFakeTimers();
      cache.set('expired', 'val', 100);
      vi.advanceTimersByTime(101);
      expect(cache.has('expired')).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('delete', () => {
    it('should remove a specific key', () => {
      cache.set('to-delete', 'val');
      cache.delete('to-delete');
      expect(cache.get('to-delete')).toBeNull();
    });

    it('should not throw when deleting nonexistent key', () => {
      expect(() => cache.delete('nonexistent')).not.toThrow();
    });
  });

  describe('deleteByPrefix', () => {
    it('should remove all keys with matching prefix', () => {
      cache.set('orders:store-1', [1]);
      cache.set('orders:store-2', [2]);
      cache.set('categories:store-1', [3]);

      cache.deleteByPrefix('orders:');

      expect(cache.get('orders:store-1')).toBeNull();
      expect(cache.get('orders:store-2')).toBeNull();
      expect(cache.get('categories:store-1')).toEqual([3]);
    });

    it('should not remove keys without matching prefix', () => {
      cache.set('other', 'val');
      cache.deleteByPrefix('nonexistent:');
      expect(cache.get('other')).toBe('val');
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct size and keys', () => {
      cache.set('x', 1);
      cache.set('y', 2);
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('x');
      expect(stats.keys).toContain('y');
    });

    it('should return empty stats for empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });
});

describe('cacheKeys', () => {
  it('should generate stores key', () => {
    expect(cacheKeys.stores()).toBe('stores');
  });

  it('should generate categories key with storeId', () => {
    expect(cacheKeys.categories('s1')).toBe('categories:s1');
  });

  it('should generate items key with storeId', () => {
    expect(cacheKeys.items('s2')).toBe('items:s2');
  });

  it('should generate orders key with storeId', () => {
    expect(cacheKeys.orders('s3')).toBe('orders:s3');
  });

  it('should generate bills key with storeId', () => {
    expect(cacheKeys.bills('s4')).toBe('bills:s4');
  });

  it('should generate users key', () => {
    expect(cacheKeys.users()).toBe('users');
  });
});
