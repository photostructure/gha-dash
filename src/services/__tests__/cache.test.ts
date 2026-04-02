import { describe, it, expect, vi, beforeEach } from "vitest";
import { Cache } from "../cache.js";

describe("Cache", () => {
  let cache: Cache<string[]>;

  beforeEach(() => {
    cache = new Cache<string[]>(60); // 60s TTL
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("stores and retrieves data", () => {
    cache.set("key", ["a", "b"]);
    const entry = cache.get("key");
    expect(entry?.data).toEqual(["a", "b"]);
    expect(entry?.error).toBeNull();
    expect(entry?.fetchedAt).toBeGreaterThan(0);
  });

  it("reports fresh entries as not stale", () => {
    cache.set("key", ["a"]);
    expect(cache.isStale("key")).toBe(false);
  });

  it("reports expired entries as stale", () => {
    vi.useFakeTimers();
    cache.set("key", ["a"]);
    vi.advanceTimersByTime(61_000);
    expect(cache.isStale("key")).toBe(true);
    vi.useRealTimers();
  });

  it("reports missing entries as stale", () => {
    expect(cache.isStale("missing")).toBe(true);
  });

  describe("stale-while-revalidate", () => {
    it("keeps stale data on error and records error message", () => {
      cache.set("key", ["original"]);
      cache.setError("key", "API rate limited");

      const entry = cache.get("key");
      expect(entry?.data).toEqual(["original"]);
      expect(entry?.error).toBe("API rate limited");
    });

    it("creates empty entry with error for missing keys", () => {
      cache.setError("new", "404 Not Found");

      const entry = cache.get("new");
      expect(entry?.data).toEqual([]);
      expect(entry?.error).toBe("404 Not Found");
    });
  });

  it("iterates over all entries", () => {
    cache.set("a", ["1"]);
    cache.set("b", ["2"]);

    const keys = [...cache.entries()].map(([k]) => k);
    expect(keys).toEqual(["a", "b"]);
  });

  it("clears all entries", () => {
    cache.set("a", ["1"]);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });
});
