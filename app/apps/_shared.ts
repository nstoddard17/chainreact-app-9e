import { getProvider, listProviders, providerIconUrl } from "@/integrations/_registry";
import type { IntegrationRecord } from "@/repositories/integrations";
import { APPS_CATEGORY_ORDER, categoryFor, descriptionFor, type AppsCategory } from "@/lib/apps/providerCategories";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";
import { effectiveIntegrationSharingScope } from "@/core/integrations/sharingScope";
import { isConnectionSharingEnabled } from "@/services/integrations/connectionSharingFlags";
import type { MembershipRole } from "@/contracts/accounts";
import type {
  AppAccountSummary,
  AppCatalogItem,
  AppsCategory as AppsCategoryDto,
} from "@/contracts/apps";

/**
 * Shared route-layer helpers for the Apps page (Slice 4.APPS-PAGE-1).
 *
 * Owns the projection from `(ProviderManifest, IntegrationRecord[])` →
 * `AppCatalogItem[]`. Per project-structure-and-module-boundaries.md §5 the
 * route file stays thin; this file handles the cross-cutting safety + merge
 * logic. The DTO is intentionally narrow — see `contracts/apps.ts` for the
 * Zod schemas. The `toAppCatalogItem` mapper does NOT emit:
 *   - access/refresh tokens (encrypted columns)
 *   - providerAccountId (workspace/team id — mildly sensitive)
 *   - accountMetadata (free-form blob, may contain PII)
 *   - granted scopes
 *   - access-token-expires-at
 */

interface ProviderShape {
  id: string;
  displayName: string;
  isEnabled: boolean;
  isExperimental: boolean;
  capabilities: { oauth: boolean };
}

interface IntegrationShape {
  id: string;
  provider: string;
  displayName: string | null;
  createdAt: string;
  /**
   * SERVER-ONLY provenance — the human who connected this row. Used ONLY to
   * derive the `canDisconnect` / sharing booleans below; it is NEVER copied into
   * the emitted DTO. (The dto-safety test asserts it never appears in the output.)
   */
  connectedByUserId: string | null;
  /**
   * SERVER-ONLY raw sharing-scope column (CS-1). Used ONLY to derive the
   * `sharingStatus` / `sharedWithAccount` / `canShare` / `canUnshare` fields; the
   * raw value is NEVER emitted. Optional — mirrors the optional column on
   * `IntegrationRecord`; `undefined` reads as `null` (the helper accepts both).
   */
  integrationSharingScope?: string | null;
}

interface SharingDtoFields {
  sharingStatus: AppAccountSummary["sharingStatus"];
  sharedWithAccount: boolean;
  canShare: boolean;
  canUnshare: boolean;
}

/**
 * Server-derived sharing fields for one row (CS-5a), evaluated for UI gating only
 * (the POST sharing route re-authorizes authoritatively).
 *
 * `not_applicable` (no sharing UI) when the feature flag is OFF or the provider is
 * account/service (already account-shared). For personal providers with the flag
 * ON: status from the row's effective scope; `canShare` = the CONNECTOR only on a
 * still-private row (owner/admin can NOT silently share a member's identity);
 * `canUnshare` = connector OR owner/admin on a shared row (admin-safety removal).
 * Rows here are always active (the catalog only contains active integrations), so
 * disconnected rows never expose a toggle.
 */
function computeSharingFields(
  provider: string,
  connectedByUserId: string | null,
  rawSharingScope: string | null | undefined,
  ctx: DisconnectContext | undefined,
): SharingDtoFields {
  const off: SharingDtoFields = {
    sharingStatus: "not_applicable",
    sharedWithAccount: false,
    canShare: false,
    canUnshare: false,
  };
  if (!ctx || !isConnectionSharingEnabled()) return off;
  if (isAccountCredentialProvider(provider)) return off; // already account-shared

  const scope = effectiveIntegrationSharingScope(provider, rawSharingScope);
  const isConnector = connectedByUserId !== null && connectedByUserId === ctx.callerUserId;
  const isOwnerAdmin = ctx.callerRole === "owner" || ctx.callerRole === "admin";
  return {
    sharingStatus: scope,
    sharedWithAccount: scope === "shared_with_account",
    canShare: scope === "private_to_connector" && isConnector,
    canUnshare: scope === "shared_with_account" && (isConnector || isOwnerAdmin),
  };
}

/**
 * The current caller's disconnect authorization context (Slice 4.APPS-DISCONNECT
 * / CD-3). Resolved once per request in the page; threaded into the projection so
 * each account's `canDisconnect` is computed server-side. `undefined` ⇒ every
 * `canDisconnect` is `false` (control never renders).
 */
export interface DisconnectContext {
  callerUserId: string;
  callerRole: MembershipRole | null;
}

/**
 * Mirror of the disconnect service's `resolveAndAuthorize` rule, evaluated for
 * UI gating only (the DELETE/GET routes re-authorize authoritatively, so this is
 * never the security boundary). Account/service (shared) providers ⇒ owner/admin;
 * personal-credential providers ⇒ owner/admin OR the original connector.
 */
function computeCanDisconnect(
  provider: string,
  connectedByUserId: string | null,
  ctx: DisconnectContext | undefined,
): boolean {
  if (!ctx) return false;
  const isOwnerAdmin = ctx.callerRole === "owner" || ctx.callerRole === "admin";
  if (isAccountCredentialProvider(provider)) return isOwnerAdmin;
  return isOwnerAdmin || (connectedByUserId !== null && connectedByUserId === ctx.callerUserId);
}

/**
 * Mirror of the reconnect service's authorization rule (APPS-PERM-1), evaluated
 * for UI gating only (the connect route re-authorizes authoritatively). Account/
 * service (shared) providers ⇒ owner/admin (same as disconnect + the reconnect
 * service). Personal-credential providers ⇒ the original CONNECTOR ONLY — an
 * INTENTIONAL asymmetry with `computeCanDisconnect`: owner/admin may disconnect a
 * member's personal connection for safety but may NOT re-authorize it (only the
 * identity-holder can).
 */
function computeCanReconnect(
  provider: string,
  connectedByUserId: string | null,
  ctx: DisconnectContext | undefined,
): boolean {
  if (!ctx) return false;
  if (isAccountCredentialProvider(provider)) {
    return ctx.callerRole === "owner" || ctx.callerRole === "admin";
  }
  return connectedByUserId !== null && connectedByUserId === ctx.callerUserId;
}

/**
 * Connect authorization for UI gating (APPS-PERM-1), evaluated for the provider
 * card's Connect / Connect-another controls (the connect route re-authorizes
 * authoritatively). Personal-credential providers ⇒ any member may connect their
 * OWN identity. Account/service providers ⇒ owner/admin only (connecting or
 * overwriting a shared org credential is account management). No ctx ⇒ account
 * providers gate to `false` (conservative; the control never renders).
 * `baseConnectable` is the manifest gate (`isEnabled && capabilities.oauth`).
 */
function computeCanConnect(
  provider: string,
  baseConnectable: boolean,
  ctx: DisconnectContext | undefined,
): boolean {
  if (!baseConnectable) return false;
  if (!isAccountCredentialProvider(provider)) return true;
  return ctx ? ctx.callerRole === "owner" || ctx.callerRole === "admin" : false;
}

function toAppAccountSummary(
  record: IntegrationShape,
  ctx: DisconnectContext | undefined,
): AppAccountSummary {
  // Disconnect and reconnect now diverge (APPS-PERM-1): disconnect allows
  // owner/admin OR connector for personal providers, but reconnect is
  // connector-only for personal (owner/admin can still disconnect for safety).
  // Account/service providers stay owner/admin for both. The DELETE / connect
  // routes re-authorize authoritatively.
  return {
    id: record.id,
    displayName: record.displayName,
    connectedAt: record.createdAt,
    canDisconnect: computeCanDisconnect(
      record.provider,
      record.connectedByUserId,
      ctx,
    ),
    canReconnect: computeCanReconnect(
      record.provider,
      record.connectedByUserId,
      ctx,
    ),
    ...computeSharingFields(
      record.provider,
      record.connectedByUserId,
      record.integrationSharingScope,
      ctx,
    ),
  };
}

/**
 * Project one provider + its active integrations into the route-safe item
 * shape. Accounts are sorted oldest-first so the first row is the user's
 * primary connection (most-recent at top would look like a recent activity
 * stream, which it isn't).
 */
export function toAppCatalogItem(
  provider: ProviderShape,
  integrationsForProvider: readonly IntegrationShape[],
  ctx?: DisconnectContext,
): AppCatalogItem {
  const sortedAccounts = [...integrationsForProvider]
    .map((record) => toAppAccountSummary(record, ctx))
    .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
  const isConnected = sortedAccounts.length > 0;
  const canConnect = computeCanConnect(
    provider.id,
    provider.isEnabled && provider.capabilities.oauth,
    ctx,
  );
  return {
    providerId: provider.id,
    name: provider.displayName,
    description: descriptionFor(provider.id),
    iconUrl: providerIconUrl(provider.id) ?? null,
    category: categoryFor(provider.id),
    isConnected,
    canConnect,
    // Every V2 provider today supports more than one connection (user-scoped
    // tokens for most; multi-workspace OAuth for Slack/Notion/etc.). Kept as
    // a DTO field so we can flip individual providers off without UI churn
    // when/if a single-account-only provider lands.
    supportsMultipleAccounts: true,
    accounts: sortedAccounts,
    firstConnectedAt: sortedAccounts[0]?.connectedAt ?? null,
  };
}

/**
 * Resolve the full catalog server-side. Filters out experimental providers
 * (same rule the existing `IntegrationsList` applied). Items render in
 * `listProviders()` registry order — the design's category nav handles the
 * actual grouping client-side, so we don't need to pre-group here.
 */
export function resolveAppCatalog(
  records: readonly IntegrationRecord[],
  ctx?: DisconnectContext,
): readonly AppCatalogItem[] {
  const providersByUser = new Map<string, IntegrationRecord[]>();
  for (const r of records) {
    const bucket = providersByUser.get(r.provider) ?? [];
    bucket.push(r);
    providersByUser.set(r.provider, bucket);
  }
  return listProviders()
    .filter((p) => p.isEnabled && !p.isExperimental)
    .map((p) =>
      toAppCatalogItem(p, providersByUser.get(p.id) ?? [], ctx),
    );
}

/**
 * Server-side category list with counts. "All apps" is added first; "Other"
 * is included only when at least one provider falls into it. Counts are
 * derived from the *visible* catalog (post enabled/experimental filter), so
 * the sidebar can never advertise a category that has zero clickable rows.
 */
export function buildCategoryList(items: readonly AppCatalogItem[]): readonly AppsCategoryDto[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  const result: AppsCategoryDto[] = [
    { id: "All", label: "All apps", count: items.length },
  ];
  for (const c of APPS_CATEGORY_ORDER) {
    const n = counts.get(c) ?? 0;
    if (n === 0) continue;
    result.push({ id: c, label: labelFor(c), count: n });
  }
  return result;
}

function labelFor(c: AppsCategory): string {
  // The map ids already read well as labels — exposed verbatim. Kept as a
  // helper so a future localized label can swap in without touching the
  // category ids (used as stable filter keys client-side).
  return c;
}

/** Re-export the manifest projection used by the page test (no internal fields). */
export function projectProviderForMapper(p: {
  id: string;
  displayName: string;
  isEnabled: boolean;
  isExperimental: boolean;
  capabilities: { oauth: boolean };
}): ProviderShape {
  return {
    id: p.id,
    displayName: p.displayName,
    isEnabled: p.isEnabled,
    isExperimental: p.isExperimental,
    capabilities: { oauth: p.capabilities.oauth },
  };
}

/** Re-export the integration record projection used by tests. */
export function projectIntegrationForMapper(r: IntegrationRecord): IntegrationShape {
  return {
    id: r.id,
    provider: r.provider,
    displayName: r.displayName,
    createdAt: r.createdAt,
    // Server-only — consumed by computeCanDisconnect + computeSharingFields,
    // never emitted in the DTO.
    connectedByUserId: r.connectedByUserId,
    integrationSharingScope: r.integrationSharingScope ?? null,
  };
}

/** Silences an unused-name lint when only the helpers are imported from a test. */
export const __getProviderForTest = getProvider;
