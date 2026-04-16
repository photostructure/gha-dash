import type { Octokit } from "@octokit/rest";
import type { OctokitResponse } from "@octokit/types";

/**
 * In-memory ETag cache for Octokit requests.
 *
 * GitHub's REST API supports If-None-Match conditional requests on every GET
 * endpoint we use. A 304 Not Modified response **does not count** against the
 * rate limit, so caching ETags is essentially free quota for unchanged data.
 *
 * Most polling cycles return identical data (no new runs, no new PRs, no
 * workflow changes), which means most requests can be 304s in steady state.
 *
 * Not persisted to disk — the cache rebuilds itself within one refresh cycle
 * after process restart, and persisting raw API responses would bloat the
 * config dir significantly.
 */

export interface EtagEntry {
  etag: string;
  data: unknown;
  /** Cached Link header so octokit.paginate can follow pagination on 304s. */
  link?: string;
}

/**
 * Sentinel header that callers set to opt out of ETag caching for a single
 * request. Used by callers that depend on the *current* Link header (e.g.
 * fetchRepoStats reads `rel="last"` to count open PRs, which would go stale
 * if served from a 304 cache because GitHub's ETag for `pulls.list` only
 * hashes the visible body, not the full list state).
 */
export const SKIP_ETAG_CACHE_HEADER = "x-skip-etag-cache";

export class EtagCache {
  #store = new Map<string, EtagEntry>();
  #hits = 0;
  #misses = 0;
  #noEtagResponses = 0;

  size(): number {
    return this.#store.size;
  }

  get(key: string): EtagEntry | undefined {
    return this.#store.get(key);
  }

  set(key: string, entry: EtagEntry): void {
    this.#store.set(key, entry);
  }

  /** Number of 304 hits (free responses) since process start. */
  hits(): number {
    return this.#hits;
  }

  /** Number of cache misses (requests that consumed quota) since process start. */
  misses(): number {
    return this.#misses;
  }

  /**
   * Number of successful responses that arrived without an ETag header and
   * therefore could not be cached. A non-zero value here means quota savings
   * are degraded — usually a sign that an upstream proxy is stripping
   * caching headers, since GitHub itself reliably sends ETags.
   */
  noEtagResponses(): number {
    return this.#noEtagResponses;
  }

  recordHit(): void {
    this.#hits++;
  }

  recordMiss(): void {
    this.#misses++;
  }

  recordNoEtag(): void {
    this.#noEtagResponses++;
  }

  /**
   * Compute a stable cache key from request options. Incorporates the HTTP
   * method, URL template, and all non-control params so different repos,
   * pages, and query strings get distinct keys.
   */
  static keyFor(
    options: Record<string, unknown> & { url?: string; method?: string },
  ): string {
    const method = String(options.method ?? "GET").toUpperCase();
    const url = String(options.url ?? "");
    const skip = new Set([
      "method",
      "url",
      "headers",
      "request",
      "mediaType",
      "baseUrl",
    ]);
    const params: Record<string, unknown> = {};
    for (const key of Object.keys(options).sort()) {
      if (!skip.has(key)) params[key] = options[key];
    }
    return `${method} ${url} ${JSON.stringify(params)}`;
  }
}

/**
 * Install an Octokit hook that attaches If-None-Match headers from the cache
 * and translates 304 responses back into the cached response. Only GET
 * requests are intercepted; POSTs (e.g. workflow dispatch) pass through.
 */
export function installEtagHook(octokit: Octokit, cache: EtagCache): void {
  octokit.hook.wrap("request", async (request, options) => {
    const method = String(options.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      return request(options);
    }

    // Per-request opt-out: caller passes the skip header to bypass the
    // conditional If-None-Match (because they must see ground truth — e.g.
    // actions runs list, whose ETag lags status transitions). Strip the
    // marker before it goes out so it doesn't reach GitHub. We still cache
    // the fresh 200 response below, so later refreshes benefit from the
    // updated ETag.
    let skipCache = false;
    if (
      options.headers &&
      SKIP_ETAG_CACHE_HEADER in (options.headers as Record<string, unknown>)
    ) {
      const stripped = { ...options.headers } as Record<string, unknown>;
      delete stripped[SKIP_ETAG_CACHE_HEADER];
      options.headers = stripped as typeof options.headers;
      skipCache = true;
    }

    const key = EtagCache.keyFor(options as Record<string, unknown>);
    const cached = skipCache ? undefined : cache.get(key);

    // Mutate options.headers IN PLACE. The before-after-hook wrap chain
    // binds `options` as a fixed argument when the chain is built, so any
    // *new* options object passed to the inner `request()` call gets dropped
    // by downstream hooks (e.g. auth-token re-merges from the original
    // route). Mutation is the only reliable way to thread headers through.
    if (cached?.etag) {
      options.headers = {
        ...options.headers,
        "if-none-match": cached.etag,
      } as typeof options.headers;
    }

    try {
      const response = (await request(options)) as OctokitResponse<unknown>;

      // 200 — extract ETag and cache the response for next time
      const etag = response.headers.etag;
      if (typeof etag === "string") {
        const link =
          typeof response.headers.link === "string"
            ? response.headers.link
            : undefined;
        cache.set(key, { etag, data: response.data, link });
      } else {
        // Surface silent degradation: GitHub normally always sends ETags on
        // these endpoints, so missing ones suggest a proxy is stripping
        // caching headers and quota savings are quietly disappearing.
        cache.recordNoEtag();
      }
      cache.recordMiss();
      return response;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 304 && cached) {
        // Synthesize a 200 response from cache. octokit.paginate reads
        // headers.link to follow pagination, so include the cached link.
        const synthHeaders: Record<string, string> = {};
        if (cached.link) synthHeaders.link = cached.link;
        cache.recordHit();
        // url: by the time hooks run, @octokit/endpoint has already resolved
        // url templates and query params, so options.url is the absolute
        // URL. plugin-paginate-rest's compareCommits fallback (iterator.js)
        // does `new URL(normalizedResponse.url)` if Link is absent — that
        // assumes an absolute URL, which we provide here. Not currently used
        // by gha-dash, but worth knowing if a caller adds compareCommits.
        return {
          status: 200,
          url: String(options.url ?? ""),
          headers: synthHeaders,
          data: cached.data,
        } as OctokitResponse<unknown>;
      }
      throw err;
    }
  });
}
