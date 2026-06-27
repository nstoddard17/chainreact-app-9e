import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for ops_signal_events (Phase 8b launch alerts).
 *
 * Append-only, safe signal log with no existing durable home: cron run
 * heartbeats and billing-webhook processing failures. Service-role only — written
 * by cron routes + the billing webhook handler (no user session), read by the
 * ops-alert evaluator. Stores identifiers + coarse outcomes ONLY (no payloads,
 * tokens, messages). See supabase/migrations/20260714000000_ops_signal_events.sql.
 */

export type OpsSignalKind = "cron_run" | "billing_webhook_failure";
export type OpsSignalOutcome = "ok" | "failed";

export interface RecordOpsSignalInput {
  kind: OpsSignalKind;
  source: string;
  outcome: OpsSignalOutcome;
  /** Short, non-secret machine reason. NEVER a raw error/token/payload. */
  detailCode?: string | null;
}

export async function record(input: RecordOpsSignalInput): Promise<void> {
  const supabase = getServiceRoleClient(
    `ops signal: ${input.kind} ${input.source} ${input.outcome}`,
  );
  const { error } = await supabase.from("ops_signal_events").insert({
    kind: input.kind,
    source: input.source,
    outcome: input.outcome,
    detail_code: input.detailCode ?? null,
  });
  if (error) throw new Error(`opsSignalEvents.record failed: ${error.message}`);
}

export interface CronRunStatusReading {
  source: string;
  lastOutcome: OpsSignalOutcome | null;
  /** Age (minutes) of the most recent `ok` row; null when none observed. */
  lastSuccessAgeMinutes: number | null;
  /** Count of consecutive `failed` rows from newest backwards. */
  consecutiveFailures: number;
}

interface SignalRow {
  source: string;
  outcome: OpsSignalOutcome;
  created_at: string;
}

const PER_SOURCE_SCAN = 25; // newest rows per source used to derive status

/**
 * Derive per-cron run status from the recent heartbeat rows. A source with NO
 * rows returns `{lastOutcome:null, lastSuccessAgeMinutes:null, consecutiveFailures:0}`
 * — the evaluator treats a null last-success as a missing run (never green).
 */
export async function getCronRunStatuses(
  sources: readonly string[],
  nowIso: string,
): Promise<CronRunStatusReading[]> {
  if (sources.length === 0) return [];
  const supabase = getServiceRoleClient("ops signal: read cron run statuses");
  const nowMs = Date.parse(nowIso);

  const out: CronRunStatusReading[] = [];
  for (const source of sources) {
    const { data, error } = await supabase
      .from("ops_signal_events")
      .select("source, outcome, created_at")
      .eq("kind", "cron_run")
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_SCAN);
    if (error) throw new Error(`opsSignalEvents.getCronRunStatuses failed: ${error.message}`);

    const rows = (data ?? []) as SignalRow[];
    if (rows.length === 0) {
      out.push({ source, lastOutcome: null, lastSuccessAgeMinutes: null, consecutiveFailures: 0 });
      continue;
    }
    const lastOutcome = rows[0]!.outcome;
    let consecutiveFailures = 0;
    for (const r of rows) {
      if (r.outcome === "failed") consecutiveFailures += 1;
      else break;
    }
    const firstOk = rows.find((r) => r.outcome === "ok");
    const lastSuccessAgeMinutes = firstOk
      ? Math.max(0, Math.round((nowMs - Date.parse(firstOk.created_at)) / 60_000))
      : null;
    out.push({ source, lastOutcome, lastSuccessAgeMinutes, consecutiveFailures });
  }
  return out;
}

export interface BillingWebhookFailureCounts {
  totalFailures: number;
  signatureFailures: number;
}

/**
 * Count billing-webhook processing failures in the window, plus the signature-
 * failure subset in the (shorter) burst window.
 */
export async function countBillingWebhookFailures(
  windowCutoffIso: string,
  signatureCutoffIso: string,
): Promise<BillingWebhookFailureCounts> {
  const supabase = getServiceRoleClient("ops signal: count billing webhook failures");

  const total = await supabase
    .from("ops_signal_events")
    .select("*", { count: "exact", head: true })
    .eq("kind", "billing_webhook_failure")
    .eq("outcome", "failed")
    .gte("created_at", windowCutoffIso);
  if (total.error) {
    throw new Error(`opsSignalEvents.countBillingWebhookFailures failed: ${total.error.message}`);
  }

  const sig = await supabase
    .from("ops_signal_events")
    .select("*", { count: "exact", head: true })
    .eq("kind", "billing_webhook_failure")
    .eq("outcome", "failed")
    .eq("detail_code", "invalid_signature")
    .gte("created_at", signatureCutoffIso);
  if (sig.error) {
    throw new Error(`opsSignalEvents.countBillingWebhookFailures (sig) failed: ${sig.error.message}`);
  }

  return { totalFailures: total.count ?? 0, signatureFailures: sig.count ?? 0 };
}

/** Retention cleanup: delete rows older than the cutoff. Returns rows deleted. */
export async function deleteOlderThan(cutoffIso: string): Promise<number> {
  const supabase = getServiceRoleClient("ops signal: retention cleanup");
  const { data, error } = await supabase
    .from("ops_signal_events")
    .delete()
    .lt("created_at", cutoffIso)
    .select("id");
  if (error) throw new Error(`opsSignalEvents.deleteOlderThan failed: ${error.message}`);
  return data?.length ?? 0;
}
