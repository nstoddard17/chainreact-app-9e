/**
 * @jest-environment node
 *
 * Fleetio HTTP wrapper wire contract (FLEETIO-1).
 *
 * Business rules protected:
 *   - Every call carries the two Fleetio auth headers in Fleetio's exact
 *     shape (`Authorization: Token <key>` + `Account-Token`) and the PINNED
 *     `X-Api-Version` — an unpinned call would silently ride the key's own
 *     locked version and change behavior between accounts.
 *   - 401 → Unauthorized401Error (drives reconnect semantics later).
 *   - 403 → typed role error (fix is a Fleetio role change, not reconnect).
 *   - 429 honors Retry-After: small delay → ONE inline retry; large delay or
 *     second 429 → typed rate-limit error carrying the parsed delay.
 *   - No thrown error message ever contains a credential or a full URL.
 */
import {
  fleetioRequest,
  FleetioForbiddenError,
  FleetioRateLimitError,
  FLEETIO_API_VERSION,
} from "@/integrations/fleetio/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const ORIGINAL_FETCH = global.fetch;

const API_KEY = "fleetio-api-key-secret-123";
const ACCOUNT_TOKEN = "acct-token-secret-456";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  jest.useRealTimers();
});

describe("fleetioRequest — wire shape", () => {
  it("sends Authorization: Token, Account-Token, pinned X-Api-Version, over https", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fleetioRequest({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      method: "GET",
      path: "/vehicles",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://secure.fleetio.com/api/vehicles");
    const headers = init.headers;
    expect(headers.Authorization).toBe(`Token ${API_KEY}`);
    expect(headers["Account-Token"]).toBe(ACCOUNT_TOKEN);
    expect(headers["X-Api-Version"]).toBe(FLEETIO_API_VERSION);
    expect(FLEETIO_API_VERSION).toBe("2025-05-05");
  });

  it("omits the Account-Token header when accountToken is null (GET /accounts verification shape)", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, { records: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fleetioRequest({
      apiKey: API_KEY,
      accountToken: null,
      method: "GET",
      path: "/accounts",
    });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    const headers = init.headers;
    expect(headers["Account-Token"]).toBeUndefined();
    expect(headers.Authorization).toBe(`Token ${API_KEY}`);
  });
});

describe("fleetioRequest — error mapping", () => {
  it("maps 401 to Unauthorized401Error without leaking credentials", async () => {
    global.fetch = jest.fn(async () =>
      new Response("bad key", { status: 401 }),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioRequest({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, method: "GET", path: "/vehicles" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Unauthorized401Error);
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
    expect(String((thrown as Error).message)).not.toContain(ACCOUNT_TOKEN);
  });

  it("maps 403 to FleetioForbiddenError (role gap, not reconnect)", async () => {
    global.fetch = jest.fn(async () =>
      new Response("forbidden", { status: 403 }),
    ) as unknown as typeof fetch;
    await expect(
      fleetioRequest({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, method: "GET", path: "/vehicles" }),
    ).rejects.toBeInstanceOf(FleetioForbiddenError);
  });

  it("honors a small Retry-After with exactly one inline retry, then succeeds", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "Too many requests" }, { "Retry-After": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fleetioRequest<{ ok: boolean }>({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      method: "GET",
      path: "/vehicles",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws FleetioRateLimitError (with parsed delay) when Retry-After exceeds the inline cap", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(429, { error: "Too many requests" }, { "Retry-After": "120" }),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioRequest({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, method: "GET", path: "/vehicles" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(FleetioRateLimitError);
    expect((thrown as FleetioRateLimitError).retryAfterSeconds).toBe(120);
  });

  it("throws FleetioRateLimitError after a second consecutive 429 (no infinite retry)", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(429, { error: "Too many requests" }, { "Retry-After": "0" }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      fleetioRequest({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, method: "GET", path: "/vehicles" }),
    ).rejects.toBeInstanceOf(FleetioRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps a network failure to a transient error naming only method + path", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioRequest({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, method: "GET", path: "/vehicles" });
    } catch (err) {
      thrown = err;
    }
    const message = String((thrown as Error).message);
    expect(message).toMatch(/Fleetio GET \/vehicles network failure/);
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(ACCOUNT_TOKEN);
    expect(message).not.toContain("https://");
  });

  it("surfaces non-OK provider errors bounded and credential-free", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(422, { error: "Vehicle name can't be blank" }),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioRequest({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, method: "POST", path: "/vehicles", body: {} });
    } catch (err) {
      thrown = err;
    }
    const message = String((thrown as Error).message);
    expect(message).toContain("Vehicle name can't be blank");
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(ACCOUNT_TOKEN);
  });
});
