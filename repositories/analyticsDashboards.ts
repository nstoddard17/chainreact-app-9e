import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import { toJsonColumn } from "@/core/database/jsonColumn";
import type { TableInsert, TableRow, TableUpdate } from "@/types/tables";

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
 *
 * TABLE TYPING (SUPABASE-TABLE-TYPING-1C). Table access runs through
 * `asTypedDb`, so the table name and every selected column are compile-time
 * checked against `types/database.types.ts`.
 *
 * `widgets` is classified DISPLAY-ONLY CONFIGURATION, validated at ONE
 * downstream chokepoint: `services/analytics/dashboards.ts` normalizes every
 * board through `normalizeDashboardWidgets` on read, and
 * `validateLayout` refuses an unstorable board on write. This repository
 * therefore keeps the column OPAQUE (`Json` in, `unknown` out) and asserts
 * nothing about its interior — a second schema here would be a second source of
 * truth for the layout contract. Writes CONSTRUCT the `Json` value with
 * `toJsonColumn` rather than asserting `as Json`, so an unencodable widget
 * payload is rejected before it reaches Postgres.
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

/**
 * `COLUMNS` is the FULL generated row, so the mapper takes `TableRow`. That is
 * not a formality: if a column were ever dropped from the projection, the
 * inferred query result would stop being assignable here and the build would
 * fail — the exact drift a handwritten row interface used to hide.
 */
const COLUMNS =
  "id,account_id,created_by_user_id,name,position,is_default,widgets,created_at,updated_at";

function rowToRecord(row: TableRow<"analytics_dashboards">): AnalyticsDashboardRecord {
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
  const supabase = asTypedDb(await createClient());
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .select(COLUMNS)
    .eq("account_id", accountId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`analytics_dashboards.listByAccount failed: ${error.message}`);
  }
  return (data ?? []).map(rowToRecord);
}

/**
 * Service-role load by id — NON-AUTHORIZING. Used only by the write routes to
 * read a row's `account_id` for membership authorization before mutating.
 */
export async function getByIdServiceRole(
  id: string,
): Promise<AnalyticsDashboardRecord | null> {
  const supabase = asTypedDb(
    getServiceRoleClient(`analytics_dashboards: getById ${id}`),
  );
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`analytics_dashboards.getByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

export interface CreateDashboardRecord {
  accountId: string;
  createdByUserId: string | null;
  name: string;
  position: number;
  isDefault: boolean;
  widgets: unknown;
}

/**
 * The insert payload, checked against the generated `Insert` contract. `id`,
 * `created_at` and `updated_at` are database-managed and deliberately absent.
 */
function toInsertRow(input: CreateDashboardRecord) {
  return {
    account_id: input.accountId,
    created_by_user_id: input.createdByUserId,
    name: input.name,
    position: input.position,
    is_default: input.isDefault,
    widgets: toJsonColumn("analytics_dashboards.widgets", input.widgets),
  } satisfies TableInsert<"analytics_dashboards">;
}

export async function createServiceRole(
  input: CreateDashboardRecord,
): Promise<AnalyticsDashboardRecord> {
  const supabase = asTypedDb(
    getServiceRoleClient(
      `analytics_dashboards: create for account ${input.accountId}`,
    ),
  );
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .insert(toInsertRow(input))
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`analytics_dashboards.createServiceRole failed: ${error.message}`);
  }
  return rowToRecord(data);
}

/**
 * Seed the default dashboard, race-safe. Returns the created record, or `null`
 * when a concurrent first-load already inserted the account's default (Postgres
 * unique violation `23505` against `analytics_dashboards_one_default_per_account`
 * — added in 20260702000001). The caller then re-lists. Real (non-conflict)
 * errors still throw.
 */
export async function seedDefaultServiceRole(
  input: CreateDashboardRecord,
): Promise<AnalyticsDashboardRecord | null> {
  const supabase = asTypedDb(
    getServiceRoleClient(
      `analytics_dashboards: seedDefault for account ${input.accountId}`,
    ),
  );
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .insert(toInsertRow(input))
    .select(COLUMNS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw new Error(`analytics_dashboards.seedDefaultServiceRole failed: ${error.message}`);
  }
  return rowToRecord(data);
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
  const supabase = asTypedDb(getServiceRoleClient(`analytics_dashboards: update ${id}`));
  // Sparse by design — an absent key must stay untouched, so this is the
  // generated Update contract (every column optional), never the full Row.
  const row: TableUpdate<"analytics_dashboards"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.position !== undefined) row.position = patch.position;
  if (patch.widgets !== undefined) {
    row.widgets = toJsonColumn("analytics_dashboards.widgets", patch.widgets);
  }
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .update(row)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`analytics_dashboards.updateServiceRole failed: ${error.message}`);
  }
  return rowToRecord(data);
}

export async function deleteServiceRole(id: string): Promise<void> {
  const supabase = asTypedDb(getServiceRoleClient(`analytics_dashboards: delete ${id}`));
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
  const supabase = asTypedDb(
    getServiceRoleClient(`analytics_dashboards: nextPosition ${accountId}`),
  );
  // A one-column PROJECTION — the query describes its own shape, so no type
  // argument is supplied and nothing here claims to hold a whole dashboard row.
  const { data, error } = await supabase
    .from("analytics_dashboards")
    .select("position")
    .eq("account_id", accountId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(
      `analytics_dashboards.nextPositionServiceRole failed: ${error.message}`,
    );
  }
  return data ? data.position + 1 : 0;
}
