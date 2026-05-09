/**
 * @jest-environment node
 *
 * Tests for shopifyOAuth — V2's first per-shop multi-tenant OAuth
 * provider (Slice 12). Mocks the global fetch so we don't hit Shopify.
 * Verifies:
 *   - Strict shop-domain validation + normalization (host-injection
 *     guard fix for V1's accept-anything behavior).
 *   - Per-shop authorize URL: `https://{shop}/admin/oauth/authorize`
 *     with comma-separated scopes, no PKCE.
 *   - Token exchange uses JSON body (NOT form-urlencoded — the
 *     distinguishing wire-format feature for Shopify).
 *   - Auxiliary `/shop.json` fetch for displayName + plan metadata
 *     with best-effort fallback.
 *   - Comma-separated scope split on the response.
 *   - Encrypted token storage.
 *   - Non-refreshable contract: `refreshToken()` throws
 *     `RefreshNotSupportedError`.
 */
import { randomBytes } from "node:crypto";
import { RefreshNotSupportedError } from "@/contracts/integration";
import {
  InvalidShopDomainError,
  normalizeShopDomain,
  shopifyOAuth,
} from "@/integrations/shopify/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.SHOPIFY_CLIENT_ID = "test-shopify-client-id";
  process.env.SHOPIFY_CLIENT_SECRET = "test-shopify-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SHOPIFY_CLIENT_ID;
  delete process.env.SHOPIFY_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const body = r.text !== undefined ? r.text : JSON.stringify(r.json ?? {});
    spy.mockResolvedValueOnce(
      new Response(body, {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

const SCOPES = [
  "read_orders",
  "write_orders",
  "read_products",
  "write_products",
  "read_customers",
  "write_customers",
  "read_inventory",
  "write_inventory",
  "read_checkouts",
  "read_fulfillments",
  "write_fulfillments",
] as const;

const VALID_HINT = { shop: "mystore.myshopify.com" } as const;

const EXPECTED_REDIRECT =
  "https://app.example.test/api/integrations/oauth/shopify/callback";

// ─── normalizeShopDomain — strict validation ────────────────────────────────

describe("normalizeShopDomain", () => {
  describe("accepts and normalizes", () => {
    it("a bare subdomain → appends .myshopify.com", () => {
      expect(normalizeShopDomain("mystore")).toBe("mystore.myshopify.com");
    });

    it("a fully-qualified .myshopify.com domain", () => {
      expect(normalizeShopDomain("mystore.myshopify.com")).toBe(
        "mystore.myshopify.com",
      );
    });

    it("hyphen-containing names", () => {
      expect(normalizeShopDomain("my-store-123")).toBe(
        "my-store-123.myshopify.com",
      );
    });

    it("mixed case (lowercased)", () => {
      expect(normalizeShopDomain("MyStore.MyShopify.com")).toBe(
        "mystore.myshopify.com",
      );
    });

    it("padded whitespace (trimmed)", () => {
      expect(normalizeShopDomain("  mystore  ")).toBe("mystore.myshopify.com");
    });

    it("the maximum 60-char subdomain length", () => {
      const sub = "a" + "b".repeat(58) + "c"; // 60 chars
      expect(normalizeShopDomain(sub)).toBe(`${sub}.myshopify.com`);
    });
  });

  describe("rejects (host-injection guards)", () => {
    it("non-string input", () => {
      expect(() => normalizeShopDomain(42 as unknown)).toThrow(
        InvalidShopDomainError,
      );
      expect(() => normalizeShopDomain(null)).toThrow(InvalidShopDomainError);
      expect(() => normalizeShopDomain(undefined)).toThrow(
        InvalidShopDomainError,
      );
      expect(() => normalizeShopDomain({} as unknown)).toThrow(
        InvalidShopDomainError,
      );
    });

    it("empty / whitespace-only", () => {
      expect(() => normalizeShopDomain("")).toThrow(/empty after trim/);
      expect(() => normalizeShopDomain("   ")).toThrow(/empty after trim/);
    });

    it("URL-shaped inputs (protocol)", () => {
      expect(() => normalizeShopDomain("https://mystore.myshopify.com")).toThrow(
        InvalidShopDomainError,
      );
      expect(() =>
        normalizeShopDomain("http://evil.myshopify.com"),
      ).toThrow(InvalidShopDomainError);
    });

    it("paths / queries / fragments / ports", () => {
      expect(() =>
        normalizeShopDomain("mystore.myshopify.com/admin"),
      ).toThrow(InvalidShopDomainError);
      expect(() =>
        normalizeShopDomain("mystore.myshopify.com?evil=1"),
      ).toThrow(InvalidShopDomainError);
      expect(() =>
        normalizeShopDomain("mystore.myshopify.com#x"),
      ).toThrow(InvalidShopDomainError);
      expect(() =>
        normalizeShopDomain("mystore.myshopify.com:8080"),
      ).toThrow(InvalidShopDomainError);
    });

    it("non-myshopify.com hostnames", () => {
      expect(() => normalizeShopDomain("evil.attacker.com")).toThrow(
        /must end with \.myshopify\.com/,
      );
      expect(() => normalizeShopDomain("mystore.shopify.com")).toThrow(
        /must end with \.myshopify\.com/,
      );
    });

    it("attempted dot-injection that LOOKS like .myshopify.com but isn't", () => {
      // A hostname like `evil.myshopify.com.attacker.com` doesn't end
      // with `.myshopify.com` so we reject before normalization.
      expect(() =>
        normalizeShopDomain("evil.myshopify.com.attacker.com"),
      ).toThrow(/must end with \.myshopify\.com/);
    });

    it("subdomain longer than 60 chars", () => {
      const tooLong = "a".repeat(61);
      expect(() => normalizeShopDomain(tooLong)).toThrow(InvalidShopDomainError);
    });

    it("leading hyphen", () => {
      expect(() => normalizeShopDomain("-mystore")).toThrow(
        InvalidShopDomainError,
      );
    });

    it("non-ASCII characters", () => {
      expect(() => normalizeShopDomain("mýstoré.myshopify.com")).toThrow(
        /contains illegal characters/,
      );
    });

    it("backslash / @ / colon / whitespace inside the value", () => {
      expect(() =>
        normalizeShopDomain("mystore@evil.myshopify.com"),
      ).toThrow(/contains illegal characters/);
      expect(() =>
        normalizeShopDomain("mystore evil.myshopify.com"),
      ).toThrow(/contains illegal characters/);
      expect(() => normalizeShopDomain("mystore\\evil")).toThrow(
        /contains illegal characters/,
      );
    });
  });
});

// ─── validateProviderHint ───────────────────────────────────────────────────

describe("shopifyOAuth.validateProviderHint", () => {
  it("accepts a valid shop hint", () => {
    expect(() =>
      shopifyOAuth.validateProviderHint!({ shop: "mystore.myshopify.com" }),
    ).not.toThrow();
    expect(() =>
      shopifyOAuth.validateProviderHint!({ shop: "mystore" }),
    ).not.toThrow();
  });

  it("rejects a missing shop key", () => {
    expect(() =>
      shopifyOAuth.validateProviderHint!({} as Record<string, string>),
    ).toThrow(InvalidShopDomainError);
  });

  it("rejects a non-string shop value at runtime", () => {
    // Cast through unknown to simulate a malformed value reaching the
    // validator (e.g. from a tampered JWT after signature compromise —
    // defense-in-depth, not normal happy path).
    expect(() =>
      shopifyOAuth.validateProviderHint!({
        shop: 42,
      } as unknown as Record<string, string>),
    ).toThrow(InvalidShopDomainError);
  });

  it("rejects a malformed shop format", () => {
    expect(() =>
      shopifyOAuth.validateProviderHint!({ shop: "evil.attacker.com" }),
    ).toThrow(/must end with \.myshopify\.com/);
  });
});

// ─── generatePkce — absent ──────────────────────────────────────────────────

describe("shopifyOAuth.generatePkce", () => {
  it("is undefined (Shopify does not use PKCE)", () => {
    expect(shopifyOAuth.generatePkce).toBeUndefined();
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("shopifyOAuth.buildAuthUrl", () => {
  it("builds a per-shop authorize URL with all required params", () => {
    const url = shopifyOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      null,
      VALID_HINT,
    );
    const u = new URL(url);
    expect(u.host).toBe("mystore.myshopify.com");
    expect(u.pathname).toBe("/admin/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("test-shopify-client-id");
    expect(u.searchParams.get("state")).toBe("STATE-TOKEN");
    expect(u.searchParams.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("uses comma-separated scopes (Shopify convention)", () => {
    const url = shopifyOAuth.buildAuthUrl(
      "S",
      ["read_orders", "write_orders"],
      null,
      VALID_HINT,
    );
    const scope = new URL(url).searchParams.get("scope");
    expect(scope).toBe("read_orders,write_orders");
    // Must NOT use space-separation (the Stripe / Google convention).
    expect(scope).not.toBe("read_orders write_orders");
  });

  it("normalizes a bare subdomain hint to .myshopify.com hostname", () => {
    const url = shopifyOAuth.buildAuthUrl(
      "S",
      SCOPES,
      null,
      { shop: "mystore" },
    );
    expect(new URL(url).host).toBe("mystore.myshopify.com");
  });

  it("does NOT include PKCE params (Shopify does not accept code_challenge)", () => {
    const url = shopifyOAuth.buildAuthUrl("S", SCOPES, null, VALID_HINT);
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge")).toBeNull();
    expect(u.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("throws when providerHint.shop is missing", () => {
    expect(() => shopifyOAuth.buildAuthUrl("S", SCOPES, null, null)).toThrow(
      /providerHint\.shop is required/,
    );
    expect(() =>
      shopifyOAuth.buildAuthUrl("S", SCOPES, null, undefined),
    ).toThrow(/providerHint\.shop is required/);
    expect(() =>
      shopifyOAuth.buildAuthUrl("S", SCOPES, null, {} as Record<string, string>),
    ).toThrow(/providerHint\.shop is required/);
  });

  it("throws when providerHint.shop is malformed (re-validates at the build step)", () => {
    expect(() =>
      shopifyOAuth.buildAuthUrl("S", SCOPES, null, {
        shop: "evil.attacker.com",
      }),
    ).toThrow(/must end with \.myshopify\.com/);
  });

  it("throws when SHOPIFY_CLIENT_ID is unset", () => {
    delete process.env.SHOPIFY_CLIENT_ID;
    expect(() => shopifyOAuth.buildAuthUrl("S", SCOPES, null, VALID_HINT)).toThrow(
      /SHOPIFY_CLIENT_ID/,
    );
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("shopifyOAuth.handleCallback", () => {
  it("throws when providerHint is missing (host-injection guard)", async () => {
    await expect(
      shopifyOAuth.handleCallback("code", "state", null, null),
    ).rejects.toThrow(/providerHint\.shop is required/);
  });

  it("posts JSON body to per-shop /admin/oauth/access_token (NOT form-urlencoded)", async () => {
    const spy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "shpat_test",
          scope: "read_orders,write_orders",
        },
      },
      // shop.json best-effort
      {
        ok: true,
        json: { shop: { name: "My Test Store", plan_name: "basic" } },
      },
    ]);

    await shopifyOAuth.handleCallback("auth-code", "state", null, VALID_HINT);

    // 1st call — token exchange.
    const tokenCall = spy.mock.calls[0]!;
    expect(tokenCall[0]).toBe(
      "https://mystore.myshopify.com/admin/oauth/access_token",
    );
    const init = tokenCall[1]!;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    // Body MUST be JSON, not form-urlencoded.
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      client_id: "test-shopify-client-id",
      client_secret: "test-shopify-client-secret",
      code: "auth-code",
    });
  });

  it("returns encrypted access_token + null refresh + null expires + comma-split scopes", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "shpat_test_token",
          scope: "read_orders,write_orders,read_customers",
        },
      },
      {
        ok: true,
        json: { shop: { name: "Acme Store", plan_name: "shopify_plus" } },
      },
    ]);

    const result = await shopifyOAuth.handleCallback(
      "code",
      "state",
      null,
      VALID_HINT,
    );

    // Encrypted token round-trips through decryptToken to the original.
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "shpat_test_token",
    );
    // Non-refreshable: no refresh token, no expiry.
    expect(result.tokens.refreshTokenEncrypted).toBeNull();
    expect(result.tokens.accessTokenExpiresAt).toBeNull();
    expect(result.tokens.scopes).toEqual([
      "read_orders",
      "write_orders",
      "read_customers",
    ]);
  });

  it("uses normalized shop domain as providerAccountId AND in metadata", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "t", scope: "" } },
      { ok: true, json: { shop: { name: "Acme", plan_name: "basic" } } },
    ]);

    const result = await shopifyOAuth.handleCallback(
      "code",
      "state",
      null,
      { shop: "mystore" }, // bare subdomain → normalizes to full
    );

    expect(result.account.providerAccountId).toBe("mystore.myshopify.com");
    expect(result.account.displayName).toBe("Acme");
    expect(result.account.metadata.shopDomain).toBe("mystore.myshopify.com");
    expect(result.account.metadata.shopName).toBe("Acme");
    expect(result.account.metadata.shopPlan).toBe("basic");
  });

  it("falls back to shop domain as displayName when /shop.json fails (best-effort)", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "t", scope: "" } },
      // /shop.json returns 401 — best-effort, swallow.
      { ok: false, status: 401, json: {} },
    ]);

    const result = await shopifyOAuth.handleCallback(
      "code",
      "state",
      null,
      VALID_HINT,
    );

    expect(result.account.displayName).toBe("mystore.myshopify.com");
    expect(result.account.metadata.shopName).toBeNull();
    expect(result.account.metadata.shopPlan).toBeNull();
  });

  it("falls back to shop domain as displayName when /shop.json throws (network error)", async () => {
    const spy = jest.spyOn(globalThis, "fetch");
    spy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "t", scope: "" }),
        { status: 200 },
      ),
    );
    spy.mockRejectedValueOnce(new Error("network down"));

    const result = await shopifyOAuth.handleCallback(
      "code",
      "state",
      null,
      VALID_HINT,
    );
    expect(result.account.displayName).toBe("mystore.myshopify.com");
  });

  it("trims whitespace in the comma-separated scope value", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "t",
          // Shopify occasionally returns scope with whitespace after
          // commas — V2 trims defensively.
          scope: "read_orders, write_orders ,  read_customers",
        },
      },
      { ok: true, json: { shop: {} } },
    ]);

    const result = await shopifyOAuth.handleCallback(
      "code",
      "state",
      null,
      VALID_HINT,
    );
    expect(result.tokens.scopes).toEqual([
      "read_orders",
      "write_orders",
      "read_customers",
    ]);
  });

  it("throws on token-exchange HTTP error", async () => {
    mockFetchSequence([
      { ok: false, status: 400, text: '{"error":"invalid_request"}' },
    ]);
    await expect(
      shopifyOAuth.handleCallback("code", "state", null, VALID_HINT),
    ).rejects.toThrow(/Shopify token exchange failed: HTTP 400/);
  });

  it("throws when token response is missing access_token", async () => {
    mockFetchSequence([{ ok: true, json: { scope: "read_orders" } }]);
    await expect(
      shopifyOAuth.handleCallback("code", "state", null, VALID_HINT),
    ).rejects.toThrow(/missing access_token/);
  });

  it("throws when SHOPIFY_CLIENT_SECRET is unset", async () => {
    delete process.env.SHOPIFY_CLIENT_SECRET;
    await expect(
      shopifyOAuth.handleCallback("code", "state", null, VALID_HINT),
    ).rejects.toThrow(/SHOPIFY_CLIENT_SECRET/);
  });

  it("uses the JWT-bound shop, NOT any URL query parameter (host-injection guard)", async () => {
    // Even though Shopify echoes ?shop= in the callback URL, V2's
    // handleCallback signature doesn't accept it — the shop comes
    // EXCLUSIVELY from the JWT-bound providerHint.
    const spy = mockFetchSequence([
      { ok: true, json: { access_token: "t", scope: "" } },
      { ok: true, json: { shop: {} } },
    ]);

    await shopifyOAuth.handleCallback("code", "state", null, {
      shop: "legitimate-store.myshopify.com",
    });

    // Token exchange goes to the JWT-bound shop's URL — not anywhere
    // else.
    expect(spy.mock.calls[0]![0]).toBe(
      "https://legitimate-store.myshopify.com/admin/oauth/access_token",
    );
  });
});

// ─── refreshToken — non-refreshable contract ────────────────────────────────

describe("shopifyOAuth.refreshToken", () => {
  it("throws RefreshNotSupportedError for shopify (matches Slack/Notion non-refreshable contract)", async () => {
    await expect(shopifyOAuth.refreshToken("any-value")).rejects.toThrow(
      RefreshNotSupportedError,
    );
    await expect(shopifyOAuth.refreshToken("any-value")).rejects.toThrow(
      /'shopify'/,
    );
  });
});

// ─── revoke — stub ───────────────────────────────────────────────────────────

describe("shopifyOAuth.revoke", () => {
  it("returns without error (deferred to disconnect-UX slice)", async () => {
    await expect(shopifyOAuth.revoke("any-token")).resolves.toBeUndefined();
  });
});
