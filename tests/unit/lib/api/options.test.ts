/**
 * @jest-environment node
 *
 * Tests for `lib/api/options.ts` — Slice 3.30 typed client.
 *
 * Pin:
 *   - URL building (source encoding, q + deps[*] serialization).
 *   - Discriminated body passes through verbatim.
 *   - 401 maps to UNAUTHENTICATED without parsing the body.
 *   - Network throw maps to UNKNOWN + `ok: false` (single union type
 *     for callers).
 *   - AbortError re-throws so callers detect cancellation explicitly.
 *   - Malformed JSON maps to a sane SERVER_ERROR / UNKNOWN fallback.
 *
 * Uses `jest.spyOn(globalThis, "fetch")` — established pattern in
 * `tests/unit/integrations/airtable/oauth.test.ts` etc. The Node test
 * environment exposes a real `Response` constructor + `fetch` global,
 * matching the production runtime; jsdom's polyfills would diverge.
 */

import {
  buildOptionsSourceUrl,
  fetchOptionsSource,
  type OptionsApiResponse,
} from "@/lib/api/options";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(response: Response | Promise<Response>): void {
  jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(response as Response);
}

function mockFetchReject(error: unknown): void {
  jest.spyOn(globalThis, "fetch").mockRejectedValueOnce(error);
}

describe("buildOptionsSourceUrl", () => {
  it("URL-encodes the source segment", () => {
    expect(buildOptionsSourceUrl("slack:channels")).toBe(
      "/api/options/slack%3Achannels",
    );
  });

  it("omits the query string when no q / deps", () => {
    expect(buildOptionsSourceUrl("native:examples")).toBe(
      "/api/options/native%3Aexamples",
    );
  });

  it("serializes `q` when non-empty", () => {
    expect(
      buildOptionsSourceUrl("slack:channels", { q: "eng" }),
    ).toBe("/api/options/slack%3Achannels?q=eng");
  });

  it("omits `q` when empty", () => {
    expect(
      buildOptionsSourceUrl("slack:channels", { q: "" }),
    ).toBe("/api/options/slack%3Achannels");
  });

  it("serializes deps[*] with literal brackets in the key", () => {
    const url = buildOptionsSourceUrl("airtable:tables", {
      deps: { baseId: "app01" },
    });
    expect(url).toContain("deps%5BbaseId%5D=app01");
  });

  it("serializes multiple deps in stable order", () => {
    const url = buildOptionsSourceUrl("synthetic:source", {
      deps: { baseId: "B1", tableId: "T1" },
    });
    // URLSearchParams preserves insertion order.
    expect(url).toBe(
      "/api/options/synthetic%3Asource?deps%5BbaseId%5D=B1&deps%5BtableId%5D=T1",
    );
  });

  it("URL-encodes special characters in q + dep values", () => {
    const url = buildOptionsSourceUrl("slack:channels", {
      q: "Q4 report",
      deps: { folder: "a/b c" },
    });
    expect(url).toContain("q=Q4+report");
    expect(url).toContain("deps%5Bfolder%5D=a%2Fb+c");
  });

  // ── Slice 4.ACCOUNT-MODEL-22D-1 — workflowId provenance plumbing ──────────
  it("serializes workflowId when set", () => {
    expect(
      buildOptionsSourceUrl("slack:channels", { workflowId: "wf-9" }),
    ).toBe("/api/options/slack%3Achannels?workflowId=wf-9");
  });

  it("omits workflowId when empty", () => {
    expect(
      buildOptionsSourceUrl("slack:channels", { workflowId: "" }),
    ).toBe("/api/options/slack%3Achannels");
  });

  it("serializes workflowId alongside q + deps", () => {
    const url = buildOptionsSourceUrl("airtable:tables", {
      q: "x",
      deps: { baseId: "b1" },
      workflowId: "wf-9",
    });
    expect(url).toContain("q=x");
    expect(url).toContain("deps%5BbaseId%5D=b1");
    expect(url).toContain("workflowId=wf-9");
  });

  // ── CS-4 — nodeId for per-node credential-owner resolution ────────────────
  it("serializes nodeId alongside workflowId when set", () => {
    const url = buildOptionsSourceUrl("gmail:labels", {
      workflowId: "wf-9",
      nodeId: "node-7",
    });
    expect(url).toContain("workflowId=wf-9");
    expect(url).toContain("nodeId=node-7");
  });

  it("omits nodeId when empty", () => {
    expect(
      buildOptionsSourceUrl("gmail:labels", { workflowId: "wf-9", nodeId: "" }),
    ).toBe("/api/options/gmail%3Alabels?workflowId=wf-9");
  });
});

describe("fetchOptionsSource — happy path", () => {
  it("returns the discriminated body verbatim on a 200 response", async () => {
    const payload: OptionsApiResponse = {
      ok: true,
      source: "native:examples",
      items: [{ value: "apple", label: "Apple" }],
      hasMore: false,
    };
    mockFetchOnce(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await fetchOptionsSource("native:examples");
    expect(result).toEqual(payload);
  });

  it("passes args.signal through to fetch", async () => {
    const controller = new AbortController();
    const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          source: "native:examples",
          items: [],
          hasMore: false,
        }),
        { status: 200 },
      ),
    );

    await fetchOptionsSource("native:examples", { signal: controller.signal });
    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0]![1];
    expect(init?.signal).toBe(controller.signal);
  });

  it("sends a GET with Accept: application/json", async () => {
    const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          source: "native:examples",
          items: [],
          hasMore: false,
        }),
        { status: 200 },
      ),
    );

    await fetchOptionsSource("native:examples", {
      q: "ap",
      deps: { category: "fruit" },
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "/api/options/native%3Aexamples?q=ap&deps%5Bcategory%5D=fruit",
    );
    const init = spy.mock.calls[0]![1];
    expect(init?.method).toBe("GET");
    expect(
      (init?.headers as Record<string, string>)["Accept"],
    ).toBe("application/json");
  });
});

describe("fetchOptionsSource — error paths", () => {
  it("returns ok:false + UNAUTHENTICATED on 401 without parsing the body", async () => {
    mockFetchOnce(new Response("not json", { status: 401 }));

    const result = await fetchOptionsSource("native:examples");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHENTICATED");
      expect(result.source).toBe("native:examples");
    }
  });

  it("returns the route's ok:false body verbatim on 200 + ok:false", async () => {
    const payload: OptionsApiResponse = {
      ok: false,
      source: "ghost:nothing",
      code: "SOURCE_NOT_FOUND",
      message: "Unknown options source 'ghost:nothing'.",
    };
    mockFetchOnce(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await fetchOptionsSource("ghost:nothing");
    expect(result).toEqual(payload);
  });

  it("returns ok:false + UNKNOWN on a network-layer throw", async () => {
    mockFetchReject(new TypeError("network down"));

    const result = await fetchOptionsSource("native:examples");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNKNOWN");
    }
  });

  it("re-throws AbortError so callers detect cancellation", async () => {
    mockFetchReject(new DOMException("aborted", "AbortError"));

    await expect(fetchOptionsSource("native:examples")).rejects.toThrow(
      /aborted/,
    );
  });

  it("returns ok:false on malformed JSON (no crash)", async () => {
    mockFetchOnce(new Response("<<not json>>", { status: 200, headers: {} }));

    const result = await fetchOptionsSource("native:examples");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 200 status + unparseable → UNKNOWN (per the client's branch).
      expect(result.code).toBe("UNKNOWN");
    }
  });

  it("returns ok:false on a response missing the discriminator", async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );

    const result = await fetchOptionsSource("native:examples");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNKNOWN");
    }
  });
});

describe("fetchOptionsSource — error code coverage (matches OptionsSourceErrorCode union)", () => {
  // Pin that every route-defined error code passes through the client
  // verbatim. If a new code lands in services/options/types.ts, this
  // test reminds us to add it to lib/api/options.ts (the two unions
  // are duplicated by design to keep the client/server boundary clean
  // — boundary test forbids lib/api/ from importing services/).
  const codes = [
    "UNAUTHENTICATED",
    "INTEGRATION_DISCONNECTED",
    "SOURCE_NOT_FOUND",
    "MISSING_DEPENDENCY",
    "PROVIDER_ERROR",
    "PROVIDER_REAUTH_REQUIRED",
    "SERVER_ERROR",
    // Slice 4.ACCOUNT-MODEL-22D-2 personal-provider policy states.
    "NOT_WORKFLOW_OWNER",
    "OWNER_MUST_CONNECT",
    "UNKNOWN",
  ] as const;

  it.each(codes)("preserves code '%s' from the route body", async (code) => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          ok: false,
          source: "test:source",
          code,
          message: `Synthetic ${code}.`,
        }),
        { status: 200 },
      ),
    );

    const result = await fetchOptionsSource("test:source");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
    }
  });
});
