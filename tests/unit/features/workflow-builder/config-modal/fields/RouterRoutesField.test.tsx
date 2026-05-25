/**
 * Tests for features/workflow-builder/config-modal/fields/RouterRoutesField.
 *
 * Slice 3.6. Covers the controlled-component contract: add / remove /
 * edit / operator-switch all emit the runtime-schema-shaped value
 * through onChange. The inline FieldShell error surfaces the
 * top-level validation message; per-row errors surface inline below
 * the offending row.
 *
 * Unary operators DROP the `value` key from the saved object (the
 * `.strict()` runtime schema rejects `value: undefined`). The
 * operator picker must hide the value input row in that case.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { RouterRoutesField } from "@/features/workflow-builder/config-modal/fields/RouterRoutesField";

const field: FieldMeta = {
  name: "routes",
  label: "Routes",
  type: "router-routes",
  required: true,
  description: "Ordered list of routes; first match wins.",
};

interface SavedRoute {
  label: string;
  condition: {
    input: unknown;
    operator: string;
    value?: unknown;
  };
}

function lastEmitted(onChange: jest.Mock): SavedRoute[] {
  return onChange.mock.calls[onChange.mock.calls.length - 1]![0] as SavedRoute[];
}

describe("RouterRoutesField — empty value", () => {
  it("renders the empty-state hint when value is not an array", () => {
    render(<RouterRoutesField field={field} value={undefined} onChange={jest.fn()} />);
    expect(
      screen.getByText(/no routes yet\. add a route to get started\./i),
    ).toBeInTheDocument();
    // FieldShell surfaces the validator's "Add at least one route" error.
    expect(screen.getByText(/add at least one route/i)).toBeInTheDocument();
  });

  it("Add route appends a blank row and emits the new array via onChange", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<RouterRoutesField field={field} value={[]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /^add route$/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastEmitted(onChange)).toEqual([
      {
        label: "",
        condition: { input: "", operator: "equals", value: "" },
      },
    ]);
  });
});

describe("RouterRoutesField — editing rows", () => {
  const oneRoute: SavedRoute[] = [
    {
      label: "happy",
      condition: { input: "{{trigger.x}}", operator: "equals", value: "yes" },
    },
  ];

  it("editing the label emits the updated label", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <RouterRoutesField field={field} value={oneRoute} onChange={onChange} />,
    );
    const labelInput = screen.getByLabelText("Route 1 label");
    await user.type(labelInput, "X");
    const emitted = lastEmitted(onChange);
    expect(emitted[0]!.label).toBe("happyX");
  });

  it("editing the input emits the updated condition.input", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <RouterRoutesField field={field} value={oneRoute} onChange={onChange} />,
    );
    await user.type(screen.getByLabelText("Route 1 input"), "Y");
    expect(lastEmitted(onChange)[0]!.condition.input).toBe(
      "{{trigger.x}}Y",
    );
  });

  it("editing the value emits the updated condition.value", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <RouterRoutesField field={field} value={oneRoute} onChange={onChange} />,
    );
    await user.type(screen.getByLabelText("Route 1 value"), "Z");
    expect(lastEmitted(onChange)[0]!.condition.value).toBe("yesZ");
  });

  it("removing a row emits the array without that row", async () => {
    const twoRoutes: SavedRoute[] = [
      oneRoute[0]!,
      {
        label: "sad",
        condition: { input: "x", operator: "equals", value: "no" },
      },
    ];
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <RouterRoutesField field={field} value={twoRoutes} onChange={onChange} />,
    );
    await user.click(screen.getByLabelText("Remove route 2"));
    expect(lastEmitted(onChange)).toHaveLength(1);
    expect(lastEmitted(onChange)[0]!.label).toBe("happy");
  });
});

describe("RouterRoutesField — operator switching", () => {
  it("switching to a unary operator hides the value input and drops `value` from the saved object", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const initial: SavedRoute[] = [
      {
        label: "x",
        condition: { input: "y", operator: "equals", value: "z" },
      },
    ];
    const { rerender } = render(
      <RouterRoutesField field={field} value={initial} onChange={onChange} />,
    );
    // Native <select> — pick by visible label.
    await user.selectOptions(
      screen.getByLabelText("Route 1 operator"),
      "is_empty",
    );
    const after = lastEmitted(onChange);
    expect(after[0]!.condition.operator).toBe("is_empty");
    // Saved object must NOT contain a `value` key for a unary operator.
    expect(Object.prototype.hasOwnProperty.call(after[0]!.condition, "value")).toBe(false);

    // Re-render with the unary state — the value input is gone.
    rerender(<RouterRoutesField field={field} value={after} onChange={onChange} />);
    expect(
      screen.queryByLabelText("Route 1 value"),
    ).not.toBeInTheDocument();
  });

  it("switching back to a binary operator restores an editable value input (starts empty)", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const unary: SavedRoute[] = [
      { label: "x", condition: { input: "y", operator: "is_empty" } },
    ];
    const { rerender } = render(
      <RouterRoutesField field={field} value={unary} onChange={onChange} />,
    );
    await user.selectOptions(
      screen.getByLabelText("Route 1 operator"),
      "equals",
    );
    const after = lastEmitted(onChange);
    expect(after[0]!.condition.operator).toBe("equals");
    expect(after[0]!.condition.value).toBe("");

    rerender(<RouterRoutesField field={field} value={after} onChange={onChange} />);
    expect(screen.getByLabelText("Route 1 value")).toBeInTheDocument();
  });
});

describe("RouterRoutesField — per-row validation", () => {
  it("surfaces a duplicate-label inline error on the second offending row", () => {
    const dup: SavedRoute[] = [
      { label: "a", condition: { input: "x", operator: "equals", value: "y" } },
      { label: "a", condition: { input: "x", operator: "equals", value: "z" } },
    ];
    render(<RouterRoutesField field={field} value={dup} onChange={jest.fn()} />);
    expect(
      within(screen.getByTestId("router-route-row-1-error")).getByText(
        /duplicate label 'a'/i,
      ),
    ).toBeInTheDocument();
    // Top-level error too.
    expect(
      screen.getByText(/one or more routes are invalid/i),
    ).toBeInTheDocument();
  });

  it("surfaces a missing-label inline error and the top-level summary", () => {
    const missing: SavedRoute[] = [
      { label: "", condition: { input: "x", operator: "equals", value: "y" } },
    ];
    render(
      <RouterRoutesField field={field} value={missing} onChange={jest.fn()} />,
    );
    expect(
      within(screen.getByTestId("router-route-row-0-error")).getByText(
        /label is required/i,
      ),
    ).toBeInTheDocument();
  });
});

describe("RouterRoutesField — cap", () => {
  it("disables Add route once 32 routes are present", () => {
    const many: SavedRoute[] = Array.from({ length: 32 }, (_, i) => ({
      label: `r${i}`,
      condition: { input: "x", operator: "equals", value: "y" },
    }));
    render(<RouterRoutesField field={field} value={many} onChange={jest.fn()} />);
    expect(screen.getByRole("button", { name: /add route \(max 32\)/i })).toBeDisabled();
  });
});

describe("RouterRoutesField — disabled prop", () => {
  it("disables every input + the add button when `disabled` is set", () => {
    const oneRoute: SavedRoute[] = [
      {
        label: "happy",
        condition: { input: "x", operator: "equals", value: "y" },
      },
    ];
    render(
      <RouterRoutesField
        field={field}
        value={oneRoute}
        onChange={jest.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText("Route 1 label")).toBeDisabled();
    expect(screen.getByLabelText("Route 1 input")).toBeDisabled();
    expect(screen.getByLabelText("Route 1 value")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /^add route$/i }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Remove route 1")).toBeDisabled();
  });
});
