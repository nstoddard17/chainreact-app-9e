/** @jest-environment node */
/**
 * Metadata-driven proposed-config sanitizer (REACT-CONFIG-COVERAGE-1).
 *
 * Runs against the REAL discovery registry (gmail/slack metas) plus fixture FieldMeta for the
 * secret/connection and future-field cases. Pins the core product contract:
 *   - user-supplied values land in DECLARED fields (required or optional), typed and coerced;
 *   - unusable supplied values are DEFERRED to requiredInputs (targeted input), never silently lost;
 *   - undeclared / secret / connection keys are dropped;
 *   - explicit false and 0 survive; {{...}} variable references pass through.
 */
import type { FieldMeta } from "@/contracts/actionMeta";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import {
  sanitizeConfigAgainstFields,
  sanitizePlanStepConfigs,
} from "@/services/ai-guidance/planConfig/sanitizeProposedConfig";

function plan(steps: WorkflowPlan["steps"]): WorkflowPlan {
  return { schemaVersion: 1, title: "t", summary: "s", steps, notApplied: true };
}

describe("sanitizePlanStepConfigs (real registry)", () => {
  it("keeps the gmail sender filter (optional string-array) — scalar coerced to array", () => {
    const result = sanitizePlanStepConfigs(
      plan([
        {
          ref: "s0",
          role: "trigger",
          provider: "gmail",
          type: "new_email",
          purpose: "",
          config: { from: "vendor@example.com" },
        },
      ]),
    );
    expect(result.plan.steps[0]!.config).toEqual({ from: ["vendor@example.com"] });
  });

  it("keeps multiple optional constraints together (sender + subject + attachment label→value)", () => {
    const result = sanitizePlanStepConfigs(
      plan([
        {
          ref: "s0",
          role: "trigger",
          provider: "gmail",
          type: "new_email",
          purpose: "",
          config: {
            from: ["vendor@example.com"],
            subject: "Invoice",
            subjectExactMatch: false,
            hasAttachment: "Has attachment", // static-option LABEL → value "yes"
          },
        },
      ]),
    );
    expect(result.plan.steps[0]!.config).toEqual({
      from: ["vendor@example.com"],
      subject: "Invoice",
      subjectExactMatch: false,
      hasAttachment: "yes",
    });
  });

  it("drops undeclared keys and defers a declared-but-unusable value into requiredInputs", () => {
    const result = sanitizePlanStepConfigs(
      plan([
        {
          ref: "s0",
          role: "trigger",
          provider: "gmail",
          type: "new_email",
          purpose: "",
          config: { totallyMadeUp: "x", hasAttachment: "definitely-not-an-option", subject: 42 },
        },
      ]),
    );
    const step = result.plan.steps[0]!;
    expect(step.config).toBeUndefined();
    // supplied-but-unusable → targeted input, never silent
    expect(step.requiredInputs).toEqual(expect.arrayContaining(["hasAttachment", "subject"]));
    // undeclared → dropped, not surfaced as an input
    expect(step.requiredInputs).not.toContain("totallyMadeUp");
  });

  it("passes {{...}} variable references through untouched", () => {
    const result = sanitizePlanStepConfigs(
      plan([
        {
          ref: "s1",
          role: "action",
          provider: "slack",
          type: "send_channel_message",
          purpose: "",
          config: { text: "{{trigger.subject}} arrived" },
        },
      ]),
    );
    expect(result.plan.steps[0]!.config).toEqual({ text: "{{trigger.subject}} arrived" });
  });

  it("drops config for a capability with no registry metadata", () => {
    const result = sanitizePlanStepConfigs(
      plan([
        { ref: "s0", role: "action", provider: "nope", type: "nothing", purpose: "", config: { a: 1 } },
      ]),
    );
    expect(result.plan.steps[0]!.config).toBeUndefined();
  });
});

describe("sanitizeConfigAgainstFields (fixtures)", () => {
  const secretField: FieldMeta = {
    name: "apiToken",
    label: "API token",
    type: "text",
    required: false,
    sensitivity: "secret",
  } as FieldMeta;
  const connectionField: FieldMeta = {
    name: "integrationId",
    label: "Connection",
    type: "text",
    required: false,
    sensitivity: "connection",
  } as FieldMeta;
  const plainField: FieldMeta = { name: "note", label: "Note", type: "text", required: false } as FieldMeta;

  it("strips secret and connection fields outright (never accepted, never deferred to input)", () => {
    const r = sanitizeConfigAgainstFields(
      { apiToken: "sk-123", integrationId: "int-9", note: "hello" },
      [secretField, connectionField, plainField],
    );
    expect(r.config).toEqual({ note: "hello" });
    expect([...r.droppedFields].sort()).toEqual(["apiToken", "integrationId"]);
    expect(r.deferredFields).toHaveLength(0);
  });

  it("preserves explicit false and 0 and drops empty strings as unset", () => {
    const fields: FieldMeta[] = [
      { name: "enabled", label: "E", type: "boolean", required: false } as FieldMeta,
      { name: "limit", label: "L", type: "number", required: false } as FieldMeta,
      { name: "note", label: "N", type: "text", required: false } as FieldMeta,
    ];
    const r = sanitizeConfigAgainstFields({ enabled: false, limit: 0, note: "" }, fields);
    expect(r.config).toEqual({ enabled: false, limit: 0 });
    expect(r.deferredFields).toHaveLength(0);
  });

  it("coerces numeric/boolean strings", () => {
    const fields: FieldMeta[] = [
      { name: "limit", label: "L", type: "number", required: false } as FieldMeta,
      { name: "flag", label: "F", type: "boolean", required: false } as FieldMeta,
    ];
    const r = sanitizeConfigAgainstFields({ limit: "25", flag: "false" }, fields);
    expect(r.config).toEqual({ limit: 25, flag: false });
  });

  it("scenario 7 — a conditionally visible field configures together with its enabling parent", () => {
    const fields: FieldMeta[] = [
      {
        name: "mode",
        label: "Mode",
        type: "select",
        required: true,
        options: [
          { value: "simple", label: "Simple" },
          { value: "filtered", label: "Filtered" },
        ],
      } as FieldMeta,
      {
        name: "filterExpression",
        label: "Filter",
        type: "text",
        required: false,
        visibleWhen: { field: "mode", valueIn: ["filtered"] },
      } as FieldMeta,
    ];
    const r = sanitizeConfigAgainstFields({ mode: "filtered", filterExpression: "amount > 100" }, fields);
    expect(r.config).toEqual({ mode: "filtered", filterExpression: "amount > 100" });
    expect(r.deferredFields).toHaveLength(0);
  });

  it("scenario 9 — an Advanced-section field is settable exactly like a Setup field", () => {
    const fields: FieldMeta[] = [
      { name: "pageSize", label: "Page size", type: "number", required: false, advanced: true } as FieldMeta,
    ];
    const r = sanitizeConfigAgainstFields({ pageSize: 50 }, fields);
    expect(r.config).toEqual({ pageSize: 50 });
  });

  it("future-field regression: a brand-new metadata field is automatically settable (no AI list to update)", () => {
    const futureField: FieldMeta = {
      name: "vendorEmailFilter",
      label: "Vendor email filter",
      type: "string-array",
      required: false,
    } as FieldMeta;
    const r = sanitizeConfigAgainstFields({ vendorEmailFilter: "a@b.com" }, [futureField]);
    expect(r.config).toEqual({ vendorEmailFilter: ["a@b.com"] });
  });
});
