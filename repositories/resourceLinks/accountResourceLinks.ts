import { getServiceRoleClient } from "../supabase/serviceRoleClient";
import {
  CreateConfirmedResourceLinkInputSchema,
  type CreateConfirmedResourceLinkInput,
  type ResourceLinkDTO,
  type ResourceLinkKind,
  type ResourceLinkMatchBasis,
} from "@/contracts/resourceLinks";

/**
 * Repository for `public.account_resource_links` (5.TRUCK-BRIDGE-1 CS-1).
 *
 * Lives in its own `repositories/resourceLinks/` folder (the `machineCredentials/`
 * / `onboarding/` precedent) because `repositories/` sat at exactly the 50-file
 * leaf cap — adding a 51st file at the top level trips `npm run lint:structure`
 * (project-structure rule / CLAUDE.md rule 16). CS-2+ resource-link repositories
 * belong here too.
 *
 * Database access ONLY. No provider API calls, no matching/suggestion logic, no
 * authorization decisions — those belong to CS-2+ in `core/` and `services/`.
 *
 * ── The tenant boundary lives HERE ──────────────────────────────────────────
 * This repository uses the SERVICE-ROLE client, which BYPASSES RLS. The table's
 * RLS policy therefore does NOT constrain anything in this file. What enforces
 * tenant isolation for every call below is the mandatory `account_id` predicate
 * on every read and every write — which is why:
 *
 *   - `accountId` is the FIRST parameter of every exported function,
 *   - there is NO function that can read or mutate a link by id alone,
 *   - a row id belonging to another account resolves to `null` / zero rows
 *     rather than to that row.
 *
 * That last property is deliberate and load-bearing: a caller handed another
 * account's link id learns nothing — not the target vehicle, not the labels, not
 * the confirmer, not even whether such a row exists. Callers map `null` to a 404.
 *
 * ── Provenance is not authorization ─────────────────────────────────────────
 * `created_by_user_id` / `confirmed_by_user_id` are returned for the audit
 * requirement and are never part of any predicate. Any member of the owning
 * account may read, create, and archive that account's links.
 *
 * ── Archival, not deletion ──────────────────────────────────────────────────
 * Links are archived (`archived_at` set), never hard-deleted, so a historical
 * run that used a since-removed link stays explainable. `findActiveLink`
 * excludes archived rows; `listLinks` returns them so a management screen can
 * show history. The two partial unique indexes only constrain ACTIVE rows, so
 * archiving frees the pair for a replacement link.
 */

/** Raw row shape — never leaves this module. */
interface AccountResourceLinkRow {
  id: string;
  account_id: string;
  resource_kind: string;
  source_provider: string;
  source_external_id: string;
  target_provider: string;
  target_external_id: string;
  source_label: string | null;
  target_label: string | null;
  match_basis: string;
  created_by_user_id: string | null;
  confirmed_by_user_id: string | null;
  confirmed_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Explicit column list. Every column is intentional; `SELECT *` is avoided so a
 * future column cannot silently join the DTO without a decision being made here.
 *
 * Kept as ONE string literal (not a concatenation) on purpose: supabase-js infers
 * the returned row shape from the literal type of this argument, and `+` widens
 * it to `string`, which collapses the inference to `GenericStringError`.
 */
const LINK_COLUMNS =
  "id, account_id, resource_kind, source_provider, source_external_id, target_provider, target_external_id, source_label, target_label, match_basis, created_by_user_id, confirmed_by_user_id, confirmed_at, archived_at, created_at, updated_at";

/** Explicit row→DTO projection. The raw row never escapes the repository. */
function rowToDto(row: AccountResourceLinkRow): ResourceLinkDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    resourceKind: row.resource_kind as ResourceLinkKind,
    sourceProvider: row.source_provider,
    sourceExternalId: row.source_external_id,
    targetProvider: row.target_provider,
    targetExternalId: row.target_external_id,
    sourceLabel: row.source_label,
    targetLabel: row.target_label,
    matchBasis: row.match_basis as ResourceLinkMatchBasis,
    createdByUserId: row.created_by_user_id,
    confirmedByUserId: row.confirmed_by_user_id,
    confirmedAt: row.confirmed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every link for one account + resource kind, newest first, INCLUDING archived
 * rows (a management screen shows history and a "previously linked" state).
 * Callers that want only live links filter on `archivedAt === null`, or use
 * `findActiveLink` for a keyed lookup.
 */
export async function listLinks(
  accountId: string,
  resourceKind: ResourceLinkKind,
): Promise<readonly ResourceLinkDTO[]> {
  const supabase = getServiceRoleClient(
    `account_resource_links: listLinks ${accountId}/${resourceKind}`,
  );
  const { data, error } = await supabase
    .from("account_resource_links")
    .select(LINK_COLUMNS)
    .eq("account_id", accountId)
    .eq("resource_kind", resourceKind)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`account_resource_links.listLinks failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToDto(r as AccountResourceLinkRow));
}

/**
 * The runtime lookup CS-3's action will use: the one ACTIVE link for a source
 * vehicle, keyed on the complete identity the source-uniqueness index enforces
 * — `(account_id, resource_kind, source_provider, source_external_id,
 * target_provider)`. Archived rows are excluded, so a removed link reads exactly
 * like a link that never existed (both produce the same "unmapped" outcome).
 *
 * Returns `null` when there is no active link. There is NO cross-account
 * fallback: an id that belongs to another account simply does not match.
 */
export async function findActiveLink(
  accountId: string,
  resourceKind: ResourceLinkKind,
  sourceProvider: string,
  sourceExternalId: string,
  targetProvider: string,
): Promise<ResourceLinkDTO | null> {
  const supabase = getServiceRoleClient(
    `account_resource_links: findActiveLink ${accountId}/${resourceKind}/${sourceProvider}->${targetProvider}`,
  );
  const { data, error } = await supabase
    .from("account_resource_links")
    .select(LINK_COLUMNS)
    .eq("account_id", accountId)
    .eq("resource_kind", resourceKind)
    .eq("source_provider", sourceProvider)
    .eq("source_external_id", sourceExternalId)
    .eq("target_provider", targetProvider)
    .is("archived_at", null)
    .maybeSingle<AccountResourceLinkRow>();
  if (error) {
    throw new Error(`account_resource_links.findActiveLink failed: ${error.message}`);
  }
  return data ? rowToDto(data) : null;
}

/**
 * Insert a confirmed link. Input is validated against the strict contract schema
 * first, so a malformed/self-referential link is rejected with a readable
 * message before it reaches Postgres (the DB CHECKs remain the backstop).
 *
 * A duplicate ACTIVE pair violates one of the two partial unique indexes and
 * surfaces as an error from Postgres — the caller decides whether that is a
 * user-facing conflict. Archiving the prior link first is what makes a re-link
 * succeed.
 */
export async function createConfirmedLink(
  input: CreateConfirmedResourceLinkInput,
): Promise<ResourceLinkDTO> {
  const parsed = CreateConfirmedResourceLinkInputSchema.parse(input);

  const supabase = getServiceRoleClient(
    `account_resource_links: createConfirmedLink ${parsed.accountId}/${parsed.resourceKind}`,
  );
  const { data, error } = await supabase
    .from("account_resource_links")
    .insert({
      account_id: parsed.accountId,
      resource_kind: parsed.resourceKind,
      source_provider: parsed.sourceProvider,
      source_external_id: parsed.sourceExternalId,
      target_provider: parsed.targetProvider,
      target_external_id: parsed.targetExternalId,
      source_label: parsed.sourceLabel ?? null,
      target_label: parsed.targetLabel ?? null,
      match_basis: parsed.matchBasis,
      created_by_user_id: parsed.createdByUserId ?? null,
      confirmed_by_user_id: parsed.confirmedByUserId ?? null,
      confirmed_at: parsed.confirmedAt,
    })
    .select(LINK_COLUMNS)
    .single<AccountResourceLinkRow>();
  if (error || !data) {
    throw new Error(
      `account_resource_links.createConfirmedLink failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToDto(data);
}

/**
 * Archive one link, scoped to its account. Idempotent-safe by construction: the
 * `archived_at IS NULL` predicate means a second call matches nothing and
 * returns `null` rather than moving the timestamp.
 *
 * Returns `null` when no ACTIVE link with that id exists **for that account** —
 * which covers both "already archived" and "belongs to a different account".
 * Collapsing those two cases is intentional: the caller (and therefore the user)
 * learns nothing about another account's data, not even whether the id exists.
 */
export async function archiveLink(
  accountId: string,
  linkId: string,
  archivedAt: string,
): Promise<ResourceLinkDTO | null> {
  const supabase = getServiceRoleClient(
    `account_resource_links: archiveLink ${accountId}/${linkId}`,
  );
  const { data, error } = await supabase
    .from("account_resource_links")
    .update({ archived_at: archivedAt })
    .eq("id", linkId)
    .eq("account_id", accountId)
    .is("archived_at", null)
    .select(LINK_COLUMNS)
    .maybeSingle<AccountResourceLinkRow>();
  if (error) {
    throw new Error(`account_resource_links.archiveLink failed: ${error.message}`);
  }
  return data ? rowToDto(data) : null;
}
