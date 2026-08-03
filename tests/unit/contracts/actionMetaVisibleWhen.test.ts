/** @jest-environment node */
/**
 * CONFIG-UX-SETUP-ADVANCED-1 — top-level `visibleWhen` contract tests.
 *
 * Covers: condition-shape validation, self/unknown/chained reference
 * rejection (actions AND triggers), and the shared `isVisibleWhenMet`
 * evaluator both SchemaForm and the readiness core rely on.
 */
import {
  ActionMetaSchema,
  FieldMetaSchema,
  isVisibleWhenMet,
  type ActionMeta,
  type FieldMeta,
} from "@/contracts/actionMeta";
import { TriggerMetaSchema, type TriggerMeta } from "@/contracts/triggerMeta";

const baseAction = (fields: FieldMeta[]): ActionMeta =>
  ({
    key: "native:http_request",
    provider: "native",
    type: "http_request",
    displayName: "HTTP Request",
    description: "Send an HTTP request.",
    category: "http",
    requiresIntegration: false,
    fields,
    outputs: [],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: null,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
  }) as ActionMeta;

const modeField: FieldMeta = {
  name: "mode",
  label: "Mode",
  type: "select",
  required: true,
  options: [
    { value: "simple", label: "Simple" },
    { value: "custom", label: "Custom" },
  ],
} as FieldMeta;

describe("FieldMetaSchema — visibleWhen shape", () => {
  it("accepts valueIn and valueTruthy conditions", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "detail",
        label: "Detail",
        type: "text",
        required: false,
        visibleWhen: { field: "mode", valueIn: ["custom"] },
      }),
    ).not.toThrow();
    expect(() =>
      FieldMetaSchema.parse({
        name: "detail",
        label: "Detail",
        type: "text",
        required: false,
        visibleWhen: { field: "enabled", valueTruthy: true },
      }),
    ).not.toThrow();
  });

  it("rejects a condition with neither valueIn nor valueTruthy", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "detail",
        label: "Detail",
        type: "text",
        required: false,
        visibleWhen: { field: "mode" },
      }),
    ).toThrow(/valueIn|valueTruthy/);
  });

  it("rejects a field gating its own visibility", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "detail",
        label: "Detail",
        type: "text",
        required: false,
        visibleWhen: { field: "detail", valueTruthy: true },
      }),
    ).toThrow(/cannot gate its own visibility/);
  });
});

describe("ActionMetaSchema — visibleWhen cross-field references", () => {
  it("accepts a condition referencing a known sibling", () => {
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([
          modeField,
          {
            name: "customBody",
            label: "Custom body",
            type: "textarea",
            required: false,
            visibleWhen: { field: "mode", valueIn: ["custom"] },
          } as FieldMeta,
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects a condition referencing an unknown sibling", () => {
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([
          {
            name: "customBody",
            label: "Custom body",
            type: "textarea",
            required: false,
            visibleWhen: { field: "ghost", valueTruthy: true },
          } as FieldMeta,
        ]),
      ),
    ).toThrow(/unknown field 'ghost'/);
  });

  it("rejects a visibility chain (controller itself conditionally visible)", () => {
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([
          modeField,
          {
            name: "middle",
            label: "Middle",
            type: "boolean",
            required: false,
            visibleWhen: { field: "mode", valueIn: ["custom"] },
          } as FieldMeta,
          {
            name: "leaf",
            label: "Leaf",
            type: "text",
            required: false,
            visibleWhen: { field: "middle", valueTruthy: true },
          } as FieldMeta,
        ]),
      ),
    ).toThrow(/chains are not allowed/);
  });
});

describe("TriggerMetaSchema — visibleWhen cross-field references", () => {
  const baseTrigger = (fields: FieldMeta[]): TriggerMeta =>
    ({
      key: "native:schedule.fired",
      provider: "native",
      type: "schedule.fired",
      displayName: "Scheduled Trigger",
      description: "Fires on a schedule.",
      category: "scheduling",
      activation: "scheduled",
      requiresIntegration: false,
      fields,
      payloadShape: [],
      displayOrder: null,
    }) as TriggerMeta;

  it("rejects an unknown reference on triggers too", () => {
    expect(() =>
      TriggerMetaSchema.parse(
        baseTrigger([
          {
            name: "windowEnd",
            label: "Window end",
            type: "time",
            required: false,
            visibleWhen: { field: "nope", valueTruthy: true },
          } as FieldMeta,
        ]),
      ),
    ).toThrow(/unknown field 'nope'/);
  });

  it("accepts a valid trigger-side condition", () => {
    expect(() =>
      TriggerMetaSchema.parse(
        baseTrigger([
          { name: "limitWindow", label: "Limit window", type: "boolean", required: false } as FieldMeta,
          {
            name: "windowEnd",
            label: "Window end",
            type: "time",
            required: false,
            visibleWhen: { field: "limitWindow", valueTruthy: true },
          } as FieldMeta,
        ]),
      ),
    ).not.toThrow();
  });
});

describe("isVisibleWhenMet", () => {
  it("no condition → always visible", () => {
    expect(isVisibleWhenMet(undefined, {})).toBe(true);
  });

  it("valueTruthy: true is met only by boolean true", () => {
    const cond = { field: "enabled", valueTruthy: true };
    expect(isVisibleWhenMet(cond, { enabled: true })).toBe(true);
    expect(isVisibleWhenMet(cond, { enabled: false })).toBe(false);
    expect(isVisibleWhenMet(cond, { enabled: "true" })).toBe(false);
    expect(isVisibleWhenMet(cond, {})).toBe(false);
  });

  it("valueTruthy: false is met while the controller is NOT true", () => {
    const cond = { field: "enabled", valueTruthy: false };
    expect(isVisibleWhenMet(cond, { enabled: true })).toBe(false);
    expect(isVisibleWhenMet(cond, { enabled: false })).toBe(true);
    expect(isVisibleWhenMet(cond, {})).toBe(true);
  });

  it("valueIn matches string membership only", () => {
    const cond = { field: "mode", valueIn: ["custom", "raw"] };
    expect(isVisibleWhenMet(cond, { mode: "custom" })).toBe(true);
    expect(isVisibleWhenMet(cond, { mode: "simple" })).toBe(false);
    expect(isVisibleWhenMet(cond, { mode: 3 })).toBe(false);
    expect(isVisibleWhenMet(cond, {})).toBe(false);
  });

  it("valueIn + valueTruthy must BOTH hold", () => {
    const cond = { field: "mode", valueIn: ["custom"], valueTruthy: false };
    expect(isVisibleWhenMet(cond, { mode: "custom" })).toBe(true);
    // valueTruthy:false fails when the value is literally `true` — but a
    // string can never be `true`, so exercise the inverse: valueIn fails.
    expect(isVisibleWhenMet(cond, { mode: "simple" })).toBe(false);
  });
});
