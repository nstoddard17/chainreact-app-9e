/**
 * @jest-environment node
 *
 * core/workflows/triggerChange — detects MEANINGFUL trigger changes between two workflow
 * definitions (drives disable-on-active-trigger-edit). Trigger add/remove/id/provider/type/
 * config → changed; action / label / layout / edge edits + config key reordering → unchanged.
 */
import { triggerChanged } from "@/core/workflows/triggerChange";

const trigger = (over: Record<string, unknown> = {}) => ({
  id: "t1", kind: "trigger", provider: "slack", type: "message_received",
  config: { channel: "C1" }, position: { x: 0, y: 0 }, ...over,
});
const action = (over: Record<string, unknown> = {}) => ({
  id: "a1", kind: "action", provider: "slack", type: "post_message",
  config: { text: "hi" }, position: { x: 0, y: 100 }, ...over,
});
const def = (nodes: unknown[], edges: unknown[] = []) =>
  ({ nodes, edges }) as unknown as import("@/contracts/workflow").WorkflowDefinition;

describe("triggerChanged — NOT a trigger change (safe to keep live)", () => {
  it("identical definitions", () => {
    expect(triggerChanged(def([trigger(), action()]), def([trigger(), action()]))).toBe(false);
  });
  it("action node config edited", () => {
    expect(triggerChanged(def([trigger(), action()]), def([trigger(), action({ config: { text: "bye" } })]))).toBe(false);
  });
  it("action node added", () => {
    expect(triggerChanged(def([trigger()]), def([trigger(), action()]))).toBe(false);
  });
  it("trigger label (displayName) changed only", () => {
    expect(triggerChanged(def([trigger()]), def([trigger({ displayName: "My trigger" })]))).toBe(false);
  });
  it("trigger layout (position) changed only", () => {
    expect(triggerChanged(def([trigger()]), def([trigger({ position: { x: 999, y: 42 } })]))).toBe(false);
  });
  it("edges changed only", () => {
    const a = def([trigger(), action()], []);
    const b = def([trigger(), action()], [{ id: "e1", from: "t1", to: "a1" }]);
    expect(triggerChanged(a, b)).toBe(false);
  });
  it("trigger config key reorder (same values)", () => {
    const a = def([trigger({ config: { channel: "C1", mode: "all" } })]);
    const b = def([trigger({ config: { mode: "all", channel: "C1" } })]);
    expect(triggerChanged(a, b)).toBe(false);
  });
});

describe("triggerChanged — IS a trigger change (requires deactivation)", () => {
  it("trigger removed", () => {
    expect(triggerChanged(def([trigger(), action()]), def([action()]))).toBe(true);
  });
  it("trigger added (manual-only → triggered)", () => {
    expect(triggerChanged(def([action()]), def([trigger(), action()]))).toBe(true);
  });
  it("trigger node id changed (delete + re-add)", () => {
    expect(triggerChanged(def([trigger({ id: "t1" })]), def([trigger({ id: "t2" })]))).toBe(true);
  });
  it("trigger provider changed", () => {
    expect(triggerChanged(def([trigger()]), def([trigger({ provider: "gmail" })]))).toBe(true);
  });
  it("trigger type changed", () => {
    expect(triggerChanged(def([trigger()]), def([trigger({ type: "reaction_added" })]))).toBe(true);
  });
  it("trigger config changed (resource / filter selection)", () => {
    expect(triggerChanged(def([trigger({ config: { channel: "C1" } })]), def([trigger({ config: { channel: "C2" } })]))).toBe(true);
  });
});
