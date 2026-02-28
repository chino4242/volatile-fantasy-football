import { describe, it, expect, beforeEach } from 'vitest';
import { cache, TTL } from '@/lib/cache';

describe('Cache', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should store and retrieve data', () => {
    cache.set('test-key', { value: 123 });
    const result = cache.get('test-key', 1000);
    expect(result).toEqual({ value: 123 });
  });

  it('should return null for expired data', async () => {
    cache.set('test-key', { value: 123 });
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const result = cache.get('test-key', 10); // 10ms TTL
    expect(result).toBeNull();
  });

  it('should return null for non-existent keys', () => {
    const result = cache.get('non-existent', 1000);
    expect(result).toBeNull();
  });

  it('should clear all cache', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    cache.clear();
    
    expect(cache.get('key1', 1000)).toBeNull();
    expect(cache.get('key2', 1000)).toBeNull();
  });

  it('should clear cache by pattern', () => {
    cache.set('sleeper:users:123', 'data1');
    cache.set('sleeper:rosters:123', 'data2');
    cache.set('fleaflicker:league:456', 'data3');
    
    cache.clear('sleeper');
    
    expect(cache.get('sleeper:users:123', 1000)).toBeNull();
    expect(cache.get('sleeper:rosters:123', 1000)).toBeNull();
    expect(cache.get('fleaflicker:league:456', 1000)).toBe('data3');
  });
});
