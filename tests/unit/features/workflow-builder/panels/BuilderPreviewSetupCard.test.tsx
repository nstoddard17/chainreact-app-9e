/**
 * REACT-AGENT-PREAPPLY-SETUP-UX-1 — the pre-apply preview card is a SUMMARY, not a form.
 *
 * The reported failure, from the exact Stripe → Slack prompt: the card rendered Stripe's entire
 * event catalog as checkboxes, ran the Slack channel resolver, discovered the workspace was
 * disconnected, and offered "Reconnect in Apps" / "Enter ID manually" / "Add to draft & open step" —
 * all above an "Apply to draft" button the user had to scroll a long form to reach. Setup and
 * connection were effectively required before the workflow could even enter the draft.
 *
 * These tests pin the inverse: the card explains what will be created, says what will still need
 * setting up afterwards, and offers exactly one action. The controls themselves now live in the
 * guided Configure stage (see BuilderNodeSetupCard / setupFieldRecovery tests), where the node is
 * real and connections have already been resolved.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderPreviewSetupCard } from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";
import type { AgentConnectionSignal } from "@/core/workflows/agentReadiness";

/** The workflow from the screenshots: Stripe payment → Slack message. */
const preview: DraftPreview = {
  version: 1,
  title: "Stripe to Slack",
  summary: "When a Stripe payment succeeds, send a Slack message.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    {
      previewId: "p1",
      role: "trigger",
      provider: "stripe",
      type: "event_received",
      label: "stripe:event_received",
      purpose: "watch",
      missingInputs: ["enabledEvents"],
      notApplied: true,
    },
    {
      previewId: "p2",
      role: "action",
      provider: "slack",
      type: "send_channel_message",
      label: "slack:send_channel_message",
      purpose: "notify",
      missingInputs: ["channel", "text"],
      notApplied: true,
    },
  ],
  edges: [{ previewId: "e1", fromPreviewId: "p1", toPreviewId: "p2", notApplied: true }],
};

const setupFieldsByType: PreviewSetupFieldsByType = {
  "stripe:event_received": [
    {
      name: "enabledEvents",
      label: "Stripe event",
      type: "multi-select",
      required: true,
      options: [
        { value: "payment_intent.succeeded", label: "payment_intent.succeeded" },
        { value: "charge.refunded", label: "charge.refunded" },
      ],
    },
  ],
  "slack:send_channel_message": [
    { name: "channel", label: "Channel", type: "select-async", required: true, optionsSource: "slack:channels" },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
};

const nodeDisplayNames = {
  "stripe:event_received": "Stripe Event Received",
  "slack:send_channel_message": "Send Channel Message",
};
const providerLabels = { stripe: "Stripe", slack: "Slack" };

/** Both apps disconnected — the state in the screenshots. */
const bothDisconnected: AgentConnectionSignal = {
  state: "resolved",
  allConnected: false,
  providers: [
    { provider: "stripe", name: "Stripe", nodeIds: ["p1"], state: "missing", canReconnect: true },
    { provider: "slack", name: "Slack", nodeIds: ["p2"], state: "missing", canReconnect: true },
  ],
};

type CardProps = Parameters<typeof BuilderPreviewSetupCard>[0];

function renderCard(overrides: Partial<CardProps> = {}) {
  const onApply = jest.fn();
  render(
    <BuilderPreviewSetupCard
      preview={preview}
      setupFieldsByType={setupFieldsByType}
      nodeDisplayNames={nodeDisplayNames}
      providerLabels={providerLabels}
      connection={bothDisconnected}
      onApply={onApply}
      {...overrides}
    />,
  );
  return { onApply };
}

describe("the preview stage explains what will be created", () => {
  it("1. the exact Stripe → Slack prompt produces a compact step summary", () => {
    renderCard();
    const steps = screen.getByTestId("preview-summary-steps");
    expect(steps).toHaveTextContent("Stripe Event Received");
    expect(steps).toHaveTextContent("Send Channel Message");
    // Named the way the canvas names them — never the raw capability key.
    expect(steps).not.toHaveTextContent("slack:send_channel_message");
  });

  it("lists what will still need setting up, including the missing connections", () => {
    renderCard();
    const required = screen.getByTestId("preview-setup-required");
    expect(required).toHaveTextContent("Stripe connection");
    expect(required).toHaveTextContent("Slack connection");
    expect(required).toHaveTextContent("Stripe event");
    expect(required).toHaveTextContent("Channel");
    expect(required).toHaveTextContent("Message");
  });

  it("never invents a connection requirement while the signal is unresolved", () => {
    renderCard({ connection: { state: "loading" } });
    const required = screen.getByTestId("preview-setup-required");
    expect(required).not.toHaveTextContent("connection");
    // Field requirements are still honest — they come from the preview itself.
    expect(required).toHaveTextContent("Stripe event");
  });

  it("omits a connection row for a provider that is already connected", () => {
    renderCard({
      connection: {
        state: "resolved",
        allConnected: false,
        providers: [
          { provider: "stripe", name: "Stripe", nodeIds: ["p1"], state: "connected", canReconnect: true },
          { provider: "slack", name: "Slack", nodeIds: ["p2"], state: "missing", canReconnect: true },
        ],
      },
    });
    const required = screen.getByTestId("preview-setup-required");
    expect(required).not.toHaveTextContent("Stripe connection");
    expect(required).toHaveTextContent("Slack connection");
  });

  it("does not list a field the user's own request already supplied", () => {
    renderCard({ prefilledConfig: { p2: { text: "A payment came in" } } });
    // Row-level, not text-level: "Send Channel Message" is a step NAME that contains the word
    // "Message", so a substring assertion here would pass for the wrong reason.
    expect(screen.queryByTestId("preview-requirement-field:p2:text")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-requirement-field:p2:channel")).toBeInTheDocument();
  });
});

describe("Apply is the primary action and is never gated on setup", () => {
  it("2. Apply to draft renders above the outstanding-setup list", () => {
    renderCard();
    const apply = screen.getByTestId("builder-preview-setup-apply");
    const required = screen.getByTestId("preview-setup-required");
    // The user reaches the primary action before reading what is still to do.
    expect(apply.compareDocumentPosition(required) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Apply works with every field still unresolved and both apps disconnected", async () => {
    const user = userEvent.setup();
    const { onApply } = renderCard();
    const apply = screen.getByTestId("builder-preview-setup-apply");
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("says so plainly when there is nothing left to set up", () => {
    renderCard({
      preview: { ...preview, nodes: preview.nodes.map((n) => ({ ...n, missingInputs: [] })) },
      connection: { state: "resolved", allConnected: true, providers: [] },
    });
    expect(screen.queryByTestId("preview-setup-required")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-preview-setup-apply")).toBeInTheDocument();
  });
});

describe("3. no provider pickers, resolvers or recovery UI before Apply", () => {
  it("renders no Stripe event picker", () => {
    renderCard();
    expect(screen.queryByTestId("preview-setup-p1-enabledEvents")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    // Not even one catalog entry leaks into the summary.
    expect(screen.queryByText("payment_intent.succeeded")).not.toBeInTheDocument();
  });

  it("renders no Slack channel picker", () => {
    renderCard();
    expect(screen.queryByTestId("preview-setup-p2-channel")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders no connection-recovery or manual-ID controls", () => {
    renderCard();
    expect(screen.queryByText(/Reconnect in Apps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enter ID manually/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Try again/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Add to draft & open step/i)).not.toBeInTheDocument();
    // And no route off to the Apps page from the preview at all.
    expect(document.querySelector('a[href^="/apps"]')).toBeNull();
  });

  it("offers exactly one button: Apply", () => {
    renderCard();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("data-testid", "builder-preview-setup-apply");
  });
});
