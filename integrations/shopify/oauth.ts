import {
  RefreshNotSupportedError,
  type EncryptedTokens,
  type ProviderHint,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { shopifyOriginFor } from "@/integrations/_shared/shopify/api/_base";

/**
 * Shopify OAuth implementation.
 *
 * Slice 12 — V2's first per-shop multi-tenant OAuth provider. See
 * `docs/slices/slice-12-shopify.md` §"OAuth model — per-shop validation
 * + state-bound shop + non-refreshable".
 *
 * Wire-format (per https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens
 * cross-checked against V1's [`provider-registry.ts:1453-1503`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1453)):
 *
 *   - **Per-shop authorize URL.** GET
 *     `https://{shop}/admin/oauth/authorize?client_id=…&scope=…&redirect_uri=…&state=…`
 *     where `{shop}` is the validated `*.myshopify.com` domain. Scopes
 *     are **comma-separated** (Shopify convention; V1 line 1474 splits
 *     on `,` when reading them back from the response). No PKCE.
 *   - **Per-shop token exchange.** POST `https://{shop}/admin/oauth/access_token`
 *     with `Content-Type: application/json` and body
 *     `{ client_id, client_secret, code }`. **JSON body, NOT
 *     form-urlencoded** — the distinguishing wire-format feature for
 *     Shopify vs every other V2 OAuth provider (Stripe / Google /
 *     Microsoft / Notion / Airtable all use form-encoded).
 *     Response: `{ access_token, scope }`. **No `refresh_token`, no
 *     `expires_in`** — Shopify offline tokens don't expire and have no
 *     refresh grant.
 *   - **Auxiliary `/shop.json` GET.** After token exchange, V2 fetches
 *     `https://{shop}/admin/api/2024-10/shop.json` with header
 *     `X-Shopify-Access-Token: <access_token>` (note: not "Bearer
 *     <token>" — Shopify uses a custom header name). The response's
 *     `shop.name` and `shop.plan_name` populate `displayName` and
 *     `metadata.shopPlan`. Best-effort — if the call fails, fall back
 *     to the shop domain as displayName.
 *
 * **Per-shop validation (V1 rot fixed during port).** V1's OAuth
 * callback at [`provider-registry.ts:1454-1456`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1454)
 * trusts whatever `?shop=` appears in the callback URL — host-injection
 * vector if an attacker can manipulate the connect-flow start. V2 fixes
 * this with two layers:
 *   1. The connect endpoint accepts `shop` as a JSON body field; the
 *      dispatcher invokes `validateProviderHint` BEFORE creating state.
 *      Bad input fails at the start of the flow.
 *   2. The validated shop domain is bound to the signed OAuth state JWT
 *      (`OAuthStatePayload.providerHint`); the callback re-derives the
 *      token-exchange URL from the JWT-bound value, never from the URL
 *      query. Even if an attacker could manipulate the authorize-step
 *      redirect, the callback rejects mismatches.
 *
 * **Non-refreshable.** `refreshToken()` throws `RefreshNotSupportedError("shopify")` —
 * matches V2's Slack / Notion contract. V1's [`authSchemes.ts:65-69`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L65)
 * confirms `'non_refreshable'`.
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider. Shopify provides no formal revoke endpoint;
 * "uninstall" is merchant-initiated from the Shopify admin and triggers
 * the standard 401 path on subsequent action calls.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - SHOPIFY_CLIENT_ID — Custom App's `client_id`.
 *   - SHOPIFY_CLIENT_SECRET — Custom App's secret. Used here for OAuth
 *     token exchange AND (Slice 12 Commit 4) for webhook signature
 *     verification — single global app secret, two purposes.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Strict shop-domain regex. Matches the form `<sub>.myshopify.com` where
 * `<sub>` starts with an alphanumeric character, contains only
 * alphanumerics + hyphens, and is 1-60 characters long. Per current
 * Shopify documentation on shop name format.
 *
 * Anchored ^…$ — partial matches are rejected. Lowercase only — the
 * `normalizeShopDomain` helper lowercases input first.
 */
const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/;

/**
 * Pinned Shopify Admin API version. Mirrors `manifest.ts`'s `apiVersion`
 * — kept in lockstep so the auxiliary `/shop.json` call here goes to
 * the same versioned surface as Slice 12 Commit 3's action wrappers.
 */
const SHOPIFY_API_VERSION = "2024-10";

// ─── Env helpers ────────────────────────────────────────────────────────────

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/shopify/callback`;
}

function getClientId(): string {
  const id = process.env.SHOPIFY_CLIENT_ID;
  if (!id) throw new Error("SHOPIFY_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error("SHOPIFY_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Shop domain validation + normalization ─────────────────────────────────

/**
 * Typed error for shop-domain validation failures. The dispatcher
 * surfaces the message verbatim through the connect route so the user
 * sees a precise rejection reason at the start of the flow.
 */
export class InvalidShopDomainError extends Error {
  constructor(input: string, reason: string) {
    super(
      `Invalid Shopify shop domain '${input}': ${reason}.`,
    );
    this.name = "InvalidShopDomainError";
  }
}

/**
 * Normalize and strictly validate a user-supplied shop value.
 *
 * Accepts:
 *   - `"mystore"` → normalized to `"mystore.myshopify.com"`.
 *   - `"mystore.myshopify.com"` (lowercase, ASCII).
 *   - Whitespace-padded variants (trimmed).
 *   - Mixed-case input (lowercased).
 *
 * Rejects:
 *   - Non-string input.
 *   - Empty / whitespace-only.
 *   - URL forms (protocol, port, path, query, fragment).
 *   - Trailing dot, double dots, leading dash, etc. (caught by regex).
 *   - Hostnames other than `*.myshopify.com`.
 *   - Subdomain longer than 60 chars.
 *
 * Exported for direct unit testing AND for the connect route's defensive
 * pre-validation when desired.
 */
export function normalizeShopDomain(input: unknown): string {
  if (typeof input !== "string") {
    throw new InvalidShopDomainError(String(input), "must be a string");
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new InvalidShopDomainError(input, "empty after trim");
  }
  // Reject any character outside the allowed alphabet AT THIS STAGE — a
  // legitimate shop name + `.myshopify.com` only contains a-z 0-9 - and
  // a single dot. Catching protocol/port/path/query/fragment here is
  // defense-in-depth before the regex below.
  // Allowed: a-z, A-Z, 0-9, hyphen, dot.
  if (/[^a-zA-Z0-9.-]/.test(trimmed)) {
    throw new InvalidShopDomainError(input, "contains illegal characters");
  }
  let value = trimmed.toLowerCase();
  if (!value.endsWith(".myshopify.com")) {
    if (value.includes(".")) {
      // Has a dot but not the right TLD — reject rather than try to
      // normalize. Examples: "mystore.com", "mystore.shopify.com",
      // "evil.myshopify.com.attacker.com" (dot prefix).
      throw new InvalidShopDomainError(input, "must end with .myshopify.com");
    }
    value = `${value}.myshopify.com`;
  }
  if (!SHOP_DOMAIN_REGEX.test(value)) {
    throw new InvalidShopDomainError(
      input,
      "must match /^[a-z0-9][a-z0-9-]{0,59}\\.myshopify\\.com$/",
    );
  }
  return value;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface ShopifyTokenSuccess {
  access_token: string;
  scope?: string;
}

interface ShopifyShopInfo {
  name?: string;
  plan_name?: string;
}

// ─── ProviderOAuth ──────────────────────────────────────────────────────────

function readShopFromHint(
  hint: ProviderHint | null | undefined,
  origin: string,
): string {
  if (!hint || typeof hint.shop !== "string") {
    throw new Error(
      `${origin}: providerHint.shop is required for Shopify OAuth.`,
    );
  }
  return normalizeShopDomain(hint.shop);
}

export const shopifyOAuth: ProviderOAuth = {
  // No generatePkce — Shopify's authorize endpoint does not accept
  // PKCE parameters.

  /**
   * Validates the shape of `providerHint` AT THE DISPATCHER'S
   * PRE-STATE-CREATION HOOK. Throws on bad input; the dispatcher
   * surfaces the thrown error to the connect route which returns a 400.
   *
   * This guarantees that by the time `buildAuthUrl` runs, the shop
   * domain is already normalized and known-valid.
   */
  validateProviderHint(hint) {
    if (!hint || typeof hint.shop !== "string") {
      throw new InvalidShopDomainError(
        String((hint as Record<string, unknown> | null)?.shop ?? ""),
        "providerHint.shop is required and must be a string",
      );
    }
    // Re-derived value not used here; we only care that normalization
    // doesn't throw. The actual normalized value is recomputed inside
    // buildAuthUrl / handleCallback from the JWT-bound providerHint
    // (the dispatcher binds the original-input value, not the
    // normalized one — the round-trip cost is one regex match per
    // OAuth call).
    normalizeShopDomain(hint.shop);
  },

  /**
   * Per-account reconnect hint derivation (Slice 4.APPS-RECONNECT). The Shopify
   * shop domain IS the row's `provider_account_id` (see `handleCallback` —
   * `providerAccountId: shop`), with `accountMetadata.shopDomain` as a fallback.
   * Reconstruct the `{ shop }` hint the authorize URL needs entirely from the
   * stored row — the client never sends it. Returns `null` (NOT a throw — the
   * thrown message would echo the shop) when neither value is a valid shop
   * domain, so the dispatcher surfaces a safe generic error instead.
   */
  deriveReconnectHint({ providerAccountId, accountMetadata }) {
    const candidates = [
      providerAccountId,
      typeof accountMetadata?.shopDomain === "string"
        ? (accountMetadata.shopDomain as string)
        : undefined,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        return { shop: normalizeShopDomain(candidate) };
      } catch {
        // Not a valid shop domain — try the next candidate.
      }
    }
    return null;
  },

  buildAuthUrl(state, scopes, _pkce, providerHint) {
    const shop = readShopFromHint(providerHint, "shopifyOAuth.buildAuthUrl");
    const params = new URLSearchParams({
      client_id: getClientId(),
      // Shopify accepts comma-separated scopes (V1 line 1474 splits on
      // `,`). Joining with `,` instead of ` ` is a deliberate
      // distinguishing feature vs every other V2 OAuth.
      scope: scopes.join(","),
      redirect_uri: getRedirectUrl(),
      state,
    });
    return `${shopifyOriginFor(shop)}/admin/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce, providerHint) {
    // The shop is recovered from the JWT-bound providerHint, NOT from
    // any URL query parameter. This is the second half of the
    // host-injection guard — even if an attacker could manipulate the
    // authorize-step redirect or the callback's `?shop=` param, the
    // token-exchange URL is built from the value the dispatcher signed
    // at connect time.
    const shop = readShopFromHint(providerHint, "shopifyOAuth.handleCallback");

    // Token exchange — JSON body (NOT form-urlencoded — distinguishing
    // wire-format feature for Shopify).
    const tokenRes = await fetch(`${shopifyOriginFor(shop)}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: getClientId(),
        client_secret: getClientSecret(),
        code,
      }),
    });
    if (!tokenRes.ok) {
      const status = tokenRes.status;
      const text = await tokenRes.text().catch(() => "");
      throw new Error(
        `Shopify token exchange failed: HTTP ${status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      );
    }
    const tokenJson = (await tokenRes.json()) as ShopifyTokenSuccess;
    if (!tokenJson.access_token) {
      throw new Error("Shopify token response missing access_token.");
    }

    // Auxiliary `/shop.json` GET for displayName + plan metadata.
    // Best-effort — if it fails, fall back to the shop domain. This
    // call is during initial OAuth so there's no integration row yet
    // to wrap in `refreshAndRetry`; a plain fetch is the right shape.
    let shopInfo: ShopifyShopInfo = {};
    try {
      const shopRes = await fetch(
        `${shopifyOriginFor(shop)}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
        {
          headers: { "X-Shopify-Access-Token": tokenJson.access_token },
        },
      );
      if (shopRes.ok) {
        const shopJson = (await shopRes.json()) as { shop?: ShopifyShopInfo };
        shopInfo = shopJson.shop ?? {};
      }
    } catch {
      // best-effort
    }

    // Shopify returns scope as a comma-separated string. Trimming
    // tolerates Shopify's occasional `scope: "read_orders, write_orders"`
    // shape with whitespace after commas.
    const scopesGranted = (tokenJson.scope ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(tokenJson.access_token),
        // Shopify offline tokens don't have a refresh grant.
        refreshTokenEncrypted: null,
        // Shopify offline tokens don't expire.
        accessTokenExpiresAt: null,
        scopes: scopesGranted,
      },
      account: {
        // The shop domain IS the account id — stable for the life of
        // the merchant's Shopify account.
        providerAccountId: shop,
        displayName: shopInfo.name ?? shop,
        metadata: {
          shopDomain: shop,
          shopName: shopInfo.name ?? null,
          shopPlan: shopInfo.plan_name ?? null,
          scopesGranted,
        },
      },
    };
  },

  async refreshToken(_refreshTokenPlaintext): Promise<EncryptedTokens> {
    // Shopify offline tokens don't have a refresh grant. Mirrors V2's
    // Slack / Notion non-refreshable contract — `refreshAndRetry`
    // catches `RefreshNotSupportedError` and translates to
    // `IntegrationActionRequiredError` so the user sees a "reconnect
    // your Shopify account" prompt instead of a stale-token retry loop.
    throw new RefreshNotSupportedError("shopify");
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the disconnect-UX slice — matches every other V2
    // provider's revoke pattern. Shopify offers no formal revoke API;
    // "uninstall" is merchant-initiated from the Shopify admin.
  },
};
