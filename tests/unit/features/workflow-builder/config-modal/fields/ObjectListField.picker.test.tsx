/**
 * RESOLVERS-3 — per-row option-source pickers inside `object-list` /
 * `object` editors.
 *
 * Before this slice an `itemFields` sub-field could only ever be a raw text
 * box, so a provider id inside a row (Stripe `lineItems[].priceId`, Shopify
 * `line_items[].variant_id`) had to be hand-typed next to a registered,
 * unreferenced resolver. These tests pin the behavior that makes the picker
 * safe to ship:
 *
 *   - a picker renders PER ROW and each row's selection is independent;
 *   - selecting commits the SAVED ROW SHAPE UNCHANGED (a `number` sub-field
 *     still writes a number — the runtime .strict() schema never sees a
 *     string);
 *   - a SAVED value that isn't in the current list stays visible and stays
 *     saved (never silently cleared) — the same `combobox-saved-value-missing`
 *     treatment top-level fields get;
 *   - a resolver ERROR does not erase existing row config;
 *   - manual entry + variable insertion still work (the picker is ADDITIVE
 *     to `{{...}}` mapping, never a replacement);
 *   - `dependsOn` resolves against the node's TOP-LEVEL config (the
 *     object-list's siblings), NOT row-local values.
 *
 * Radix/cmdk note: the popover is a real portal — `user.click(combobox)`
 * then `user.click(option)`; fireEvent.change does not drive it.
 */
const mockUseOptionsSource = jest.fn();
const mockRefetch = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...a: unknown[]) => mockUseOptionsSource(...a),
}));

const mockSources = jest.fn();
jest.mock(
  "@/features/workflow-builder/hooks/useActiveNodeUpstreamVariables",
  () => ({
    __esModule: true,
    useActiveNodeUpstreamVariables: () => mockSources(),
  }),
);

// Isolate the row-picker wiring from VariablePickerPopover internals; mirrors
// the real button's "hidden when no sources" behavior.
jest.mock(
  "@/features/workflow-builder/config-modal/fields/VariablePickerButton",
  () => ({
    __esModule: true,
    VariablePickerButton: ({
      sources,
      onInsertAtCursor,
      testIdRoot,
    }: {
      sources: unknown[];
      onInsertAtCursor: (t: string) => void;
      testIdRoot: string;
    }) =>
      sources.length === 0 ? null : (
        <button
          type="button"
          data-testid={`${testIdRoot}-trigger`}
          onClick={() => onInsertAtCursor("{{step1.variantId}}")}
        >
          var
        </button>
      ),
  }),
);

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { ObjectListField } from "@/features/workflow-builder/config-modal/fields/ObjectListField";
import { ObjectField } from "@/features/workflow-builder/config-modal/fields/ObjectField";
import type { UseOptionsSourceState } from "@/features/workflow-builder/hooks/useOptionsSource";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function setHookState(state: UseOptionsSourceState): void {
  mockUseOptionsSource.mockReturnValue({ state, refetch: mockRefetch });
}

const ready = (items: Array<{ value: string; label: string }>) =>
  ({ status: "ready", items, hasMore: false }) as UseOptionsSourceState;

/** Stripe create_checkout_session shape — text id + picker, no deps. */
const stripeField = (): FieldMeta =>
  ({
    name: "lineItems",
    label: "Line items",
    type: "object-list",
    required: true,
    itemFields: [
      {
        name: "priceId",
        label: "Price",
        type: "text",
        required: true,
        optionsSource: "stripe:prices",
        allowManualEntry: true,
      },
      { name: "quantity", label: "Quantity", type: "number", required: true },
    ],
  }) as FieldMeta;

/** Shopify create_order shape — NUMBER-typed id behind a picker. */
const shopifyField = (): FieldMeta =>
  ({
    name: "line_items",
    label: "Line items",
    type: "object-list",
    required: true,
    itemFields: [
      {
        name: "variant_id",
        label: "Product variant",
        type: "number",
        required: true,
        optionsSource: "shopify:variants",
        allowManualEntry: true,
      },
      { name: "quantity", label: "Quantity", type: "number", required: true },
    ],
  }) as FieldMeta;

/** Power BI shape — picker depending on TWO top-level siblings. */
const powerbiField = (): FieldMeta =>
  ({
    name: "parameters",
    label: "Parameters",
    type: "object-list",
    required: true,
    itemFields: [
      {
        name: "name",
        label: "Parameter name",
        type: "text",
        required: true,
        optionsSource: "microsoft-powerbi:semantic_model_parameters",
        dependsOn: ["workspaceId", "semanticModelId"],
        allowManualEntry: true,
      },
      { name: "newValue", label: "New value", type: "text", required: true },
    ],
  }) as FieldMeta;

const powerbiTopLevel: FieldMeta[] = [
  { name: "workspaceId", label: "Workspace", type: "combobox", required: true },
  {
    name: "semanticModelId",
    label: "Semantic model",
    type: "combobox",
    required: true,
  },
] as FieldMeta[];

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockRefetch.mockReset();
  mockSources.mockReturnValue({ sources: [], latestValuesBySource: {} });
  useGraphSlice.getState().reset();
  setHookState(ready([]));
});

describe("object-list row picker — rendering", () => {
  it("renders a picker (not a text box) per row for a sub-field with optionsSource", async () => {
    setHookState(
      ready([{ value: "price_1", label: "Pro plan - $20/mo" }]),
    );
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "price_1" }, { priceId: "price_2" }]}
        onChange={jest.fn()}
      />,
    );
    // Two rows → two independent comboboxes, each showing its own value.
    const combos = screen.getAllByRole("combobox", { name: "Price" });
    expect(combos).toHaveLength(2);
    // Row 0's id resolves to a real catalog label; row 1's is unknown and
    // falls back to the raw saved id.
    expect(combos[0]).toHaveTextContent("Pro plan - $20/mo");
    expect(combos[1]).toHaveTextContent("price_2");
  });

  it("leaves sub-fields WITHOUT optionsSource as plain inputs", () => {
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "price_1", quantity: 2 }]}
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("spinbutton", { name: "Quantity (entry 1)" }),
    ).toHaveValue(2);
  });

  it("gives each row a distinct control id (no duplicate DOM ids across rows)", () => {
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "price_1" }, { priceId: "price_2" }]}
        onChange={jest.fn()}
      />,
    );
    const ids = screen
      .getAllByRole("combobox", { name: "Price" })
      .map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("object-list row picker — committed row shape (runtime schema safety)", () => {
  it("selecting an option commits the picked id into the RIGHT row, leaving others untouched", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    setHookState(
      ready([
        { value: "price_new", label: "Starter - $5/mo" },
        { value: "price_1", label: "Pro plan - $20/mo" },
      ]),
    );
    render(
      <ObjectListField
        field={stripeField()}
        value={[
          { priceId: "price_1", quantity: 2 },
          { priceId: "price_2", quantity: 7 },
        ]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getAllByRole("combobox", { name: "Price" })[1]!);
    await user.click(await screen.findByText("Starter - $5/mo"));

    expect(onChange).toHaveBeenCalledWith([
      { priceId: "price_1", quantity: 2 },
      { priceId: "price_new", quantity: 7 },
    ]);
  });

  it("a NUMBER sub-field behind a picker still commits a NUMBER (shape unchanged)", async () => {
    // Shopify's runtime schema is variant_id: z.number().int().positive().
    // The combobox hands back a string; the row must still carry a number or
    // the .strict() schema rejects at runtime.
    const user = userEvent.setup();
    const onChange = jest.fn();
    setHookState(ready([{ value: "44556677", label: "Tee - Large - $25" }]));
    render(
      <ObjectListField
        field={shopifyField()}
        value={[{ variant_id: 111, quantity: 1 }]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Product variant" }));
    await user.click(await screen.findByText("Tee - Large - $25"));

    expect(onChange).toHaveBeenCalledWith([
      { variant_id: 44556677, quantity: 1 },
    ]);
    const [[committed]] = onChange.mock.calls as [[Array<Record<string, unknown>>]];
    expect(typeof committed[0]!.variant_id).toBe("number");
  });

  it("a saved NUMBER row value renders in the trigger and survives an unrelated edit", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    setHookState(ready([{ value: "111", label: "Tee - Small - $20" }]));
    render(
      <ObjectListField
        field={shopifyField()}
        value={[{ variant_id: 111, quantity: 1 }]}
        onChange={onChange}
      />,
    );
    // The saved number resolves to its catalog label in the picker trigger.
    expect(
      screen.getByRole("combobox", { name: "Product variant" }),
    ).toHaveTextContent("Tee - Small - $20");

    // Editing a DIFFERENT column must carry the picker's saved number through
    // untouched, still typed as a number. (Controlled component: `value` is
    // fixed by the harness, so the typed digit appends to the rendered "1".)
    await user.type(
      screen.getByRole("spinbutton", { name: "Quantity (entry 1)" }),
      "3",
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { variant_id: 111, quantity: 13 },
    ]);
    const lastRow = (
      onChange.mock.calls.at(-1) as [Array<Record<string, unknown>>]
    )[0][0]!;
    expect(typeof lastRow.variant_id).toBe("number");
  });
});

describe("object-list row picker — backward compatibility (never clear saved config)", () => {
  it("a saved row value missing from the current list stays visible + flagged, not cleared", async () => {
    const onChange = jest.fn();
    setHookState(ready([{ value: "price_1", label: "Pro plan - $20/mo" }]));
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "price_archived", quantity: 1 }]}
        onChange={onChange}
      />,
    );
    // Raw saved id still shown…
    expect(
      screen.getByRole("combobox", { name: "Price" }),
    ).toHaveTextContent("price_archived");
    // …explicitly flagged as an unavailable saved selection…
    expect(screen.getByTestId("combobox-saved-value-missing")).toHaveTextContent(
      "price_archived",
    );
    // …and NOT rewritten behind the user's back.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a resolver ERROR does not erase existing row config", () => {
    const onChange = jest.fn();
    setHookState({
      status: "error",
      message: "Couldn't load prices.",
    } as UseOptionsSourceState);
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "price_1", quantity: 2 }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Price" })).toHaveTextContent(
      "price_1",
    );
    expect(screen.getByRole("spinbutton", { name: "Quantity (entry 1)" })).toHaveValue(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a disconnected provider does not erase existing row config", () => {
    const onChange = jest.fn();
    setHookState({
      status: "disconnected",
      provider: "stripe",
    } as UseOptionsSourceState);
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "price_1", quantity: 2 }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Price" })).toHaveTextContent(
      "price_1",
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("object-list row picker — manual entry + variables still work", () => {
  it("manual entry commits exactly what was typed into that row", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    setHookState(ready([{ value: "price_1", label: "Pro plan - $20/mo" }]));
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "", quantity: 1 }]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Price" }));
    await user.type(screen.getByPlaceholderText("Search..."), "price_pasted");
    await user.click(screen.getByTestId("combobox-manual-entry"));

    expect(onChange).toHaveBeenCalledWith([
      { priceId: "price_pasted", quantity: 1 },
    ]);
  });

  it("variable insertion sets the row value to an upstream token", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    mockSources.mockReturnValue({
      sources: [{ nodeId: "step1", label: "Step 1", variables: [] }],
      latestValuesBySource: {},
    });
    setHookState(ready([]));
    render(
      <ObjectListField
        field={shopifyField()}
        value={[{ variant_id: 111, quantity: 1 }]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByTestId(
        "combobox-line_items-0-variant_id-picker-trigger",
      ),
    );
    // A {{...}} token is NOT numeric — it must pass through verbatim rather
    // than be mangled to NaN, so the engine can resolve it at run time.
    expect(onChange).toHaveBeenCalledWith([
      { variant_id: "{{step1.variantId}}", quantity: 1 },
    ]);
  });

  it("a variable token in a row is not mistaken for an unavailable saved value", () => {
    setHookState(ready([{ value: "price_1", label: "Pro plan - $20/mo" }]));
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "{{step1.priceId}}", quantity: 1 }]}
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.queryByTestId("combobox-saved-value-missing"),
    ).not.toBeInTheDocument();
  });
});

describe("object-list row picker — dependsOn resolves against TOP-LEVEL config", () => {
  it("gates the row picker until every top-level parent has a value, naming the missing one", () => {
    render(
      <ObjectListField
        field={powerbiField()}
        value={[{ name: "", newValue: "x" }]}
        onChange={jest.fn()}
        formValues={{ workspaceId: "ws-1", parameters: [] }}
        formFields={powerbiTopLevel}
      />,
    );
    // semanticModelId still empty → passive trigger, hook never mounts.
    expect(screen.getByTestId("combobox-parent-missing")).toHaveTextContent(
      "Select Semantic model first",
    );
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });

  it("passes the FULL top-level dep set to the options hook once all parents are set", async () => {
    setHookState(ready([{ value: "Region", label: "Region" }]));
    render(
      <ObjectListField
        field={powerbiField()}
        value={[{ name: "Region", newValue: "EU" }]}
        onChange={jest.fn()}
        formValues={{ workspaceId: "ws-1", semanticModelId: "sm-9" }}
        formFields={powerbiTopLevel}
      />,
    );
    expect(mockUseOptionsSource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "microsoft-powerbi:semantic_model_parameters",
        deps: { workspaceId: "ws-1", semanticModelId: "sm-9" },
      }),
    );
  });

  it("never calls the resolver with a PARTIAL dep set", () => {
    render(
      <ObjectListField
        field={powerbiField()}
        value={[{ name: "", newValue: "" }]}
        onChange={jest.fn()}
        formValues={{ workspaceId: "ws-1" }}
        formFields={powerbiTopLevel}
      />,
    );
    for (const call of mockUseOptionsSource.mock.calls) {
      expect(call[0]?.deps).toBeUndefined();
    }
  });
});

describe("object (single) editor — same picker path", () => {
  it("renders a picker for an optionsSource sub-field and commits the object shape", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    setHookState(ready([{ value: "item_9", label: "Consulting" }]));
    const field = {
      name: "defaults",
      label: "Defaults",
      type: "object",
      required: false,
      itemFields: [
        {
          name: "itemId",
          label: "Product/service",
          type: "text",
          required: true,
          optionsSource: "quickbooks:items",
          allowManualEntry: true,
        },
      ],
    } as unknown as FieldMeta;

    render(
      <ObjectField field={field} value={{ itemId: "item_1" }} onChange={onChange} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Product/service" }));
    await user.click(await screen.findByText("Consulting"));

    expect(onChange).toHaveBeenCalledWith({ itemId: "item_9" });
  });

  it("preserves unknown saved keys when a picker commits", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    setHookState(ready([{ value: "item_9", label: "Consulting" }]));
    const field = {
      name: "defaults",
      label: "Defaults",
      type: "object",
      required: false,
      itemFields: [
        {
          name: "itemId",
          label: "Product/service",
          type: "text",
          required: true,
          optionsSource: "quickbooks:items",
        },
      ],
    } as unknown as FieldMeta;

    render(
      <ObjectField
        field={field}
        value={{ itemId: "item_1", legacyKey: "keep-me" }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Product/service" }));
    await user.click(await screen.findByText("Consulting"));

    expect(onChange).toHaveBeenCalledWith({
      itemId: "item_9",
      legacyKey: "keep-me",
    });
  });
});

describe("ItemFieldPicker — no parallel discovery path", () => {
  it("requests options through the SAME useOptionsSource hook top-level fields use", () => {
    setHookState(ready([]));
    render(
      <ObjectListField
        field={stripeField()}
        value={[{ priceId: "price_1" }]}
        onChange={jest.fn()}
      />,
    );
    expect(mockUseOptionsSource).toHaveBeenCalledWith(
      expect.objectContaining({ source: "stripe:prices" }),
    );
    // Sanity: the row picker is the real ComboboxField surface.
    expect(
      within(screen.getByTestId("object-list-lineItems-row-0")).getByRole(
        "combobox",
        { name: "Price" },
      ),
    ).toBeInTheDocument();
  });
});
