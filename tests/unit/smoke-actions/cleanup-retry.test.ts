/**
 * @jest-environment node
 *
 * Write smoke harness — bounded cleanup retry for create→delete propagation lag
 * (SMOKE-WRITE-35 unblock). Two layers:
 *   A. the pure `runCleanupStepWithRetry` helper (retry / 404-already-cleaned / bounds);
 *   B. the orchestrator wiring through `copy_page`'s `cleanupEach` (the retry fires only
 *      for `microsoft-onenote:delete_page`, never for a non-OneNote cleanup).
 *
 * Business rules protected:
 *   1. a delete that fails transiently then SUCCEEDS within the budget is "deleted",
 *   2. a `404 / not found` on a SMOKE-OWNED current-run target counts as "already_cleaned",
 *   3. a non-404 error that keeps failing is "failed" after the bounded retries (never
 *      masked — the gate still fails),
 *   4. a non-eligible (non-OneNote-delete) step keeps EXACTLY its single-attempt behavior,
 *   5. retries are BOUNDED (attempts <= maxAttempts, cumulative wait <= totalWaitCapMs).
 *
 * The injected `sleep` makes every retry instant and lets us assert the wait budget.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  ONEDRIVE_ITEM_DELETE_RETRY,
  ONENOTE_PAGE_DELETE_RETRY,
  cleanupRetryPolicyFor,
  isNotFoundReason,
  runCleanupStepWithRetry,
} from "@/tests/smoke-actions/cleanupRetry";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const ONENOTE = { provider: "microsoft-onenote", action: "delete_page" } as const;
const noSleep = async (): Promise<void> => {};

/** A `runActionStep` that returns a scripted outcome per call, recording every call. */
function scriptedStep(outcomes: readonly StepRunOutcome[]): {
  readonly run: WriteHarnessDeps["runActionStep"];
  readonly calls: { provider: string; action: string }[];
} {
  const calls: { provider: string; action: string }[] = [];
  let i = 0;
  return {
    calls,
    run: async (input) => {
      calls.push({ provider: input.provider, action: input.action });
      const out = outcomes[Math.min(i, outcomes.length - 1)]!;
      i += 1;
      return out;
    },
  };
}

// ─── A. policy selection + reason classification ──────────────────────────────

describe("cleanupRetryPolicyFor", () => {
  it("returns the OneNote budget for microsoft-onenote:delete_page", () => {
    expect(cleanupRetryPolicyFor("microsoft-onenote", "delete_page")).toBe(ONENOTE_PAGE_DELETE_RETRY);
  });

  it("returns the OneDrive budget for microsoft-onedrive:delete_item", () => {
    expect(cleanupRetryPolicyFor("microsoft-onedrive", "delete_item")).toBe(ONEDRIVE_ITEM_DELETE_RETRY);
  });

  it("returns null for every other provider/action (non-eligible -> single attempt)", () => {
    expect(cleanupRetryPolicyFor("microsoft-onenote", "update_page")).toBeNull();
    expect(cleanupRetryPolicyFor("airtable", "delete_record")).toBeNull();
    expect(cleanupRetryPolicyFor("google-drive", "delete_file")).toBeNull();
    expect(cleanupRetryPolicyFor("trello", "delete_page")).toBeNull();
    expect(cleanupRetryPolicyFor("microsoft-onedrive", "move_item")).toBeNull();
  });

  it("both budgets are small + bounded (sanity on the constants)", () => {
    for (const p of [ONENOTE_PAGE_DELETE_RETRY, ONEDRIVE_ITEM_DELETE_RETRY]) {
      expect(p.maxAttempts).toBeGreaterThanOrEqual(2);
      expect(p.maxAttempts).toBeLessThanOrEqual(5);
      expect(p.totalWaitCapMs).toBeLessThanOrEqual(6000);
    }
  });
});

describe("isNotFoundReason", () => {
  it.each([
    "404 not found",
    "onenote page 1-abc not found: The specified resource ID does not exist",
    "itemNotFound",
    "ResourceNotFound",
    "Page does not exist",
  ])("treats %s as not-found", (reason) => {
    expect(isNotFoundReason(reason)).toBe(true);
  });

  it.each([null, "rate limited", "500 internal server error", "request timed out"])(
    "does NOT treat %s as not-found",
    (reason) => {
      expect(isNotFoundReason(reason)).toBe(false);
    },
  );
});

// ─── A. runCleanupStepWithRetry ───────────────────────────────────────────────

describe("runCleanupStepWithRetry — eligible OneNote page delete", () => {
  it("rule 1: a delete that fails transiently then SUCCEEDS is 'deleted' (retried)", async () => {
    const { run, calls } = scriptedStep([
      { ok: false, output: null, reason: "request timed out" },
      { ok: false, output: null, reason: "500 internal server error" },
      { ok: true, output: { success: true }, reason: null },
    ]);
    const res = await runCleanupStepWithRetry({
      ...ONENOTE,
      config: { pageId: "p1" },
      targetIsSmokeOwned: true,
      runActionStep: run,
      sleep: noSleep,
      policy: ONENOTE_PAGE_DELETE_RETRY,
    });
    expect(res).toMatchObject({ ok: true, disposition: "deleted", attempts: 3 });
    expect(calls).toHaveLength(3);
  });

  it("rule 2: a 404 on a SMOKE-OWNED target counts as 'already_cleaned' (no further retry)", async () => {
    const { run, calls } = scriptedStep([
      { ok: false, output: null, reason: "onenote page p1 not found: resource ID does not exist" },
    ]);
    const res = await runCleanupStepWithRetry({
      ...ONENOTE,
      config: { pageId: "p1" },
      targetIsSmokeOwned: true,
      runActionStep: run,
      sleep: noSleep,
      policy: ONENOTE_PAGE_DELETE_RETRY,
    });
    expect(res).toMatchObject({ ok: true, disposition: "already_cleaned", attempts: 1 });
    expect(calls).toHaveLength(1); // short-circuits — does not burn the retry budget
  });

  it("a 404 on a NON-smoke-owned target is NOT masked (keeps retrying, then fails)", async () => {
    // Defensive: the orchestrator only ever passes smoke-owned ids, but the guard must
    // hold — a 404 we don't own is a transient failure, never a silent "already cleaned".
    const { run } = scriptedStep([{ ok: false, output: null, reason: "404 not found" }]);
    const res = await runCleanupStepWithRetry({
      ...ONENOTE,
      config: { pageId: "foreign" },
      targetIsSmokeOwned: false,
      runActionStep: run,
      sleep: noSleep,
      policy: ONENOTE_PAGE_DELETE_RETRY,
    });
    expect(res).toMatchObject({ ok: false, disposition: "failed" });
  });

  it("rule 3: a persistent NON-404 error FAILS after the bounded retries (never masked)", async () => {
    const { run, calls } = scriptedStep([{ ok: false, output: null, reason: "500 internal server error" }]);
    const res = await runCleanupStepWithRetry({
      ...ONENOTE,
      config: { pageId: "p1" },
      targetIsSmokeOwned: true,
      runActionStep: run,
      sleep: noSleep,
      policy: ONENOTE_PAGE_DELETE_RETRY,
    });
    expect(res.ok).toBe(false);
    expect(res.disposition).toBe("failed");
    expect(res.reason).toBe("500 internal server error");
    expect(calls).toHaveLength(ONENOTE_PAGE_DELETE_RETRY.maxAttempts);
  });

  it("rule 5: retries are BOUNDED — attempts <= maxAttempts AND cumulative wait <= cap", async () => {
    const slept: number[] = [];
    const { run, calls } = scriptedStep([{ ok: false, output: null, reason: "still lagging" }]);
    const res = await runCleanupStepWithRetry({
      ...ONENOTE,
      config: { pageId: "p1" },
      targetIsSmokeOwned: true,
      runActionStep: run,
      sleep: async (ms) => {
        slept.push(ms);
      },
      policy: ONENOTE_PAGE_DELETE_RETRY,
    });
    expect(calls.length).toBeLessThanOrEqual(ONENOTE_PAGE_DELETE_RETRY.maxAttempts);
    expect(res.attempts).toBe(ONENOTE_PAGE_DELETE_RETRY.maxAttempts);
    // One fewer sleep than attempts (no backoff after the final attempt).
    expect(slept).toHaveLength(ONENOTE_PAGE_DELETE_RETRY.maxAttempts - 1);
    const totalWait = slept.reduce((a, b) => a + b, 0);
    expect(totalWait).toBeLessThanOrEqual(ONENOTE_PAGE_DELETE_RETRY.totalWaitCapMs);
    expect(res.waitedMs).toBe(totalWait);
  });

  it("succeeds on the FIRST attempt with no sleep when there is no lag", async () => {
    const slept: number[] = [];
    const { run, calls } = scriptedStep([{ ok: true, output: { success: true }, reason: null }]);
    const res = await runCleanupStepWithRetry({
      ...ONENOTE,
      config: { pageId: "p1" },
      targetIsSmokeOwned: true,
      runActionStep: run,
      sleep: async (ms) => {
        slept.push(ms);
      },
      policy: ONENOTE_PAGE_DELETE_RETRY,
    });
    expect(res).toMatchObject({ ok: true, disposition: "deleted", attempts: 1, waitedMs: 0 });
    expect(calls).toHaveLength(1);
    expect(slept).toHaveLength(0);
  });
});

describe("runCleanupStepWithRetry — rule 4: non-eligible step unchanged (policy null)", () => {
  it("makes EXACTLY one attempt and never special-cases a 404", async () => {
    const { run, calls } = scriptedStep([{ ok: false, output: null, reason: "404 not found" }]);
    const res = await runCleanupStepWithRetry({
      provider: "airtable",
      action: "delete_record",
      config: { recordId: "r1" },
      targetIsSmokeOwned: true,
      runActionStep: run,
      sleep: noSleep,
      policy: null, // non-eligible -> single attempt, no 404 path
    });
    expect(res).toMatchObject({ ok: false, disposition: "failed", attempts: 1 });
    expect(calls).toHaveLength(1); // no retry, no 404-as-cleaned
  });

  it("a single ok attempt is 'deleted'", async () => {
    const { run, calls } = scriptedStep([{ ok: true, output: null, reason: null }]);
    const res = await runCleanupStepWithRetry({
      provider: "airtable",
      action: "delete_record",
      config: { recordId: "r1" },
      targetIsSmokeOwned: true,
      runActionStep: run,
      sleep: noSleep,
      policy: null,
    });
    expect(res).toMatchObject({ ok: true, disposition: "deleted", attempts: 1 });
    expect(calls).toHaveLength(1);
  });
});

// ─── B. orchestrator wiring through copy_page cleanupEach ──────────────────────

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const env = (n: string) =>
  n === "SMOKE_ONENOTE_SECTION_ID" ? "sec-smoke" : n === "SMOKE_ONENOTE_NOTEBOOK_ID" ? "nb-smoke" : undefined;

const copyPageFixture = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "microsoft-onenote:copy_page")!;

/**
 * Deps that drive copy_page to the cleanup phase with both pages captured (source +
 * copy), then play a per-delete-call script so cleanup behavior can be asserted.
 */
function copyPageDeps(deleteOutcomes: readonly StepRunOutcome[]): {
  readonly deps: WriteHarnessDeps;
  readonly deleteCalls: number;
} {
  let di = 0;
  const counter = { deleteCalls: 0 };
  const deps: WriteHarnessDeps = {
    async runActionStep(input) {
      if (input.action === "create_page") {
        return { ok: true, output: { id: "src-1", title: `${MARKER}page` }, reason: null };
      }
      if (input.action === "copy_page") {
        return { ok: true, output: { operationLocation: "https://graph.microsoft.com/v1.0/me/onenote/operations/op1" }, reason: null };
      }
      if (input.action === "delete_page") {
        counter.deleteCalls += 1;
        const out = deleteOutcomes[Math.min(di, deleteOutcomes.length - 1)]!;
        di += 1;
        return out;
      }
      if (input.action === "get_page_content") {
        // verify read-back of the COPY's title (engine path, not smokeRead).
        return { ok: true, output: { title: `${MARKER}page` }, reason: null };
      }
      return { ok: true, output: null, reason: null };
    },
    async smokeReadBack(input) {
      if (input.action === "copy_monitor") {
        // Async completion -> capture the copied page id "copy-1" into the ledger.
        return { ok: true, output: { pageId: "copy-1" }, reason: null };
      }
      return { ok: false, output: null, reason: "no reader" };
    },
  };
  return { deps, get deleteCalls() { return counter.deleteCalls; } };
}

describe("copy_page orchestration: cleanupEach retry wiring", () => {
  it("PASS_CLEANED when a lagging delete recovers on retry (created 2 / cleaned 2 / 0 leaked)", async () => {
    // Flat per-delete-call script across BOTH ledger pages (source first, then copy):
    // source lags transiently once then succeeds; copy succeeds first try.
    const result = copyPageDeps([
      { ok: false, output: null, reason: "request timed out" }, // source attempt 1 (transient)
      { ok: true, output: { success: true }, reason: null }, // source attempt 2 (recovers)
      { ok: true, output: { success: true }, reason: null }, // copy attempt 1
    ]);
    const res = await runWriteSmoke(copyPageFixture(), { ...RUN, envLookup: env, sleep: noSleep }, result.deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger).toMatchObject({ created: 2, cleaned: 2, leaked: 0 });
  });

  it("a 404 on a smoke-owned page counts as already-cleaned -> 0 leaked", async () => {
    // Source delete 404s (already gone) -> already_cleaned (no retry burned); copy succeeds.
    const result = copyPageDeps([
      { ok: false, output: null, reason: "onenote page not found: resource ID does not exist" },
      { ok: true, output: { success: true }, reason: null }, // copy
    ]);
    const res = await runWriteSmoke(copyPageFixture(), { ...RUN, envLookup: env, sleep: noSleep }, result.deps);
    expect(res.status).toBe("PASS");
    expect(res.ledger).toMatchObject({ created: 2, cleaned: 2, leaked: 0 });
    // Source short-circuited on the 404 (1 call), copy took 1 call -> 2 deletes total.
    expect(result.deleteCalls).toBe(2);
  });

  it("CLEANUP_FAILED (not masked) when a delete keeps failing with a non-404 after retries", async () => {
    const result = copyPageDeps([
      { ok: false, output: null, reason: "500 internal server error" }, // source: never recovers
    ]);
    const res = await runWriteSmoke(copyPageFixture(), { ...RUN, envLookup: env, sleep: noSleep }, result.deps);
    expect(res.status).toBe("CLEANUP_FAILED");
    expect(res.ledger.leaked).toBeGreaterThan(0);
    // The source delete burned its full retry budget before failing.
    expect(result.deleteCalls).toBeGreaterThanOrEqual(ONENOTE_PAGE_DELETE_RETRY.maxAttempts);
  });
});
