/**
 * @jest-environment node
 *
 * services/workflows/saveDraftDefinition — the shared "write draft + deactivate on active
 * ACTIVATABLE-trigger change" path used by manual PATCH save AND AI-apply. Proves the manual
 * trigger (native:manual.run, activation "manual") is NOT treated as an activatable trigger,
 * the cross-category cases, and that a no-op (null) write never deactivates.
 */

// getTriggerMeta classifies activation kind: native:manual.run → manual (not activatable);
// everything else → webhook (activatable).
jest.mock("@/services/discovery/_registry", () => ({
  getTriggerMeta: (key: string) =>
    key === "native:manual.run" ? { activation: "manual" } : { activation: "webhook" },
}));

const mockDisable = jest.fn();
jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({ disable: (...a: unknown[]) => mockDisable(...a) }),
}));

import { saveDraftDefinition, activatableTriggerChanged } from "@/services/workflows/saveDraftDefinition";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { WorkflowRecord } from "@/repositories/workflows";

const trig = (provider: string, type: string, config: Record<string, unknown> = {}, id = "t1") => ({
  id, kind: "trigger", provider, type, config, position: { x: 0, y: 0 },
});
const act = (config: Record<string, unknown> = { text: "hi" }) => ({
  id: "a1", kind: "action", provider: "slack", type: "post_message", config, position: { x: 0, y: 80 },
});
const def = (nodes: unknown[], edges: unknown[] = []) => ({ nodes, edges }) as unknown as WorkflowDefinition;

const webhookDef = (config: Record<string, unknown> = { channel: "C1" }) => def([trig("slack", "message_received", config), act()]);
const manualDef = (config: Record<string, unknown> = {}) => def([trig("native", "manual.run", config), act()]);

const recordFor = (def_: WorkflowDefinition, state = "active") =>
  ({ id: "wf-1", name: "WF", state, draftDefinition: def_ }) as unknown as WorkflowRecord;
function writeReturning(record: WorkflowRecord): () => Promise<WorkflowRecord | null> {
  return jest.fn(async () => record);
}

beforeEach(() => {
  mockDisable.mockReset();
  mockDisable.mockResolvedValue({ id: "wf-1", name: "WF", state: "disabled", draftDefinition: { nodes: [], edges: [] } });
});

describe("activatableTriggerChanged — manual triggers are excluded", () => {
  it("manual.run config edit → NOT a change (manual isn't activatable)", () => {
    expect(activatableTriggerChanged(manualDef({ a: 1 }), manualDef({ a: 2 }))).toBe(false);
  });
  it("webhook trigger config edit → changed", () => {
    expect(activatableTriggerChanged(webhookDef({ channel: "C1" }), webhookDef({ channel: "C2" }))).toBe(true);
  });
  it("activatable trigger → manual.run (external registration orphaned) → changed", () => {
    expect(activatableTriggerChanged(webhookDef(), manualDef())).toBe(true);
  });
  it("manual.run → activatable trigger (new registration needed) → changed", () => {
    expect(activatableTriggerChanged(manualDef(), webhookDef())).toBe(true);
  });
  it("action-only edit on a webhook workflow → NOT a change", () => {
    expect(activatableTriggerChanged(def([trig("slack", "message_received"), act({ text: "a" })]), def([trig("slack", "message_received"), act({ text: "b" })]))).toBe(false);
  });
});

describe("saveDraftDefinition — deactivation decision", () => {
  it("active + webhook trigger change → writes then disables (reason/context), returns disabled record", async () => {
    const write = writeReturning(recordFor(webhookDef({ channel: "C2" })));
    const result = await saveDraftDefinition({
      previousState: "active",
      previousDefinition: webhookDef({ channel: "C1" }),
      nextDefinition: webhookDef({ channel: "C2" }),
      write,
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(mockDisable).toHaveBeenCalledWith({
      workflowId: "wf-1",
      reason: "manual_admin",
      context: "Trigger changed — reconnect and reactivate.",
    });
    expect(result).toMatchObject({ state: "disabled" });
  });

  it("active + MANUAL trigger change → writes, does NOT disable, stays active", async () => {
    const write = writeReturning(recordFor(manualDef({ a: 2 })));
    const result = await saveDraftDefinition({
      previousState: "active",
      previousDefinition: manualDef({ a: 1 }),
      nextDefinition: manualDef({ a: 2 }),
      write,
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(mockDisable).not.toHaveBeenCalled();
    expect(result).toMatchObject({ state: "active" });
  });

  it("active external → manual.run → disables (tears down the old external registration)", async () => {
    const write = writeReturning(recordFor(manualDef()));
    await saveDraftDefinition({ previousState: "active", previousDefinition: webhookDef(), nextDefinition: manualDef(), write });
    expect(mockDisable).toHaveBeenCalledTimes(1);
  });

  it("active manual.run → external → disables (forces Reactivate→Resume to register the new trigger)", async () => {
    const write = writeReturning(recordFor(webhookDef()));
    await saveDraftDefinition({ previousState: "active", previousDefinition: manualDef(), nextDefinition: webhookDef(), write });
    expect(mockDisable).toHaveBeenCalledTimes(1);
  });

  it("active + action-only change → no disable", async () => {
    const before = def([trig("slack", "message_received"), act({ text: "a" })]);
    const after = def([trig("slack", "message_received"), act({ text: "b" })]);
    const write = writeReturning(recordFor(after));
    await saveDraftDefinition({ previousState: "active", previousDefinition: before, nextDefinition: after, write });
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it.each(["draft", "paused", "disabled", "eligible_to_resume"] as const)(
    "%s + webhook trigger change → no disable (not actively dispatching)",
    async (state) => {
      const write = writeReturning(recordFor(webhookDef({ channel: "C2" }), state));
      await saveDraftDefinition({ previousState: state, previousDefinition: webhookDef({ channel: "C1" }), nextDefinition: webhookDef({ channel: "C2" }), write });
      expect(mockDisable).not.toHaveBeenCalled();
    },
  );

  it("write returns null (stale / no-op) → returns null, NO disable", async () => {
    const write = jest.fn(async () => null);
    const result = await saveDraftDefinition({
      previousState: "active",
      previousDefinition: webhookDef({ channel: "C1" }),
      nextDefinition: webhookDef({ channel: "C2" }),
      write,
    });
    expect(result).toBeNull();
    expect(mockDisable).not.toHaveBeenCalled();
  });
});
