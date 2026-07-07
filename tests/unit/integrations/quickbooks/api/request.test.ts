/**
 * @jest-environment node
 *
 * QUICKBOOKS-1 — shared Accounting API request helper: minorversion
 * pinning, realm-scoped URLs, query escaping, octet-stream send shape,
 * and the cross-provider error mapping.
 */
import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  NotFoundError,
  RateLimitedError,
  surfaceQuickbooksError,
} from "@/integrations/_shared/quickbooks/errors";
import {
  escapeQueryValue,
  quickbooksRequest,
} from "@/integrations/_shared/quickbooks/api/_request";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.QUICKBOOKS_API_BASE;
});

function mockFetchOnce(input: { status?: number; json?: unknown; text?: string; headers?: Record<string, string> }) {
  const status = input.status ?? 200;
  const body = input.text !== undefined ? input.text : JSON.stringify(input.json ?? {});
  const spy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(body, { status, headers: input.headers }),
  );
  return spy;
}

const BASE_INPUT = {
  accessToken: "tok",
  realmId: "913035",
  method: "GET" as const,
  path: "/customer/42",
  resourceForNotFound: "customer 42",
};

describe("escapeQueryValue", () => {
  it("escapes single quotes with a backslash (Intuit's documented escape)", () => {
    expect(escapeQueryValue("Adam's Candy")).toBe("Adam\\'s Candy");
  });
  it("doubles backslashes FIRST so a trailing user backslash can't dangle", () => {
    expect(escapeQueryValue("a\\'b")).toBe("a\\\\\\'b");
    expect(escapeQueryValue("trailing\\")).toBe("trailing\\\\");
  });
});

describe("quickbooksRequest", () => {
  it("builds the realm-scoped URL with minorversion=75 and Bearer auth", async () => {
    const spy = mockFetchOnce({ json: { Customer: {} } });
    await quickbooksRequest(BASE_INPUT);
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://quickbooks.api.intuit.com/v3/company/913035/customer/42?minorversion=75",
    );
    const headers = (init as { headers?: Record<string, string> }).headers!;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers.Accept).toBe("application/json");
  });

  it("honors the QUICKBOOKS_API_BASE override (sandbox keys)", async () => {
    process.env.QUICKBOOKS_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
    const spy = mockFetchOnce({ json: {} });
    await quickbooksRequest(BASE_INPUT);
    expect(String(spy.mock.calls[0]![0])).toContain(
      "https://sandbox-quickbooks.api.intuit.com/v3/company/913035/",
    );
  });

  it("sends application/octet-stream with an empty body for the /send shape", async () => {
    const spy = mockFetchOnce({ json: { Invoice: {} } });
    await quickbooksRequest({
      ...BASE_INPUT,
      method: "POST",
      path: "/invoice/7/send",
      octetStream: true,
      query: new URLSearchParams({ sendTo: "x@y.test" }),
      resourceForNotFound: "invoice 7",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("sendTo=x%40y.test");
    const headers = (init as { headers?: Record<string, string> }).headers!;
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect((init as { body?: unknown }).body).toBe("");
  });

  it("maps 401 → Unauthorized401Error (refreshAndRetry contract)", async () => {
    mockFetchOnce({ status: 401, json: {} });
    await expect(quickbooksRequest(BASE_INPUT)).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("maps 403 → InsufficientScopeError", async () => {
    mockFetchOnce({ status: 403, json: {} });
    await expect(quickbooksRequest(BASE_INPUT)).rejects.toBeInstanceOf(
      InsufficientScopeError,
    );
  });

  it("maps 404 → NotFoundError carrying the resource label", async () => {
    mockFetchOnce({ status: 404, json: {} });
    await expect(quickbooksRequest(BASE_INPUT)).rejects.toThrow(
      /customer 42/,
    );
    mockFetchOnce({ status: 404, json: {} });
    await expect(quickbooksRequest(BASE_INPUT)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps 429 → RateLimitedError with parsed Retry-After", async () => {
    mockFetchOnce({
      status: 429,
      json: {},
      headers: { "retry-after": "30" },
    });
    const err = await quickbooksRequest(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfterSeconds).toBe(30);
  });

  it("surfaces Fault Message+code on other failures — never Detail (entity values)", async () => {
    mockFetchOnce({
      status: 400,
      json: {
        Fault: {
          Error: [
            {
              Message: "Duplicate Name Exists Error",
              Detail: "The name Acme Corp is already in use",
              code: "6240",
            },
          ],
          type: "ValidationFault",
        },
      },
    });
    const err = (await quickbooksRequest(BASE_INPUT).catch((e) => e)) as Error;
    expect(err.message).toContain("Duplicate Name Exists Error (code 6240)");
    expect(err.message).not.toContain("Acme Corp");
  });
});

describe("surfaceQuickbooksError", () => {
  it("falls back to HTTP status on non-JSON bodies", () => {
    expect(surfaceQuickbooksError("<html>", 502)).toBe("HTTP 502");
  });
});
