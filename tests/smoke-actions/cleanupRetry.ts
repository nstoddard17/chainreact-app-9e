/**
 * Write smoke harness — bounded cleanup retry for create→delete propagation lag.
 *
 * SMOKE-ONLY, CLEANUP-PHASE-ONLY. This NEVER changes a production action: it wraps
 * the harness's cleanup-step dispatch so an intermittent provider eventual-consistency
 * window (a just-created resource not yet deletable) is absorbed by a small, bounded
 * retry instead of being reported as a leak.
 *
 * Scope is deliberately narrow — only `microsoft-onenote:delete_page` cleanup is
 * eligible (`cleanupRetryPolicyFor` returns null for everything else), so non-OneNote
 * cleanup keeps its exact single-attempt behavior. The OneNote operations endpoint
 * is eventually consistent: a page created seconds earlier can transiently fail to
 * delete (`404 not found` / a transient error) until the create has propagated.
 *
 * Two absorbed shapes, both bounded:
 *   - transient failure -> retry up to `maxAttempts`, short backoff, total wait CAPPED
 *     (no infinite polling); if the delete then succeeds the resource is "deleted".
 *   - `404 / not found` on a SMOKE-OWNED current-run target -> the page is already
 *     gone (the delete landed but a re-poll 404s, or it never propagated as a live
 *     resource), so it counts as "already_cleaned". Gated on `targetIsSmokeOwned`:
 *     a 404 is only ever read as cleaned for an id THIS run created (the orchestrator
 *     only ever calls this with ledger-owned ids), never a foreign/literal id.
 *
 * What it does NOT do (by contract):
 *   - It does not mask a verification failure (this is cleanup only — verify ran first).
 *   - It does not mask a cleanup failure after the bounded retries are exhausted: a
 *     non-404 error that keeps failing returns `disposition: "failed"`, so the
 *     orchestrator still reports CLEANUP_FAILED and the gate fails (no false PASS).
 */
import type { StepRunOutcome } from "./writeHarness";

/** Bounded retry budget. Small attempts, short backoff, total wait CAPPED. */
export interface CleanupRetryPolicy {
  /** Total attempts INCLUDING the first (>= 1). */
  readonly maxAttempts: number;
  /** Base backoff between attempts, in ms. */
  readonly backoffMs: number;
  /** Hard cap on CUMULATIVE backoff sleep across the run, in ms. */
  readonly totalWaitCapMs: number;
}

/**
 * OneNote page-delete cleanup budget: 4 attempts, 750ms backoff, 3s total cap.
 * Worst case = 3 backoffs (2250ms) under the 3000ms cap, then a final attempt — a
 * few seconds absorbs the observed lag without ever polling unbounded.
 */
export const ONENOTE_PAGE_DELETE_RETRY: CleanupRetryPolicy = {
  maxAttempts: 4,
  backoffMs: 750,
  totalWaitCapMs: 3000,
};

/**
 * The retry policy for a cleanup step, or null when the step is NOT eligible (its
 * cleanup keeps the exact single-attempt, no-404-special-casing behavior). Only
 * `microsoft-onenote:delete_page` is eligible — the one provider/action with a
 * known create→delete propagation-lag window in the smoke environment.
 */
export function cleanupRetryPolicyFor(
  provider: string,
  action: string,
): CleanupRetryPolicy | null {
  if (provider === "microsoft-onenote" && action === "delete_page") {
    return ONENOTE_PAGE_DELETE_RETRY;
  }
  return null;
}

/**
 * Is a (sanitized) cleanup failure reason a "not found" / 404? The harness reason is
 * a humanized title or engine code, so match the stable not-found shapes Graph /
 * the engine surface (`404`, "not found", "does not exist", "itemNotFound",
 * "ResourceNotFound", "resource ID does not exist").
 */
export function isNotFoundReason(reason: string | null): boolean {
  if (reason === null) return false;
  return /\b404\b|not[\s_-]?found|does not exist|itemNotFound|ResourceNotFound|resource ID does not exist/i.test(
    reason,
  );
}

/** What became of a single cleanup target after the (bounded) attempt(s). */
export type CleanupDisposition = "deleted" | "already_cleaned" | "failed";

export interface CleanupStepOutcome {
  /** true for "deleted" OR "already_cleaned" (the resource is gone either way). */
  readonly ok: boolean;
  readonly disposition: CleanupDisposition;
  /** Sanitized reason on failure; null on success. */
  readonly reason: string | null;
  /** How many provider attempts ran (>= 1, <= policy.maxAttempts). */
  readonly attempts: number;
  /** Cumulative backoff slept across the run, in ms (0 when no retry happened). */
  readonly waitedMs: number;
}

/**
 * Run ONE cleanup-step dispatch with a bounded retry / 404-already-cleaned path.
 *
 * `policy === null` -> exactly ONE attempt, NO 404 special-casing (unchanged
 * single-attempt cleanup for every non-eligible step). With a policy, a transient
 * (non-404) failure retries within the attempt + total-wait bounds, and a 404 on a
 * smoke-owned target short-circuits to "already_cleaned". Never throws — every
 * outcome is structured. Pure over the injected `runActionStep` + `sleep` seams.
 */
export async function runCleanupStepWithRetry(args: {
  readonly provider: string;
  readonly action: string;
  readonly config: Readonly<Record<string, unknown>>;
  /** Whether the cleanup target id was created by THIS run (ledger-owned). */
  readonly targetIsSmokeOwned: boolean;
  readonly runActionStep: (input: {
    readonly provider: string;
    readonly action: string;
    readonly config: Readonly<Record<string, unknown>>;
  }) => Promise<StepRunOutcome>;
  readonly sleep: (ms: number) => Promise<void>;
  /** null -> single attempt, no 404 path (non-eligible step). */
  readonly policy: CleanupRetryPolicy | null;
}): Promise<CleanupStepOutcome> {
  const { provider, action, config, targetIsSmokeOwned, runActionStep, sleep, policy } = args;
  const maxAttempts = policy ? Math.max(1, policy.maxAttempts) : 1;

  let waitedMs = 0;
  let lastReason: string | null = null;
  let attemptsRun = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsRun = attempt;
    const res = await runActionStep({ provider, action, config });
    if (res.ok) {
      return { ok: true, disposition: "deleted", reason: null, attempts: attempt, waitedMs };
    }
    lastReason = res.reason;

    // 404 on a smoke-owned current-run target -> already gone (idempotent delete).
    // Gated on a policy being present, so non-eligible steps never get this path.
    if (policy && targetIsSmokeOwned && isNotFoundReason(res.reason)) {
      return { ok: true, disposition: "already_cleaned", reason: null, attempts: attempt, waitedMs };
    }

    // Transient failure -> retry within bounds. Stop on the last attempt, when there
    // is no policy, or once the cumulative-wait cap leaves no room for another backoff.
    if (!policy || attempt >= maxAttempts) break;
    const backoff = Math.min(policy.backoffMs, policy.totalWaitCapMs - waitedMs);
    if (backoff <= 0) break;
    await sleep(backoff);
    waitedMs += backoff;
  }

  return { ok: false, disposition: "failed", reason: lastReason, attempts: attemptsRun, waitedMs };
}
