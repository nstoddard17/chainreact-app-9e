/**
 * @jest-environment node
 *
 * Tests for `_shared/mailchimp/api/me.ts` — the two-endpoint
 * Mailchimp account-info resolver used during OAuth callback.
 *
 * Verifies:
 *   - PRIMARY `/oauth2/metadata` uses `Authorization: OAuth <token>`
 *     (NOT Bearer) — Mailchimp's legacy header convention for this
 *     single endpoint.
 *   - SECONDARY `/3.0/` uses `Authorization: Bearer <token>` (Bearer
 *     here, not OAuth).
 *   - The dc from the metadata response drives the URL of the
 *     secondary call (`https://${dc}.api.mailchimp.com/3.0/`).
 *   - Returns `{ dc, accountId, accountName, email, apiEndpoint,
 *     loginUrl }` with the right field mappings.
 *   - Fails loud (throws) on:
 *     - metadata HTTP non-2xx
 *     - metadata missing dc
 *     - API root HTTP non-2xx
 *     - API root missing account_id
 *   - The env overrides (`MAILCHIMP_LOGIN_BASE`,
 *     `MAILCHIMP_API_BASE_OVERRIDE`) route both fetches correctly.
 */
import { resolveMailchimpAccount } from "@/integrations/_shared/mailchimp/api/me";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MAILCHIMP_LOGIN_BASE;
  delete process.env.MAILCHIMP_API_BASE_OVERRIDE;
});

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status?: number;
    json?: unknown;
  }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(r.json ?? {}), {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

describe("resolveMailchimpAccount — happy path", () => {
  it("fetches /oauth2/metadata with OAuth-prefix auth, then /3.0/ with Bearer auth", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          dc: "us21",
          accountname: "Acme Corp",
          api_endpoint: "https://us21.api.mailchimp.com",
          login_url: "https://login.mailchimp.com",
          login: { email: "owner@acme.com" },
          role: "owner",
        },
      },
      {
        ok: true,
        json: {
          account_id: "8d3a3db4d97663a9074efcc16",
          account_name: "Acme Corp (Production)",
          email: "owner@acme.com",
          total_subscribers: 12345,
        },
      },
    ]);

    const info = await resolveMailchimpAccount("test_access_token");

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [metadataUrl, metadataInit] = fetchSpy.mock.calls[0]!;
    expect(metadataUrl).toBe("https://login.mailchimp.com/oauth2/metadata");
    const metadataHeaders = (metadataInit!.headers as Record<string, string>) ?? {};
    // OAuth prefix here, NOT Bearer — Mailchimp's legacy convention
    // for this single endpoint.
    expect(metadataHeaders.Authorization).toBe("OAuth test_access_token");

    const [apiUrl, apiInit] = fetchSpy.mock.calls[1]!;
    expect(apiUrl).toBe("https://us21.api.mailchimp.com/3.0/");
    const apiHeaders = (apiInit!.headers as Record<string, string>) ?? {};
    // Bearer here — the standard Mailchimp REST API auth scheme.
    expect(apiHeaders.Authorization).toBe("Bearer test_access_token");

    expect(info).toEqual({
      dc: "us21",
      accountId: "8d3a3db4d97663a9074efcc16",
      // /3.0/ root's account_name wins over metadata's accountname
      // when both present.
      accountName: "Acme Corp (Production)",
      email: "owner@acme.com",
      apiEndpoint: "https://us21.api.mailchimp.com",
      loginUrl: "https://login.mailchimp.com",
    });
  });

  it("falls back to metadata accountname when /3.0/ account_name is missing", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          dc: "us1",
          accountname: "From Metadata",
          login: { email: "owner@example.com" },
        },
      },
      {
        ok: true,
        json: { account_id: "abc123" },
      },
    ]);
    const info = await resolveMailchimpAccount("t");
    expect(info.accountName).toBe("From Metadata");
  });

  it("falls back to /3.0/ root email when metadata.login.email is missing", async () => {
    mockFetchSequence([
      { ok: true, json: { dc: "us1" } },
      { ok: true, json: { account_id: "abc123", email: "fallback@x.com" } },
    ]);
    const info = await resolveMailchimpAccount("t");
    expect(info.email).toBe("fallback@x.com");
  });

  it("returns nulls for accountName / email / apiEndpoint / loginUrl when both endpoints omit them", async () => {
    mockFetchSequence([
      { ok: true, json: { dc: "us1" } },
      { ok: true, json: { account_id: "abc123" } },
    ]);
    const info = await resolveMailchimpAccount("t");
    expect(info.accountName).toBeNull();
    expect(info.email).toBeNull();
    expect(info.apiEndpoint).toBeNull();
    expect(info.loginUrl).toBeNull();
  });

  it("routes both fetches through the env overrides (e2e mock surface)", async () => {
    process.env.MAILCHIMP_LOGIN_BASE = "http://localhost:9885";
    process.env.MAILCHIMP_API_BASE_OVERRIDE = "http://localhost:9885";
    const fetchSpy = mockFetchSequence([
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_id: "abc123" } },
    ]);
    await resolveMailchimpAccount("t");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9885/oauth2/metadata",
    );
    expect(fetchSpy.mock.calls[1]![0]).toBe("http://localhost:9885/3.0/");
  });
});

describe("resolveMailchimpAccount — failure modes (fail-loud)", () => {
  it("throws when accessToken is empty (defensive — caller bug)", async () => {
    await expect(resolveMailchimpAccount("")).rejects.toThrow(
      /accessToken is required/,
    );
  });

  it("throws when /oauth2/metadata returns non-2xx", async () => {
    mockFetchSequence([{ ok: false, status: 401 }]);
    await expect(resolveMailchimpAccount("bad")).rejects.toThrow(
      /metadata lookup failed: HTTP 401/,
    );
  });

  it("throws when /oauth2/metadata response is missing 'dc'", async () => {
    // Without dc we can't make any subsequent API call. Fail loud
    // rather than store a useless integration row.
    mockFetchSequence([
      {
        ok: true,
        json: { accountname: "Acme" /* dc omitted */ },
      },
    ]);
    await expect(resolveMailchimpAccount("t")).rejects.toThrow(
      /missing 'dc'/,
    );
  });

  it("throws when /oauth2/metadata returns dc as non-string", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: { dc: 42 /* numeric — wrong shape */ },
      },
    ]);
    await expect(resolveMailchimpAccount("t")).rejects.toThrow(
      /missing 'dc'/,
    );
  });

  it("throws when /3.0/ root returns non-2xx", async () => {
    mockFetchSequence([
      { ok: true, json: { dc: "us21" } },
      { ok: false, status: 403 },
    ]);
    await expect(resolveMailchimpAccount("t")).rejects.toThrow(
      /\/3\.0\/ root lookup failed: HTTP 403/,
    );
  });

  it("throws when /3.0/ root response is missing 'account_id'", async () => {
    // Without account_id we can't compute a stable providerAccountId.
    mockFetchSequence([
      { ok: true, json: { dc: "us21" } },
      {
        ok: true,
        json: { account_name: "Acme" /* account_id omitted */ },
      },
    ]);
    await expect(resolveMailchimpAccount("t")).rejects.toThrow(
      /missing 'account_id'/,
    );
  });
});
