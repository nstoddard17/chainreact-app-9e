/**
 * @jest-environment node
 *
 * Tests for `mailchimpRequest` — the shared Marketing API v3 HTTP
 * wrapper with per-datacenter routing. Mocks `fetch` so we don't hit
 * Mailchimp. Verifies:
 *   - Per-dc routing (`https://${dc}.api.mailchimp.com/3.0/...`).
 *   - MAILCHIMP_API_BASE_OVERRIDE env override collapses dc routing.
 *   - `Authorization: Bearer <token>` header.
 *   - `Content-Type: application/json` for POST/PATCH/PUT bodies;
 *     absent for GET/DELETE.
 *   - 401 → Unauthorized401Error (caught by refreshAndRetry).
 *   - 404 → NotFoundError(resource).
 *   - 409 → ConflictError(resource, body).
 *   - 400 with `title: "Member Exists"` → ConflictError (Mailchimp's
 *     quirk — promoted to the standard conflict shape).
 *   - 400 without that title → generic Error.
 *   - 204 → returns `{}` (caller-friendly no-content shape).
 *   - Other non-2xx → generic Error with `surfaceMailchimpError` message.
 *   - MissingDataCenterError propagates from mailchimpApiOrigin.
 */
import { mailchimpRequest } from "@/integrations/_shared/mailchimp/api/_request";
import {
  ConflictError,
  MissingDataCenterError,
  NotFoundError,
} from "@/integrations/_shared/mailchimp/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MAILCHIMP_API_BASE_OVERRIDE;
});

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const spy = jest.spyOn(globalThis, "fetch");
  const status = response.status ?? (response.ok ? 200 : 500);
  // Per spec, 204 No Content MUST have a null body — the Response
  // constructor throws on any body (even empty string) at status 204.
  const body =
    status === 204
      ? null
      : response.text !== undefined
        ? response.text
        : JSON.stringify(response.json ?? {});
  spy.mockResolvedValueOnce(new Response(body, { status }));
  return spy;
}

const BASE_INPUT = {
  accessToken: "mc_test_token",
  dc: "us21",
  resourceForNotFound: "test resource",
} as const;

// ─── routing ────────────────────────────────────────────────────────────────

describe("mailchimpRequest — per-dc routing", () => {
  it("constructs URL as https://${dc}.api.mailchimp.com/3.0/<path>", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { ok: 1 } });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "GET",
      path: "/lists/abc/members/xyz",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://us21.api.mailchimp.com/3.0/lists/abc/members/xyz",
    );
  });

  it("honors MAILCHIMP_API_BASE_OVERRIDE for e2e single-port mocks", async () => {
    process.env.MAILCHIMP_API_BASE_OVERRIDE = "http://localhost:9885";
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await mailchimpRequest({
      ...BASE_INPUT,
      dc: "eu1",
      method: "GET",
      path: "/lists",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe("http://localhost:9885/3.0/lists");
  });

  it("normalizes paths without leading slash", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "GET",
      path: "lists",
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://us21.api.mailchimp.com/3.0/lists",
    );
  });

  it("appends query string when query param is supplied", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "GET",
      path: "/lists",
      query: new URLSearchParams({ count: "100", offset: "0" }),
    });
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://us21.api.mailchimp.com/3.0/lists?count=100&offset=0",
    );
  });

  it("throws MissingDataCenterError when dc is empty", async () => {
    await expect(
      mailchimpRequest({ ...BASE_INPUT, dc: "", method: "GET", path: "/x" }),
    ).rejects.toBeInstanceOf(MissingDataCenterError);
  });
});

// ─── headers + body ─────────────────────────────────────────────────────────

describe("mailchimpRequest — headers + body", () => {
  it("sends Authorization: Bearer + Accept: application/json on GET", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "GET",
      path: "/x",
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mc_test_token");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("sends Content-Type: application/json + stringified body on POST", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "m" } });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "POST",
      path: "/x",
      body: { foo: "bar", n: 42 },
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"foo":"bar","n":42}');
  });

  it("sends body on PUT and PATCH", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "PUT",
      path: "/x",
      body: { put: 1 },
    });
    expect((fetchSpy.mock.calls[0]![1]!).body).toBe('{"put":1}');

    mockFetchOnce({ ok: true, json: {} });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "PATCH",
      path: "/x",
      body: { patch: 2 },
    });
    expect((fetchSpy.mock.calls[1]![1]!).body).toBe(
      '{"patch":2}',
    );
  });

  it("omits Content-Type and body when body is undefined", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: {} });
    await mailchimpRequest({
      ...BASE_INPUT,
      method: "DELETE",
      path: "/x",
    });
    const init = fetchSpy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });
});

// ─── error mapping ──────────────────────────────────────────────────────────

describe("mailchimpRequest — error mapping", () => {
  it("401 → Unauthorized401Error (caught by refreshAndRetry)", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      mailchimpRequest({
        ...BASE_INPUT,
        method: "GET",
        path: "/x",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("401 message includes method and path for diagnostics", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      mailchimpRequest({
        ...BASE_INPUT,
        method: "DELETE",
        path: "/lists/abc/members/xyz",
      }),
    ).rejects.toThrow(/DELETE \/lists\/abc\/members\/xyz returned HTTP 401/);
  });

  it("404 → NotFoundError with resource label + error detail", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { type: "...", title: "Resource Not Found", detail: "missing thing" },
    });
    await expect(
      mailchimpRequest({
        accessToken: "t",
        dc: "us21",
        method: "GET",
        path: "/x",
        resourceForNotFound: "subscriber abc@def.com",
      }),
    ).rejects.toMatchObject({
      name: "NotFoundError",
      resource: "subscriber abc@def.com",
    });
  });

  it("409 → ConflictError with raw body for caller analysis", async () => {
    const body = JSON.stringify({
      type: "...",
      title: "Conflict",
      detail: "tag conflict",
    });
    mockFetchOnce({ ok: false, status: 409, text: body });
    await expect(
      mailchimpRequest({
        ...BASE_INPUT,
        method: "POST",
        path: "/x",
      }),
    ).rejects.toMatchObject({
      name: "ConflictError",
      errorBody: body,
    });
  });

  it("400 with title:'Member Exists' → ConflictError (Mailchimp's quirk)", async () => {
    // Mailchimp's "Member Exists" arrives as 400, not 409. The
    // wrapper promotes it to ConflictError so callers can match on
    // a single typed shape rather than sniffing the wire envelope.
    const body = JSON.stringify({
      type: "...",
      title: "Member Exists",
      detail: "user@example.com is already a list member.",
      status: 400,
    });
    mockFetchOnce({ ok: false, status: 400, text: body });
    await expect(
      mailchimpRequest({
        ...BASE_INPUT,
        method: "PUT",
        path: "/lists/abc/members/xyz",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("400 without 'Member Exists' title → generic Error (not ConflictError)", async () => {
    // Anti-test for the "Member Exists" promotion. A regular 400
    // validation error must NOT be promoted to ConflictError —
    // that would mask validation failures as conflicts.
    const body = JSON.stringify({
      type: "...",
      title: "Invalid Resource",
      detail: "email_address is required",
    });
    mockFetchOnce({ ok: false, status: 400, text: body });
    let caught: unknown;
    try {
      await mailchimpRequest({
        ...BASE_INPUT,
        method: "POST",
        path: "/x",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(ConflictError);
    expect(caught).not.toBeInstanceOf(NotFoundError);
    expect((caught as Error).message).toMatch(/email_address is required/);
  });

  it("204 → returns {} (caller-friendly no-content shape)", async () => {
    mockFetchOnce({ ok: true, status: 204, text: "" });
    const result = await mailchimpRequest({
      ...BASE_INPUT,
      method: "DELETE",
      path: "/x",
    });
    expect(result).toEqual({});
  });

  it("500 → generic Error with surfaceMailchimpError message", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: { detail: "internal server error" },
    });
    await expect(
      mailchimpRequest({
        ...BASE_INPUT,
        method: "GET",
        path: "/x",
      }),
    ).rejects.toThrow(/Mailchimp GET \/x failed: internal server error/);
  });

  it("malformed JSON error body → HTTP <status> fallback", async () => {
    mockFetchOnce({ ok: false, status: 502, text: "Bad Gateway HTML page" });
    await expect(
      mailchimpRequest({
        ...BASE_INPUT,
        method: "GET",
        path: "/x",
      }),
    ).rejects.toThrow(/Mailchimp GET \/x failed: HTTP 502/);
  });
});

// ─── successful response parsing ────────────────────────────────────────────

describe("mailchimpRequest — success cases", () => {
  it("returns parsed JSON body on 200", async () => {
    mockFetchOnce({ ok: true, json: { id: "m_xyz", status: "subscribed" } });
    const result = await mailchimpRequest<{ id: string; status: string }>({
      ...BASE_INPUT,
      method: "GET",
      path: "/x",
    });
    expect(result).toEqual({ id: "m_xyz", status: "subscribed" });
  });
});
