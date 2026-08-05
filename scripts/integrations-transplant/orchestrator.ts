/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — transplant orchestration.
 *
 * Pure orchestration over injected ports (source reader, destination store,
 * crypto, probes, provider registry facts). The safety sequence:
 *
 *   plan (plan.ts)  — resolve + validate selection, classify, detect conflicts
 *   dry-run         — plan → redacted report + fingerprint; ZERO writes,
 *                     ZERO decryption, ZERO provider calls
 *   apply           — plan again, require the dry-run fingerprint to match,
 *                     refuse while ANY item is refused/conflicted, then per
 *                     item (applyItem.ts): decrypt (source key, memory only)
 *                     → read-only identity probe → re-encrypt (dest key) →
 *                     canonical upsert → reread through the normal execution
 *                     path + runtime decrypt → rollback on any failure.
 *                     Fail-fast: the first failure aborts the run.
 *
 * Reports, logs, and thrown errors carry typed codes + redacted labels only,
 * and every report is scanned against the run's observed secrets before
 * serialization (report.ts).
 */
import { applyOne } from "./applyItem";
import {
  buildPlan,
  countStatuses,
  toReportItem,
  type PlanItem,
} from "./plan";
import { serializeReport } from "./report";
import {
  TransplantRefusalError,
  type OrchestratorDeps,
  type TransplantConfig,
  type TransplantItemReport,
  type TransplantReport,
} from "./types";

export { buildPlan } from "./plan";
export type { OrchestratorDeps } from "./types";

function baseReport(
  config: TransplantConfig,
  operationId: string,
  mode: TransplantReport["mode"],
  fingerprint: string,
  items: TransplantItemReport[],
): TransplantReport {
  return {
    operationId,
    mode,
    fingerprint,
    sourceProjectRef: config.sourceProjectRef,
    destProjectRef: config.destProjectRef,
    sourceAccountId: config.sourceAccountId,
    destAccountId: config.destAccountId,
    destConnectedByUserId: config.destConnectedByUserId,
    conflictStrategy: config.conflictStrategy,
    verificationMode: config.verificationMode,
    items,
    counts: countStatuses(items),
  };
}

// ─── Dry-run ─────────────────────────────────────────────────────────────────

export async function runDryRun(
  deps: OrchestratorDeps,
  config: TransplantConfig,
  operationId: string,
): Promise<{ report: TransplantReport; serialized: string }> {
  const plan = await buildPlan(deps, config);
  const items = plan.items.map(toReportItem);
  const report = baseReport(config, operationId, "dry-run", plan.fingerprint, items);
  // Dry-run never decrypts; the ciphertexts + raw labels it saw are still
  // scanned out of the artifact.
  const sensitive = plan.items.flatMap((i) => [
    i.row.access_token_encrypted,
    i.row.refresh_token_encrypted,
    i.row.extra_credentials_encrypted,
    i.row.provider_account_id,
    i.row.display_name,
  ]);
  return { report, serialized: serializeReport(report, sensitive) };
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export async function runApply(
  deps: OrchestratorDeps,
  config: TransplantConfig,
  operationId: string,
  approvedDryRunFingerprint: string,
): Promise<{ report: TransplantReport; serialized: string }> {
  const plan = await buildPlan(deps, config);

  if (plan.fingerprint !== approvedDryRunFingerprint) {
    throw new TransplantRefusalError(
      "dry_run_fingerprint_mismatch",
      "the current plan does not match the approved dry-run (source rows, conflicts, or config changed). Re-run --dry-run and review it again.",
    );
  }

  const blocking = plan.items.filter(
    (i) => i.intendedAction === "refuse" || i.status === "conflict",
  );
  if (blocking.length > 0) {
    throw new TransplantRefusalError(
      "unresolved_conflicts",
      `${blocking.length} selected integration(s) are refused/conflicted in the plan; resolve or deselect them before apply.`,
    );
  }

  const sensitive: string[] = [];
  const items: TransplantItemReport[] = [];
  let aborted = false;

  for (const item of plan.items) {
    const reportItem = toReportItem(item);
    if (item.intendedAction === "skip") {
      items.push(reportItem);
      continue;
    }
    if (aborted) {
      items.push({ ...reportItem, status: "skipped", reason: "aborted_after_earlier_failure" });
      continue;
    }
    const started = deps.now();
    const outcome = await applyOne(deps, config, item, sensitive);
    items.push({
      ...reportItem,
      status: outcome.status,
      reason: outcome.reason,
      destinationIntegrationId: outcome.destinationIntegrationId,
      sourceUnchanged: outcome.sourceUnchanged,
      elapsedMs: deps.now() - started,
    });
    deps.log(`${itemLabel(item)}: ${outcome.status}${outcome.failed ? " — aborting (fail-fast)" : ""}`);
    if (outcome.failed) aborted = true;
  }

  const report = baseReport(config, operationId, "apply", plan.fingerprint, items);

  // Also scan raw labels/ids out of the serialized artifact.
  for (const i of plan.items) {
    sensitive.push(i.row.provider_account_id);
    if (i.row.display_name) sensitive.push(i.row.display_name);
  }
  const serialized = serializeReport(report, sensitive);
  sensitive.length = 0;
  return { report, serialized };
}

function itemLabel(item: PlanItem): string {
  return `${item.row.provider} ${item.row.id.slice(0, 8)}…`;
}
