/**
 * @jest-environment node
 *
 * Tests for `hubspotRequest` — the shared CRM v3 / Webhooks v3 HTTP
 * wrapper. Mocks `fetch` so we don't hit HubSpot. Verifies:
 *   - Static API base (default) + env override (HUBSPOT_API_BASE).
 *   - `Authorization: Bearer <token>` header (standard OAuth2 bearer).
 *   - `Content-Type: application/json` for POST / PATCH / PUT bodies.
 *   - Query-string append on GET / DELETE.
 *   - 401 → `Unauthorized401Error`.
 *   - 404 → `NotFoundError`.
 *   - 409 → `ConflictError` (V2 contract for duplicate-record recovery).
 *   - 204 → returns `{}` (caller-friendly no-content shape).
 *   - Other non-2xx → generic Error with `surfaceHubSpotError` message.
 *   - `crmPath` helper produces `/crm/v3/...`.
 */
import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  crmPath,
  hubspotRequest,
} from "@/integrations/_shared/hubspot/api/_request";
import {
  ConflictError,
  NotFoundError,
} from "@/integrations/_shared/hubspot/errors";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.HUBSPOT_API_BASE;
});

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const spy = jest.spyOn(globalThis, "fetch");
  const body =
    response.text !== undefined ? response.text : JSON.stringify(response.json ?? {});
  spy.mockResolvedValueOnce(
    new Response(body, {
      status: response.status ?? (response.ok ? 200 : 500),
    }),
  );
  return spy;
}

// ─── crmPath ────────────────────────────────────────────────────────────────

describe("crmPath", () => {
  it("produces /crm/v3/<rest>", () => {
    expect(crmPath("objects/contacts")).toBe("/crm/v3/objects/contacts");
    expect(crmPath("objects/deals/1234")).toBe("/crm/v3/objects/deals/1234");
  });
});

// ─── URL routing ────────────────────────────────────────────────────────────

describe("hubspotRequest — URL routing", () => {
  it("defaults to https://api.hubapi.com when HUBSPOT_API_BASE is unset", async () => {
    const spy = mockFetchOnce({ ok: true, json: { id: "1" } });
    await hubspotRequest({
      accessToken: "tok",
      method: "GET",
      path: crmPath("objects/contacts/1"),
      resourceForNotFound: "contact 1",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.hubapi.com/crm/v3/objects/contacts/1",
    );
  });

  it("uses HUBSPOT_API_BASE override when set (e2e mock surface)", async () => {
    process.env.HUBSPOT_API_BASE = "http://localhost:9883";
    const spy = mockFetchOnce({ ok: true, json: {} });
    await hubspotRequest({
      accessToken: "tok",
      method: "GET",
      path: crmPath("objects/companies/5"),
      resourceForNotFound: "company 5",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "http://localhost:9883/crm/v3/objects/companies/5",
    );
  });

  it("appends query-string params when supplied", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await hubspotRequest({
      accessToken: "tok",
      method: "GET",
      path: crmPath("objects/contacts/42"),
      query: new URLSearchParams({ properties: "email,firstname" }),
      resourceForNotFound: "contact 42",
    });
    expect(spy.mock.calls[0]![0]).toBe(
      "https://api.hubapi.com/crm/v3/objects/contacts/42?properties=email%2Cfirstname",
    );
  });
});

// ─── Headers ────────────────────────────────────────────────────────────────

describe("hubspotRequest — headers", () => {
  it("sends Authorization: Bearer <token>", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await hubspotRequest({
      accessToken: "secret-token-abc",
      method: "GET",
      path: crmPath("objects/contacts"),
      resourceForNotFound: "contacts",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token-abc");
  });

  it("includes Content-Type: application/json on POST/PATCH with body", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await hubspotRequest({
      accessToken: "tok",
      method: "POST",
      path: crmPath("objects/contacts"),
      body: { properties: { email: "a@example.com" } },
      resourceForNotFound: "contact (create)",
    });
    const init = spy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(
      JSON.stringify({ properties: { email: "a@example.com" } }),
    );
  });

  it("omits Content-Type when no body (GET / DELETE pattern)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await hubspotRequest({
      accessToken: "tok",
      method: "GET",
      path: crmPath("objects/contacts/1"),
      resourceForNotFound: "contact 1",
    });
    const init = spy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("always sends Accept: application/json (defensive)", async () => {
    const spy = mockFetchOnce({ ok: true, json: {} });
    await hubspotRequest({
      accessToken: "tok",
      method: "GET",
      path: crmPath("objects/contacts"),
      resourceForNotFound: "contacts",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
  });
});

// ─── Error mapping ──────────────────────────────────────────────────────────

describe("hubspotRequest — error mapping", () => {
  it("throws Unauthorized401Error on 401 (refreshAndRetry catches this)", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await expect(
      hubspotRequest({
        accessToken: "tok",
        method: "GET",
        path: crmPath("objects/contacts"),
        resourceForNotFound: "contacts",
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("throws InsufficientScopeError on 403 (missing scope — reconnect, not refresh) without leaking the body", async () => {
    // CONFIG-FIELD-UX-SWEEP-4: 403 = HubSpot MISSING_SCOPES. Refresh keeps the
    // same scopes, so this is a reconnect signal, not a retry — and the body
    // (which can echo the granted/required scope list) is never surfaced.
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { status: "error", message: "MISSING_SCOPES granted=[a] required=[crm.schemas.contacts.read] leak" },
    });
    try {
      await hubspotRequest({
        accessToken: "tok",
        method: "GET",
        path: crmPath("properties/contacts/lifecyclestage"),
        resourceForNotFound: "property contacts.lifecyclestage",
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientScopeError);
      expect((err as Error).message).not.toContain("leak");
    }
  });

  it("throws NotFoundError on 404 with surfaced message", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { status: "error", message: "Contact 9999 not found" },
    });
    await expect(
      hubspotRequest({
        accessToken: "tok",
        method: "GET",
        path: crmPath("objects/contacts/9999"),
        resourceForNotFound: "contact 9999",
      }),
    ).rejects.toThrow(NotFoundError);

    mockFetchOnce({
      ok: false,
      status: 404,
      json: { status: "error", message: "Contact 9999 not found" },
    });
    await expect(
      hubspotRequest({
        accessToken: "tok",
        method: "GET",
        path: crmPath("objects/contacts/9999"),
        resourceForNotFound: "contact 9999",
      }),
    ).rejects.toThrow(/Contact 9999 not found/);
  });

  it("throws ConflictError on 409 (caller decides recovery)", async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      json: {
        status: "error",
        message: "Contact already exists. Existing ID: 12345",
        category: "OBJECT_ALREADY_EXISTS",
      },
    });
    await expect(
      hubspotRequest({
        accessToken: "tok",
        method: "POST",
        path: crmPath("objects/contacts"),
        body: { properties: { email: "dup@example.com" } },
        resourceForNotFound: "contact (create)",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("ConflictError preserves the raw HubSpot error body for deterministic recovery", async () => {
    const errorJson = {
      status: "error",
      message: "Contact already exists. Existing ID: 12345",
      category: "OBJECT_ALREADY_EXISTS",
    };
    mockFetchOnce({ ok: false, status: 409, json: errorJson });
    try {
      await hubspotRequest({
        accessToken: "tok",
        method: "POST",
        path: crmPath("objects/contacts"),
        body: { properties: { email: "dup@example.com" } },
        resourceForNotFound: "contact (create)",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      // The raw error body is preserved on the error instance — but
      // the V2 contract says CALLERS DO NOT REGEX-EXTRACT the
      // existing id from it. They use deterministic search-by-property
      // instead. The body is preserved for diagnostics / logging only.
      expect((err as ConflictError).errorBody).toContain(
        "OBJECT_ALREADY_EXISTS",
      );
    }
  });

  it("returns empty object on 204 No Content", async () => {
    // The standard Response constructor refuses a body on 204; build
    // it directly instead of going through mockFetchOnce (which
    // always supplies a body string).
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await hubspotRequest({
      accessToken: "tok",
      method: "DELETE",
      path: crmPath("objects/contacts/1"),
      resourceForNotFound: "contact 1",
    });
    expect(result).toEqual({});
  });

  it("throws generic Error on 4xx (validation) with surfaced message", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: {
        status: "error",
        message: "Property values were not valid",
        category: "VALIDATION_ERROR",
      },
    });
    await expect(
      hubspotRequest({
        accessToken: "tok",
        method: "POST",
        path: crmPath("objects/contacts"),
        body: { properties: { email: "not-an-email" } },
        resourceForNotFound: "contact (create)",
      }),
    ).rejects.toThrow(/Property values were not valid/);
  });

  it("throws generic Error on 5xx", async () => {
    mockFetchOnce({ ok: false, status: 500, text: "" });
    await expect(
      hubspotRequest({
        accessToken: "tok",
        method: "GET",
        path: crmPath("objects/contacts"),
        resourceForNotFound: "contacts",
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

// ─── Success ────────────────────────────────────────────────────────────────

describe("hubspotRequest — success", () => {
  it("returns the parsed JSON body verbatim", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: { id: "42", properties: { email: "a@example.com" } },
    });
    const result = await hubspotRequest<{
      id: string;
      properties: { email: string };
    }>({
      accessToken: "tok",
      method: "GET",
      path: crmPath("objects/contacts/42"),
      resourceForNotFound: "contact 42",
    });
    expect(result.id).toBe("42");
    expect(result.properties.email).toBe("a@example.com");
  });
});
