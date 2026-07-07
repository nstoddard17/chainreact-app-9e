/**
 * Tests for ObjectListField (CONFIG-UX-AUDIT-1) — the repeater that
 * replaced paste-JSON textareas for array-of-object configs.
 *
 * Behavior under test (user-facing, not implementation):
 *   - add/remove rows through visible buttons;
 *   - sub-fields render per row (text / number / select);
 *   - `visibleWhen` gates a sub-field on a sibling's value in the SAME
 *     row (HubSpot propertyName appears only for *.propertyChange);
 *   - serialization: REAL Array<Record<...>>; hidden/empty optional keys
 *     omitted; numbers stored as numbers; last row removed → undefined.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { ObjectListField } from "@/features/workflow-builder/config-modal/fields/ObjectListField";

function hubspotStyleField(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "subscriptions",
    label: "Events to watch",
    type: "object-list",
    required: true,
    itemFields: [
      {
        name: "eventType",
        label: "Event",
        type: "select",
        required: true,
        options: [
          { value: "contact.creation", label: "Contact created" },
          { value: "deal.propertyChange", label: "Deal property changed" },
        ],
      },
      {
        name: "propertyName",
        label: "Property to watch",
        type: "text",
        required: true,
        visibleWhen: { field: "eventType", valueEndsWith: ".propertyChange" },
      },
    ],
    ...overrides,
  } as FieldMeta;
}

function lineItemsField(): FieldMeta {
  return {
    name: "lineItems",
    label: "Line items",
    type: "object-list",
    required: true,
    listMaxItems: 2,
    itemFields: [
      { name: "priceId", label: "Price ID", type: "text", required: true },
      { name: "quantity", label: "Quantity", type: "number", required: true },
    ],
  } as FieldMeta;
}

describe("ObjectListField", () => {
  it("adds a row, fills sub-fields, and commits a REAL array of objects (numbers as numbers)", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ObjectListField field={lineItemsField()} value={undefined} onChange={onChange} />,
    );

    await user.click(screen.getByTestId("object-list-lineItems-add"));
    expect(onChange).toHaveBeenLastCalledWith([{}]);

    // Controlled component — feed the committed value back in.
    rerender(
      <ObjectListField field={lineItemsField()} value={[{}]} onChange={onChange} />,
    );
    await user.type(
      screen.getByRole("textbox", { name: /price id \(entry 1\)/i }),
      "p",
    );
    expect(onChange).toHaveBeenLastCalledWith([{ priceId: "p" }]);

    rerender(
      <ObjectListField
        field={lineItemsField()}
        value={[{ priceId: "price_1" }]}
        onChange={onChange}
      />,
    );
    await user.type(
      screen.getByRole("spinbutton", { name: /quantity \(entry 1\)/i }),
      "3",
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { priceId: "price_1", quantity: 3 },
    ]);
  });

  it("visibleWhen: propertyName appears ONLY for *.propertyChange rows and is omitted from other rows' serialization", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const value = [
      { eventType: "contact.creation" },
      { eventType: "deal.propertyChange", propertyName: "amount" },
    ];
    render(
      <ObjectListField field={hubspotStyleField()} value={value} onChange={onChange} />,
    );

    // Row 1 (creation): no property input. Row 2 (propertyChange): input present.
    expect(
      screen.queryByRole("textbox", { name: /property to watch \(entry 1\)/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /property to watch \(entry 2\)/i }),
    ).toHaveValue("amount");

    // Editing row 2's property keeps row 1 free of a propertyName key.
    await user.type(
      screen.getByRole("textbox", { name: /property to watch \(entry 2\)/i }),
      "x",
    );
    const committed = onChange.mock.lastCall![0] as Array<Record<string, unknown>>;
    expect(Object.keys(committed[0]!)).toEqual(["eventType"]);
    expect(committed[1]).toEqual({
      eventType: "deal.propertyChange",
      propertyName: "amountx",
    });
  });

  it("remove buttons drop the row; removing the last row commits undefined (field drops out of saved config)", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <ObjectListField
        field={hubspotStyleField()}
        value={[{ eventType: "contact.creation" }]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /remove events to watch entry 1/i }),
    );
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("listMaxItems caps the Add affordance", async () => {
    render(
      <ObjectListField
        field={lineItemsField()}
        value={[
          { priceId: "a", quantity: 1 },
          { priceId: "b", quantity: 2 },
        ]}
        onChange={jest.fn()}
      />,
    );
    const add = screen.getByTestId("object-list-lineItems-add");
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent(/max 2/i);
    await waitFor(() => expect(add).toBeDisabled());
  });

  it("selecting a *.propertyChange event reveals the property input in that row only", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ObjectListField
        field={hubspotStyleField()}
        value={[{}]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: /event \(entry 1\)/i }));
    await user.click(
      await screen.findByRole("option", { name: "Deal property changed" }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { eventType: "deal.propertyChange" },
    ]);
    rerender(
      <ObjectListField
        field={hubspotStyleField()}
        value={[{ eventType: "deal.propertyChange" }]}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: /property to watch \(entry 1\)/i }),
    ).toBeInTheDocument();
  });
});
