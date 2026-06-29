/**
 * @jest-environment node
 *
 * Tests for services/execution/staleQueuedRunSweep — the queued-age finalizer.
 *
 * Business rule: a run still 'queued' past the cutoff (processor never claimed it)
 * is finalized 'failed' with a humanized error, so a wedged worker never leaves
 * runs hanging 'queued' forever. The service builds the cutoff from the clock and
 * delegates the race-safe UPDATE to the repo.
 */
const mockRepoSweep = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  sweepStaleQueuedWorkflowRuns: (...a: unknown[]) => mockRepoSweep(...a),
}));
jest.mock("@/core/errors/humanizeActionError", () => ({
  humanizeActionError: jest.fn(() => ({ title: "Run interrupted", description: "d", severity: "error" })),
}));

import {
  sweepStaleQueuedWorkflowRuns,
  STALE_QUEUED_RUN_DEFAULT_AGE_MS,
  STALE_QUEUED_RUN_FAILURE_CODE,
} from "@/services/execution/staleQueuedRunSweep";

beforeEach(() => {
  mockRepoSweep.mockReset();
  // The real repo echoes the input cutoff back; mirror that so the service's
  // returned cutoff reflects the computed value.
  mockRepoSweep.mockImplementation(async (...a: unknown[]) => ({
    sweptCount: 2,
    runIds: ["r1", "r2"],
    cutoff: (a[0] as { cutoff: string }).cutoff,
  }));
});

describe("sweepStaleQueuedWorkflowRuns", () => {
  it("computes the cutoff from now - olderThanMs and finalizes with EXECUTION_INTERRUPTED", async () => {
    const now = new Date("2026-06-29T12:00:00.000Z");
    const olderThanMs = STALE_QUEUED_RUN_DEFAULT_AGE_MS; // 30 min
    const result = await sweepStaleQueuedWorkflowRuns({ now, olderThanMs });

    const call = mockRepoSweep.mock.calls[0]![0] as {
      cutoff: string;
      finishedAt: string;
      fatalError: { code: string; message: string };
    };
    expect(call.cutoff).toBe("2026-06-29T11:30:00.000Z"); // 30 min before now
    expect(call.finishedAt).toBe("2026-06-29T12:00:00.000Z");
    expect(call.fatalError.code).toBe(STALE_QUEUED_RUN_FAILURE_CODE); // EXECUTION_INTERRUPTED
    expect(call.fatalError.message).toMatch(/queued/i);
    expect(result).toEqual({
      sweptCount: 2,
      runIds: ["r1", "r2"],
      cutoff: "2026-06-29T11:30:00.000Z",
      olderThanMs,
    });
  });

  it("forwards an explicit batch limit to the repo", async () => {
    await sweepStaleQueuedWorkflowRuns({ now: new Date("2026-06-29T12:00:00.000Z"), limit: 50 });
    expect(mockRepoSweep.mock.calls[0]![0]).toEqual(expect.objectContaining({ limit: 50 }));
  });
});
