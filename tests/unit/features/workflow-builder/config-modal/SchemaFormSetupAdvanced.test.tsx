/**
 * CONFIG-UX-SETUP-ADVANCED-1 — SchemaForm section rendering, top-level
 * `visibleWhen` behavior, and the advanced override frame.
 *
 * User-behavior coverage:
 *   - section="setup" draws only normal fields; section="advanced" only
 *     advanced fields (one shared field list + values → pending edits are
 *     shared by construction).
 *   - a `visibleWhen`-gated field appears/disappears with its controller,
 *     and its value is cleared when a controller CHANGE hides it (never on
 *     hydration).
 *   - an advanced field with a custom value shows the override chip and
 *     "Reset to standard" clears the stored key; a value equal to the
 *     declared default is standard (no chip).
 */
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import type { FieldMeta } from "@/contracts/actionMeta";

const fields: readonly FieldMeta[] = [
  { name: "url", label: "URL", type: "text", required: true },
  {
    name: "mode",
    label: "Mode",
    type: "select",
    required: true,
    options: [
      { value: "simple", label: "Simple" },
      { value: "custom", label: "Custom" },
    ],
  },
  {
    name: "customBody",
    label: "Custom body",
    type: "textarea",
    required: false,
    visibleWhen: { field: "mode", valueIn: ["custom"] },
  },
  {
    name: "timeoutSeconds",
    label: "Timeout (seconds)",
    type: "number",
    required: false,
    advanced: true,
    defaultValue: 15,
  },
  {
    name: "userAgent",
    label: "User agent",
    type: "text",
    required: false,
    advanced: true,
  },
] as readonly FieldMeta[];

function renderForm(
  values: Record<string, unknown>,
  section?: "setup" | "advanced",
  onChange: jest.Mock = jest.fn(),
) {
  const utils = render(
    <SchemaForm
      fields={fields}
      values={values}
      onChange={onChange}
      {...(section ? { section } : {})}
    />,
  );
  return { ...utils, onChange };
}

describe("SchemaForm — section rendering", () => {
  it("setup section draws only non-advanced fields (no disclosure)", () => {
    renderForm({}, "setup");
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Mode")).toBeInTheDocument();
    expect(screen.queryByLabelText("Timeout (seconds)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("User agent")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schema-form-advanced")).not.toBeInTheDocument();
  });

  it("advanced section draws only advanced fields", () => {
    renderForm({}, "advanced");
    expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Timeout (seconds)")).toBeInTheDocument();
    expect(screen.getByLabelText("User agent")).toBeInTheDocument();
  });

  it("legacy mode (no section) keeps the collapsed disclosure", () => {
    renderForm({});
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.getByTestId("schema-form-advanced")).toBeInTheDocument();
  });

  it("setup section with only advanced fields explains where the settings live", () => {
    render(
      <SchemaForm
        fields={[fields[3]!, fields[4]!]}
        values={{}}
        onChange={jest.fn()}
        section="setup"
      />,
    );
    expect(
      screen.getByText(/Optional settings live in the Advanced tab/i),
    ).toBeInTheDocument();
  });
});

describe("SchemaForm — top-level visibleWhen", () => {
  it("hides the gated field until the controller matches", () => {
    renderForm({ mode: "simple" }, "setup");
    expect(screen.queryByLabelText("Custom body")).not.toBeInTheDocument();
  });

  it("shows the gated field when the controller matches (hydration keeps values)", () => {
    renderForm({ mode: "custom", customBody: "hello" }, "setup");
    expect(screen.getByLabelText("Custom body")).toHaveValue("hello");
  });

  it("clears the gated field's value when a controller CHANGE hides it", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderForm({ mode: "custom", customBody: "hello" }, "setup", onChange);
    // Radix select: open the combobox, pick the option.
    await user.click(screen.getByRole("combobox", { name: "Mode" }));
    await user.click(screen.getByRole("option", { name: "Simple" }));
    expect(onChange).toHaveBeenCalledWith("mode", "simple");
    expect(onChange).toHaveBeenCalledWith("customBody", undefined);
  });

  it("does NOT clear the gated field when the controller change keeps it visible", async () => {
    const gated: readonly FieldMeta[] = [
      {
        name: "mode",
        label: "Mode",
        type: "select",
        required: true,
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "off", label: "Off" },
        ],
      },
      {
        name: "detail",
        label: "Detail",
        type: "text",
        required: false,
        visibleWhen: { field: "mode", valueIn: ["a", "b"] },
      },
    ] as readonly FieldMeta[];
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm
        fields={gated}
        values={{ mode: "a", detail: "keep me" }}
        onChange={onChange}
        section="setup"
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Mode" }));
    await user.click(screen.getByRole("option", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("mode", "b");
    expect(onChange).not.toHaveBeenCalledWith("detail", undefined);
  });
});

describe("SchemaForm — advanced override frame", () => {
  it("no chip while the advanced value is unset or equals the default", () => {
    renderForm({ timeoutSeconds: 15 }, "advanced");
    expect(screen.queryByTestId("advanced-override-row")).not.toBeInTheDocument();
  });

  it("a custom advanced value shows the override chip", () => {
    renderForm({ timeoutSeconds: 30 }, "advanced");
    const rows = screen.getAllByTestId("advanced-override-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-override-field", "timeoutSeconds");
    expect(
      screen.getByText(/overrides standard behavior/i),
    ).toBeInTheDocument();
  });

  it("a defaultless advanced field with any value counts as an override", () => {
    renderForm({ userAgent: "custom-agent" }, "advanced");
    expect(screen.getByTestId("advanced-override-row")).toHaveAttribute(
      "data-override-field",
      "userAgent",
    );
  });

  it("Reset to standard clears the stored key (restores derived behavior)", () => {
    const onChange = jest.fn();
    renderForm({ timeoutSeconds: 30 }, "advanced", onChange);
    fireEvent.click(screen.getByTestId("advanced-override-reset"));
    expect(onChange).toHaveBeenCalledWith("timeoutSeconds", undefined);
  });

  it("setup edits never touch advanced keys (per-field dispatch only)", () => {
    const onChange = jest.fn();
    renderForm({ timeoutSeconds: 30 }, "setup", onChange);
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://x.test" },
    });
    const touched = onChange.mock.calls.map((c) => c[0]);
    expect(touched).toContain("url");
    expect(touched).not.toContain("timeoutSeconds");
    expect(touched).not.toContain("userAgent");
  });
});
