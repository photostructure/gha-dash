import type { CacheEntry } from "../types.js";
import { readCacheFromDisk, writeCacheToDisk } from "./config.js";

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): CacheEntry<T> | undefined {
    return this.store.get(key);
  }

  set(key: string, data: T): void {
    this.store.set(key, {
      data,
      fetchedAt: Date.now(),
      error: null,
    });
  }

  setError(key: string, error: string): void {
    const existing = this.store.get(key);
    if (existing) {
      existing.error = error;
    } else {
      this.store.set(key, {
        data: [] as unknown as T,
        fetchedAt: Date.now(),
        error,
      });
    }
  }

  isStale(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    return Date.now() - entry.fetchedAt > this.ttlMs;
  }

  entries(): IterableIterator<[string, CacheEntry<T>]> {
    return this.store.entries();
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  async loadFromDisk(): Promise<boolean> {
    const loaded = await readCacheFromDisk<T>();
    if (loaded && loaded.size > 0) {
      this.store = loaded;
      return true;
    }
    return false;
  }

  async saveToDisk(): Promise<void> {
    await writeCacheToDisk(this.store.entries());
  }
}
