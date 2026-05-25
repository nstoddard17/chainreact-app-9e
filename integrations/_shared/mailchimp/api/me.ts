/**
 * Mailchimp account-info resolution helper.
 *
 * Slice 14 Commit 2. **Two-endpoint strategy** used during OAuth
 * callback to populate the integration row's `accountMetadata.dc`
 * (REQUIRED for every subsequent API call) AND `providerAccountId`
 * (the stable Mailchimp account id).
 *
 *   - PRIMARY: `GET https://login.mailchimp.com/oauth2/metadata` with
 *     `Authorization: OAuth <accessToken>`. **Note: `OAuth ` prefix,
 *     NOT `Bearer `** — this is the only Mailchimp endpoint that
 *     uses the legacy OAuth-prefix header scheme. Response shape:
 *       {
 *         "dc": "us21",
 *         "role": "owner",
 *         "accountname": "Acme Corp",
 *         "user_id": 12345678,
 *         "login": { "email": "owner@acme.com", "login_email": "...", ... },
 *         "login_url": "https://login.mailchimp.com",
 *         "api_endpoint": "https://us21.api.mailchimp.com"
 *       }
 *     V1 reads this at [`provider-registry.ts:670-695`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L670)
 *     and at [`utils.ts:41-67`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L41).
 *
 *   - SECONDARY: `GET https://${dc}.api.mailchimp.com/3.0/` with
 *     `Authorization: Bearer <accessToken>` (Bearer here, NOT OAuth).
 *     Returns the API root with `{ account_id, account_name, ... }`.
 *     `account_id` is a stable string identifier (e.g.
 *     `"8d3a3db4d97663a9074efcc16"`) — V2 uses this as
 *     `providerAccountId` so re-authorizing to a different Mailchimp
 *     account creates a sibling integration row rather than
 *     overwriting (mirrors HubSpot's hubId / Shopify's shopDomain
 *     pattern). V1 reads this at
 *     [`provider-registry.ts:679-690`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L679)
 *     to populate `account_name` for display but doesn't use the
 *     `account_id` as a stable identifier; V2 corrects this gap.
 *
 * Returns a single typed object covering both fetches. Throws on:
 *   - Metadata endpoint non-2xx (can't determine dc → can't make any
 *     subsequent calls → integration is useless).
 *   - Metadata response missing `dc` (same reason).
 *   - Account endpoint non-2xx (can't determine accountId → can't
 *     compute a stable `providerAccountId`).
 *   - Account response missing `account_id` (same reason).
 *
 * Env vars read:
 *   - MAILCHIMP_LOGIN_BASE — e2e override for the metadata endpoint
 *     (production never sets it; default is `https://login.mailchimp.com`).
 *   - MAILCHIMP_API_BASE_OVERRIDE — e2e override for the per-dc API
 *     endpoint (production never sets it; default is
 *     `https://${dc}.api.mailchimp.com`).
 */

import { mailchimpLoginBase, mailchimpApiOrigin } from "./_base";

interface MailchimpMetadataResponse {
  dc?: string;
  accountname?: string;
  user_id?: number | string;
  login?: {
    email?: string;
    login_email?: string;
    login_name?: string;
  };
  login_url?: string;
  api_endpoint?: string;
  role?: string;
}

interface MailchimpApiRootResponse {
  account_id?: string;
  account_name?: string;
  email?: string;
  username?: string;
  total_subscribers?: number;
}

export interface MailchimpAccountInfo {
  /** Datacenter prefix (e.g. `"us21"`) — REQUIRED for every API call. */
  dc: string;
  /** Stable Mailchimp account id — used as `providerAccountId`. */
  accountId: string;
  /** Friendly account label (e.g. `"Acme Corp"`). */
  accountName: string | null;
  /** Owner-account email — populated from the metadata response. */
  email: string | null;
  /**
   * Mailchimp's self-reported API endpoint URL (e.g.
   * `"https://us21.api.mailchimp.com"`). Diagnostic only — V2 uses
   * `mailchimpApiOrigin(dc)` for routing, NOT this value.
   */
  apiEndpoint: string | null;
  /** Mailchimp login URL — diagnostic only. */
  loginUrl: string | null;
}

/**
 * Resolve the user's Mailchimp dc + account info during OAuth
 * callback. Two sequential fetches; both required for the integration
 * row to be useful.
 */
export async function resolveMailchimpAccount(
  accessToken: string,
): Promise<MailchimpAccountInfo> {
  if (!accessToken) {
    throw new Error("resolveMailchimpAccount: accessToken is required.");
  }

  // ─── PRIMARY: /oauth2/metadata (Authorization: OAuth <token>) ─────────────
  const metadataUrl = `${mailchimpLoginBase()}/oauth2/metadata`;
  const metadataRes = await fetch(metadataUrl, {
    method: "GET",
    headers: {
      // OAuth prefix here, NOT Bearer — Mailchimp's legacy convention
      // for this single endpoint. Every other Mailchimp endpoint uses
      // Bearer. V1's behavior matches at
      // `provider-registry.ts:671` and `utils.ts:42`.
      Authorization: `OAuth ${accessToken}`,
    },
  });
  if (!metadataRes.ok) {
    throw new Error(
      `Mailchimp metadata lookup failed: HTTP ${metadataRes.status}. ` +
        "Cannot resolve datacenter without this endpoint succeeding.",
    );
  }
  const metadata = (await metadataRes.json()) as MailchimpMetadataResponse;
  if (!metadata.dc || typeof metadata.dc !== "string") {
    throw new Error(
      "Mailchimp metadata response missing 'dc'. Cannot resolve datacenter — integration cannot be saved.",
    );
  }
  const dc = metadata.dc;

  // ─── SECONDARY: /3.0/ root (Authorization: Bearer <token>) ────────────────
  const apiRootUrl = `${mailchimpApiOrigin(dc)}/3.0/`;
  const apiRes = await fetch(apiRootUrl, {
    method: "GET",
    headers: {
      // Bearer here — the standard Mailchimp REST API auth scheme.
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!apiRes.ok) {
    throw new Error(
      `Mailchimp /3.0/ root lookup failed: HTTP ${apiRes.status}. ` +
        "Cannot resolve stable account id.",
    );
  }
  const apiRoot = (await apiRes.json()) as MailchimpApiRootResponse;
  if (!apiRoot.account_id || typeof apiRoot.account_id !== "string") {
    throw new Error(
      "Mailchimp /3.0/ root response missing 'account_id'. Cannot compute providerAccountId.",
    );
  }

  return {
    dc,
    accountId: apiRoot.account_id,
    accountName:
      apiRoot.account_name ?? metadata.accountname ?? null,
    email: metadata.login?.email ?? apiRoot.email ?? null,
    apiEndpoint: metadata.api_endpoint ?? null,
    loginUrl: metadata.login_url ?? null,
  };
}
