/** @jest-environment node */
/**
 * AI-PROVIDER-6 (CS-6) — Transform Data builder contract + destination picker.
 *
 * Registration, the mode-driven conditional surface, readiness, the schema
 * editor's Save gate, the destination option source, and the dynamic-output
 * declarations CS-8 will consume — all against the REAL registries.
 */
import {
  ActionMetaSchema,
  isVisibleWhenMet,
  type FieldMeta,
} from "@/contracts/actionMeta";
import type { WorkflowNode } from "@/contracts/workflow";
import { AI_PROVIDER_ID } from "@/core/integrations/connectionlessProviders";
import {
  buildRequiredFieldsByType,
  missingRequiredFields,
} from "@/core/workflows/requiredFields";
import { collectSchemaFieldsBlockingError } from "@/features/workflow-builder/config-modal/fields/_schemaFieldsBlocking";
import { transformDataMeta } from "@/integrations/ai/actions/transformData.meta";
import { aiDestinationActionsResolver } from "@/integrations/ai/options/destinationActions";
import { getAiActionRegistryEntry } from "@/services/ai/processor/aiActionRegistry";
import {
  getActionMeta,
  listActionMetasForProvider,
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { getActionHandler } from "@/services/execution/handlers/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import { decideTestModeBlock } from "@/services/execution/testModeGate";
import type { OptionsResolverContext } from "@/services/options/types";

const KEY = "ai:transform_data";
const SCHEMA_VALUE = { fields: [{ name: "full_name", type: "string", required: true }] };

function field(name: string): FieldMeta {
  const found = transformDataMeta.fields.find((f) => f.name === name);
  if (!found) throw new Error(`no field '${name}'`);
  return found;
}

function node(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "n1",
    kind: "action",
    provider: AI_PROVIDER_ID,
    type: "transform_data",
    config,
  } as WorkflowNode;
}

function resolverCtx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration: null, q: "", deps: {}, ...overrides };
}

describe("registration", () => {
  it("parses against the ActionMeta contract", () => {
    expect(ActionMetaSchema.safeParse(transformDataMeta).success).toBe(true);
  });

  it("joins Analyze Document in the ChainReact AI catalog with a registered handler", () => {
    expect(getActionMeta(KEY)).toBeDefined();
    expect(listActionMetasForProvider(AI_PROVIDER_ID).map((m) => m.key)).toEqual([
      "ai:analyze_document",
      KEY,
    ]);
    expect(getActionHandler(AI_PROVIDER_ID, "transform_data")).toBeDefined();
  });

  it("is connectionless, low-risk, and runs in Test / Run-now", () => {
    expect(transformDataMeta.requiresIntegration).toBe(false);
    expect(transformDataMeta.riskLevel).toBe("low");
    expect(transformDataMeta.isDestructive).toBe(false);
    expect(transformDataMeta.category).toBe("ai");
    expect(decideTestModeBlock(AI_PROVIDER_ID, "transform_data")).toEqual({
      blocked: false,
    });
  });

  it("is billed through the data_transform feature", () => {
    expect(getAiActionRegistryEntry(KEY)?.feature).toBe("data_transform");
    expect(getAiActionRegistryEntry(KEY)?.enabledFlag).toBe("AI_PROCESSOR_ENABLED");
  });

  it("discloses cost and AI processing in the description", () => {
    expect(transformDataMeta.description).toMatch(/AI credits/i);
    expect(transformDataMeta.description).toMatch(/processed by ChainReact's AI service/i);
  });
});

describe("conditional configuration", () => {
  it("always asks for the data, the mode, the shape, and optional instructions", () => {
    for (const mode of ["action", "custom"]) {
      for (const name of ["input", "destinationMode", "outputShape", "instructions"]) {
        expect(isVisibleWhenMet(field(name).visibleWhen, { destinationMode: mode })).toBe(
          true,
        );
      }
    }
  });

  it("reveals the destination picker only in action mode", () => {
    expect(
      isVisibleWhenMet(field("destinationAction").visibleWhen, { destinationMode: "action" }),
    ).toBe(true);
    expect(
      isVisibleWhenMet(field("destinationAction").visibleWhen, { destinationMode: "custom" }),
    ).toBe(false);
  });

  it("reveals the schema editor only in custom mode", () => {
    expect(
      isVisibleWhenMet(field("destinationSchema").visibleWhen, { destinationMode: "custom" }),
    ).toBe(true);
    expect(
      isVisibleWhenMet(field("destinationSchema").visibleWhen, { destinationMode: "action" }),
    ).toBe(false);
  });

  it("defaults to the destination-action experience (owner decision 10)", () => {
    expect(field("destinationMode").defaultValue).toBe("action");
    expect(field("outputShape").defaultValue).toBe("rows");
  });

  it("keeps power-user knobs on the Advanced tab and core decisions off it", () => {
    expect(
      transformDataMeta.fields.filter((f) => f.advanced === true).map((f) => f.name),
    ).toEqual([
      "maxRows",
      "confidenceThreshold",
      "onLowConfidence",
      "strictValidation",
      "modelQuality",
    ]);
    for (const name of [
      "input",
      "destinationMode",
      "destinationAction",
      "destinationSchema",
      "outputShape",
    ]) {
      expect(field(name).advanced).toBeUndefined();
    }
  });

  it("uses a registered picker for the destination and never a raw key box", () => {
    expect(field("destinationAction").type).toBe("combobox");
    expect(field("destinationAction").optionsSource).toBe("ai:destination_actions");
    expect(field("destinationAction").allowManualEntry).toBeUndefined();
    expect(transformDataMeta.fields.some((f) => f.type === "json")).toBe(false);
  });
});

describe("readiness", () => {
  const required = buildRequiredFieldsByType(listAllActionMetas(), listAllTriggerMetas());

  it("asks for the data and the destination in the default mode", () => {
    expect(
      missingRequiredFields(node({ destinationMode: "action" }), required).map(
        (f) => f.name,
      ),
    ).toEqual(["input", "destinationAction"]);
  });

  it("asks for the schema instead once the author defines fields by hand", () => {
    expect(
      missingRequiredFields(node({ input: "{{a.rows}}", destinationMode: "custom" }), required).map(
        (f) => f.name,
      ),
    ).toEqual(["destinationSchema"]);
  });

  it("never reports the other mode's field as a gap", () => {
    expect(
      missingRequiredFields(
        node({
          input: "{{a.rows}}",
          destinationMode: "action",
          destinationAction: "microsoft-outlook:send_email",
        }),
        required,
      ),
    ).toEqual([]);
  });

  it("treats the defaulted mode/shape selects as satisfied", () => {
    const names = missingRequiredFields(node({}), required).map((f) => f.name);
    expect(names).not.toContain("destinationMode");
    expect(names).not.toContain("outputShape");
  });
});

describe("schema editor Save gate", () => {
  it("blocks an empty schema in custom mode and ignores it in action mode", () => {
    expect(
      collectSchemaFieldsBlockingError(transformDataMeta.fields, {
        destinationMode: "custom",
        destinationSchema: { fields: [] },
      }),
    ).toMatch(/Add at least one field/);
    expect(
      collectSchemaFieldsBlockingError(transformDataMeta.fields, {
        destinationMode: "action",
        destinationSchema: { fields: [] },
      }),
    ).toBeNull();
    expect(
      collectSchemaFieldsBlockingError(transformDataMeta.fields, {
        destinationMode: "custom",
        destinationSchema: SCHEMA_VALUE,
      }),
    ).toBeNull();
  });
});

describe("outputs and dynamic-output declarations", () => {
  it("declares one fixed, bounded output key set", () => {
    expect(transformDataMeta.outputs.map((o) => o.name)).toEqual([
      "rows",
      "rowCount",
      "record",
      "inputCount",
      "destination",
      "overallConfidence",
      "lowConfidenceFields",
      "warnings",
    ]);
  });

  it("marks the shape-specific outputs nullable", () => {
    for (const name of ["rows", "rowCount", "record", "destination"]) {
      expect(transformDataMeta.outputs.find((o) => o.name === name)?.nullable).toBe(true);
    }
  });

  it("points the custom schema editor at both output shapes", () => {
    expect(transformDataMeta.dynamicOutputs).toEqual([
      {
        configField: "destinationSchema",
        attachUnder: "rows",
        whenField: "destinationMode",
        whenValueIn: ["custom"],
      },
      {
        configField: "destinationSchema",
        attachUnder: "record",
        whenField: "destinationMode",
        whenValueIn: ["custom"],
      },
    ]);
  });

  it("emits no FileRef", () => {
    expect(transformDataMeta.producesFileRef).toBe(false);
    expect(transformDataMeta.consumesFileRef).toBe(false);
  });
});

describe("ai:destination_actions option source", () => {
  it("is registered and needs no connection", () => {
    const resolver = getOptionsResolver("ai:destination_actions");
    expect(resolver).toBeDefined();
    expect(resolver?.requiresIntegration).toBe(false);
    expect(resolver?.requiredDeps).toBeUndefined();
  });

  it("lists real registered actions, labeled by app", async () => {
    const result = await aiDestinationActionsResolver.resolve(resolverCtx());
    expect(result.items.length).toBeGreaterThan(20);
    const keys = new Set(result.items.map((i) => i.value));
    expect(keys.has("microsoft-outlook:send_email")).toBe(true);
    for (const item of result.items) {
      // Every offered destination resolves in the same registry the runtime reads.
      expect(getActionMeta(item.value)).toBeDefined();
      expect(item.label).toMatch(/ — /);
    }
  });

  it("never offers a ChainReact AI action as a destination", async () => {
    const result = await aiDestinationActionsResolver.resolve(resolverCtx());
    expect(result.items.some((i) => i.value.startsWith("ai:"))).toBe(false);
  });

  it("only offers destinations that actually have mappable fields", async () => {
    const result = await aiDestinationActionsResolver.resolve(resolverCtx());
    for (const item of result.items.slice(0, 40)) {
      expect(item.description).toMatch(/^[1-9]\d* fields? can be filled automatically\./);
    }
  });

  it("filters on the search query", async () => {
    const result = await aiDestinationActionsResolver.resolve(resolverCtx({ q: "outlook" }));
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(`${item.label} ${item.value}`.toLowerCase()).toContain("outlook");
    }
  });

  it("returns nothing rather than everything for an unmatched query", async () => {
    const result = await aiDestinationActionsResolver.resolve(
      resolverCtx({ q: "zzzz-not-a-real-action" }),
    );
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});
