import { getServiceRoleClient } from "../supabase/serviceRoleClient";
import { rowToRecord, type WorkflowRecord } from "../workflows";
import type { WorkflowState } from "@/contracts/workflow";

/**
 * MOBILE-COMPANION-M1 — sessionless workflow readers for the bearer-authed
 * `/api/mobile/v1` namespace (sibling file per the workflowRunsDiagnostics
 * precedent: file-size hygiene + a distinct trust posture).
 *
 * NON-AUTHORIZING: the mobile gate has ALREADY verified the bearer user and
 * their membership of `accountId`; the hard `eq('account_id', …)` predicate is
 * the scope. Rows never reach a client raw — the mobile service builds an
 * allow-listed DTO (no draftDefinition, no config) and egress-validates it.
 *
 * Keyset pagination (no offsets): ORDER BY updated_at DESC, id DESC with an
 * exclusive `(updated_at, id) < (before.sortTs, before.id)` continuation — the
 * id tie-breaker keeps traversal exact across equal timestamps.
 */
export interface ListWorkflowsPageOptions {
  /** Rows to fetch. The SERVICE passes its clamped limit + 1 to detect more. */
  limit: number;
  /** Exclusive keyset position from the decoded cursor. */
  before?: { sortTs: string; id: string };
  /** Optional exact lifecycle-state filter (already schema-validated). */
  state?: WorkflowState;
}

export async function listPageByAccountServiceRole(
  accountId: string,
  opts: ListWorkflowsPageOptions,
): Promise<readonly WorkflowRecord[]> {
  const supabase = getServiceRoleClient(
    `workflows: listPageByAccountServiceRole account ${accountId} (mobile v1)`,
  );
  let query = supabase
    .from("workflows")
    .select("*")
    .eq("account_id", accountId)
    .neq("state", "deleted");
  if (opts.state) query = query.eq("state", opts.state);
  if (opts.before) {
    query = query.or(
      `updated_at.lt.${opts.before.sortTs},and(updated_at.eq.${opts.before.sortTs},id.lt.${opts.before.id})`,
    );
  }
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit);
  if (error) {
    throw new Error(
      `workflows.listPageByAccountServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToRecord(r as Parameters<typeof rowToRecord>[0]));
}

/**
 * `(id, name)` for an explicit id set WITHIN one account — labels the mobile
 * run list without a per-row fetch. The account predicate is defense in depth
 * on top of the caller's verified scope.
 */
export async function listNamesByIdsForAccountServiceRole(
  accountId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = getServiceRoleClient(
    `workflows: listNamesByIdsForAccountServiceRole account ${accountId} (mobile v1)`,
  );
  const { data, error } = await supabase
    .from("workflows")
    .select("id,name")
    .eq("account_id", accountId)
    .in("id", ids as string[]);
  if (error) {
    throw new Error(
      `workflows.listNamesByIdsForAccountServiceRole failed: ${error.message}`,
    );
  }
  return new Map(
    ((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]),
  );
}
