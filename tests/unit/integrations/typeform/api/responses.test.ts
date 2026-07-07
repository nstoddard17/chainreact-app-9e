/**
 * @jest-environment node
 *
 * TYPEFORM-2 — `responsesList` wrapper (GET /forms/{id}/responses)
 * through the real `typeformRequest` with a mocked fetch boundary:
 * query construction, bounded item projection, and HTTP error mapping.
 */
import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  NotFoundError,
  RateLimitedError,
} from "@/integrations/_shared/typeform/errors";
import { responsesList } from "@/integrations/_shared/typeform/api/responses";

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("responsesList query construction", () => {
  it("always sends page_size; omits absent filters; never sends sort or response_type", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ total_items: 0, items: [] }));
    await responsesList({ accessToken: "at", formId: "abc123", pageSize: 25 });
    const url = new URL(mockFetch.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/forms/abc123/responses");
    expect(url.searchParams.get("page_size")).toBe("25");
    for (const absent of ["sort", "response_type", "since", "until", "query", "before", "included_response_ids"]) {
      expect(url.searchParams.has(absent)).toBe(false);
    }
  });

  it("threads since/until/query/before/included_response_ids and URL-encodes the form id", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ total_items: 0, items: [] }));
    await responsesList({
      accessToken: "at",
      formId: "a/b",
      pageSize: 5,
      since: "2026-07-01T00:00:00Z",
      until: "2026-07-06T00:00:00Z",
      query: "ada",
      before: "resp-0",
      includedResponseIds: "resp-9",
    });
    const raw = mockFetch.mock.calls[0]![0] as string;
    expect(raw).toContain("/forms/a%2Fb/responses");
    const url = new URL(raw);
    expect(url.searchParams.get("since")).toBe("2026-07-01T00:00:00Z");
    expect(url.searchParams.get("until")).toBe("2026-07-06T00:00:00Z");
    expect(url.searchParams.get("query")).toBe("ada");
    expect(url.searchParams.get("before")).toBe("resp-0");
    expect(url.searchParams.get("included_response_ids")).toBe("resp-9");
  });

  it("sends the bearer token in the Authorization header only", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));
    await responsesList({ accessToken: "secret-at", formId: "f", pageSize: 1 });
    const [url, init] = mockFetch.mock.calls[0]! as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers.Authorization).toBe("Bearer secret-at");
    expect(url).not.toContain("secret-at");
  });
});

describe("responsesList projection", () => {
  it("narrows items to the projection type — metadata / unknown keys dropped", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        total_items: 1,
        page_count: 1,
        items: [
          {
            token: "resp-1",
            response_id: "raw-id",
            landing_id: "landing-1",
            submitted_at: "2026-07-05T10:00:00Z",
            landed_at: "2026-07-05T09:59:00Z",
            metadata: {
              user_agent: "Mozilla/5.0",
              referer: "https://example.test",
              network_id: "abc",
            },
            hidden: { source: "ad" },
            calculated: { score: 5 },
            variables: [{ key: "v", type: "number", number: 1 }],
            answers: [{ type: "text", field: { id: "f1" }, text: "hi" }],
          },
        ],
      }),
    );
    const page = await responsesList({ accessToken: "at", formId: "f", pageSize: 1 });
    expect(page.totalItems).toBe(1);
    expect(page.items).toHaveLength(1);
    const item = page.items[0]!;
    expect(item).toEqual({
      token: "resp-1",
      submitted_at: "2026-07-05T10:00:00Z",
      landed_at: "2026-07-05T09:59:00Z",
      hidden: { source: "ad" },
      calculated: { score: 5 },
      answers: [{ type: "text", field: { id: "f1" }, text: "hi" }],
    });
    expect(item).not.toHaveProperty("metadata");
    expect(item).not.toHaveProperty("variables");
    expect(item).not.toHaveProperty("response_id");
    expect(item).not.toHaveProperty("landing_id");
  });

  it("tolerates missing/odd fields (empty body, non-array items)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const page = await responsesList({ accessToken: "at", formId: "f", pageSize: 1 });
    expect(page).toEqual({ items: [], totalItems: null });
  });
});

describe("responsesList error mapping", () => {
  it("401 -> Unauthorized401Error (refreshAndRetry seam)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(
      responsesList({ accessToken: "at", formId: "f", pageSize: 1 }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("403 -> InsufficientScopeError (missing responses:read grant -> re-consent)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 403));
    await expect(
      responsesList({ accessToken: "at", formId: "f", pageSize: 1 }),
    ).rejects.toBeInstanceOf(InsufficientScopeError);
  });

  it("404 -> NotFoundError naming the form (never the raw body)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: "FORM_NOT_FOUND", description: "Form not found" }, 404),
    );
    const err = await responsesList({
      accessToken: "at",
      formId: "nope",
      pageSize: 1,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).resource).toBe("form nope");
  });

  it("429 -> RateLimitedError with parsed Retry-After", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("{}", { status: 429, headers: { "Retry-After": "3" } }),
    );
    const err = await responsesList({
      accessToken: "at",
      formId: "f",
      pageSize: 1,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfterSeconds).toBe(3);
  });

  it("5xx -> generic error surfacing the envelope description, never the raw body", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ code: "INTERNAL", description: "upstream exploded", secrets: "xoxo" }, 500),
    );
    const err = await responsesList({
      accessToken: "at",
      formId: "f",
      pageSize: 1,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("upstream exploded");
    expect((err as Error).message).not.toContain("xoxo");
  });
});
