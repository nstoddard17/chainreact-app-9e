/**
 * Tests for core/workflows/latestRunValues.ts.
 *
 * Pin: trigger alias mapping is strict; mismatched trigger node id
 * → no fabricated value under `"trigger"`; action steps land under
 * their nodeId; output-less steps omit themselves entirely.
 */
import {
  buildLatestValuesBySource,
  TRIGGER_SOURCE_ALIAS,
} from "@/core/workflows/latestRunValues";
import type { WorkflowRunDetail } from "@/contracts/workflow";

const triggerEvent = {
  provider: "native" as const,
  eventType: "manual.run",
  eventId: "ev1",
  occurredAt: "2026-05-17T00:00:00Z",
  accountId: "system",
  payload: { inputs: {} },
};

function makeDetail(overrides: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    workflowId: "33333333-3333-3333-3333-333333333333",
    status: "succeeded",
    triggerNodeId: "t1",
    startedAt: "2026-05-17T00:00:00Z",
    finishedAt: "2026-05-17T00:00:01Z",
    errorClassification: null,
    triggerEvent,
    steps: [
      { nodeId: "t1", status: "succeeded", output: { event: "fired" } },
      { nodeId: "a1", status: "succeeded", output: { sentTo: "C123" } },
    ],
    fatalError: null,
    ...overrides,
  };
}

describe("buildLatestValuesBySource", () => {
  it("null detail returns an empty map", () => {
    expect(
      buildLatestValuesBySource({ detail: null, currentTriggerNodeId: null }),
    ).toEqual({});
  });

  it("trigger step maps to the trigger alias when current graph trigger matches", () => {
    const out = buildLatestValuesBySource({
      detail: makeDetail(),
      currentTriggerNodeId: "t1",
    });
    expect(out[TRIGGER_SOURCE_ALIAS]).toEqual({ event: "fired" });
  });

  it("action step maps to its own nodeId", () => {
    const out = buildLatestValuesBySource({
      detail: makeDetail(),
      currentTriggerNodeId: "t1",
    });
    expect(out["a1"]).toEqual({ sentTo: "C123" });
  });

  it("trigger step is also keyed under its literal nodeId for direct references", () => {
    const out = buildLatestValuesBySource({
      detail: makeDetail(),
      currentTriggerNodeId: "t1",
    });
    expect(out["t1"]).toEqual({ event: "fired" });
  });

  it("trigger id mismatch → no fabricated value under the trigger alias", () => {
    const out = buildLatestValuesBySource({
      detail: makeDetail(), // run's trigger nodeId is "t1"
      currentTriggerNodeId: "t-new", // user deleted t1 and added a new trigger
    });
    expect(out).not.toHaveProperty(TRIGGER_SOURCE_ALIAS);
    // Action keys are unaffected.
    expect(out["a1"]).toEqual({ sentTo: "C123" });
    // The literal nodeId path still records the stale step (useful for
    // direct-reference workflows / agent inspection).
    expect(out["t1"]).toEqual({ event: "fired" });
  });

  it("null currentTriggerNodeId omits the alias regardless", () => {
    const out = buildLatestValuesBySource({
      detail: makeDetail(),
      currentTriggerNodeId: null,
    });
    expect(out).not.toHaveProperty(TRIGGER_SOURCE_ALIAS);
  });

  it("steps with no output are omitted entirely (skipped, failed without output)", () => {
    const out = buildLatestValuesBySource({
      detail: makeDetail({
        steps: [
          { nodeId: "t1", status: "succeeded", output: { event: "fired" } },
          { nodeId: "a1", status: "skipped" }, // no output
          {
            nodeId: "a2",
            status: "failed",
            error: { code: "X", message: "y" },
          }, // no output
          { nodeId: "a3", status: "succeeded", output: {} }, // empty output is FOUND
        ],
      }),
      currentTriggerNodeId: "t1",
    });
    expect(out).not.toHaveProperty("a1");
    expect(out).not.toHaveProperty("a2");
    expect(out["a3"]).toEqual({});
  });

  it("missing trigger step entirely → no trigger alias key", () => {
    const out = buildLatestValuesBySource({
      detail: makeDetail({
        steps: [{ nodeId: "a1", status: "succeeded", output: { ok: true } }],
      }),
      currentTriggerNodeId: "t1",
    });
    expect(out).not.toHaveProperty(TRIGGER_SOURCE_ALIAS);
    expect(out).not.toHaveProperty("t1");
    expect(out["a1"]).toEqual({ ok: true });
  });
});
