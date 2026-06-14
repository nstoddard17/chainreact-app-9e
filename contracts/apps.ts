import { z } from "zod";

/**
 * Route-safe contracts for the Apps page (Slice 4.APPS-PAGE-1).
 *
 * Per docs/rules/database-security.md and docs/slices/phase-4/page-
 * implementation-guide.md §"Repository / API usage": only the fields the
 * UI actually needs leave the server. Specifically — NO encrypted tokens,
 * NO provider account ids (some are workspace/team ids), NO raw account
 * metadata blob, NO granted-scopes list (impl detail). Test coverage at
 * `tests/unit/app/apps/_shared-dto-safety.test.ts` pins this.
 */

export const AppAccountSummarySchema = z.object({
  /** Integration row id. Opaque UUID — safe to expose for keys/data attrs. */
  id: z.string(),
  /** User-friendly account label provided at OAuth time (e.g. "Personal · marcus@example.com"). */
  displayName: z.string().nullable(),
  /** ISO-8601 createdAt of the integration row. */
  connectedAt: z.string(),
  /**
   * Whether the CURRENT caller may disconnect THIS connection (Slice
   * 4.APPS-DISCONNECT / CD-3). Server-derived boolean only — it encodes
   * "owner/admin, OR a personal-credential provider the caller connected, AND
   * the disconnect feature is enabled". The inputs (`connected_by_user_id`, the
   * caller's role, provider credential-class) are NEVER emitted; only this flag.
   * Drives whether the Disconnect control renders. The DELETE/GET routes
   * re-authorize server-side, so a stale `true` cannot bypass anything.
   */
  canDisconnect: z.boolean(),
  /**
   * Whether the CURRENT caller may reconnect THIS connection (Slice
   * 4.APPS-RECONNECT; tightened in APPS-PERM-1). Server-derived: owner/admin for
   * account-shared providers; the original CONNECTOR ONLY for personal providers.
   * This INTENTIONALLY diverges from `canDisconnect` — owner/admin may disconnect
   * a member's personal connection for safety but may NOT re-authorize it (only
   * the identity-holder can). Drives whether the per-row Reconnect control
   * renders. The connect route re-authorizes server-side, so a stale `true` can't
   * bypass anything. NO identity (`provider_account_id` / email) is emitted —
   * reconnect sends only the opaque row id.
   */
  canReconnect: z.boolean(),
  /**
   * Explicit connection-sharing status of THIS row (Slice 4.CONN-SHARE / CS-5a):
   *   - `not_applicable` — account/service provider (already account-shared by
   *     classification), OR the `ENABLE_CONNECTION_SHARING` feature is OFF. No
   *     sharing UI renders.
   *   - `private_to_connector` — a personal connection only its connector can use
   *     for runnable workflows ("Private to you").
   *   - `shared_with_account` — the connector opted it in; team members may run
   *     workflows using it ("Shared with team").
   * Server-derived from the row's sharing scope + provider class + the flag. The
   * inputs (`integration_sharing_scope`, `connected_by_user_id`) are NEVER emitted.
   */
  sharingStatus: z.enum(["not_applicable", "private_to_connector", "shared_with_account"]),
  /** Convenience boolean — `sharingStatus === "shared_with_account"`. */
  sharedWithAccount: z.boolean(),
  /**
   * Whether the CURRENT caller may SHARE this private connection (CS-5a). True only
   * for the CONNECTOR of an active personal connection that is currently private,
   * with the flag ON. Owner/admin can NOT share another member's personal identity,
   * so this stays false for them. The POST sharing route re-authorizes — a stale
   * `true` can't bypass anything. No identity emitted.
   */
  canShare: z.boolean(),
  /**
   * Whether the CURRENT caller may STOP sharing this connection (CS-5a). True for
   * the connector OR owner/admin (admin-safety removal) on a currently-shared
   * active personal connection, flag ON. The route re-authorizes server-side.
   */
  canUnshare: z.boolean(),
  /**
   * Whether THIS connection has a persisted "reconnect needed" signal (Slice
   * 4.V2-READY-28). Server-derived boolean from `integrations.needs_reconnect_at`
   * (`!= null`) — set when a provider operation detected a TRUE auth/reconnect
   * failure (e.g. a Slack option-source PROVIDER_REAUTH_REQUIRED), cleared on
   * (re)connect + a later successful auth-sensitive op. The underlying timestamp
   * is NEVER emitted (no provider error / scope / token / identity); only this
   * flag. Drives the per-row "Reconnect needed" copy; the Reconnect control is
   * unchanged (`canReconnect`).
   */
  needsReconnect: z.boolean(),
});
export type AppAccountSummary = z.infer<typeof AppAccountSummarySchema>;

export const AppCatalogItemSchema = z.object({
  providerId: z.string(),
  /** ProviderManifest.displayName. */
  name: z.string(),
  /** Short blurb. Pulled from the local Apps catalog map (route layer). */
  description: z.string(),
  /** `/integrations/<id>.svg` — public asset. null when no asset is registered. */
  iconUrl: z.string().nullable(),
  /** UI category label. Truthful local route-layer mapping; "Other" fallback. */
  category: z.string(),
  /** Whether the user has at least one active integration row for this provider. */
  isConnected: z.boolean(),
  /**
   * Whether ANY active account row for this provider currently has the persisted
   * reconnect-needed signal (Slice 4.V2-READY-28). Lets the provider-level status
   * pill distinguish "connected row exists" from "a connection needs reconnecting"
   * — so green "Connected" no longer implies fully healthy. Pure server-derived
   * boolean (OR of the per-account `needsReconnect`); no timestamp/identity emitted.
   */
  needsReconnect: z.boolean(),
  /**
   * Whether the CURRENT caller may connect a (new) account for this provider —
   * drives whether the Connect / Connect-another control renders. Server-derived
   * (APPS-PERM-1): `ProviderManifest.isEnabled && capabilities.oauth`, AND for
   * account/service providers (Slack/Stripe/Notion/Shopify/HubSpot/Mailchimp) the
   * caller must be owner/admin (connecting a shared org credential is account
   * management). Personal providers stay open to any member. The connect route
   * re-authorizes server-side, so a stale `true` can't bypass anything.
   */
  canConnect: z.boolean(),
  /**
   * Whether the CURRENT caller is restricted from connecting / managing this app
   * because it is an account/service provider (Slack/Stripe/Notion/Shopify/
   * HubSpot/Mailchimp) and they are NOT an owner/admin (APPS-PERM-2). Drives
   * explanatory UI copy ("Only an owner or admin can connect this app for the
   * team.") so the page never silently hides the action without a reason. Pure
   * server-derived UX hint — a single boolean that carries NO role, provider
   * class, identity, token, scope, or secret. Always `false` for personal
   * providers and for owner/admin. The connect/reconnect/disconnect routes
   * re-authorize authoritatively, so this never gates anything by itself.
   */
  restrictedToAdmins: z.boolean(),
  /**
   * Whether the provider's tokens are user-scoped (most providers) — multiple
   * accounts make sense. workspace-scoped providers (Slack, Notion, …) also
   * support multiple workspaces in practice, so this is true for both today.
   */
  supportsMultipleAccounts: z.boolean(),
  /** Active integration rows for this provider, scoped to the current user. */
  accounts: z.array(AppAccountSummarySchema).readonly(),
  /** Earliest createdAt across active accounts. null when not connected. */
  firstConnectedAt: z.string().nullable(),
  /**
   * Per-tenant connect-time input descriptor, mirrored from the provider
   * manifest's `connectInput` (Shopify's `*.myshopify.com` shop domain).
   * Present ONLY for per-tenant providers — the UI renders a prompt and
   * sends the entered value as `providerHint[hintKey]` when starting OAuth.
   * Omitted for every other provider (plain Connect, no prompt). Pure static
   * UI metadata — carries no identity, token, or account state.
   */
  connectInput: z
    .object({
      hintKey: z.string(),
      label: z.string(),
      placeholder: z.string(),
      help: z.string().optional(),
    })
    .optional(),
});
export type AppCatalogItem = z.infer<typeof AppCatalogItemSchema>;

export const AppsCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Count of providers in this category — derived server-side over the full catalog. */
  count: z.number().int().nonnegative(),
});
export type AppsCategory = z.infer<typeof AppsCategorySchema>;
