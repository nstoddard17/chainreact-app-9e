import { getServiceRoleClient } from "../supabase/serviceRoleClient";
import {
  CreateResourceLinkDismissalInputSchema,
  type CreateResourceLinkDismissalInput,
  type ResourceLinkDismissalDTO,
  type ResourceLinkMatchTier,
} from "@/contracts/resourceLinkDismissals";
import type { ResourceLinkKind } from "@/contracts/resourceLinks";

/**
 * Repository for `public.account_resource_link_dismissals` (5.TRUCK-BRIDGE-1 CS-5).
 *
 * Sits beside `accountResourceLinks.ts` in `repositories/resourceLinks/` and
 * follows it exactly: database access ONLY — no matching, no authorization, no
 * provider calls. Those belong to `core/` and `services/`.
 *
 * ── The tenant boundary lives HERE ──────────────────────────────────────────
 * This repository uses the SERVICE-ROLE client, which BYPASSES RLS, so the
 * table's policy does NOT constrain anything in this file. What enforces tenant
 * isolation is the mandatory `account_id` predicate on every read and write —
 * which is why `accountId` is the FIRST parameter of every exported function and
 * why no function can address a dismissal by id alone. A dismissal id belonging
 * to another account resolves to `null`, not to that row.
 *
 * ── Archival, not deletion ──────────────────────────────────────────────────
 * Dismissals are archived (`archived_at` set), never hard-deleted, so "why did
 * this stop being suggested?" stays answerable. `listActiveDismissals` excludes
 * archived rows, and the partial unique index only constrains ACTIVE rows — so
 * archiving frees the pair to be dismissed again with new evidence.
 */

/** Raw row shape — never leaves this module. */
interface DismissalRow {
  id: string;
  account_id: string;
  resource_kind: string;
  source_provider: string;
  source_external_id: string;
  target_provider: string;
  target_external_id: string;
  match_tier: string;
  evidence_fingerprint: string;
  dismissed_by_user_id: string | null;
  dismissed_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Explicit column list — `SELECT *` is avoided so a future column cannot join
 * the DTO without a decision being made here. Kept as ONE string literal (not a
 * concatenation): supabase-js infers the row shape from the literal type, and
 * `+` widens it to `string`, collapsing inference to `GenericStringError`.
 */
const DISMISSAL_COLUMNS =
  "id, account_id, resource_kind, source_provider, source_external_id, target_provider, target_external_id, match_tier, evidence_fingerprint, dismissed_by_user_id, dismissed_at, archived_at, created_at, updated_at";

function rowToDto(row: DismissalRow): ResourceLinkDismissalDTO {
  return {
    id: row.id,
    accountId: row.account_id,
    resourceKind: row.resource_kind as "vehicle",
    sourceProvider: row.source_provider,
    sourceExternalId: row.source_external_id,
    targetProvider: row.target_provider,
    targetExternalId: row.target_external_id,
    matchTier: row.match_tier as ResourceLinkMatchTier,
    evidenceFingerprint: row.evidence_fingerprint,
    dismissedByUserId: row.dismissed_by_user_id,
    dismissedAt: row.dismissed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every ACTIVE dismissal for one account + resource kind. This is the set the
 * Suggested tab subtracts from its freshly computed proposals.
 */
export async function listActiveDismissals(
  accountId: string,
  resourceKind: ResourceLinkKind,
): Promise<readonly ResourceLinkDismissalDTO[]> {
  const supabase = getServiceRoleClient(
    `account_resource_link_dismissals: listActiveDismissals ${accountId}/${resourceKind}`,
  );
  const { data, error } = await supabase
    .from("account_resource_link_dismissals")
    .select(DISMISSAL_COLUMNS)
    .eq("account_id", accountId)
    .eq("resource_kind", resourceKind)
    .is("archived_at", null)
    .order("dismissed_at", { ascending: false });
  if (error) {
    throw new Error(
      `account_resource_link_dismissals.listActiveDismissals failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToDto(r as DismissalRow));
}

/**
 * Record a dismissal. Input is validated against the strict contract first, so a
 * malformed / self-referential row is rejected with a readable message before it
 * reaches Postgres (the DB CHECKs remain the backstop).
 *
 * A second ACTIVE dismissal for the same pair violates the partial unique index
 * and surfaces as an error — the caller archives the prior one first when it
 * wants to replace the evidence.
 */
export async function createDismissal(
  input: CreateResourceLinkDismissalInput,
): Promise<ResourceLinkDismissalDTO> {
  const parsed = CreateResourceLinkDismissalInputSchema.parse(input);

  const supabase = getServiceRoleClient(
    `account_resource_link_dismissals: createDismissal ${parsed.accountId}/${parsed.resourceKind}`,
  );
  const { data, error } = await supabase
    .from("account_resource_link_dismissals")
    .insert({
      account_id: parsed.accountId,
      resource_kind: parsed.resourceKind,
      source_provider: parsed.sourceProvider,
      source_external_id: parsed.sourceExternalId,
      target_provider: parsed.targetProvider,
      target_external_id: parsed.targetExternalId,
      match_tier: parsed.matchTier,
      evidence_fingerprint: parsed.evidenceFingerprint,
      dismissed_by_user_id: parsed.dismissedByUserId ?? null,
      dismissed_at: parsed.dismissedAt,
    })
    .select(DISMISSAL_COLUMNS)
    .single<DismissalRow>();
  if (error || !data) {
    throw new Error(
      `account_resource_link_dismissals.createDismissal failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToDto(data);
}

/**
 * Archive the ACTIVE dismissal for one pair, scoped to its account. Returns
 * `null` when there is none — which covers "already archived", "never
 * dismissed", and "belongs to another account" identically, so the caller (and
 * therefore the user) learns nothing about another account's data.
 *
 * Keyed on the PAIR rather than a row id because that is how callers think about
 * it ("stop suppressing this suggestion"), and because it keeps every mutation
 * account-scoped by construction.
 */
export async function archiveDismissalForPair(
  accountId: string,
  resourceKind: ResourceLinkKind,
  sourceProvider: string,
  sourceExternalId: string,
  targetProvider: string,
  targetExternalId: string,
  archivedAt: string,
): Promise<ResourceLinkDismissalDTO | null> {
  const supabase = getServiceRoleClient(
    `account_resource_link_dismissals: archiveDismissalForPair ${accountId}/${resourceKind}`,
  );
  const { data, error } = await supabase
    .from("account_resource_link_dismissals")
    .update({ archived_at: archivedAt })
    .eq("account_id", accountId)
    .eq("resource_kind", resourceKind)
    .eq("source_provider", sourceProvider)
    .eq("source_external_id", sourceExternalId)
    .eq("target_provider", targetProvider)
    .eq("target_external_id", targetExternalId)
    .is("archived_at", null)
    .select(DISMISSAL_COLUMNS)
    .maybeSingle<DismissalRow>();
  if (error) {
    throw new Error(
      `account_resource_link_dismissals.archiveDismissalForPair failed: ${error.message}`,
    );
  }
  return data ? rowToDto(data) : null;
}
