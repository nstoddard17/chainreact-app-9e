/**
 * @jest-environment node
 *
 * Tests for services/execution/staleWorkflowRunSweep.ts (Slice 4.COST-15F).
 *
 * Mocks the repository sweep so these tests assert the service's contract:
 * cutoff math, default threshold, EXECUTION_INTERRUPTED failure payload (via the
 * REAL humanizeActionError), limit pass-through, and outcome shaping. The repo's
 * UPDATE/idempotency/billing-preservation is covered in workflowRuns.test.ts.
 */

const mockRepoSweep = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  sweepStaleRunningWorkflowRuns: (...args: unknown[]) => mockRepoSweep(...args),
}));

import {
  sweepStaleRunningWorkflowRuns,
  STALE_RUNNING_RUN_DEFAULT_AGE_MS,
  STALE_RUNNING_RUN_FAILURE_CODE,
} from "@/services/execution/staleWorkflowRunSweep";
import { failedRunCta } from "@/core/errors/failedRunCta";

const NOW = new Date("2026-05-25T02:00:00.000Z");

beforeEach(() => {
  mockRepoSweep.mockReset();
  // Echo the cutoff back so the service's outcome reflects what it computed.
  mockRepoSweep.mockImplementation(async (input: { cutoff: string }) => ({
    sweptCount: 0,
    runIds: [],
    cutoff: input.cutoff,
  }));
});

describe("staleWorkflowRunSweep.sweepStaleRunningWorkflowRuns", () => {
  it("computes cutoff = now − olderThanMs and delegates to the repo", async () => {
    await sweepStaleRunningWorkflowRuns({ olderThanMs: 30 * 60_000, now: NOW });
    expect(mockRepoSweep).toHaveBeenCalledTimes(1);
    const arg = mockRepoSweep.mock.calls[0]![0] as {
      cutoff: string;
      finishedAt: string;
    };
    expect(arg.cutoff).toBe(new Date(NOW.getTime() - 30 * 60_000).toISOString());
    expect(arg.finishedAt).toBe(NOW.toISOString());
  });

  it("defaults to the 60-minute staleness threshold", async () => {
    await sweepStaleRunningWorkflowRuns({ now: NOW });
    const arg = mockRepoSweep.mock.calls[0]![0] as { cutoff: string };
    expect(arg.cutoff).toBe(
      new Date(NOW.getTime() - STALE_RUNNING_RUN_DEFAULT_AGE_MS).toISOString(),
    );
  });

  it("stamps an EXECUTION_INTERRUPTED fatal + humanized classification", async () => {
    await sweepStaleRunningWorkflowRuns({ now: NOW });
    const arg = mockRepoSweep.mock.calls[0]![0] as {
      fatalError: { code: string; message: string };
      errorClassification: { title: string; severity: string; action?: string };
    };
    expect(arg.fatalError.code).toBe(STALE_RUNNING_RUN_FAILURE_CODE);
    expect(arg.fatalError.code).toBe("EXECUTION_INTERRUPTED");
    // Via the REAL core/errors humanizer.
    expect(arg.errorClassification.title).toBe("Run interrupted");
    expect(arg.errorClassification.severity).toBe("error");
    // TEST-SUITE-GREEN-1 — this asserted `action` was undefined, but the real
    // rule it was protecting is the COMMENT: a lifecycle sweep must not push a
    // BILLING CTA at the user. The humanizer deliberately classifies
    // EXECUTION_INTERRUPTED as `retry_later` (COST-15F / CR-FAILREASON-1:
    // re-running IS the right next step), and `retry_later` is guidance-only —
    // failedRunCta maps it to `href: null`, so it renders as text, never a link.
    // So the intent held all along and only the assertion was wrong. Pinning the
    // intent directly is stronger than `toBeUndefined()`, which would also have
    // accepted a future silent regression to no guidance at all.
    expect(arg.errorClassification.action).toBe("retry_later");
    expect(
      failedRunCta(arg.errorClassification.action as never, { workflowId: "wf-1" })?.href,
    ).toBeNull();
  });

  it("passes a batch limit through, and omits it when not provided", async () => {
    await sweepStaleRunningWorkflowRuns({ now: NOW, limit: 100 });
    expect((mockRepoSweep.mock.calls[0]![0] as { limit?: number }).limit).toBe(100);

    mockRepoSweep.mockClear();
    await sweepStaleRunningWorkflowRuns({ now: NOW });
    expect("limit" in (mockRepoSweep.mock.calls[0]![0] as object)).toBe(false);
  });

  it("returns the swept outcome (count + ids + cutoff + olderThanMs)", async () => {
    mockRepoSweep.mockResolvedValueOnce({
      sweptCount: 3,
      runIds: ["x", "y", "z"],
      cutoff: "2026-05-25T01:00:00.000Z",
    });
    const out = await sweepStaleRunningWorkflowRuns({ now: NOW });
    expect(out).toEqual({
      sweptCount: 3,
      runIds: ["x", "y", "z"],
      cutoff: "2026-05-25T01:00:00.000Z",
      olderThanMs: STALE_RUNNING_RUN_DEFAULT_AGE_MS,
    });
  });

  it("does not import or call any billing/reserve path (structural: only repo.sweep is invoked)", async () => {
    await sweepStaleRunningWorkflowRuns({ now: NOW });
    // The service's only dependency-with-effects is the repo sweep; it passes no
    // billing fields (the repo test asserts the UPDATE omits them).
    const arg = mockRepoSweep.mock.calls[0]![0] as Record<string, unknown>;
    for (const k of ["reserved", "reconciled", "billingStatus", "tasks"]) {
      expect(k in arg).toBe(false);
    }
  });
});
