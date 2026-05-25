/**
 * @jest-environment node
 *
 * Slice 3.POSTSEC-6B — tests for the workflow trigger-kind classifier.
 *
 * Pure-function tests: feed a `WorkflowNode[]` shape, assert the
 * classification and the UI predicates. No store, no DOM.
 *
 * The classifier is the single source of truth the builder's run /
 * test panel uses to decide whether to expose "Run Manually" vs
 * "Activate". Tests cover:
 *   - the three classifications (manual / automated / none)
 *   - the convenience predicates (isManualTriggerWorkflow,
 *     shouldShowManualRun, shouldShowTestWorkflow)
 *   - defensive behavior on unknown / stale provider:type pairs
 *   - immutability — calls don't mutate the input array
 */
import type { WorkflowNode } from "@/contracts/workflow";
import {
  getTriggerKind,
  isManualTriggerWorkflow,
  shouldShowManualRun,
  shouldShowTestWorkflow,
  type TriggerKind,
} from "@/features/workflow-builder/state/triggerKind";

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: "n1",
    kind: "trigger",
    provider: "native",
    type: "manual.run",
    config: {},
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

describe("getTriggerKind", () => {
  it("returns 'manual' for the native manual trigger", () => {
    const nodes = [makeNode({ provider: "native", type: "manual.run" })];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("manual");
  });

  it("returns 'automated' for the native scheduled trigger", () => {
    const nodes = [makeNode({ provider: "native", type: "schedule.fired" })];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("automated");
  });

  it("returns 'automated' for a provider event trigger (e.g. slack:message_received)", () => {
    const nodes = [
      makeNode({ provider: "slack", type: "message_received" }),
    ];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("automated");
  });

  it("returns 'automated' for a webhook trigger (e.g. stripe:invoice.paid)", () => {
    const nodes = [
      makeNode({ provider: "stripe", type: "invoice.paid" }),
    ];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("automated");
  });

  it("returns 'automated' for an unknown native trigger type (defensive — manual is opt-in by exact match)", () => {
    // A future-flagged native trigger that hasn't shipped runtime
    // support yet must NOT accidentally pass the manual check.
    const nodes = [
      makeNode({ provider: "native", type: "some_future_native_trigger" }),
    ];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("automated");
  });

  it("returns 'none' for an empty graph", () => {
    expect(getTriggerKind([])).toBe<TriggerKind>("none");
  });

  it("returns 'none' when the graph has only action nodes (no trigger yet)", () => {
    const nodes = [
      makeNode({ id: "a1", kind: "action", provider: "slack", type: "send_message" }),
    ];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("none");
  });

  it("returns 'manual' on a manual-trigger workflow that also has actions", () => {
    const nodes: WorkflowNode[] = [
      makeNode({ provider: "native", type: "manual.run" }),
      makeNode({ id: "a1", kind: "action", provider: "slack", type: "send_message" }),
    ];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("manual");
  });

  it("classifies based on the first trigger when the graph has both kinds (only one is allowed — single-trigger invariant from the schema)", () => {
    // The DefinitionSchema would reject this graph at save time
    // (`triggerCount > 1`), but the classifier itself must not crash;
    // it should return a deterministic answer based on the first
    // trigger encountered.
    const nodes: WorkflowNode[] = [
      makeNode({ id: "t1", provider: "native", type: "manual.run" }),
      makeNode({ id: "t2", provider: "stripe", type: "invoice.paid" }),
    ];
    expect(getTriggerKind(nodes)).toBe<TriggerKind>("manual");
  });

  it("does not mutate the input array", () => {
    const nodes = Object.freeze([
      makeNode({ provider: "native", type: "manual.run" }),
    ]);
    expect(() => getTriggerKind(nodes)).not.toThrow();
    expect(nodes).toHaveLength(1);
  });
});

describe("isManualTriggerWorkflow", () => {
  it("is true exactly when getTriggerKind returns 'manual'", () => {
    expect(
      isManualTriggerWorkflow([
        makeNode({ provider: "native", type: "manual.run" }),
      ]),
    ).toBe(true);
    expect(
      isManualTriggerWorkflow([
        makeNode({ provider: "native", type: "schedule.fired" }),
      ]),
    ).toBe(false);
    expect(
      isManualTriggerWorkflow([
        makeNode({ provider: "slack", type: "message_received" }),
      ]),
    ).toBe(false);
    expect(isManualTriggerWorkflow([])).toBe(false);
  });
});

describe("shouldShowManualRun", () => {
  it("matches isManualTriggerWorkflow today — only manual workflows show the live manual-run button", () => {
    // Same shape as isManualTriggerWorkflow today; kept as a separate
    // predicate so future flags can diverge without graph mutation.
    expect(
      shouldShowManualRun([
        makeNode({ provider: "native", type: "manual.run" }),
      ]),
    ).toBe(true);
    expect(
      shouldShowManualRun([
        makeNode({ provider: "native", type: "schedule.fired" }),
      ]),
    ).toBe(false);
    expect(
      shouldShowManualRun([
        makeNode({ provider: "stripe", type: "invoice.paid" }),
      ]),
    ).toBe(false);
    expect(shouldShowManualRun([])).toBe(false);
  });
});

describe("shouldShowTestWorkflow", () => {
  it("is true whenever the workflow has a trigger (manual OR automated)", () => {
    expect(
      shouldShowTestWorkflow([
        makeNode({ provider: "native", type: "manual.run" }),
      ]),
    ).toBe(true);
    expect(
      shouldShowTestWorkflow([
        makeNode({ provider: "native", type: "schedule.fired" }),
      ]),
    ).toBe(true);
    expect(
      shouldShowTestWorkflow([
        makeNode({ provider: "stripe", type: "invoice.paid" }),
      ]),
    ).toBe(true);
  });

  it("is false when the workflow has no trigger node yet", () => {
    expect(shouldShowTestWorkflow([])).toBe(false);
    expect(
      shouldShowTestWorkflow([
        makeNode({ id: "a1", kind: "action", provider: "slack", type: "send_message" }),
      ]),
    ).toBe(false);
  });
});
