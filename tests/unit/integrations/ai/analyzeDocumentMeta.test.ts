/** @jest-environment node */
/**
 * AI-PROVIDER-5 (CS-5) — Analyze Document builder contract.
 *
 * Covers registration (catalog + handler + AI action registry), the
 * mode-driven conditional surface, readiness, the schema-editor Save gate,
 * the dynamic-output declarations CS-8 will consume, and the test-mode
 * posture. Everything runs against the REAL registries.
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
import { analyzeDocumentMeta } from "@/integrations/ai/actions/analyzeDocument.meta";
import { getAiActionRegistryEntry } from "@/services/ai/processor/aiActionRegistry";
import {
  getActionMeta,
  listActionMetasForProvider,
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { getActionHandler } from "@/services/execution/handlers/_registry";
import { decideTestModeBlock } from "@/services/execution/testModeGate";

const KEY = "ai:analyze_document";
const SCHEMA_VALUE = { fields: [{ name: "total", type: "currency", required: true }] };

function field(name: string): FieldMeta {
  const found = analyzeDocumentMeta.fields.find((f) => f.name === name);
  if (!found) throw new Error(`no field '${name}'`);
  return found;
}

function node(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "n1",
    kind: "action",
    provider: AI_PROVIDER_ID,
    type: "analyze_document",
    config,
  } as WorkflowNode;
}

describe("registration", () => {
  it("parses against the ActionMeta contract", () => {
    expect(ActionMetaSchema.safeParse(analyzeDocumentMeta).success).toBe(true);
  });

  it("is discoverable as a ChainReact AI action and has a registered handler", () => {
    expect(getActionMeta(KEY)).toBeDefined();
    expect(listActionMetasForProvider(AI_PROVIDER_ID).map((m) => m.key)).toEqual([KEY]);
    expect(getActionHandler(AI_PROVIDER_ID, "analyze_document")).toBeDefined();
  });

  it("is connectionless, low-risk, and never destructive", () => {
    expect(analyzeDocumentMeta.requiresIntegration).toBe(false);
    expect(analyzeDocumentMeta.riskLevel).toBe("low");
    expect(analyzeDocumentMeta.isDestructive).toBe(false);
    expect(analyzeDocumentMeta.requiresConfirmation).toBe(false);
    expect(analyzeDocumentMeta.category).toBe("ai");
  });

  it("runs in Test / Run-now (a real, uncharged AI call — owner decision 4)", () => {
    expect(decideTestModeBlock(AI_PROVIDER_ID, "analyze_document")).toEqual({
      blocked: false,
    });
  });

  it("every registered ai:* action meta has an AI action registry entry", () => {
    const aiMetas = listAllActionMetas().filter((m) => m.provider === AI_PROVIDER_ID);
    expect(aiMetas.length).toBeGreaterThan(0);
    for (const meta of aiMetas) {
      const entry = getAiActionRegistryEntry(meta.key);
      expect(entry).toBeDefined();
      expect(entry?.enabledFlag).toBe("AI_PROCESSOR_ENABLED");
    }
    expect(getAiActionRegistryEntry(KEY)?.feature).toBe("document_analysis");
  });

  it("discloses cost and AI processing in the description (no hidden spend)", () => {
    expect(analyzeDocumentMeta.description).toMatch(/AI credits/i);
    expect(analyzeDocumentMeta.description).toMatch(/processed by ChainReact's AI service/i);
  });
});

describe("conditional configuration", () => {
  const conditional: Record<string, string[]> = {
    expectedFields: ["extract_fields"],
    rowSchema: ["extract_rows"],
    labels: ["classify"],
    allowOtherLabel: ["classify"],
    question: ["answer_questions"],
  };

  it("shows the always-present setup fields in every mode", () => {
    for (const mode of [
      "summarize",
      "extract_fields",
      "extract_rows",
      "classify",
      "answer_questions",
    ]) {
      for (const name of ["file", "mode", "instructions"]) {
        expect(isVisibleWhenMet(field(name).visibleWhen, { mode })).toBe(true);
      }
    }
  });

  it("reveals each mode-scoped field only in its own mode", () => {
    for (const [name, modes] of Object.entries(conditional)) {
      for (const mode of [
        "summarize",
        "extract_fields",
        "extract_rows",
        "classify",
        "answer_questions",
      ]) {
        expect(isVisibleWhenMet(field(name).visibleWhen, { mode })).toBe(
          modes.includes(mode),
        );
      }
    }
  });

  it("keeps power-user knobs on the Advanced tab and core decisions off it", () => {
    const advanced = analyzeDocumentMeta.fields
      .filter((f) => f.advanced === true)
      .map((f) => f.name);
    expect(advanced).toEqual([
      "pageRange",
      "sheetName",
      "maxPages",
      "maxRows",
      "confidenceThreshold",
      "onLowConfidence",
      "strictValidation",
      "modelQuality",
    ]);
    for (const name of Object.keys(conditional)) {
      expect(field(name).advanced).toBeUndefined();
    }
  });

  it("uses structured editors — no raw-entry escape hatch anywhere", () => {
    expect(field("expectedFields").type).toBe("schema-fields");
    expect(field("rowSchema").type).toBe("schema-fields");
    expect(field("labels").type).toBe("string-array");
    expect(analyzeDocumentMeta.fields.some((f) => f.type === "json")).toBe(false);
  });
});

describe("readiness", () => {
  const required = buildRequiredFieldsByType(listAllActionMetas(), listAllTriggerMetas());

  it("asks only for the document until a mode is chosen", () => {
    const missing = missingRequiredFields(node({ mode: "summarize" }), required).map(
      (f) => f.name,
    );
    expect(missing).toEqual(["file"]);
  });

  it("adds the mode's own requirement once that mode is selected", () => {
    expect(
      missingRequiredFields(node({ file: "x", mode: "extract_fields" }), required).map(
        (f) => f.name,
      ),
    ).toEqual(["expectedFields"]);
    expect(
      missingRequiredFields(node({ file: "x", mode: "extract_rows" }), required).map(
        (f) => f.name,
      ),
    ).toEqual(["rowSchema"]);
    expect(
      missingRequiredFields(node({ file: "x", mode: "classify" }), required).map(
        (f) => f.name,
      ),
    ).toEqual(["labels"]);
    expect(
      missingRequiredFields(node({ file: "x", mode: "answer_questions" }), required).map(
        (f) => f.name,
      ),
    ).toEqual(["question"]);
  });

  it("never reports another mode's field as a gap (mode switching leaves no phantom)", () => {
    const missing = missingRequiredFields(
      node({ file: "x", mode: "summarize" }),
      required,
    );
    expect(missing).toEqual([]);
  });

  it("is satisfied once the visible mode field is filled", () => {
    expect(
      missingRequiredFields(
        node({ file: "x", mode: "extract_fields", expectedFields: SCHEMA_VALUE }),
        required,
      ),
    ).toEqual([]);
  });
});

describe("schema editor Save gate", () => {
  it("blocks an empty schema in an extract mode", () => {
    expect(
      collectSchemaFieldsBlockingError(analyzeDocumentMeta.fields, {
        mode: "extract_fields",
        expectedFields: { fields: [] },
      }),
    ).toMatch(/Add at least one field/);
  });

  it("ignores a schema belonging to a mode the author is not using", () => {
    expect(
      collectSchemaFieldsBlockingError(analyzeDocumentMeta.fields, {
        mode: "summarize",
        expectedFields: { fields: [] },
      }),
    ).toBeNull();
  });

  it("blocks a structurally invalid schema and passes a valid one", () => {
    expect(
      collectSchemaFieldsBlockingError(analyzeDocumentMeta.fields, {
        mode: "extract_rows",
        rowSchema: { fields: [{ name: "9bad", type: "string" }] },
      }),
    ).toMatch(/letters, numbers, and underscores/);
    expect(
      collectSchemaFieldsBlockingError(analyzeDocumentMeta.fields, {
        mode: "extract_rows",
        rowSchema: SCHEMA_VALUE,
      }),
    ).toBeNull();
  });
});

describe("outputs and dynamic-output declarations", () => {
  it("declares one fixed, bounded output key set", () => {
    expect(analyzeDocumentMeta.outputs.map((o) => o.name)).toEqual([
      "mode",
      "sourceName",
      "detectedType",
      "summary",
      "keyPoints",
      "fields",
      "rows",
      "rowCount",
      "label",
      "answer",
      "overallConfidence",
      "lowConfidenceFields",
      "truncated",
      "pageRangeApplied",
      "segmentsAnalyzed",
      "warnings",
    ]);
  });

  it("marks every mode-specific output nullable (it is null in the other modes)", () => {
    for (const name of ["summary", "keyPoints", "fields", "rows", "rowCount", "label", "answer"]) {
      const output = analyzeDocumentMeta.outputs.find((o) => o.name === name);
      expect(output?.nullable).toBe(true);
    }
  });

  it("points each schema editor at the output whose children it defines", () => {
    expect(analyzeDocumentMeta.dynamicOutputs).toEqual([
      {
        configField: "expectedFields",
        attachUnder: "fields",
        whenField: "mode",
        whenValueIn: ["extract_fields"],
      },
      {
        configField: "rowSchema",
        attachUnder: "rows",
        whenField: "mode",
        whenValueIn: ["extract_rows"],
      },
    ]);
  });

  it("emits no FileRef and never carries bytes", () => {
    expect(analyzeDocumentMeta.producesFileRef).toBe(false);
    expect(analyzeDocumentMeta.consumesFileRef).toBe(true);
    for (const output of analyzeDocumentMeta.outputs) {
      expect(output.type).not.toBe("fileRef");
    }
  });
});
