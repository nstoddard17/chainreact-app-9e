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
  QuickbooksApiError,
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

/** Silence + capture the sanitized `quickbooks.api.error` troubleshooting log. */
function spyConsoleError() {
  return jest.spyOn(console, "error").mockImplementation(() => {});
}

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
    spyConsoleError();
    mockFetchOnce({ status: 401, json: {} });
    await expect(quickbooksRequest(BASE_INPUT)).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("maps 403 → InsufficientScopeError", async () => {
    spyConsoleError();
    mockFetchOnce({ status: 403, json: {} });
    await expect(quickbooksRequest(BASE_INPUT)).rejects.toBeInstanceOf(
      InsufficientScopeError,
    );
  });

  it("maps 404 → NotFoundError carrying the resource label", async () => {
    spyConsoleError();
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
    spyConsoleError();
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
    spyConsoleError();
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
    const err = (await quickbooksRequest(BASE_INPUT).catch((e) => e)) as QuickbooksApiError;
    expect(err).toBeInstanceOf(QuickbooksApiError);
    expect(err.status).toBe(400);
    expect(err.message).toContain("Duplicate Name Exists Error (code 6240)");
    expect(err.message).not.toContain("Acme Corp");
  });
});

describe("quickbooksRequest — intuit_tid capture", () => {
  const TID = "a1b2c3d4-tid-9999";

  it("carries intuit_tid on NotFoundError metadata (404)", async () => {
    spyConsoleError();
    mockFetchOnce({ status: 404, json: {}, headers: { intuit_tid: TID } });
    const err = (await quickbooksRequest(BASE_INPUT).catch((e) => e)) as NotFoundError;
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.intuitTid).toBe(TID);
    // Never leaked into the user/engine-facing message.
    expect(err.message).not.toContain(TID);
  });

  it("carries intuit_tid on RateLimitedError metadata (429)", async () => {
    spyConsoleError();
    mockFetchOnce({
      status: 429,
      json: {},
      headers: { "retry-after": "5", intuit_tid: TID },
    });
    const err = (await quickbooksRequest(BASE_INPUT).catch((e) => e)) as RateLimitedError;
    expect(err.intuitTid).toBe(TID);
  });

  it("carries intuit_tid + status on QuickbooksApiError metadata (other non-OK)", async () => {
    spyConsoleError();
    mockFetchOnce({ status: 400, json: {}, headers: { intuit_tid: TID } });
    const err = (await quickbooksRequest(BASE_INPUT).catch((e) => e)) as QuickbooksApiError;
    expect(err).toBeInstanceOf(QuickbooksApiError);
    expect(err.status).toBe(400);
    expect(err.intuitTid).toBe(TID);
    expect(err.message).not.toContain(TID);
  });

  it("null intuitTid when the header is absent (does not fabricate one)", async () => {
    spyConsoleError();
    mockFetchOnce({ status: 400, json: {} });
    const err = (await quickbooksRequest(BASE_INPUT).catch((e) => e)) as QuickbooksApiError;
    expect(err.intuitTid).toBeNull();
  });

  it("writes a sanitized quickbooks.api.error log with the tid — never the token/Authorization/body", async () => {
    const spy = spyConsoleError();
    mockFetchOnce({
      status: 400,
      text: JSON.stringify({
        Fault: {
          Error: [{ Message: "Boom", Detail: "secret Acme Corp detail", code: "9" }],
        },
      }),
      headers: { intuit_tid: TID },
    });
    await quickbooksRequest(BASE_INPUT).catch((e) => e);

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0]![0]);
    const parsed = JSON.parse(logged) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      event: "quickbooks.api.error",
      method: "GET",
      path: "/customer/42",
      status: 400,
      intuitTid: TID,
    });
    // Hard no-leak guarantees on the log line.
    expect(logged).not.toContain("tok"); // the access token (BASE_INPUT.accessToken)
    expect(logged).not.toContain("Authorization");
    expect(logged).not.toContain("Bearer");
    expect(logged).not.toContain("Acme Corp"); // raw Fault.Detail body
  });

  it("captures the tid on 401/403 via the sanitized log (cross-provider errors don't carry it)", async () => {
    const spy = spyConsoleError();
    mockFetchOnce({ status: 401, json: {}, headers: { intuit_tid: TID } });
    await quickbooksRequest(BASE_INPUT).catch((e) => e);
    const logged = String(spy.mock.calls[0]![0]);
    expect(JSON.parse(logged)).toMatchObject({ status: 401, intuitTid: TID });
    expect(logged).not.toContain("tok");
  });
});

describe("surfaceQuickbooksError", () => {
  it("falls back to HTTP status on non-JSON bodies", () => {
    expect(surfaceQuickbooksError("<html>", 502)).toBe("HTTP 502");
  });
});
