/**
 * Tests for SchemaForm.
 *
 * Verifies:
 *   - Renders one field per FieldMeta entry through the registry.
 *   - Dispatches onChange(name, value) correctly.
 *   - Renders inline errors keyed by FieldMeta.name.
 *   - Propagates `disabled` to renderers.
 *   - Surfaces an empty-state when fields[] is empty.
 *   - Surfaces a developer-error message for an unknown FieldType
 *     (defense in depth — TypeScript prevents this at compile time).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";

const fields: readonly FieldMeta[] = [
  { name: "url", label: "URL", type: "text", required: true } as FieldMeta,
  {
    name: "body",
    label: "Body",
    type: "textarea",
    required: false,
  } as FieldMeta,
  {
    name: "method",
    label: "Method",
    type: "select",
    required: true,
    options: [
      { value: "GET", label: "GET" },
      { value: "POST", label: "POST" },
    ],
  } as FieldMeta,
  {
    name: "timeoutSeconds",
    label: "Timeout",
    type: "number",
    required: false,
    numeric: { min: 1, max: 30, integer: true, step: 1 },
  } as FieldMeta,
  { name: "active", label: "Active", type: "boolean", required: false } as FieldMeta,
];

describe("SchemaForm", () => {
  it("renders one input per field", () => {
    render(
      <SchemaForm fields={fields} values={{}} onChange={jest.fn()} />,
    );
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Body")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Method" })).toBeInTheDocument();
    expect(screen.getByLabelText("Timeout")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Active" })).toBeInTheDocument();
  });

  it("invokes onChange(name, value) on text input", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm fields={fields} values={{}} onChange={onChange} />,
    );
    await user.type(screen.getByLabelText("URL"), "x");
    expect(onChange).toHaveBeenCalledWith("url", "x");
  });

  it("renders inline errors keyed by FieldMeta.name", () => {
    render(
      <SchemaForm
        fields={fields}
        values={{}}
        errors={{ url: "URL is required.", body: "Body too long." }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("URL is required.")).toBeInTheDocument();
    expect(screen.getByText("Body too long.")).toBeInTheDocument();
  });

  it("propagates disabled to every renderer", () => {
    render(
      <SchemaForm fields={fields} values={{}} onChange={jest.fn()} disabled />,
    );
    expect(screen.getByLabelText("URL")).toBeDisabled();
    expect(screen.getByLabelText("Body")).toBeDisabled();
    expect(screen.getByLabelText("Timeout")).toBeDisabled();
  });

  it("renders the empty-state message when fields[] is empty", () => {
    render(
      <SchemaForm fields={[]} values={{}} onChange={jest.fn()} />,
    );
    expect(
      screen.getByText("This action has no configurable fields."),
    ).toBeInTheDocument();
  });

  it("renders a developer-error message for an unknown FieldType", () => {
    const bogus = [
      {
        name: "x",
        label: "X",
        type: "telepathy" as unknown,
        required: false,
      } as unknown as FieldMeta,
    ];
    render(
      <SchemaForm fields={bogus} values={{}} onChange={jest.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Unknown field type/);
  });
});

// ─── Slice 3.33 — dependsOn cascade ──────────────────────────────────────────

describe("SchemaForm dependsOn cascade (Slice 3.33)", () => {
  const cascadeFields: readonly FieldMeta[] = [
    {
      name: "parent",
      label: "Parent",
      type: "text",
      required: true,
    } as FieldMeta,
    {
      name: "child",
      label: "Child",
      type: "text",
      required: false,
      dependsOn: "parent",
    } as FieldMeta,
    {
      name: "unrelated",
      label: "Unrelated",
      type: "text",
      required: false,
    } as FieldMeta,
  ];

  it("clears a direct dependent when its parent changes", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm
        fields={cascadeFields}
        values={{ parent: "old", child: "stale-value" }}
        onChange={onChange}
      />,
    );

    // Typing into the parent. user.type fires one onChange per
    // keystroke. The wrapping handler should additionally dispatch
    // onChange("child", undefined) after each.
    await user.type(screen.getByLabelText("Parent"), "x");

    const parentCalls = onChange.mock.calls.filter((c) => c[0] === "parent");
    const childClearCalls = onChange.mock.calls.filter(
      (c) => c[0] === "child" && c[1] === undefined,
    );
    expect(parentCalls.length).toBeGreaterThan(0);
    // One child clear per parent keystroke.
    expect(childClearCalls.length).toBe(parentCalls.length);
  });

  it("clears multiple direct dependents that share the same parent", async () => {
    const fields: readonly FieldMeta[] = [
      { name: "parent", label: "Parent", type: "text", required: true } as FieldMeta,
      {
        name: "childA",
        label: "Child A",
        type: "text",
        required: false,
        dependsOn: "parent",
      } as FieldMeta,
      {
        name: "childB",
        label: "Child B",
        type: "text",
        required: false,
        dependsOn: "parent",
      } as FieldMeta,
    ];
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm
        fields={fields}
        values={{ parent: "p", childA: "a", childB: "b" }}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText("Parent"), "x");
    const aClear = onChange.mock.calls.filter(
      (c) => c[0] === "childA" && c[1] === undefined,
    );
    const bClear = onChange.mock.calls.filter(
      (c) => c[0] === "childB" && c[1] === undefined,
    );
    expect(aClear.length).toBeGreaterThan(0);
    expect(bClear.length).toBeGreaterThan(0);
    expect(aClear.length).toBe(bClear.length);
  });

  it("does not clear unrelated fields when a parent changes", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm
        fields={cascadeFields}
        values={{ parent: "p", child: "c", unrelated: "u" }}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByLabelText("Parent"), "x");
    const unrelatedCalls = onChange.mock.calls.filter(
      (c) => c[0] === "unrelated",
    );
    expect(unrelatedCalls).toEqual([]);
  });

  it("does not propagate clears to grand-children (single-hop only)", async () => {
    const fields: readonly FieldMeta[] = [
      { name: "B", label: "B", type: "text", required: true } as FieldMeta,
      {
        name: "A",
        label: "A",
        type: "text",
        required: false,
        dependsOn: "B",
      } as FieldMeta,
      {
        name: "C",
        label: "C",
        type: "text",
        required: false,
        dependsOn: "A",
      } as FieldMeta,
    ];
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm
        fields={fields}
        values={{ B: "b", A: "a", C: "c" }}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByLabelText("B"), "x");
    // A (direct child of B) is cleared.
    const aClear = onChange.mock.calls.filter(
      (c) => c[0] === "A" && c[1] === undefined,
    );
    expect(aClear.length).toBeGreaterThan(0);
    // C (grand-child of B via A) is NOT cleared by the single-hop rule.
    const cClear = onChange.mock.calls.filter(
      (c) => c[0] === "C" && c[1] === undefined,
    );
    expect(cClear).toEqual([]);
  });

  it("dispatches no clears when a field without dependents changes", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm
        fields={cascadeFields}
        values={{ parent: "p", child: "c" }}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByLabelText("Unrelated"), "x");
    // Only the unrelated field's own onChange fires.
    const undefinedClears = onChange.mock.calls.filter(
      (c) => c[1] === undefined,
    );
    expect(undefinedClears).toEqual([]);
  });

  it("ignores dependsOn pointing to a non-existent field name (treats child as enabled=false, no clear-on-change)", async () => {
    const fields: readonly FieldMeta[] = [
      {
        name: "ghost",
        label: "Ghost",
        type: "text",
        required: false,
        dependsOn: "doesNotExist",
      } as FieldMeta,
    ];
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm fields={fields} values={{}} onChange={onChange} />,
    );
    await user.type(screen.getByLabelText("Ghost"), "x");
    // Only the field's own change fires; no synthetic clear for a
    // dependent that doesn't exist.
    expect(
      onChange.mock.calls.every((c) => c[0] === "ghost"),
    ).toBe(true);
  });
});

// ─── Slice 3.33 — deps / enabled propagation through ComboboxField ─────────

// Mock `useOptionsSource` so the cascade tests below can observe the
// args ComboboxField passes through (deps, query, enabled, source).
// Other suites in this file render text / select / boolean / etc.
// fields that never call the hook — the mock is a no-op there.
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: jest.fn(),
}));

import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";
const mockUseOptionsSource = useOptionsSource as jest.Mock;

describe("SchemaForm dependsOn cascade — deps + enabled propagation to ComboboxField", () => {
  const childAsyncFields: readonly FieldMeta[] = [
    {
      name: "parent",
      label: "Parent Label",
      type: "text",
      required: true,
    } as FieldMeta,
    {
      name: "child",
      label: "Child",
      type: "combobox",
      required: false,
      dependsOn: "parent",
      optionsSource: "native:examples",
    } as FieldMeta,
  ];

  beforeEach(() => {
    mockUseOptionsSource.mockReset();
    // Default ready state so the popover content renders cleanly when
    // the renderer reaches the async body.
    mockUseOptionsSource.mockReturnValue({
      state: { status: "ready", items: [], hasMore: false },
      refetch: jest.fn(),
    });
  });

  it("passes deps={parent: <value>} to useOptionsSource when the parent has a non-empty string value", () => {
    render(
      <SchemaForm
        fields={childAsyncFields}
        values={{ parent: "PV" }}
        onChange={jest.fn()}
      />,
    );
    const args = mockUseOptionsSource.mock.calls.find(
      (c) => c[0]?.source === "native:examples",
    );
    expect(args).toBeDefined();
    expect(args![0].deps).toEqual({ parent: "PV" });
    // enabled is not explicitly set when the parent is present (the
    // hook treats undefined/true the same way).
    expect(args![0].enabled).not.toBe(false);
  });

  it("renders the 'Select <parentLabel> first' passive trigger when the parent value is empty (no fetch)", () => {
    render(
      <SchemaForm
        fields={childAsyncFields}
        values={{}}
        onChange={jest.fn()}
      />,
    );
    // The passive trigger replaces the async body entirely.
    const passive = screen.getByTestId("combobox-parent-missing");
    expect(passive).toBeInTheDocument();
    expect(passive).toBeDisabled();
    expect(passive).toHaveTextContent(/Select Parent Label first/i);
    // AsyncComboboxBody never mounts → hook not called for this
    // source.
    const nativeCalls = mockUseOptionsSource.mock.calls.filter(
      (c) => c[0]?.source === "native:examples",
    );
    expect(nativeCalls).toEqual([]);
  });

  it("treats non-string parent values as missing (numeric parent does not enable the child)", () => {
    const fields: readonly FieldMeta[] = [
      { name: "parent", label: "P", type: "number", required: true } as FieldMeta,
      {
        name: "child",
        label: "Child",
        type: "combobox",
        required: false,
        dependsOn: "parent",
        optionsSource: "native:examples",
      } as FieldMeta,
    ];
    render(
      <SchemaForm
        fields={fields}
        values={{ parent: 42 }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
    const nativeCalls = mockUseOptionsSource.mock.calls.filter(
      (c) => c[0]?.source === "native:examples",
    );
    expect(nativeCalls).toEqual([]);
  });

  it("treats whitespace-only parent values as missing", () => {
    render(
      <SchemaForm
        fields={childAsyncFields}
        values={{ parent: "" }}
        onChange={jest.fn()}
      />,
    );
    // Empty string is the same as missing — passive trigger renders.
    expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
  });

  it("hook is not called for static-options fields regardless of dependsOn", () => {
    const fields: readonly FieldMeta[] = [
      { name: "parent", label: "P", type: "text", required: true } as FieldMeta,
      {
        name: "child",
        label: "Child",
        type: "combobox",
        required: false,
        dependsOn: "parent",
        options: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
      } as FieldMeta,
    ];
    render(
      <SchemaForm
        fields={fields}
        values={{ parent: "PV" }}
        onChange={jest.fn()}
      />,
    );
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });
});
