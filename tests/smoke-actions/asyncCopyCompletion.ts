/**
 * Pure, bounded poller for an asynchronous provider "operation monitor" — modelled
 * on the Microsoft Graph `/copy` async lifecycle.
 *
 * WHY THIS IS SMOKE-ONLY (and NOT in the production handler): the production
 * `copy_item` action returns `{ status: "pending", monitorUrl }` and deliberately
 * does NOT poll (Slice 8 V1-rot fix — long waits exceed serverless timeouts, and
 * the action's contract is "initiate the copy + surface the monitor URL", which it
 * does honestly). The write-smoke harness, however, needs the COMPLETED copy's id
 * to verify it landed and to clean it up, so it polls the monitor URL to terminal
 * completion HERE — never in the shipped action.
 *
 * The Graph async copy lifecycle this models:
 *   1. POST /me/drive/items/{id}/copy            -> 202 Accepted + a monitor URL
 *                                                    in the `Location` header.
 *   2. GET <monitorUrl> (unauthenticated status) -> 200 with an AsyncJobStatus:
 *        { status: "inProgress" | "completed" | "failed" | ..., resourceId?,
 *          percentageComplete? }  (or a terminal redirect to the new DriveItem).
 *   3. On `status: "completed"`, `resourceId` IS the copied item's DriveItem id —
 *      a reliable, deterministic identifier (no marker-discovery needed).
 *
 * Everything time/IO-related is injected (the single status fetch, the clock, the
 * sleep) so the loop unit-tests fully without a network or real timers. The real
 * Graph wiring lives in `writeHarnessDeps/copyMonitor.ts`.
 */

/** A single normalized read of the operation monitor. */
export interface AsyncOperationStatus {
  /** Graph AsyncJobStatus.status — e.g. "notStarted"|"inProgress"|"completed"|"failed". */
  readonly status: string | null;
  /** The completed resource's id (Graph `resourceId`), present on terminal success. */
  readonly resourceId: string | null;
  readonly percentageComplete?: number | null;
}

/** Bounded polling budget: attempts AND total wall-clock, plus capped backoff. */
export interface PollBudget {
  readonly maxAttempts: number;
  readonly baseIntervalMs: number;
  readonly maxIntervalMs: number;
  readonly totalTimeoutMs: number;
}

/**
 * Default budget for a OneDrive smoke copy of a tiny (~few-byte) file: completes in
 * well under a second in practice, but bounded generously so a slow drive still
 * terminates deterministically (never an unbounded loop).
 */
export const DEFAULT_COPY_POLL_BUDGET: PollBudget = {
  maxAttempts: 20,
  baseIntervalMs: 500,
  maxIntervalMs: 4000,
  totalTimeoutMs: 30000,
};

export type PollOutcome =
  | { readonly ok: true; readonly resourceId: string }
  | { readonly ok: false; readonly reason: string };

/** Graph terminal-FAILURE statuses (case-insensitive). */
const TERMINAL_FAILURE = new Set(["failed", "cancelled", "canceled", "deletefailed"]);
/** Graph terminal-SUCCESS status. */
const TERMINAL_SUCCESS = "completed";

/** Classify a raw monitor status into success / failure / still-pending. Pure. */
export function classifyStatus(s: string | null): "success" | "failure" | "pending" {
  if (!s) return "pending";
  const v = s.trim().toLowerCase();
  if (v === TERMINAL_SUCCESS) return "success";
  if (TERMINAL_FAILURE.has(v)) return "failure";
  return "pending";
}

/** Capped exponential backoff for a 0-based attempt index. Pure. */
export function backoffMs(attempt: number, budget: PollBudget): number {
  const ms = budget.baseIntervalMs * 2 ** attempt;
  return Math.min(ms, budget.maxIntervalMs);
}

/**
 * Extract a DriveItem id from a `resourceLocation` / redirect URL of the shape
 * `.../items/{id}` (terminal completion can surface as a redirect to the new item
 * rather than an AsyncJobStatus body). Returns null when the URL has no `/items/{id}`
 * segment. Pure.
 */
export function extractItemIdFromResourceUrl(url: string): string | null {
  const m = url.match(/\/items\/([^/?#]+)/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

export interface PollDeps {
  /**
   * One bounded read of the monitor URL, normalized to an `AsyncOperationStatus`.
   * MAY throw (a transient network / 5xx blip) — the poller treats a throw as
   * retryable within the budget, never a terminal failure.
   */
  readonly fetchStatus: () => Promise<AsyncOperationStatus>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}

/**
 * Poll an async operation monitor to terminal completion within a bounded budget.
 * Never throws — every exit is a structured `PollOutcome`:
 *   - terminal SUCCESS with a non-empty `resourceId`  -> { ok:true, resourceId }.
 *   - terminal SUCCESS but NO `resourceId`            -> { ok:false, ... } (honest:
 *       a "completed" with no id can't be verified/cleaned, so never a pass).
 *   - terminal FAILURE status                          -> { ok:false, ... }.
 *   - budget exhausted (attempts OR total timeout)     -> { ok:false, ... }.
 * A transient fetch throw or an unrecognized/missing status is treated as
 * still-pending: back off and retry until the budget is spent.
 */
export async function pollAsyncCopyCompletion(
  budget: PollBudget,
  deps: PollDeps,
): Promise<PollOutcome> {
  const start = deps.now();
  let lastReason = "async copy did not complete within the polling budget";

  for (let attempt = 0; attempt < budget.maxAttempts; attempt++) {
    if (deps.now() - start >= budget.totalTimeoutMs) {
      return { ok: false, reason: "async copy polling timed out" };
    }

    let st: AsyncOperationStatus | null = null;
    try {
      st = await deps.fetchStatus();
    } catch (err) {
      // Transient — record and retry within the budget (never a terminal verdict).
      lastReason = `async copy monitor read failed: ${(err as Error).message}`;
      st = null;
    }

    if (st) {
      const cls = classifyStatus(st.status);
      if (cls === "success") {
        if (st.resourceId && st.resourceId.length > 0) {
          return { ok: true, resourceId: st.resourceId };
        }
        return { ok: false, reason: "async copy completed but returned no resourceId" };
      }
      if (cls === "failure") {
        return { ok: false, reason: `async copy reported terminal failure (${st.status})` };
      }
      // pending -> back off below
    }

    // Respect the total timeout before sleeping; never overshoot it.
    const remaining = budget.totalTimeoutMs - (deps.now() - start);
    if (remaining <= 0) return { ok: false, reason: "async copy polling timed out" };
    await deps.sleep(Math.min(backoffMs(attempt, budget), remaining));
  }

  return { ok: false, reason: lastReason };
}

/**
 * Operation-host suffixes a Graph-issued `/copy` monitor URL may legitimately use,
 * BEYOND the exact configured Graph base host. The PRIMARY trust property is
 * PROVENANCE — the monitor URL flows from Graph's own authenticated 202 `Location`
 * header on the copy WE issued, never from user input. This narrow allow list is the
 * defense-in-depth backstop so the poller never fetches an off-Microsoft URL even in
 * a tampering scenario. HTTPS only. Each entry must be justified by the LIVE response
 * or Microsoft's copy-monitor contract — NOT a broad `*.microsoft.com` / `*.live.com`
 * grant (those were removed; add a suffix only with concrete evidence it is used):
 *   - `.svc.ms`         — OBSERVED LIVE: consumer OneDrive `/copy` monitor host.
 *   - `.sharepoint.com` — OneDrive for Business: the async copy monitor lives on the
 *                         tenant's SharePoint host (Microsoft copy-operation contract).
 */
const TRUSTED_MS_OPERATION_HOST_SUFFIXES: readonly string[] = [
  ".svc.ms",
  ".sharepoint.com",
];

/**
 * Trust gate for a monitor URL: never fetch an arbitrary URL. Accepts EITHER the
 * exact configured Graph base host+scheme (production `graph.microsoft.com`, or the
 * http e2e mock host when `MICROSOFT_GRAPH_API_BASE` overrides it) OR an HTTPS URL on
 * one of the narrow, evidence-justified operation hosts
 * (`TRUSTED_MS_OPERATION_HOST_SUFFIXES`) — because Graph issues real `/copy` monitor
 * URLs on its operation infra, not the Graph API host. Pure.
 */
export function isTrustedGraphMonitorUrl(rawUrl: string, graphBase: string): boolean {
  let u: URL;
  let base: URL;
  try {
    u = new URL(rawUrl);
    base = new URL(graphBase);
  } catch {
    return false;
  }
  // Exact Graph base host+scheme (production graph.microsoft.com OR the e2e mock).
  if (u.protocol === base.protocol && u.host === base.host) return true;
  // Otherwise: HTTPS + a narrow, evidence-justified Microsoft operation host.
  if (u.protocol !== "https:") return false;
  const host = u.host.toLowerCase();
  return TRUSTED_MS_OPERATION_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

/** The host of a monitor URL (a public Microsoft domain — safe to surface), or "unparseable". */
export function monitorUrlHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "unparseable";
  }
}
