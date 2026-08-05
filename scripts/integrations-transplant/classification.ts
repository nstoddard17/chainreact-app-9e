/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — Phase 2 provider transplant
 * classification.
 *
 * Derived from the actual auth implementations under `integrations/` (audited
 * 2026-08-04 — see docs/slices/phase-5/dev-connection-transplant/). Facts this
 * matrix encodes:
 *   - Every OAuth provider reads ONE flat env pair (<PROVIDER>_CLIENT_ID /
 *     _CLIENT_SECRET) with zero per-environment branching, so whether a
 *     transplanted refresh token remains refreshable in dev is a DEPLOYMENT
 *     CONFIG question (same OAuth app or not) that this utility cannot read
 *     from the database — hence `oauthClientBound` + the owner attestation
 *     (`sharedOAuthClientProviders`) gate on `verified`.
 *   - Rotating-refresh providers can invalidate the token the PRODUCTION row
 *     still holds the first time dev refreshes — hence `rotatingRefresh` +
 *     the explicit `acknowledgeRotationRiskProviders` gate.
 *   - Category C (webhook/polling lifecycle state) is an overlay: this utility
 *     NEVER copies trigger state for anyone; the flag exists so the report can
 *     say why fresh activation is required in dev.
 *
 * Unknown / unlisted providers are UNSUPPORTED until proven safe (fail closed).
 */
import type {
  ProviderTransplantClassification,
  TransplantCategory,
} from "./types";

type Entry = Omit<ProviderTransplantClassification, "provider">;

const oauthB = (over: Partial<Entry> & { reason: string }): Entry => ({
  authType: "oauth",
  category: "B",
  refreshable: true,
  oauthClientBound: true,
  rotatingRefresh: false,
  multiAccountRisk: false,
  hasTriggerLifecycleState: true,
  verificationSupported: true,
  ...over,
});

const CLASSIFICATIONS: Record<string, Entry> = {
  // ── Category A — standalone credentials (no client binding, no refresh) ──
  fleetio: {
    authType: "credential_paste",
    category: "A",
    refreshable: false,
    oauthClientBound: false,
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: false,
    verificationSupported: true,
    reason: "Static API key + Account-Token pair; independent of any OAuth app; read-only GET /accounts verification.",
  },
  github: {
    authType: "oauth",
    category: "A",
    refreshable: false,
    oauthClientBound: false,
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: true,
    verificationSupported: true,
    reason: "Non-expiring OAuth access token usable standalone; GET /user verification.",
  },
  notion: {
    authType: "oauth",
    category: "A",
    refreshable: false,
    oauthClientBound: false,
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: false,
    verificationSupported: true,
    reason: "Non-refreshable workspace token usable standalone; GET /v1/users/me verification.",
  },
  shopify: {
    authType: "oauth",
    category: "A",
    refreshable: false,
    oauthClientBound: false,
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: true,
    verificationSupported: true,
    reason: "Offline access token bound to the shop, not the client; GET shop.json verification.",
  },
  mailchimp: {
    authType: "oauth",
    category: "A",
    refreshable: false,
    oauthClientBound: false,
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: true,
    verificationSupported: true,
    reason: "Non-expiring OAuth token usable standalone; oauth2/metadata verification.",
  },
  facebook: {
    authType: "oauth",
    category: "A",
    refreshable: false,
    oauthClientBound: false,
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: true,
    verificationSupported: true,
    reason: "Long-lived user token (~60d) usable standalone; GET /me verification. May fail if the app enforces appsecret_proof — reported honestly as verification_failed.",
  },
  eden: {
    authType: "token_paste",
    category: "A",
    refreshable: false,
    oauthClientBound: false,
    rotatingRefresh: false,
    multiAccountRisk: true, // providerAccountId is the constant "eden" (LIVE-TODO upstream)
    hasTriggerLifecycleState: false,
    verificationSupported: false,
    reason: "Pasted PAT; providerAccountId is a constant so only ONE eden row can exist per account (ambiguity fails closed); no lightweight read-only probe implemented (MCP handshake only).",
  },

  // ── Category B — client-bound and/or rotating OAuth ──
  gmail: oauthB({ reason: "Google refresh token; bound to GOOGLE_CLIENT_ID; non-rotating." }),
  "google-calendar": oauthB({ reason: "Shared Google OAuth app; non-rotating refresh." }),
  "google-docs": oauthB({ reason: "Shared Google OAuth app; non-rotating refresh." }),
  "google-drive": oauthB({ reason: "Shared Google OAuth app; non-rotating refresh." }),
  "google-sheets": oauthB({ reason: "Shared Google OAuth app; non-rotating refresh." }),
  "google-analytics": oauthB({ reason: "Shared Google OAuth app; non-rotating refresh.", hasTriggerLifecycleState: false }),
  "microsoft-outlook": oauthB({ reason: "Microsoft refresh token; rotates on refresh (new token persisted); bound to MICROSOFT_CLIENT_ID.", rotatingRefresh: true }),
  "microsoft-outlook-calendar": oauthB({ reason: "Shared Microsoft OAuth app; rotating refresh.", rotatingRefresh: true }),
  "microsoft-onedrive": oauthB({ reason: "Shared Microsoft OAuth app; rotating refresh.", rotatingRefresh: true }),
  "microsoft-onenote": oauthB({ reason: "Shared Microsoft OAuth app; rotating refresh.", rotatingRefresh: true }),
  "microsoft-excel": oauthB({ reason: "Shared Microsoft OAuth app; rotating refresh.", rotatingRefresh: true }),
  "microsoft-teams": oauthB({ reason: "Shared Microsoft OAuth app; rotating refresh.", rotatingRefresh: true }),
  "microsoft-powerbi": oauthB({
    reason: "Shared Microsoft OAuth app; rotating refresh; token audience is Power BI (not Graph) so the probe proves acceptance only.",
    rotatingRefresh: true,
    probeIdentityLimited: true,
  }),
  slack: oauthB({
    refreshable: true,
    reason: "Bot/user tokens bound to the Slack app; rotation is opt-in per app (treated as rotating for safety when rotation is enabled upstream); auth.test verification.",
  }),
  hubspot: oauthB({ reason: "Refresh token bound to HUBSPOT_CLIENT_ID; non-rotating; access-token introspection verification." }),
  monday: oauthB({ reason: "Refresh token bound to MONDAY_CLIENT_ID; GraphQL me verification." }),
  dropbox: oauthB({ reason: "Offline refresh token bound to DROPBOX_CLIENT_ID; get_current_account verification." }),
  asana: oauthB({ reason: "Refresh token bound to ASANA_CLIENT_ID; GET /users/me verification." }),
  stripe: oauthB({ reason: "Connect OAuth; access key usable standalone but refresh is client-bound; GET /v1/account verification." }),
  airtable: oauthB({ reason: "MANDATORY rotating refresh token (single-use); dev refresh invalidates the production copy.", rotatingRefresh: true }),
  typeform: oauthB({ reason: "Rotating refresh token (offline scope); GET /me verification.", rotatingRefresh: true }),
  calendly: oauthB({ reason: "SINGLE-USE rotating refresh token; dev refresh invalidates the production copy.", rotatingRefresh: true }),
  quickbooks: oauthB({ reason: "Rolling ~daily-rotating refresh token (100-day window); realm-scoped companyinfo verification.", rotatingRefresh: true }),
  motive: oauthB({ reason: "SINGLE-USE rotating refresh token; GET /v1/companies verification.", rotatingRefresh: true }),
  linear: oauthB({ reason: "Rotating refresh token (mandatory since 2026-04); GraphQL viewer verification.", rotatingRefresh: true, hasTriggerLifecycleState: false }),
  discord: oauthB({ reason: "Unconditionally rotating refresh token; GET /users/@me verification.", rotatingRefresh: true }),
  trello: {
    authType: "token_ingest",
    category: "B",
    refreshable: false,
    oauthClientBound: true, // every API call sends key (TRELLO_CLIENT_ID) + token as a pair
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: true,
    verificationSupported: true,
    reason: "Ingested token is used as a (key, token) pair with the deployment's Trello API key on every call — dev must run the same TRELLO_CLIENT_ID; GET /1/members/me verification.",
  },

  // ── Category D — never transplant automatically ──
  adp: {
    authType: "machine_credentials",
    category: "D",
    refreshable: false,
    oauthClientBound: true,
    rotatingRefresh: false,
    multiAccountRisk: false,
    hasTriggerLifecycleState: false,
    verificationSupported: false,
    reason: "mTLS client certificate + private key + machine client credentials in a SEPARATE table (account_machine_credentials), outside the integrations encryption contract. Owner re-onboards in dev manually.",
  },
};

export function classifyProvider(
  provider: string,
): ProviderTransplantClassification | null {
  const entry = CLASSIFICATIONS[provider];
  if (!entry) return null;
  return { provider, ...entry };
}

export function isTransplantableCategory(category: TransplantCategory): boolean {
  return category === "A" || category === "B" || category === "C";
}

export function listClassifications(): ProviderTransplantClassification[] {
  return Object.entries(CLASSIFICATIONS).map(([provider, entry]) => ({
    provider,
    ...entry,
  }));
}
