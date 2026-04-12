import { Octokit } from "@octokit/rest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  EtagCache,
  installEtagHook,
  SKIP_ETAG_CACHE_HEADER,
} from "../etagCache.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeOctokit(): Octokit {
  return new Octokit({ auth: "test-token", baseUrl: "https://api.github.com" });
}

describe("EtagCache.keyFor", () => {
  it("produces stable keys for identical requests", () => {
    const a = EtagCache.keyFor({
      method: "GET",
      url: "/repos/{owner}/{repo}",
      owner: "x",
      repo: "y",
    });
    const b = EtagCache.keyFor({
      method: "GET",
      url: "/repos/{owner}/{repo}",
      repo: "y",
      owner: "x", // different param order
    });
    expect(a).toBe(b);
  });

  it("differs when params differ", () => {
    const a = EtagCache.keyFor({
      method: "GET",
      url: "/repos/{owner}/{repo}",
      owner: "x",
      repo: "y",
    });
    const b = EtagCache.keyFor({
      method: "GET",
      url: "/repos/{owner}/{repo}",
      owner: "x",
      repo: "z",
    });
    expect(a).not.toBe(b);
  });

  it("ignores control fields like headers and request", () => {
    const a = EtagCache.keyFor({
      method: "GET",
      url: "/user",
      headers: { accept: "application/json" },
      request: { fetch: () => Promise.resolve(new Response()) },
    });
    const b = EtagCache.keyFor({
      method: "GET",
      url: "/user",
      headers: { accept: "different" },
    });
    expect(a).toBe(b);
  });

  it("differentiates GET from POST", () => {
    const a = EtagCache.keyFor({ method: "GET", url: "/foo" });
    const b = EtagCache.keyFor({ method: "POST", url: "/foo" });
    expect(a).not.toBe(b);
  });
});

describe("installEtagHook", () => {
  it("caches a 200 response and serves the next call from cache on 304", async () => {
    let serverCalls = 0;
    const seenIfNoneMatch: (string | null)[] = [];
    const realData = {
      default_branch: "main",
      open_issues_count: 3,
      id: 1,
      name: "repo",
      full_name: "owner/repo",
      owner: { login: "owner" },
    };

    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo",
        ({ request }) => {
          serverCalls++;
          const ifNoneMatch = request.headers.get("if-none-match");
          seenIfNoneMatch.push(ifNoneMatch);
          if (ifNoneMatch === '"abc123"') {
            return new HttpResponse(null, {
              status: 304,
              headers: { etag: '"abc123"' },
            });
          }
          return HttpResponse.json(realData, {
            headers: { etag: '"abc123"' },
          });
        },
      ),
    );

    const cache = new EtagCache();
    const octokit = makeOctokit();
    installEtagHook(octokit, cache);

    // First call: real fetch, cache the etag
    const r1 = await octokit.repos.get({ owner: "owner", repo: "repo" });
    expect(r1.data.default_branch).toBe("main");
    expect(cache.size()).toBe(1);
    expect(cache.misses()).toBe(1);
    expect(cache.hits()).toBe(0);

    // Second call: server returns 304 because if-none-match matches; our
    // hook synthesizes a 200 response from cache.
    const r2 = await octokit.repos.get({ owner: "owner", repo: "repo" });
    expect(r2.data.default_branch).toBe("main");
    expect(seenIfNoneMatch).toEqual([null, '"abc123"']);
    expect(cache.misses()).toBe(1);
    expect(cache.hits()).toBe(1);
    expect(serverCalls).toBe(2); // server still got both requests
  });

  it("does not cache POST responses", async () => {
    server.use(
      http.post(
        "https://api.github.com/repos/owner/repo/actions/workflows/:id/dispatches",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const cache = new EtagCache();
    const octokit = makeOctokit();
    installEtagHook(octokit, cache);

    await octokit.actions.createWorkflowDispatch({
      owner: "owner",
      repo: "repo",
      workflow_id: 100,
      ref: "main",
    });

    // POSTs are passed through, never recorded as misses or hits
    expect(cache.size()).toBe(0);
    expect(cache.misses()).toBe(0);
    expect(cache.hits()).toBe(0);
  });

  it("re-fetches when server returns 200 with a new etag (data changed)", async () => {
    let phase = 1;
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo",
        ({ request }) => {
          const ifNoneMatch = request.headers.get("if-none-match");
          if (phase === 1) {
            return HttpResponse.json(
              { default_branch: "main", id: 1, name: "repo", full_name: "owner/repo", owner: { login: "owner" } },
              { headers: { etag: '"v1"' } },
            );
          }
          // phase 2: data changed — return 200 with new etag, ignoring old If-None-Match
          if (ifNoneMatch === '"v1"') {
            return HttpResponse.json(
              { default_branch: "develop", id: 1, name: "repo", full_name: "owner/repo", owner: { login: "owner" } },
              { headers: { etag: '"v2"' } },
            );
          }
          return new HttpResponse(null, { status: 500 });
        },
      ),
    );

    const cache = new EtagCache();
    const octokit = makeOctokit();
    installEtagHook(octokit, cache);

    const r1 = await octokit.repos.get({ owner: "owner", repo: "repo" });
    expect(r1.data.default_branch).toBe("main");

    phase = 2;
    const r2 = await octokit.repos.get({ owner: "owner", repo: "repo" });
    expect(r2.data.default_branch).toBe("develop"); // fresh data
    expect(cache.misses()).toBe(2);
    expect(cache.hits()).toBe(0);

    // Cache should now hold v2
    const entry = cache.get(EtagCache.keyFor({
      method: "GET",
      url: "/repos/{owner}/{repo}",
      owner: "owner",
      repo: "repo",
    }));
    expect(entry?.etag).toBe('"v2"');
  });

  it("propagates non-304 errors normally", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const cache = new EtagCache();
    const octokit = makeOctokit();
    installEtagHook(octokit, cache);

    await expect(
      octokit.repos.get({ owner: "owner", repo: "repo" }),
    ).rejects.toThrow();
  });

  it("octokit.paginate + 304 roundtrip serves both pages from cache", async () => {
    // Two-page paginated response. Each page has its own ETag. First call
    // fetches both pages live; second call should produce 304 on both, with
    // octokit.paginate transparently following the cached Link header from
    // page 1 to page 2.
    let serverHits = 0;
    server.use(
      http.get("https://api.github.com/user/repos", ({ request }) => {
        serverHits++;
        const url = new URL(request.url);
        const page = url.searchParams.get("page") ?? "1";
        const ifNoneMatch = request.headers.get("if-none-match");
        const etag = `"page-${page}-v1"`;

        if (ifNoneMatch === etag) {
          return new HttpResponse(null, { status: 304, headers: { etag } });
        }

        if (page === "1") {
          return HttpResponse.json(
            [
              {
                id: 1,
                full_name: "owner/repo1",
                name: "repo1",
                owner: { login: "owner" },
              },
            ],
            {
              headers: {
                etag,
                // Octokit's paginator follows rel="next". We point at page 2.
                link: '<https://api.github.com/user/repos?per_page=1&page=2>; rel="next", <https://api.github.com/user/repos?per_page=1&page=2>; rel="last"',
              },
            },
          );
        }

        // page === "2"
        return HttpResponse.json(
          [
            {
              id: 2,
              full_name: "owner/repo2",
              name: "repo2",
              owner: { login: "owner" },
            },
          ],
          { headers: { etag } },
        );
      }),
    );

    const cache = new EtagCache();
    const octokit = makeOctokit();
    installEtagHook(octokit, cache);

    // First call: paginate fetches both pages, both cached
    const r1 = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      per_page: 1,
    });
    expect(r1.map((r) => r.full_name)).toEqual(["owner/repo1", "owner/repo2"]);
    expect(cache.size()).toBe(2);
    expect(cache.misses()).toBe(2);
    expect(cache.hits()).toBe(0);
    expect(serverHits).toBe(2);

    // Second call: server should 304 both pages (we'll see 2 more server hits
    // because msw still receives the requests), and our hook should serve both
    // from cache. paginate must follow the cached Link header to find page 2.
    const r2 = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      per_page: 1,
    });
    expect(r2.map((r) => r.full_name)).toEqual(["owner/repo1", "owner/repo2"]);
    expect(cache.misses()).toBe(2); // unchanged
    expect(cache.hits()).toBe(2); // both pages
    expect(serverHits).toBe(4); // 2 fresh + 2 conditional 304s
  });

  it("counts responses without etag headers so silent degradation is visible", async () => {
    // Simulate a proxy that strips ETag headers from upstream responses.
    server.use(
      http.get("https://api.github.com/repos/owner/repo", () => {
        return HttpResponse.json(
          {
            default_branch: "main",
            id: 1,
            name: "repo",
            full_name: "owner/repo",
            owner: { login: "owner" },
          },
          // No etag header — proxy stripped it
        );
      }),
    );

    const cache = new EtagCache();
    const octokit = makeOctokit();
    installEtagHook(octokit, cache);

    await octokit.repos.get({ owner: "owner", repo: "repo" });
    await octokit.repos.get({ owner: "owner", repo: "repo" });

    // Both responses succeeded but couldn't be cached
    expect(cache.size()).toBe(0);
    expect(cache.misses()).toBe(2);
    expect(cache.hits()).toBe(0);
    expect(cache.noEtagResponses()).toBe(2);
  });

  it("skips ETag caching entirely when SKIP_ETAG_CACHE_HEADER is set", async () => {
    const seenIfNoneMatch: (string | null)[] = [];
    const seenSkipHeader: (string | null)[] = [];
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/pulls",
        ({ request }) => {
          seenIfNoneMatch.push(request.headers.get("if-none-match"));
          seenSkipHeader.push(request.headers.get(SKIP_ETAG_CACHE_HEADER));
          return HttpResponse.json([{ id: 1, number: 1, state: "open" }], {
            headers: {
              etag: '"pulls-v1"',
              link: '<https://api.github.com/repos/owner/repo/pulls?per_page=1&page=25>; rel="last"',
            },
          });
        },
      ),
    );

    const cache = new EtagCache();
    const octokit = makeOctokit();
    installEtagHook(octokit, cache);

    // First call with skip header set
    await octokit.pulls.list({
      owner: "owner",
      repo: "repo",
      state: "open",
      per_page: 1,
      headers: { [SKIP_ETAG_CACHE_HEADER]: "1" },
    });
    // Second call same way
    await octokit.pulls.list({
      owner: "owner",
      repo: "repo",
      state: "open",
      per_page: 1,
      headers: { [SKIP_ETAG_CACHE_HEADER]: "1" },
    });

    // Cache was never populated
    expect(cache.size()).toBe(0);
    expect(cache.hits()).toBe(0);
    expect(cache.misses()).toBe(0);

    // Skip header was stripped before reaching the server, and no
    // if-none-match was sent (no cached entry)
    expect(seenIfNoneMatch).toEqual([null, null]);
    expect(seenSkipHeader).toEqual([null, null]);
  });
});
