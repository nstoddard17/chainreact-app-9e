import { render, screen } from "@testing-library/react";
import { FieldSetupHint } from "@/features/workflow-builder/config-modal/fields/FieldSetupHint";

describe("FieldSetupHint", () => {
  it("renders the pre-filled badge + source label for prefilled_variable", () => {
    render(
      <FieldSetupHint
        state="prefilled_variable"
        fieldLabel="Subject"
        sourceLabel="Subject from the trigger"
      />,
    );
    expect(screen.getByTestId("field-prefill-hint")).toHaveTextContent("Pre-filled from earlier step");
    expect(screen.getByTestId("field-prefill-source")).toHaveTextContent("Subject from the trigger");
  });

  it("renders the pre-filled badge without a source label for prefilled_mixed", () => {
    render(<FieldSetupHint state="prefilled_mixed" fieldLabel="Message" sourceLabel={null} />);
    expect(screen.getByTestId("field-prefill-hint")).toHaveTextContent("Pre-filled from earlier step");
    expect(screen.queryByTestId("field-prefill-source")).not.toBeInTheDocument();
  });

  it("never renders a raw {{...}} expression", () => {
    const { container } = render(
      <FieldSetupHint
        state="prefilled_variable"
        fieldLabel="Subject"
        sourceLabel="Subject from the trigger"
      />,
    );
    expect(container.textContent ?? "").not.toContain("{{");
  });

  it("renders a 'choose your <field>' prompt for needs_input", () => {
    render(<FieldSetupHint state="needs_input" fieldLabel="Channel" />);
    expect(screen.getByTestId("field-setup-required")).toHaveTextContent(
      "Choose your channel to finish setting up this step.",
    );
  });

  it("renders nothing for literal / optional_empty / unresolved_reference", () => {
    for (const state of ["literal", "optional_empty", "unresolved_reference"] as const) {
      const { container } = render(<FieldSetupHint state={state} fieldLabel="X" />);
      expect(container).toBeEmptyDOMElement();
    }
  });
});
