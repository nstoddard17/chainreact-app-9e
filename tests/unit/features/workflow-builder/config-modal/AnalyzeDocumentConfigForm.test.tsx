/**
 * AI-PROVIDER-5 (CS-5) — the Analyze Document config panel, rendered from
 * the REAL action metadata.
 *
 * User behavior: pick what the AI should do, and only that mode's settings
 * appear. Nobody is asked to hand-author a payload, and switching mode does
 * not leave the previous mode's answer behind to trip a runtime refinement.
 */
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import { selectFieldOption } from "@/tests/integration/features/workflow-builder/helpers/selectField";
import { deriveDefaultConfig } from "@/features/workflow-builder/state/graphSlice";
import { analyzeDocumentMeta } from "@/integrations/ai/actions/analyzeDocument.meta";

const FIELDS = analyzeDocumentMeta.fields;

function renderSetup(values: Record<string, unknown>, onChange = jest.fn()) {
  render(
    <SchemaForm fields={FIELDS} values={values} onChange={onChange} section="setup" />,
  );
  return onChange;
}

describe("setup surface", () => {
  it("always asks for the document and what to do with it", () => {
    renderSetup({ mode: "summarize" });
    expect(screen.getByText("Document")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /What should the AI do/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Extra instructions/)).toBeInTheDocument();
  });

  it("shows no mode-specific settings while summarizing", () => {
    renderSetup({ mode: "summarize" });
    expect(screen.queryByLabelText(/Fields to pull out/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Columns for each row/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Categories/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Question/)).not.toBeInTheDocument();
  });

  it.each([
    ["extract_fields", "Fields to pull out"],
    ["extract_rows", "Columns for each row"],
  ])("reveals the %s schema editor in its own mode", (mode, label) => {
    renderSetup({ mode });
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add field/i })).toBeInTheDocument();
  });

  it("reveals the question box when answering a question", () => {
    renderSetup({ mode: "answer_questions" });
    expect(screen.getByLabelText(/^Question/)).toBeInTheDocument();
  });

  it("reveals the category list and its Other toggle when classifying", () => {
    renderSetup({ mode: "classify" });
    expect(screen.getByLabelText(/^Categories/)).toBeInTheDocument();
    expect(screen.getByText(/Allow "Other" when nothing fits/)).toBeInTheDocument();
  });

  it("keeps the advanced knobs out of the setup path", () => {
    renderSetup({ mode: "extract_rows" });
    for (const label of [/Page range/, /Sheet name/, /Maximum pages/, /^Quality/]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it("renders a structured schema editor, not a text box", () => {
    renderSetup({ mode: "extract_fields", expectedFields: { fields: [] } });
    expect(screen.getByText(/No fields yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add field/i })).toBeInTheDocument();
  });
});

describe("mode switching", () => {
  it("clears the previous mode's answer so it cannot trip the runtime contract", async () => {
    const user = userEvent.setup();
    const onChange = renderSetup({
      mode: "answer_questions",
      question: "How much is due?",
    });

    await selectFieldOption(user, /What should the AI do/, "Pull out a table of rows");

    expect(onChange).toHaveBeenCalledWith("mode", "extract_rows");
    expect(onChange).toHaveBeenCalledWith("question", undefined);
  });

  it("keeps a hydrated value untouched until the author actually changes mode", () => {
    const onChange = renderSetup({
      mode: "answer_questions",
      question: "How much is due?",
    });
    expect(screen.getByLabelText(/^Question/)).toHaveValue("How much is due?");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("advanced surface", () => {
  it("draws only the power-user knobs, seeded with the declared defaults", () => {
    // A new node is created with `deriveDefaultConfig`, so this is the
    // config an author actually sees the first time they open Advanced.
    const seeded = deriveDefaultConfig(analyzeDocumentMeta);
    expect(seeded).toMatchObject({
      mode: "summarize",
      allowOtherLabel: true,
      maxRows: 100,
      confidenceThreshold: 0.7,
      onLowConfidence: "flag",
      strictValidation: true,
      modelQuality: "standard",
    });
    render(
      <SchemaForm
        fields={FIELDS}
        values={{ ...seeded, mode: "extract_rows" }}
        onChange={jest.fn()}
        section="advanced"
      />,
    );
    expect(screen.getByLabelText(/Page range/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confidence threshold/)).toHaveValue(0.7);
    expect(screen.getByRole("combobox", { name: /Quality/ })).toHaveTextContent(
      "Standard (3 credits)",
    );
    expect(screen.queryByText("Document")).not.toBeInTheDocument();
  });
});
