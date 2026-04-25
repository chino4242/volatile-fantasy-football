interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string, ttlMs: number): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    if (age > ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new SimpleCache();

// TTL constants (in milliseconds)
export const TTL = {
  LEAGUE_DATA: 2 * 60 * 1000,       // 2 minutes
  USER_LEAGUES: 5 * 60 * 1000,      // 5 minutes
  FLEAFLICKER_LEAGUE: 2 * 60 * 1000,  // 2 minutes
  FLEAFLICKER_ROSTERS: 2 * 60 * 1000, // 2 minutes
} as const;
