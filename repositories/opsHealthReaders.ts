import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  OAuthRefreshFailureSignal,
  ProviderFailureSignal,
  QueueBacklogSignal,
  StuckRunsSignal,
} from "@/contracts/opsAlert";

/**
 * Cross-table read-only signal readers for the ops-alert evaluator (Phase 8b).
 *
 * These are NON-AUTHORIZING service-role reads (no user session — the evaluator
 * runs from cron). They aggregate into SAFE shapes (counts + provider keys) and
 * never return run payloads, tokens, account-scoped rows, or messages. Domain
 * name = ops health; reads `workflow_runs`, `workflows`, `integrations`.
 */

const STUCK_RUN_SCAN_LIMIT = 1000;
const PROVIDER_FAIL_RUN_LIMIT = 2000;

interface StuckRunRow {
  started_at: string;
}

/**
 * Stuck runs = `status='running'` rows whose `started_at` is older than the warn
 * cutoff and not yet finalized. (The 60-min stale-run sweep finalizes them; a
 * rising count below that age signals stuck dispatch.)
 */
export async function readStuckRuns(
  warnCutoffIso: string,
  nowIso: string,
): Promise<StuckRunsSignal> {
  const supabase = getServiceRoleClient("ops health: read stuck runs");
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("started_at")
    .eq("status", "running")
    .is("finished_at", null)
    .lt("started_at", warnCutoffIso)
    .order("started_at", { ascending: true })
    .limit(STUCK_RUN_SCAN_LIMIT);
  if (error) throw new Error(`opsHealthReaders.readStuckRuns failed: ${error.message}`);

  const rows = (data ?? []) as StuckRunRow[];
  if (rows.length === 0) return { count: 0, oldestAgeMinutes: null };
  const nowMs = Date.parse(nowIso);
  const oldestMs = Date.parse(rows[0]!.started_at);
  return {
    count: rows.length,
    oldestAgeMinutes: Math.max(0, Math.round((nowMs - oldestMs) / 60_000)),
  };
}

interface RunStepsRow {
  workflow_id: string;
  steps: ReadonlyArray<{ nodeId?: unknown; status?: unknown }> | null;
}

interface WorkflowDefRow {
  id: string;
  draft_definition: unknown;
}

/** Build nodeId→provider from a stored draft_definition jsonb (defensive parse). */
function nodeProviderMap(def: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const nodes = (def as { nodes?: unknown })?.nodes;
  if (!Array.isArray(nodes)) return map;
  for (const n of nodes) {
    const id = (n as { id?: unknown })?.id;
    const provider = (n as { provider?: unknown })?.provider;
    if (typeof id === "string" && typeof provider === "string" && provider.length > 0) {
      map.set(id, provider);
    }
  }
  return map;
}

/**
 * Aggregate action-step attempts/failures by provider over the window. Provider
 * attribution maps a step's `nodeId` to its node `provider` via the workflow's
 * current definition (node ids + providers are stable; an approximation across
 * edits, documented). Steps with status `skipped` or an unresolvable provider
 * are ignored. Returns one entry per provider that had attempts.
 */
export async function aggregateProviderActionFailures(
  windowCutoffIso: string,
): Promise<ProviderFailureSignal[]> {
  const supabase = getServiceRoleClient("ops health: aggregate provider failures");
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("workflow_id, steps")
    .gte("created_at", windowCutoffIso)
    .order("created_at", { ascending: false })
    .limit(PROVIDER_FAIL_RUN_LIMIT);
  if (error) {
    throw new Error(`opsHealthReaders.aggregateProviderActionFailures failed: ${error.message}`);
  }
  const runs = (data ?? []) as RunStepsRow[];
  if (runs.length === 0) return [];

  const workflowIds = [...new Set(runs.map((r) => r.workflow_id))];
  const defs = await supabase
    .from("workflows")
    .select("id, draft_definition")
    .in("id", workflowIds);
  if (defs.error) {
    throw new Error(`opsHealthReaders.aggregateProviderActionFailures (defs) failed: ${defs.error.message}`);
  }
  const providerByWorkflowNode = new Map<string, Map<string, string>>();
  for (const row of (defs.data ?? []) as WorkflowDefRow[]) {
    providerByWorkflowNode.set(row.id, nodeProviderMap(row.draft_definition));
  }

  const attempts = new Map<string, number>();
  const failures = new Map<string, number>();
  for (const run of runs) {
    const nodeMap = providerByWorkflowNode.get(run.workflow_id);
    if (!nodeMap || !Array.isArray(run.steps)) continue;
    for (const step of run.steps) {
      const status = step?.status;
      if (status !== "succeeded" && status !== "failed") continue;
      const nodeId = step?.nodeId;
      if (typeof nodeId !== "string") continue;
      const provider = nodeMap.get(nodeId);
      if (!provider) continue;
      attempts.set(provider, (attempts.get(provider) ?? 0) + 1);
      if (status === "failed") failures.set(provider, (failures.get(provider) ?? 0) + 1);
    }
  }

  return [...attempts.entries()].map(([provider, attemptCount]) => ({
    provider,
    attempts: attemptCount,
    failures: failures.get(provider) ?? 0,
  }));
}

interface IntegrationProviderRow {
  provider: string;
}

/**
 * Count distinct integrations that newly entered needs-reconnect within the
 * window, grouped by provider. A provider-wide spike (≥ threshold) distinguishes
 * an outage from a single user reconnect. Safe: provider keys + counts only.
 */
export async function readOAuthRefreshFailuresByProvider(
  windowCutoffIso: string,
): Promise<OAuthRefreshFailureSignal[]> {
  const supabase = getServiceRoleClient("ops health: read oauth refresh failures");
  const { data, error } = await supabase
    .from("integrations")
    .select("provider")
    .gte("needs_reconnect_at", windowCutoffIso);
  if (error) {
    throw new Error(`opsHealthReaders.readOAuthRefreshFailuresByProvider failed: ${error.message}`);
  }
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as IntegrationProviderRow[]) {
    counts.set(row.provider, (counts.get(row.provider) ?? 0) + 1);
  }
  return [...counts.entries()].map(([provider, affectedCount]) => ({ provider, affectedCount }));
}

interface QueuedRunRow {
  created_at: string;
}

/**
 * Durable-queue backlog — reads the REAL queue depth (`status='queued'` count +
 * oldest-queued age) by default. No feature flag: once the durable-queue migration
 * exists the `'queued'` enum is valid and this just works. If the migration is NOT
 * applied (or the DB read otherwise fails) the query THROWS — the evaluator's
 * per-reader catch then reports the category `unmonitored` (never a depth:0 green).
 * `monitored:true` here means "the queue depth was read successfully".
 */
export async function readQueueBacklog(nowIso: string): Promise<QueueBacklogSignal> {
  const supabase = getServiceRoleClient("ops health: read queue backlog");
  const countRes = await supabase
    .from("workflow_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "queued");
  if (countRes.error) {
    throw new Error(`opsHealthReaders.readQueueBacklog (count) failed: ${countRes.error.message}`);
  }
  const oldestRes = await supabase
    .from("workflow_runs")
    .select("created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);
  if (oldestRes.error) {
    throw new Error(`opsHealthReaders.readQueueBacklog (oldest) failed: ${oldestRes.error.message}`);
  }
  const oldest = (oldestRes.data ?? [])[0] as QueuedRunRow | undefined;
  const oldestAgeMinutes = oldest
    ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(oldest.created_at)) / 60_000))
    : null;
  return { monitored: true, depth: countRes.count ?? 0, oldestAgeMinutes };
}
