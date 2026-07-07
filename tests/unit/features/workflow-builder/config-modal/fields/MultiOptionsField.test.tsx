/**
 * Tests for MultiOptionsField (CONFIG-UX-AUDIT-1) — the multi-select body
 * behind `select`/`combobox` fields with `multiple: true`.
 *
 * Uses the REAL Shopify `webhook_received` trigger meta as the canonical
 * static case: before this slice, that field rendered the internal error
 * "Multi-select on type 'select' is not supported by this renderer" in
 * the user-facing setup panel.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import { MultiOptionsField } from "@/features/workflow-builder/config-modal/fields/MultiOptionsField";
import { shopifyWebhookReceivedTriggerMeta } from "@/integrations/shopify/triggers/webhookReceived/webhookReceived.meta";

const topicsField = shopifyWebhookReceivedTriggerMeta.fields[0]!;

describe("MultiOptionsField — Shopify webhook topics (static select + multiple)", () => {
  it("renders a real multi-select through SchemaForm with NO renderer error", () => {
    render(
      <SchemaForm
        fields={shopifyWebhookReceivedTriggerMeta.fields}
        values={{}}
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /not supported by this renderer|combobox.*multiple|drop multiple/i,
    );
    expect(screen.getByTestId("multi-select-topics")).toBeInTheDocument();
  });

  it("picking topics commits a REAL string[] of topic values (the shape activate.ts requires)", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <MultiOptionsField
        field={topicsField}
        value={undefined}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("multi-select-topics"));
    await user.click(await screen.findByRole("option", { name: /order created/i }));
    expect(onChange).toHaveBeenLastCalledWith(["orders/create"]);

    rerender(
      <MultiOptionsField
        field={topicsField}
        value={["orders/create"]}
        onChange={onChange}
      />,
    );
    await user.click(
      await screen.findByRole("option", { name: /customer created/i }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      "orders/create",
      "customers/create",
    ]);
  });

  it("chips show friendly labels; removing the last selection commits undefined", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <MultiOptionsField
        field={topicsField}
        value={["orders/create"]}
        onChange={onChange}
      />,
    );
    const chips = screen.getByTestId("field-topics-chips");
    expect(chips).toHaveTextContent("Order created");
    await user.click(
      screen.getByRole("button", { name: /remove topics item order created/i }),
    );
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("toggling an already-selected option deselects it", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <MultiOptionsField
        field={topicsField}
        value={["orders/create", "orders/paid"]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("multi-select-topics"));
    await user.click(await screen.findByRole("option", { name: /order paid/i }));
    expect(onChange).toHaveBeenLastCalledWith(["orders/create"]);
  });
});
