/**
 * Trigger-smoke — certification seed (durable, version-controlled).
 *
 * The trigger-side analog of the action certification seed. Records which
 * registered triggers have passed a REAL dispatch-path live smoke. Kept minimal
 * and dependency-free on purpose: a typed record + a small seed array. Later
 * polling / webhook trigger smokes append rows in the SAME shape (so a future
 * trigger-matrix CLI can read this directly), but we do NOT build that CLI yet.
 *
 * SAFETY — committed artifact, SAFE FACTS ONLY: trigger key, activation, a status
 * enum, an optional ISO date, and a SHORT sanitized note. NEVER secrets, ids,
 * payloads, or PII.
 *
 * Status semantics:
 *   - LIVE_PASS        — fired through its REAL dispatch path to a verifiable
 *                        terminal run (the only true certification).
 *   - RUN_NOW_PROVEN   — exercised end-to-end ONLY via the manual run-now path
 *                        (enqueueRun), which bypasses dispatchTriggerEvent. An
 *                        honest, weaker status than LIVE_PASS — NOT a dispatch
 *                        cert. Used for native:manual.run.
 *   - NOT_RUN          — a harness/fixture exists but no real pass recorded yet.
 *   - MISSING_HARNESS  — no trigger-smoke harness for this trigger's lane yet.
 */

export type TriggerActivationMode = "webhook" | "polling" | "manual" | "scheduled";

export type TriggerCertStatus =
  | "LIVE_PASS"
  | "RUN_NOW_PROVEN"
  | "NOT_RUN"
  | "MISSING_HARNESS";

export interface TriggerCertRecord {
  readonly provider: string;
  readonly type: string;
  readonly activation: TriggerActivationMode;
  readonly status: TriggerCertStatus;
  /** ISO date of the recorded pass (LIVE_PASS / RUN_NOW_PROVEN only). */
  readonly date?: string;
  readonly note: string;
}

export const TRIGGER_CERTIFICATIONS: readonly TriggerCertRecord[] = [
  // native:schedule.fired — LIVE-CERTIFIED via the scheduled-trigger smoke harness
  // (tests/trigger-smoke/scheduledSmoke.ts): real activation arms nextFireAt, a
  // tick BEFORE nextFireAt fires nothing (baseline-first), a tick AT nextFireAt
  // fires exactly one run through dispatchTriggerEvent, the durable-queue run
  // reaches terminal 'succeeded', then trigger_resources + workflow are cleaned up.
  // No provider, no external resource, no send. (Flip to LIVE_PASS only after the
  // gated dev integration test reports pass.)
  {
    provider: "native",
    type: "schedule.fired",
    activation: "scheduled",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real dispatch: arm→nextFireAt, before-tick fires 0 (baseline-first), at-tick fires exactly 1 via dispatchTriggerEvent, durable run terminal 'succeeded', resources cleaned (0 leaked); no provider/send",
  },
  // microsoft-excel:new_worksheet — Lane B polling beachhead. LIVE-certified via the
  // Excel polling smoke harness (tests/trigger-smoke/excelPollingSmoke.ts): a smoke
  // workbook is created, the real activation hook seeds the worksheet-name snapshot,
  // the FIRST per-trigger poll fires NOTHING from the pre-existing sheet
  // (baseline-first), a certified create_worksheet adds one sheet, the SECOND poll
  // fires exactly one run via the handler's enqueueRun whose trigger payload carries
  // the new worksheet name, the durable run reaches 'succeeded', then the whole
  // workbook is deleted (OneDrive recycle bin) — 0 leaked. (Flip to LIVE_PASS only
  // after the gated live run reports pass.)
  {
    provider: "microsoft-excel",
    type: "new_worksheet",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real polling dispatch: activation seeds worksheet snapshot, first poll fires 0 (baseline-first), a certified create_worksheet adds 1 sheet, the per-trigger poll fires exactly 1 run whose payload carries the new sheet name, durable run terminal 'succeeded', whole workbook deleted to OneDrive recycle bin (0 leaked)",
  },
  // native:manual.run — honestly classified, NOT a dispatch cert. It is exercised
  // end-to-end on every action workflow-live smoke, but via the run-now path
  // (enqueueRun), which deliberately bypasses dispatchTriggerEvent + trigger_resources.
  {
    provider: "native",
    type: "manual.run",
    activation: "manual",
    status: "RUN_NOW_PROVEN",
    date: "2026-06-29",
    note: "proven via the manual run-now path on every action workflow-live smoke; not a dispatch trigger",
  },
];
