/**
 * @jest-environment node
 *
 * Tests for the AI-REPAIR-3A apply-readiness safety contract
 * (`services/workflows/patch/applySafety.ts`).
 *
 * Pure policy: classifies a previewed/validated WorkflowPatch into apply-eligible vs
 * blocked categories and proves it's safe to apply RIGHT NOW. No persistence, no model,
 * no apply — this slice wires NO Apply control. These tests are the executable contract
 * for what a future AI-REPAIR-3 Apply will and won't accept.
 */
import {
  assessApplyReadiness,
  APPLY_ELIGIBLE_OPERATION_KINDS,
  APPLY_BLOCKED_OPERATION_KINDS,
  KNOWN_OPERATION_KINDS,
  type AssessApplyReadinessInput,
} from "@/services/workflows/patch/applySafety";

/** A fully apply-ready baseline: one safe config update, validated, fresh revision, inactive. */
function base(over: Partial<AssessApplyReadinessInput> = {}): AssessApplyReadinessInput {
  return {
    operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { text: "hello" } }],
    validation: { ok: true, requiresConfirmation: false },
    baseRevision: "rev-1",
    currentRevision: "rev-1",
    workflowActive: false,
    ...over,
  };
}

const codes = (i: AssessApplyReadinessInput) =>
  assessApplyReadiness(i).blocks.map((b) => b.code);

describe("assessApplyReadiness — allowed", () => {
  it("a safe config update is applyable", () => {
    const r = assessApplyReadiness(base());
    expect(r.applyable).toBe(true);
    expect(r.blocks).toEqual([]);
    expect(r.operationKinds).toEqual(["updateNodeConfig"]);
  });

  it("apply-eligible edge / layout / variable-repair ops are applyable", () => {
    const r = assessApplyReadiness(
      base({
        operations: [
          { op: "addEdge", edge: { id: "e1", from: "n1", to: "n2" } },
          { op: "replaceEdge", edgeId: "e0", edge: { id: "e2", from: "n1", to: "n3" } },
          { op: "moveNode", nodeId: "n1", position: { x: 1, y: 2 } },
          { op: "repairVariableReference", nodeId: "n2", fieldPath: "body", newReference: "{{n1.output}}" },
        ],
      }),
    );
    expect(r.applyable).toBe(true);
  });

  it("carries requiresConfirmation from validation even when applyable", () => {
    const r = assessApplyReadiness(base({ validation: { ok: true, requiresConfirmation: true } }));
    expect(r.applyable).toBe(true);
    expect(r.requiresConfirmation).toBe(true);
  });

  it("a recipient change is allowed ONLY with explicit confirmation", () => {
    const ops = [{ op: "updateNodeConfig", nodeId: "n1", config: { to: "a@b.com" } }];
    expect(assessApplyReadiness(base({ operations: ops })).applyable).toBe(false);
    expect(
      assessApplyReadiness(base({ operations: ops, recipientChangeConfirmed: true })).applyable,
    ).toBe(true);
  });
});

describe("assessApplyReadiness — blocked operation categories", () => {
  it("secret-like config write is blocked", () => {
    const r = assessApplyReadiness(base({ operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { apiKey: "x" } }] }));
    expect(r.applyable).toBe(false);
    expect(r.blockedCategories).toContain("SECRET_WRITE");
  });

  it("credential / provider-account mutation is blocked", () => {
    for (const key of ["accountId", "providerAccountId", "integrationId", "connectionId"]) {
      const r = assessApplyReadiness(base({ operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { [key]: "v" } }] }));
      expect(r.applyable).toBe(false);
      expect(r.blockedCategories).toContain("CREDENTIAL_OR_ACCOUNT_MUTATION");
    }
    // `credentialId` is caught by the stricter secret classifier first — still blocked.
    const cred = assessApplyReadiness(base({ operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { credentialId: "v" } }] }));
    expect(cred.applyable).toBe(false);
    expect(cred.blockedCategories).toContain("SECRET_WRITE");
  });

  it("recipient/destination change without confirmation is blocked", () => {
    expect(codes(base({ operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { channel: "C1" } }] }))).toContain("RECIPIENT_CHANGE");
  });

  it("trigger change on an ACTIVE workflow is blocked", () => {
    const ops = [{ op: "replaceTrigger", node: { id: "t1", kind: "trigger", provider: "slack", type: "message_posted", config: {}, position: { x: 0, y: 0 } } }];
    expect(codes(base({ operations: ops, workflowActive: true }))).toContain("TRIGGER_CHANGE_ACTIVE");
    expect(codes(base({ operations: ops, workflowActive: "unknown" }))).toContain("TRIGGER_CHANGE_ACTIVE");
  });

  it("trigger change on an INACTIVE workflow requires lifecycle handling (still blocked in v1)", () => {
    const ops = [{ op: "replaceTrigger", node: { id: "t1", kind: "trigger", provider: "slack", type: "message_posted", config: {}, position: { x: 0, y: 0 } } }];
    const r = assessApplyReadiness(base({ operations: ops, workflowActive: false }));
    expect(r.applyable).toBe(false);
    expect(r.blockedCategories).toContain("TRIGGER_CHANGE_REQUIRES_LIFECYCLE");
  });

  it("destructive node deletion is blocked", () => {
    expect(codes(base({ operations: [{ op: "removeNode", nodeId: "n1" }] }))).toContain("DESTRUCTIVE_DELETION");
  });

  it("whole-graph replacement is blocked", () => {
    const r = assessApplyReadiness(
      base({
        operations: [{ op: "removeNode", nodeId: "n1" }, { op: "removeNode", nodeId: "n2" }],
        currentNodeIds: ["n1", "n2"],
      }),
    );
    expect(r.applyable).toBe(false);
    expect(r.blockedCategories).toContain("WHOLE_GRAPH_REPLACEMENT");
  });

  it("adding a node is not apply-eligible in v1", () => {
    expect(codes(base({ operations: [{ op: "addNode", node: { id: "n9" } }] }))).toContain("OP_NOT_APPLYABLE");
  });

  it("an unknown operation type is blocked", () => {
    expect(codes(base({ operations: [{ op: "frobnicate", nodeId: "n1" }] }))).toContain("UNKNOWN_OPERATION");
  });

  it("raw model text instead of typed operations is blocked", () => {
    expect(codes(base({ operations: "please fix my workflow" }))).toEqual(["RAW_MODEL_TEXT"]);
    expect(codes(base({ operations: [{ nodeId: "n1", config: {} }] }))).toContain("RAW_MODEL_TEXT");
  });

  it("an empty operation list is blocked", () => {
    expect(codes(base({ operations: [] }))).toContain("NO_OPERATIONS");
  });

  it("a patch with ANY blocked operation cannot be marked applyable", () => {
    const r = assessApplyReadiness(
      base({
        operations: [
          { op: "updateNodeConfig", nodeId: "n1", config: { text: "ok" } }, // safe
          { op: "removeNode", nodeId: "n2" }, // blocked
        ],
      }),
    );
    expect(r.applyable).toBe(false);
  });
});

describe("assessApplyReadiness — metadata / revision gates", () => {
  it("missing validation metadata is blocked", () => {
    expect(codes(base({ validation: null }))).toContain("NO_VALIDATION_METADATA");
    expect(codes(base({ validation: undefined }))).toContain("NO_VALIDATION_METADATA");
  });

  it("failed validation is blocked (cannot bypass deterministic validation)", () => {
    expect(codes(base({ validation: { ok: false } }))).toContain("VALIDATION_FAILED");
  });

  it("missing base revision is blocked", () => {
    expect(codes(base({ baseRevision: "" }))).toContain("MISSING_BASE_REVISION");
  });

  it("a stale preview (base != previewed snapshot) is blocked", () => {
    expect(codes(base({ baseRevision: "rev-2", previewRevision: "rev-1", currentRevision: "rev-1" }))).toContain("STALE_PREVIEW");
  });

  it("graph changed since preview is blocked", () => {
    expect(codes(base({ baseRevision: "rev-1", previewRevision: "rev-1", currentRevision: "rev-9" }))).toContain("GRAPH_CHANGED_SINCE_PREVIEW");
  });
});

describe("assessApplyReadiness — no-leak", () => {
  it("the readiness verdict serializes no config value, secret key, or token", () => {
    const r = assessApplyReadiness(
      base({
        operations: [
          { op: "updateNodeConfig", nodeId: "n1", config: { apiKey: "SUPERSECRET_TOKEN", password: "hunter2", accountId: "acct_live_123" } },
        ],
      }),
    );
    const json = JSON.stringify(r);
    for (const forbidden of ["SUPERSECRET_TOKEN", "hunter2", "acct_live_123", "apiKey", "password", "accountId"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe("operation-kind constants", () => {
  it("eligible + blocked kinds are disjoint and together cover the known union", () => {
    for (const k of APPLY_ELIGIBLE_OPERATION_KINDS) expect(APPLY_BLOCKED_OPERATION_KINDS.has(k)).toBe(false);
    const union = new Set([...APPLY_ELIGIBLE_OPERATION_KINDS, ...APPLY_BLOCKED_OPERATION_KINDS]);
    expect(union).toEqual(KNOWN_OPERATION_KINDS);
  });
});
