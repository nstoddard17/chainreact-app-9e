import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `analytics_dashboards` (Slice ANALYTICS-1).
 *
 * READS go through the SSR-cookie (session) client: `authenticated` holds a
 * membership-gated SELECT policy + grant on the table, so RLS makes the read
 * AUTHORIZING — a member only ever sees their own account's dashboards, and the
 * explicit `account_id` filter narrows to the resolved active account.
 *
 * WRITES go through SERVICE-ROLE (no authenticated write grant exists). They are
 * NON-AUTHORIZING — every write caller (the dashboards routes) MUST first resolve
 * the caller's account and authorize membership (`requireUserWithAccount` +
 * matching the loaded row's `account_id`) before mutating. `getByIdServiceRole`
 * exists solely to load a row's `account_id` for that write-path authorization;
 * it bypasses RLS and its result must never reach a client unauthorized.
 *
 * The `widgets` column is opaque JSONB here — the service layer validates it with
 * `contracts/analytics.ts` Zod on the way in AND out (defensive). No credentials
 * or live values are ever stored (see the migration header).
 */

export interface AnalyticsDashboardRecord {
  id: string;
  accountId: string;
  createdByUserId: string | null;
  name: string;
  position: number;
  isDefault: boolean;
  widgets: unknown;
  createdAt: string;
  updatedAt: string;
}

interface AnalyticsDashboardsRow {
  id: string;
  account_id: string;
  created_by_user_id: string | null;
  name: string;
  position: number;
  is_default: boolean;
  widgets: unknown;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id,account_id,created_by_user_id,name,position,is_default,widgets,created_at,updated_at";

function rowToRecord(row: AnalyticsDashboardsRow): AnalyticsDashboardRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    position: row.position,
    isDefault: row.is_default,
    widgets: row.widgets,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List an account's dashboards in tab order (session client; RLS-authorizing).
 * Caller passes the account it resolved from its OWN session.
 */
export async function listByAccount(
  accountId: string,
): Promise<readonly AnalyticsDashboardRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .select(COLUMNS)
    .eq("account_id", accountId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`analytics_dashboards.listByAccount failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as AnalyticsDashboardsRow));
}

/**
 * Service-role load by id — NON-AUTHORIZING. Used only by the write routes to
 * read a row's `account_id` for membership authorization before mutating.
 */
export async function getByIdServiceRole(
  id: string,
): Promise<AnalyticsDashboardRecord | null> {
  const supabase = getServiceRoleClient(`analytics_dashboards: getById ${id}`);
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`analytics_dashboards.getByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data as AnalyticsDashboardsRow) : null;
}

export interface CreateDashboardRecord {
  accountId: string;
  createdByUserId: string | null;
  name: string;
  position: number;
  isDefault: boolean;
  widgets: unknown;
}

export async function createServiceRole(
  input: CreateDashboardRecord,
): Promise<AnalyticsDashboardRecord> {
  const supabase = getServiceRoleClient(
    `analytics_dashboards: create for account ${input.accountId}`,
  );
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      position: input.position,
      is_default: input.isDefault,
      widgets: input.widgets,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`analytics_dashboards.createServiceRole failed: ${error.message}`);
  }
  return rowToRecord(data as AnalyticsDashboardsRow);
}

export interface UpdateDashboardPatch {
  name?: string;
  position?: number;
  widgets?: unknown;
}

export async function updateServiceRole(
  id: string,
  patch: UpdateDashboardPatch,
): Promise<AnalyticsDashboardRecord> {
  const supabase = getServiceRoleClient(`analytics_dashboards: update ${id}`);
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.widgets !== undefined) row.widgets = patch.widgets;
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .update(row)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`analytics_dashboards.updateServiceRole failed: ${error.message}`);
  }
  return rowToRecord(data as AnalyticsDashboardsRow);
}

export async function deleteServiceRole(id: string): Promise<void> {
  const supabase = getServiceRoleClient(`analytics_dashboards: delete ${id}`);
  const { error } = await supabase
    .from("analytics_dashboards")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`analytics_dashboards.deleteServiceRole failed: ${error.message}`);
  }
}

/** Service-role next free tab position for an account (max(position)+1, or 0). */
export async function nextPositionServiceRole(accountId: string): Promise<number> {
  const supabase = getServiceRoleClient(
    `analytics_dashboards: nextPosition ${accountId}`,
  );
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .select("position")
    .eq("account_id", accountId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  if (error) {
    throw new Error(
      `analytics_dashboards.nextPositionServiceRole failed: ${error.message}`,
    );
  }
  return data ? data.position + 1 : 0;
}
