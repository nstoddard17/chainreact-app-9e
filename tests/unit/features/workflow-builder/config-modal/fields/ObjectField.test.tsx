/**
 * CONFIG-UX-SETUP-ADVANCED-1 — `object` field renderer.
 *
 * User behavior: fill labeled inputs instead of hand-authoring JSON; the
 * committed value is the REAL flat object the runtime schema expects;
 * unknown saved keys are never dropped; an all-empty object commits
 * `undefined`.
 */
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObjectField } from "@/features/workflow-builder/config-modal/fields/ObjectField";
import type { FieldMeta } from "@/contracts/actionMeta";

const contactField: FieldMeta = {
  name: "contact",
  label: "Company contact information",
  description:
    "The postal address shown in the footer of emails sent to this audience.",
  type: "object",
  required: true,
  itemFields: [
    { name: "company", label: "Company name", type: "text", required: true },
    { name: "address1", label: "Address line 1", type: "text", required: true },
    { name: "city", label: "City", type: "text", required: true },
    { name: "zip", label: "ZIP or postal code", type: "text", required: true },
  ],
} as FieldMeta;

const taxField: FieldMeta = {
  name: "automaticTax",
  label: "Automatic tax",
  type: "object",
  required: false,
  itemFields: [
    { name: "enabled", label: "Calculate tax automatically", type: "boolean", required: true },
  ],
} as FieldMeta;

describe("ObjectField — commits the real flat-object shape", () => {
  it("renders one labeled input per declared sub-field", () => {
    render(<ObjectField field={contactField} value={undefined} onChange={jest.fn()} />);
    expect(screen.getByLabelText("Company name")).toBeInTheDocument();
    expect(screen.getByLabelText("Address line 1")).toBeInTheDocument();
    expect(screen.getByLabelText("City")).toBeInTheDocument();
    expect(screen.getByLabelText("ZIP or postal code")).toBeInTheDocument();
  });

  it("typing commits a real object keyed by sub-field name", () => {
    const onChange = jest.fn();
    render(<ObjectField field={contactField} value={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Company name"), {
      target: { value: "Acme Inc" },
    });
    expect(onChange).toHaveBeenCalledWith({ company: "Acme Inc" });
  });

  it("hydrates a saved object into the inputs", () => {
    render(
      <ObjectField
        field={contactField}
        value={{ company: "Acme", city: "Reno" }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Company name")).toHaveValue("Acme");
    expect(screen.getByLabelText("City")).toHaveValue("Reno");
  });

  it("preserves unknown saved keys on every commit (never drops what it doesn't understand)", () => {
    const onChange = jest.fn();
    render(
      <ObjectField
        field={contactField}
        value={{ company: "Acme", state: "NV", phone: "555" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Reno" } });
    expect(onChange).toHaveBeenCalledWith({
      company: "Acme",
      state: "NV",
      phone: "555",
      city: "Reno",
    });
  });

  it("clearing the last known value commits undefined (optional objects drop out)", () => {
    const onChange = jest.fn();
    render(
      <ObjectField field={contactField} value={{ company: "Acme" }} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("boolean sub-fields commit real booleans (false is kept, not dropped)", () => {
    const onChange = jest.fn();
    render(<ObjectField field={taxField} value={{ enabled: true }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Calculate tax automatically"));
    expect(onChange).toHaveBeenCalledWith({ enabled: false });
  });

  it("never asks for JSON anywhere in its copy", () => {
    const { container } = render(
      <ObjectField field={contactField} value={undefined} onChange={jest.fn()} />,
    );
    expect(container.textContent).not.toMatch(/json/i);
  });
});
