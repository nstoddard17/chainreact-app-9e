/**
 * CS-8 (AI-PROVIDER-8) — the variable picker and the soft reference
 * validator over SYNTHESIZED dynamic outputs.
 *
 * Composes the real pieces end to end with no mocks: real AI metas →
 * `applyDynamicOutputs` → the real `VariablePickerPopover` (rendering +
 * token insertion) and the real `validateReferences` (rename → soft
 * `missing_field` warning downstream).
 */
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { VariablePickerPopover } from "@/features/workflow-builder/config-modal/fields/VariablePickerPopover";
import { validateReferences } from "@/features/workflow-builder/config-modal/fields/_variableValidator";
import { applyDynamicOutputs } from "@/core/workflows/dynamicOutputs";
import { analyzeDocumentMeta } from "@/integrations/ai/actions/analyzeDocument.meta";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

function makeAiSource(config: Record<string, unknown>): VariableSource {
  return {
    sourceId: "ai1",
    displayName: analyzeDocumentMeta.displayName,
    kind: "action",
    provider: "ai",
    outputs: applyDynamicOutputs(analyzeDocumentMeta, config),
  };
}

const EXTRACT_FIELDS_CONFIG = {
  mode: "extract_fields",
  expectedFields: {
    fields: [
      { name: "employee_name", type: "string" },
      { name: "gross_pay", type: "currency" },
    ],
  },
};

describe("VariablePickerPopover — synthesized dynamic outputs", () => {
  it("renders the author's schema fields as insertable children of `fields`", () => {
    const onInsert = jest.fn();
    render(
      <VariablePickerPopover
        sources={[makeAiSource(EXTRACT_FIELDS_CONFIG)]}
        onInsert={onInsert}
        onClose={() => {}}
      />,
    );
    // First source auto-expands; the child rows render under `fields`.
    const child = screen.getByTestId("variable-output-ai1-fields.employee_name");
    expect(child).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Insert {{ai1.fields.employee_name}}" }),
    );
    expect(onInsert).toHaveBeenCalledWith("{{ai1.fields.employee_name}}");
  });

  it("shows the mapped output type chip for synthesized children (currency → number)", () => {
    render(
      <VariablePickerPopover
        sources={[makeAiSource(EXTRACT_FIELDS_CONFIG)]}
        onInsert={() => {}}
        onClose={() => {}}
      />,
    );
    const grossPay = screen.getByTestId("variable-output-ai1-fields.gross_pay");
    expect(grossPay.querySelector('[aria-label="Type number"]')).not.toBeNull();
  });

  it("renders no schema children when the node is in a non-extract mode", () => {
    render(
      <VariablePickerPopover
        sources={[makeAiSource({ mode: "summarize" })]}
        onInsert={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("variable-output-ai1-fields")).toBeInTheDocument();
    expect(
      screen.queryByTestId("variable-output-ai1-fields.employee_name"),
    ).not.toBeInTheDocument();
  });

  it("renders row-schema columns as children of `rows`", () => {
    const source = makeAiSource({
      mode: "extract_rows",
      rowSchema: {
        fields: [
          { name: "item", type: "string" },
          { name: "amount", type: "currency" },
        ],
      },
    });
    render(
      <VariablePickerPopover
        sources={[source]}
        onInsert={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("variable-output-ai1-rows.item")).toBeInTheDocument();
    expect(screen.getByTestId("variable-output-ai1-rows.amount")).toBeInTheDocument();
  });
});

describe("validateReferences — synthesized dynamic outputs", () => {
  it("a reference to a committed schema field resolves cleanly", () => {
    const warnings = validateReferences({
      value: "Pay {{ai1.fields.gross_pay}} to {{ai1.fields.employee_name}}",
      sources: [makeAiSource(EXTRACT_FIELDS_CONFIG)],
    });
    expect(warnings).toEqual([]);
  });

  it("renaming a schema field turns stale downstream references into soft missing_field warnings", () => {
    const renamed = makeAiSource({
      mode: "extract_fields",
      expectedFields: {
        fields: [
          { name: "employee_name", type: "string" },
          { name: "net_pay", type: "currency" },
        ],
      },
    });
    const warnings = validateReferences({
      value: "Pay {{ai1.fields.gross_pay}}",
      sources: [renamed],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toBe("missing_field");
    expect(warnings[0]!.token).toBe("{{ai1.fields.gross_pay}}");
  });

  it("without a committed schema, `fields` stays opaque (no false warnings mid-setup)", () => {
    const warnings = validateReferences({
      value: "{{ai1.fields.anything_at_all}}",
      sources: [makeAiSource({ mode: "summarize" })],
    });
    expect(warnings).toEqual([]);
  });

  it("row-schema children validate typos under `rows` too", () => {
    const source = makeAiSource({
      mode: "extract_rows",
      rowSchema: { fields: [{ name: "item", type: "string" }] },
    });
    expect(
      validateReferences({ value: "{{ai1.rows.item}}", sources: [source] }),
    ).toEqual([]);
    const warnings = validateReferences({
      value: "{{ai1.rows.itme}}",
      sources: [source],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toBe("missing_field");
  });
});
