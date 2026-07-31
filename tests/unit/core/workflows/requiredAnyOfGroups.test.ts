/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-2 §3 — generic cross-field ("at least one of") readiness.
 *
 * `FieldMeta.required` is per-field, so a handler schema like `gmail:send_email`'s
 * `.refine(textBody || htmlBody)` was invisible to readiness: the builder said Ready for a send
 * with no body and the run failed at dispatch. `ActionMeta.requiredAnyOf` is the metadata shadow
 * of that refine. These tests pin the contract itself with SYNTHETIC provider-agnostic metas (so
 * the rules are proven independently of Gmail), then confirm the real Gmail metas adopt it.
 */
import { ActionMetaSchema, type ActionMeta } from "@/contracts/actionMeta";
import {
  buildRequiredFieldsByType,
  missingRequiredFields,
  missingRequiredGroups,
} from "@/core/workflows/requiredFields";
import { findFieldGaps } from "@/core/workflows/executionReadiness";
import { collectBuilderValidationIssues } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import { getActionMeta } from "@/services/discovery/_registry";
import type { WorkflowNode } from "@/contracts/workflow";

/** A provider-agnostic action with one body group and one mode-scoped group. */
const FIXTURE: ActionMeta = ActionMetaSchema.parse({
  key: "acme:notify",
  provider: "acme",
  type: "notify",
  displayName: "Notify",
  description: "Synthetic fixture for the cross-field readiness contract.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    { name: "target", label: "Target", description: "Where to send.", type: "text", required: true },
    { name: "textBody", label: "Text body", description: "Plain text.", type: "textarea", required: false },
    { name: "htmlBody", label: "HTML body", description: "HTML.", type: "textarea", required: false },
    { name: "advanced", label: "Advanced", description: "Toggle.", type: "boolean", required: false, defaultValue: false },
    {
      name: "overrideA",
      label: "Override A",
      description: "Only in advanced mode.",
      type: "text",
      required: false,
      visibleWhen: { field: "advanced", valueTruthy: true },
    },
    {
      name: "overrideB",
      label: "Override B",
      description: "Only in advanced mode.",
      type: "text",
      required: false,
      visibleWhen: { field: "advanced", valueTruthy: true },
    },
  ],
  outputs: [],
  requiredAnyOf: [
    { fields: ["textBody", "htmlBody"], message: "Add a text body or HTML body." },
    { fields: ["overrideA", "overrideB"], message: "Set one override." },
  ],
});

const REQS = buildRequiredFieldsByType([FIXTURE], []);

const node = (config: Record<string, unknown>): WorkflowNode =>
  ({ id: "n1", kind: "action", provider: "acme", type: "notify", position: { x: 0, y: 0 }, config }) as WorkflowNode;

const groupMessages = (config: Record<string, unknown>) =>
  missingRequiredGroups(node(config), REQS).map((g) => g.message);

describe("requiredAnyOf — metadata contract", () => {
  it("rejects a group naming an unknown field", () => {
    expect(() =>
      ActionMetaSchema.parse({ ...FIXTURE, requiredAnyOf: [{ fields: ["textBody", "nope"], message: "x" }] }),
    ).toThrow(/unknown field 'nope'/);
  });

  it("rejects a group over an already-required field (contradictory)", () => {
    expect(() =>
      ActionMetaSchema.parse({ ...FIXTURE, requiredAnyOf: [{ fields: ["target", "textBody"], message: "x" }] }),
    ).toThrow(/already required/);
  });

  it("rejects a duplicate member and a single-member group", () => {
    expect(() =>
      ActionMetaSchema.parse({ ...FIXTURE, requiredAnyOf: [{ fields: ["textBody", "textBody"], message: "x" }] }),
    ).toThrow(/Duplicate field/);
    expect(() =>
      ActionMetaSchema.parse({ ...FIXTURE, requiredAnyOf: [{ fields: ["textBody"], message: "x" }] }),
    ).toThrow();
  });

  it("leaves providers that declare no group completely unaffected", () => {
    const plain = ActionMetaSchema.parse({ ...FIXTURE, requiredAnyOf: undefined });
    const reqs = buildRequiredFieldsByType([plain], []);
    expect(reqs["acme:notify"]!.requiredAnyOf).toBeUndefined();
    expect(missingRequiredGroups(node({}), reqs)).toEqual([]);
  });
});

describe("requiredAnyOf — evaluation", () => {
  it("reports ONE issue per unsatisfied group, not one per member", () => {
    expect(groupMessages({ target: "t" })).toEqual(["Add a text body or HTML body."]);
  });

  it("is satisfied by ANY member", () => {
    expect(groupMessages({ target: "t", textBody: "hi" })).toEqual([]);
    expect(groupMessages({ target: "t", htmlBody: "<p>hi</p>" })).toEqual([]);
    expect(groupMessages({ target: "t", textBody: "hi", htmlBody: "<p>hi</p>" })).toEqual([]);
  });

  it("treats an empty / whitespace value as unsatisfied (same rule as required fields)", () => {
    expect(groupMessages({ target: "t", textBody: "   " })).toEqual(["Add a text body or HTML body."]);
    expect(groupMessages({ target: "t", textBody: [] })).toEqual(["Add a text body or HTML body."]);
  });

  it("stays silent for a group whose members are ALL hidden by an unmet condition", () => {
    // advanced=false → overrideA/B hidden → the override group is not a real gap.
    expect(groupMessages({ target: "t", textBody: "hi" })).toEqual([]);
    expect(groupMessages({ target: "t", textBody: "hi", advanced: false })).toEqual([]);
  });

  it("demands the group once its mode is entered", () => {
    expect(groupMessages({ target: "t", textBody: "hi", advanced: true })).toEqual(["Set one override."]);
    expect(groupMessages({ target: "t", textBody: "hi", advanced: true, overrideB: "x" })).toEqual([]);
  });

  it("a value stranded in a HIDDEN field cannot satisfy the group", () => {
    // overrideA carries a value but advanced is off, so the group is skipped entirely;
    // turning advanced on must NOT silently read the stranded value as complete for overrideB.
    expect(groupMessages({ target: "t", textBody: "hi", advanced: false, overrideA: "stranded" })).toEqual([]);
    // With the mode on, the visible overrideA legitimately satisfies it.
    expect(groupMessages({ target: "t", textBody: "hi", advanced: true, overrideA: "stranded" })).toEqual([]);
  });

  it("only reports fields that were visible when evaluated", () => {
    const groups = missingRequiredGroups(node({ target: "t", advanced: true }), REQS);
    expect(groups.map((g) => g.fields.map((f) => f.name))).toEqual([
      ["textBody", "htmlBody"],
      ["overrideA", "overrideB"],
    ]);
  });

  it("does not disturb plain required-field readiness", () => {
    expect(missingRequiredFields(node({}), REQS).map((f) => f.name)).toEqual(["target"]);
  });
});

describe("requiredAnyOf — builder and server agree", () => {
  it("the builder emits one actionable issue naming every satisfying field", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        { id: "trigger", kind: "trigger", provider: "native", type: "manual.run", position: { x: 0, y: 0 }, config: {} },
        node({ target: "t" }),
      ],
      pendingEdges: [{ id: "e1", from: "trigger", to: "n1" }],
      requiredFieldsByType: REQS,
    });
    const group = issues.filter((i) => i.code === "missing_required_group");
    expect(group).toHaveLength(1);
    expect(group[0]!.severity).toBe("error");
    expect(group[0]!.message).toContain("Add a text body or HTML body.");
    // names both ways to satisfy it…
    expect(group[0]!.message).toContain("Text body or HTML body");
    // …and focuses a real field so selecting the issue opens somewhere actionable.
    expect(group[0]!.nodeId).toBe("n1");
    expect(group[0]!.fieldName).toBe("textBody");
    expect(group[0]!.fieldLabel).toBe("Text body");
  });

  it("the SERVER readiness verdict reports the same gap (no silent server pass)", () => {
    const gaps = findFieldGaps([node({ target: "t" })], REQS);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.missingFields).toEqual(["Add a text body or HTML body."]);
  });

  it("both sides go quiet once the group is satisfied", () => {
    const ready = node({ target: "t", textBody: "hi" });
    expect(findFieldGaps([ready], REQS)).toEqual([]);
    expect(
      collectBuilderValidationIssues({
        pendingNodes: [
          { id: "trigger", kind: "trigger", provider: "native", type: "manual.run", position: { x: 0, y: 0 }, config: {} },
          ready,
        ],
        pendingEdges: [{ id: "e1", from: "trigger", to: "n1" }],
        requiredFieldsByType: REQS,
      }).filter((i) => i.severity === "error"),
    ).toEqual([]);
  });
});

describe("requiredAnyOf — real Gmail metas mirror their runtime refines", () => {
  it.each([["gmail:send_email"], ["gmail:create_draft_reply"]])(
    "%s declares the textBody/htmlBody group",
    (key) => {
      const groups = getActionMeta(key)!.requiredAnyOf ?? [];
      expect(groups).toHaveLength(1);
      expect([...groups[0]!.fields].sort()).toEqual(["htmlBody", "textBody"]);
      expect(groups[0]!.message).toBe("Add a text body or HTML body.");
    },
  );

  it("a Gmail send with a recipient but no body is NOT ready", () => {
    const reqs = buildRequiredFieldsByType([getActionMeta("gmail:send_email")!], []);
    const send = {
      id: "a1",
      kind: "action",
      provider: "gmail",
      type: "send_email",
      position: { x: 0, y: 0 },
      config: { to: ["someone"], subject: "hi" },
    } as WorkflowNode;
    expect(missingRequiredFields(send, reqs)).toEqual([]); // `to` is set, `subject` defaulted
    expect(missingRequiredGroups(send, reqs).map((g) => g.message)).toEqual([
      "Add a text body or HTML body.",
    ]);
  });
});
