/**
 * @jest-environment node
 *
 * Tests for the HubSpot dual-endpoint account resolver
 * (`resolveHubSpotAccount`). Verifies:
 *   - Primary endpoint (/oauth/v1/access-tokens/{token}) hit first; no
 *     Authorization header (token in URL path per HubSpot docs).
 *   - Fallback to /integrations/v1/me when primary fails (non-2xx, network
 *     error, or missing hub_id in 200 response).
 *   - Resolved hubId is the string-cast of the numeric portal id.
 *   - source field reflects which endpoint resolved the info.
 *   - Throws when both endpoints fail.
 */
import {
  hubspotApiBase,
  resolveHubSpotAccount,
} from "@/integrations/_shared/hubspot/api/me";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.HUBSPOT_API_BASE;
});

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status?: number;
    json?: unknown;
    text?: string;
    throws?: Error;
  }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    if (r.throws) {
      spy.mockRejectedValueOnce(r.throws);
      continue;
    }
    const body = r.text !== undefined ? r.text : JSON.stringify(r.json ?? {});
    spy.mockResolvedValueOnce(
      new Response(body, {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

describe("hubspotApiBase", () => {
  it("defaults to https://api.hubapi.com when HUBSPOT_API_BASE is unset", () => {
    delete process.env.HUBSPOT_API_BASE;
    expect(hubspotApiBase()).toBe("https://api.hubapi.com");
  });

  it("uses HUBSPOT_API_BASE override when set (e2e mock surface)", () => {
    process.env.HUBSPOT_API_BASE = "http://localhost:9883";
    expect(hubspotApiBase()).toBe("http://localhost:9883");
  });
});

describe("resolveHubSpotAccount", () => {
  it("hits /oauth/v1/access-tokens/{token} first (primary endpoint, no auth header)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          user: "alice@example.com",
          user_id: 12345,
          hub_id: 9876543,
          hub_domain: "alice-portal.hubspot.com",
        },
      },
    ]);

    const account = await resolveHubSpotAccount("test-access-token");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      "https://api.hubapi.com/oauth/v1/access-tokens/test-access-token",
    );
    // No Authorization header — token is in the URL path per HubSpot docs.
    expect(init?.headers).toBeUndefined();

    expect(account).toEqual({
      hubId: "9876543",
      hubDomain: "alice-portal.hubspot.com",
      user: "alice@example.com",
      userId: "12345",
      source: "primary",
    });
  });

  it("string-casts numeric hub_id (V2 stores stable text ids)", async () => {
    mockFetchSequence([{ ok: true, json: { hub_id: 7700001 } }]);
    const account = await resolveHubSpotAccount("t");
    expect(account.hubId).toBe("7700001");
  });

  it("accepts string hub_id (defensive against future API changes)", async () => {
    mockFetchSequence([{ ok: true, json: { hub_id: "string-hub-id" } }]);
    const account = await resolveHubSpotAccount("t");
    expect(account.hubId).toBe("string-hub-id");
  });

  it("falls back to /integrations/v1/me when primary returns non-2xx", async () => {
    const fetchSpy = mockFetchSequence([
      // Primary 500
      { ok: false, status: 500, json: { error: "transient" } },
      // Fallback success
      {
        ok: true,
        json: {
          portalId: 555000,
          userId: 4321,
          user: "bob@example.com",
          hubDomain: "bob-portal",
        },
      },
    ]);

    const account = await resolveHubSpotAccount("tok");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[1]!;
    expect(url).toBe("https://api.hubapi.com/integrations/v1/me");
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );

    expect(account).toEqual({
      hubId: "555000",
      hubDomain: "bob-portal",
      user: "bob@example.com",
      userId: "4321",
      source: "fallback",
    });
  });

  it("falls back to /integrations/v1/me when primary throws (network error)", async () => {
    const fetchSpy = mockFetchSequence([
      { ok: false, throws: new Error("network unreachable") },
      {
        ok: true,
        json: {
          portalId: 111,
          userId: 222,
          user: "u@example.com",
          hubDomain: "u-portal",
        },
      },
    ]);

    const account = await resolveHubSpotAccount("tok");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(account.source).toBe("fallback");
    expect(account.hubId).toBe("111");
  });

  it("falls back when primary returns 200 but hub_id is missing (defensive)", async () => {
    const fetchSpy = mockFetchSequence([
      // Primary 200 but no hub_id
      { ok: true, json: { user: "x@example.com" } },
      // Fallback success
      {
        ok: true,
        json: { portalId: 999, user: "x@example.com" },
      },
    ]);

    const account = await resolveHubSpotAccount("tok");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(account.source).toBe("fallback");
    expect(account.hubId).toBe("999");
  });

  it("throws when both endpoints fail", async () => {
    mockFetchSequence([
      { ok: false, status: 500, json: {} },
      { ok: false, status: 401, json: {} },
    ]);

    await expect(resolveHubSpotAccount("tok")).rejects.toThrow(
      /both .* returned non-2xx/i,
    );
  });

  it("throws when fallback /integrations/v1/me succeeds but portalId is missing", async () => {
    mockFetchSequence([
      { ok: false, status: 500, json: {} },
      // Fallback success but no portalId
      { ok: true, json: { user: "x@example.com" } },
    ]);

    await expect(resolveHubSpotAccount("tok")).rejects.toThrow(/portalId/);
  });

  it("throws when accessToken is empty string", async () => {
    await expect(resolveHubSpotAccount("")).rejects.toThrow(/required/);
  });

  it("URL-encodes the access token in the primary path (defensive against tokens with special chars)", async () => {
    const fetchSpy = mockFetchSequence([
      { ok: true, json: { hub_id: 1 } },
    ]);
    await resolveHubSpotAccount("token+with/special=chars");
    const [url] = fetchSpy.mock.calls[0]!;
    // encodeURIComponent: '+' -> %2B, '/' -> %2F, '=' -> %3D
    expect(url).toBe(
      "https://api.hubapi.com/oauth/v1/access-tokens/token%2Bwith%2Fspecial%3Dchars",
    );
  });

  it("populates user/userId fields as null when absent from primary response", async () => {
    mockFetchSequence([
      { ok: true, json: { hub_id: 1, hub_domain: "d" } },
    ]);
    const account = await resolveHubSpotAccount("t");
    expect(account.user).toBeNull();
    expect(account.userId).toBeNull();
    expect(account.hubDomain).toBe("d");
  });

  it("uses HUBSPOT_API_BASE override for both endpoints", async () => {
    process.env.HUBSPOT_API_BASE = "http://localhost:9883";
    const fetchSpy = mockFetchSequence([
      { ok: false, status: 500, json: {} },
      { ok: true, json: { portalId: 42 } },
    ]);
    await resolveHubSpotAccount("tok");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9883/oauth/v1/access-tokens/tok",
    );
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "http://localhost:9883/integrations/v1/me",
    );
  });
});
