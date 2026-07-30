/**
 * REACT-AGENT-PREAPPLY-SETUP-UX-1 — the Stripe event choice is a SEARCHABLE selector, not a wall.
 *
 * The reported failure: `enabledEvents` rendered every Stripe event as a checkbox, so the rail
 * became a scrolling catalog and everything below it (including Apply) was pushed off-screen.
 *
 * The fix has to hold two things at once: the list must be usable at rail width, and the exact
 * event must NOT be guessed — picking the wrong trigger event silently changes what the workflow
 * responds to. So: nothing is preselected, likely matches are offered as a confirmable shortlist,
 * and the rest is reachable by typing.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SetupFieldControl } from "@/features/workflow-builder/panels/builderSetupFieldControls";
import type { PreviewSetupField } from "@/core/workflows/previewSetupFields";

/** A realistically-sized slice of Stripe's event catalog. */
const EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.created",
  "charge.succeeded",
  "charge.failed",
  "charge.refunded",
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.created",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.completed",
];

const field: PreviewSetupField = {
  name: "enabledEvents",
  label: "Event Types",
  type: "multi-select",
  required: true,
  options: EVENTS.map((e) => ({ value: e, label: e })),
};

const TESTID = "node-setup-n1-enabledEvents";

function Host(props: { suggestionQuery?: string }) {
  const [value, setValue] = useState<unknown>([]);
  return (
    <>
      <SetupFieldControl
        field={field}
        value={value}
        onChange={setValue}
        {...(props.suggestionQuery ? { suggestionQuery: props.suggestionQuery } : {})}
        testid={TESTID}
      />
      <pre data-testid="value">{JSON.stringify(value)}</pre>
    </>
  );
}

function selected(): string[] {
  return JSON.parse(screen.getByTestId("value").textContent || "[]") as string[];
}

describe("8. the event selector is searchable and usable at rail width", () => {
  it("does not dump the catalog: nothing is listed until the user searches or something is chosen", () => {
    render(<Host />);
    expect(screen.getByTestId(`${TESTID}-search`)).toBeInTheDocument();
    // The wall is gone — no option rows at rest.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByTestId(`${TESTID}-hidden-count`)).toHaveTextContent(
      `Type to search ${EVENTS.length} more`,
    );
  });

  it("typing narrows the list to matches", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByTestId(`${TESTID}-search`), "refund");
    const options = screen.getByTestId(`${TESTID}-options`);
    expect(within(options).getByText("charge.refunded")).toBeInTheDocument();
    expect(within(options).queryByText("invoice.paid")).not.toBeInTheDocument();
  });

  it("says so plainly when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByTestId(`${TESTID}-search`), "zzzz");
    expect(screen.getByTestId(`${TESTID}-no-matches`)).toBeInTheDocument();
  });

  it("preserves MULTI-select — a trigger may legitimately watch several events", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByTestId(`${TESTID}-search`), "charge.");
    await user.click(screen.getByTestId(`${TESTID}-charge.succeeded`));
    await user.click(screen.getByTestId(`${TESTID}-charge.refunded`));
    expect(selected()).toEqual(["charge.succeeded", "charge.refunded"]);
    expect(screen.getByTestId(`${TESTID}-selected-count`)).toHaveTextContent("2 selected");
  });

  it("keeps what is already chosen visible after the search is cleared", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const search = screen.getByTestId(`${TESTID}-search`);
    await user.type(search, "invoice.paid");
    await user.click(screen.getByTestId(`${TESTID}-invoice.paid`));
    await user.clear(search);
    // Chosen values stay listed (and checked) even though the catalog is hidden again.
    expect(screen.getByTestId(`${TESTID}-invoice.paid`)).toBeChecked();
  });

  it("unchecking removes the value", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByTestId(`${TESTID}-search`), "invoice.paid");
    await user.click(screen.getByTestId(`${TESTID}-invoice.paid`));
    expect(selected()).toEqual(["invoice.paid"]);
    await user.click(screen.getByTestId(`${TESTID}-invoice.paid`));
    expect(selected()).toEqual([]);
  });
});

describe("recommended matches are offered, never assumed", () => {
  it('suggests the payment-succeeded event for "when a stripe payment succeeds"', () => {
    render(<Host suggestionQuery="When a Stripe payment succeeds, send a Slack message to the test channel." />);
    const suggested = screen.getByTestId(`${TESTID}-suggested`);
    expect(within(suggested).getByText("payment_intent.succeeded")).toBeInTheDocument();
    // A shortlist, not the catalog.
    expect(within(suggested).queryAllByRole("checkbox").length).toBeLessThanOrEqual(3);
  });

  it("leaves the exact event UNRESOLVED — a suggestion is never preselected", () => {
    render(<Host suggestionQuery="When a Stripe payment succeeds, send a Slack message." />);
    expect(selected()).toEqual([]);
    const suggested = screen.getByTestId(`${TESTID}-suggested`);
    for (const box of within(suggested).queryAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
    expect(suggested).toHaveTextContent(/confirm the one you want/i);
  });

  it("confirming a suggestion selects it", async () => {
    const user = userEvent.setup();
    render(<Host suggestionQuery="When a Stripe payment succeeds, notify me." />);
    await user.click(screen.getByTestId(`${TESTID}-payment_intent.succeeded`));
    expect(selected()).toEqual(["payment_intent.succeeded"]);
  });

  it("offers no shortlist when the request gives nothing to match on", () => {
    render(<Host suggestionQuery="build me something useful" />);
    expect(screen.queryByTestId(`${TESTID}-suggested`)).not.toBeInTheDocument();
  });

  it("offers no shortlist at all without a request to match against", () => {
    render(<Host />);
    expect(screen.queryByTestId(`${TESTID}-suggested`)).not.toBeInTheDocument();
  });
});
