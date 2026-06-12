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
   * 4.APPS-RECONNECT). Same server-derived rule as `canDisconnect` (owner/admin
   * for account-shared providers; owner/admin OR the original connector for
   * personal providers) — both are per-account credential operations. Drives
   * whether the per-row Reconnect control renders. The connect route
   * re-authorizes server-side, so a stale `true` can't bypass anything. NO
   * identity (`provider_account_id` / email) is emitted — reconnect sends only
   * the opaque row id.
   */
  canReconnect: z.boolean(),
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
  /** ProviderManifest.isEnabled && capabilities.oauth — drives whether the Connect button renders. */
  canConnect: z.boolean(),
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
});
export type AppCatalogItem = z.infer<typeof AppCatalogItemSchema>;

export const AppsCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Count of providers in this category — derived server-side over the full catalog. */
  count: z.number().int().nonnegative(),
});
export type AppsCategory = z.infer<typeof AppsCategorySchema>;
