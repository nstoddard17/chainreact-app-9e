/**
 * @jest-environment node
 *
 * Tests for `resolveFieldSensitivity` (AI-REPAIR-SAFETY-HARDENING CS-2) — the
 * schema-aware step that maps a patch op's touched fields to their declared
 * `FieldMeta.sensitivity`, BEFORE the pure apply-safety classifier. Exercised against
 * the LIVE discovery registry, so it stays coupled to the real (annotated) metadata —
 * `gmail:send_email.to` is a first-wave `recipient` field (CS-3).
 */
import { resolveFieldSensitivity } from "@/services/workflows/patch/resolveFieldSensitivity";

const gmailNode = { id: "n1", provider: "gmail", type: "send_email" };

describe("resolveFieldSensitivity", () => {
  it("maps an updateNodeConfig's sensitive field to its declared sensitivity", () => {
    const ops = [{ op: "updateNodeConfig", nodeId: "n1", config: { to: ["a@b.com"], subject: "hi" } }];
    const map = resolveFieldSensitivity(ops, [gmailNode]);
    expect(map.get(0)).toEqual({ to: "recipient" }); // `subject` has no sensitivity → omitted
  });

  it("maps a repairVariableReference's fieldPath to its declared sensitivity", () => {
    const ops = [{ op: "repairVariableReference", nodeId: "n1", fieldPath: "to", newReference: "{{n0.email}}" }];
    expect(resolveFieldSensitivity(ops, [gmailNode]).get(0)).toEqual({ to: "recipient" });
  });

  it("returns no entry for a non-sensitive field", () => {
    const ops = [{ op: "updateNodeConfig", nodeId: "n1", config: { subject: "hi" } }];
    expect(resolveFieldSensitivity(ops, [gmailNode]).size).toBe(0);
  });

  it("returns no entry when the node's provider:type isn't in the registry", () => {
    const ops = [{ op: "updateNodeConfig", nodeId: "n1", config: { to: ["a@b.com"] } }];
    expect(resolveFieldSensitivity(ops, [{ id: "n1", provider: "nope", type: "nope" }]).size).toBe(0);
  });

  it("skips a node with a missing provider or type", () => {
    const ops = [{ op: "updateNodeConfig", nodeId: "n1", config: { to: ["a@b.com"] } }];
    expect(resolveFieldSensitivity(ops, [{ id: "n1" }]).size).toBe(0);
  });

  it("ignores non-config ops (addEdge / removeEdge / moveNode)", () => {
    const ops = [
      { op: "addEdge", edge: { id: "e1", from: "n1", to: "n2" } },
      { op: "moveNode", nodeId: "n1", position: { x: 0, y: 0 } },
    ];
    expect(resolveFieldSensitivity(ops, [gmailNode]).size).toBe(0);
  });

  it("preserves per-op indexing across a mixed op list", () => {
    const ops = [
      { op: "moveNode", nodeId: "n1", position: { x: 0, y: 0 } }, // index 0 — no entry
      { op: "updateNodeConfig", nodeId: "n1", config: { to: ["a@b.com"] } }, // index 1
    ];
    const map = resolveFieldSensitivity(ops, [gmailNode]);
    expect(map.has(0)).toBe(false);
    expect(map.get(1)).toEqual({ to: "recipient" });
  });

  it("is defensive against malformed / non-array operations (never throws)", () => {
    expect(resolveFieldSensitivity("fix it please", [gmailNode]).size).toBe(0);
    expect(resolveFieldSensitivity([{ nodeId: "n1" }, null, 42], [gmailNode]).size).toBe(0);
  });
});
