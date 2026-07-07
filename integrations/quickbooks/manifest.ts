import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * QuickBooks Online provider manifest — QUICKBOOKS-1.
 *
 * Fourth net-new V2 provider (no V1 code existed; Asana, Typeform,
 * Calendly precedents). Wire-format verified against official Intuit docs
 * (docs/providers/quickbooks/research.md, 2026-07-07).
 *
 * Auth model — OAuth 2.0 authorization code, confidential client, NO PKCE
 * (Intuit's discovery documents list no code_challenge_methods_supported),
 * Basic-auth token exchange, refreshable:
 *   - `authorize`: `https://appcenter.intuit.com/connect/oauth2`
 *   - `token`:     `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`
 *   - Access tokens expire after 60 minutes (`expires_in: 3600`); refresh
 *     tokens live on a ROLLING 100-DAY window and their VALUE rotates
 *     roughly daily — oauth.ts persists the returned refresh token on
 *     every exchange/refresh (Calendly/Typeform rotation-persist shape).
 *
 * Company scoping — every Accounting API call is scoped by `realmId`
 * (`/v3/company/{realmId}/…`). Intuit delivers the realmId ONLY as a
 * query param on the OAuth callback redirect, so oauth.ts reads it from
 * the dispatcher's generic `callbackParams` passthrough and FAILS the
 * connect when absent. `accountIdField: "realmId"` — the realmId is both
 * the providerAccountId (multi-company discriminator: one authorization =
 * one company; two companies = two integration rows) and the webhook
 * fan-out scope.
 *
 * Scopes — a single scope covers the whole Accounting API (there are NO
 * per-entity or read-only accounting scopes):
 *   - `com.intuit.quickbooks.accounting` — customers, invoices, payments,
 *     items, terms, tax codes, company info: everything this slice uses.
 * Deliberately EXCLUDED: `com.intuit.quickbooks.payment` (card-processing
 * product, unrelated to the accounting Payment entity), `openid`/`profile`/
 * `email` (identity comes from CompanyInfo, already covered).
 *
 * tokenScope: "user" — keyed per connecting user; multi-company
 * discrimination rides on providerAccountId (realmId). The credential
 * CLASS is `account` (core/integrations/credentialSharing.ts): a
 * QuickBooks connection represents the company's books — a shared
 * business resource the whole team operates (Stripe/Shopify posture) —
 * NOT one person's private data.
 *
 * apiVersion: "v3" — `/v3/company/{realmId}/…`, `minorversion=75` sent on
 * every call (minor versions 1–74 deprecated 2025-08-01).
 *
 * Health-check interval: 12h — the "Others" bucket. Hourly access tokens
 * between checks are handled reactively by `refreshAndRetry`.
 *
 * Capabilities (honest — nothing "coming soon"):
 *   - `oauth: true` — code flow + rotating refresh implemented.
 *   - `actions: true` — 7 bounded action handlers ship in this slice
 *     (create/find/get customer, create/send/get/list invoices).
 *   - `webhookTrigger: true` — 4 triggers on Intuit's APP-LEVEL webhook
 *     (endpoint + entity checklist configured once per app in the Intuit
 *     portal; NOT per-workflow provider webhooks). Activation stores an
 *     internal trigger-interest row only; deactivation removes it; the
 *     receive route fans out by (realmId, entity, operation) with
 *     post-fetch enrichment.
 *   - `pollingTrigger: false` — webhook-only; CDC backfill is a
 *     documented future backstop, not shipped.
 */
export const quickbooksManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "quickbooks",
  displayName: "QuickBooks Online",
  isEnabled: true,
  apiVersion: "v3",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "realmId",
  scopes: {
    required: ["com.intuit.quickbooks.accounting"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: true,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000,
  refreshable: true,
});
