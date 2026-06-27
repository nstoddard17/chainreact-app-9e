import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  OpsAlertCategory,
  OpsAlertContext,
  OpsAlertEventRecord,
  OpsAlertSeverity,
} from "@/contracts/opsAlert";

/**
 * Repository for ops_alert_events (Phase 8b launch alerts).
 *
 * The durable alert ledger + dedupe/cooldown state. Service-role only — written
 * and read exclusively by the ops-alert evaluator (no user session). `context`
 * holds SAFE allow-listed fields only (no tokens/payloads/messages/PII; the
 * evaluator's no-leak test guards this).
 * See supabase/migrations/20260714000001_ops_alert_events.sql.
 */

interface AlertRow {
  id: string;
  category: OpsAlertCategory;
  severity: OpsAlertSeverity;
  dedupe_key: string;
  status: "open" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  window_label: string;
  context: OpsAlertContext;
  last_delivered_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

function rowToRecord(row: AlertRow): OpsAlertEventRecord {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    dedupeKey: row.dedupe_key,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    occurrenceCount: row.occurrence_count,
    windowLabel: row.window_label,
    context: row.context ?? {},
    lastDeliveredAt: row.last_delivered_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

/** All currently-open alerts. */
export async function listOpen(): Promise<OpsAlertEventRecord[]> {
  const supabase = getServiceRoleClient("ops alert: list open");
  const { data, error } = await supabase
    .from("ops_alert_events")
    .select("*")
    .eq("status", "open");
  if (error) throw new Error(`opsAlertEvents.listOpen failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as AlertRow));
}

export interface FireAlertInput {
  category: OpsAlertCategory;
  severity: OpsAlertSeverity;
  dedupeKey: string;
  windowLabel: string;
  context: OpsAlertContext;
  nowIso: string;
}

/**
 * Insert a new open alert. Returns the record, or null if a concurrent tick
 * already opened one for this key (the partial-unique index rejects the second
 * with 23505) — the caller then re-reads and bumps instead. `last_delivered_at`
 * is left null; the caller records delivery after a successful send.
 */
export async function fireOpen(input: FireAlertInput): Promise<OpsAlertEventRecord | null> {
  const supabase = getServiceRoleClient(`ops alert: fire ${input.dedupeKey}`);
  const { data, error } = await supabase
    .from("ops_alert_events")
    .insert({
      category: input.category,
      severity: input.severity,
      dedupe_key: input.dedupeKey,
      status: "open",
      first_seen_at: input.nowIso,
      last_seen_at: input.nowIso,
      occurrence_count: 1,
      window_label: input.windowLabel,
      context: input.context,
    })
    .select()
    .single<AlertRow>();
  if (error) {
    if (error.code === "23505") return null; // open row already exists for this key
    throw new Error(`opsAlertEvents.fireOpen failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

export interface TouchAlertInput {
  id: string;
  occurrenceCount: number;
  severity: OpsAlertSeverity;
  context: OpsAlertContext;
  nowIso: string;
  /** When true, also stamps last_delivered_at (a delivery just happened). */
  delivered: boolean;
}

/**
 * Update an existing open alert after a tick: always bump last_seen_at +
 * occurrence_count and refresh severity/context; stamp last_delivered_at only
 * when this tick delivered (vs suppressed within cooldown).
 */
export async function touch(input: TouchAlertInput): Promise<void> {
  const supabase = getServiceRoleClient(`ops alert: touch ${input.id}`);
  const patch: Record<string, unknown> = {
    last_seen_at: input.nowIso,
    occurrence_count: input.occurrenceCount,
    severity: input.severity,
    context: input.context,
  };
  if (input.delivered) patch.last_delivered_at = input.nowIso;
  const { error } = await supabase
    .from("ops_alert_events")
    .update(patch)
    .eq("id", input.id);
  if (error) throw new Error(`opsAlertEvents.touch failed: ${error.message}`);
}

/** Resolve open alerts whose condition cleared. */
export async function resolve(ids: readonly string[], nowIso: string): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = getServiceRoleClient("ops alert: resolve cleared");
  const { data, error } = await supabase
    .from("ops_alert_events")
    .update({ status: "resolved", resolved_at: nowIso })
    .in("id", ids as string[])
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(`opsAlertEvents.resolve failed: ${error.message}`);
  return data?.length ?? 0;
}

/** Retention cleanup: delete resolved alerts older than the cutoff. */
export async function deleteResolvedOlderThan(cutoffIso: string): Promise<number> {
  const supabase = getServiceRoleClient("ops alert: retention cleanup");
  const { data, error } = await supabase
    .from("ops_alert_events")
    .delete()
    .eq("status", "resolved")
    .lt("created_at", cutoffIso)
    .select("id");
  if (error) throw new Error(`opsAlertEvents.deleteResolvedOlderThan failed: ${error.message}`);
  return data?.length ?? 0;
}
