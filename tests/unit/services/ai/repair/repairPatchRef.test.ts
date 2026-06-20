/**
 * @jest-environment node
 *
 * repairPatchRef (REACT-AGENT-CS-7B) — deterministic, opaque, one-way patch ref.
 * Proves determinism, key-order invariance, operation-order sensitivity, field
 * sensitivity, input immutability, fail-safe nulls, and that NO raw workflow id /
 * node id / config value / operation JSON appears in the output.
 */

import {
  repairPatchRef,
  REPAIR_PATCH_REF_PREFIX,
  type RepairPatchRefInput,
} from "@/services/ai/repair/repairPatchRef";
import type { PatchOperation } from "@/services/workflows/patch/types";

const WF = "wf-SECRET-9c1f";
const REV = "rev-2026-06-19T00:00:00Z";

function ops(): PatchOperation[] {
  return [
    { op: "updateNodeConfig", nodeId: "node-GMAIL-77", config: { to: "ceo@corp.example", subject: "topsecretvalue" } },
    { op: "repairVariableReference", nodeId: "node-SLACK-3", fieldPath: "message", newReference: "{{trigger.text}}" },
  ];
}

function input(over: Partial<RepairPatchRefInput> = {}): RepairPatchRefInput {
  return { workflowId: WF, baseRevision: REV, operations: ops(), ...over };
}

describe("repairPatchRef — determinism + shape", () => {
  it("returns an opaque `repair_patch_sha256:<hex>` ref", () => {
    const ref = repairPatchRef(input());
    expect(ref).toMatch(new RegExp(`^${REPAIR_PATCH_REF_PREFIX}:[0-9a-f]{64}$`));
  });

  it("same logical input → same ref", () => {
    expect(repairPatchRef(input())).toBe(repairPatchRef(input()));
  });

  it("operation KEY order does not change the ref (canonicalized)", () => {
    const reordered: PatchOperation[] = [
      // same op, keys written in a different order
      { config: { subject: "topsecretvalue", to: "ceo@corp.example" }, nodeId: "node-GMAIL-77", op: "updateNodeConfig" } as unknown as PatchOperation,
      { newReference: "{{trigger.text}}", fieldPath: "message", op: "repairVariableReference", nodeId: "node-SLACK-3" } as unknown as PatchOperation,
    ];
    expect(repairPatchRef(input({ operations: reordered }))).toBe(repairPatchRef(input()));
  });

  it("operation ORDER changes the ref (order is semantically meaningful)", () => {
    const swapped = [ops()[1]!, ops()[0]!];
    expect(repairPatchRef(input({ operations: swapped }))).not.toBe(repairPatchRef(input()));
  });

  it("a different workflowId changes the ref", () => {
    expect(repairPatchRef(input({ workflowId: "wf-OTHER" }))).not.toBe(repairPatchRef(input()));
  });

  it("a different baseRevision changes the ref", () => {
    expect(repairPatchRef(input({ baseRevision: "rev-DIFFERENT" }))).not.toBe(repairPatchRef(input()));
  });

  it("a changed config value changes the ref", () => {
    const changed = ops();
    (changed[0] as { config: Record<string, unknown> }).config.subject = "different";
    expect(repairPatchRef(input({ operations: changed }))).not.toBe(repairPatchRef(input()));
  });
});

describe("repairPatchRef — fail-safe", () => {
  it.each([
    ["null input", null],
    ["undefined input", undefined],
  ])("returns null for %s", (_l, v) => {
    expect(repairPatchRef(v as unknown as RepairPatchRefInput)).toBeNull();
  });

  it.each([
    ["empty workflowId", input({ workflowId: "" })],
    ["whitespace workflowId", input({ workflowId: "   " })],
    ["empty baseRevision", input({ baseRevision: "" })],
    ["empty operations", input({ operations: [] })],
  ])("returns null for %s", (_l, v) => {
    expect(repairPatchRef(v)).toBeNull();
  });
});

describe("repairPatchRef — immutability + no-leak", () => {
  it("does not mutate the input operations", () => {
    const original = input();
    const snapshot = JSON.parse(JSON.stringify(original));
    repairPatchRef(original);
    expect(original).toEqual(snapshot);
  });

  it("output embeds NO raw workflow id / node id / config value / operation JSON", () => {
    const ref = repairPatchRef(input())!;
    const hex = ref.slice(REPAIR_PATCH_REF_PREFIX.length + 1);
    for (const needle of [
      WF, REV, "node-GMAIL-77", "node-SLACK-3", "ceo@corp.example",
      "topsecretvalue", "trigger.text", "updateNodeConfig", "{", "}",
    ]) {
      expect(ref).not.toContain(needle);
      expect(hex).not.toContain(needle);
    }
    // The opaque tail is exactly a 64-char lowercase hex digest.
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});
