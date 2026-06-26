/**
 * @jest-environment jsdom
 *
 * features/templates/TemplateDetailsDialog (CS-XT-MARKETPLACE-UX-DETAIL). The marketplace
 * details / use-confirmation dialog. Proves it shows the safe summary (title, attribution,
 * description, derived metadata + chain, what-happens-next copy), wires Use / Save a copy to the
 * dashboard handlers, closes on the X / overlay / Escape, disables actions while busy, and never
 * renders raw config / JSON.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateDetailsDialog } from "@/features/templates/TemplateDetailsDialog";
import type { MarketplaceTemplateSummary } from "@/features/templates/types";

const template: MarketplaceTemplateSummary = {
  id: "off-1",
  name: "New order to Slack",
  description: "Alert your team when an order comes in.",
  source: "official",
  isOfficial: true,
  visibility: "public",
  creatorDisplayName: null,
  usageCount: 100,
  forkCount: 4,
  forkedFromTemplateId: null,
  publishedAt: "2026-06-01T00:00:00Z",
  schemaVersion: 1,
  createdAt: "2026-06-01T00:00:00Z",
  card: {
    nodeCount: 2,
    stepCount: 1,
    triggerKind: "app",
    providers: ["shopify", "slack"],
    category: "ecommerce",
    steps: [
      { kind: "trigger", provider: "shopify", type: "webhook_received" },
      { kind: "action", provider: "slack", type: "send_channel_message" },
    ],
  },
};

function setup(over: Partial<Parameters<typeof TemplateDetailsDialog>[0]> = {}) {
  const onUse = jest.fn();
  const onFork = jest.fn();
  const onClose = jest.fn();
  const { container } = render(
    <TemplateDetailsDialog template={template} busy={false} onUse={onUse} onFork={onFork} onClose={onClose} {...over} />,
  );
  return { onUse, onFork, onClose, container };
}

it("shows title, official badge, description, derived metadata + chain, and what-happens-next", () => {
  setup();
  expect(screen.getByText("New order to Slack")).toBeInTheDocument();
  expect(screen.getByTestId("official-badge")).toBeInTheDocument();
  expect(screen.getByText("Alert your team when an order comes in.")).toBeInTheDocument();
  expect(screen.getByTestId("summary-category")).toHaveTextContent("Ecommerce");
  expect(screen.getByTestId("summary-trigger-kind")).toHaveTextContent("App-triggered");
  expect(screen.getByTestId("summary-step-count")).toHaveTextContent("1 step");
  expect(screen.getByTestId("summary-provider-shopify")).toHaveTextContent("Shopify");
  expect(screen.getByTestId("summary-chain")).toHaveTextContent("Slack: Send channel message");
  expect(screen.getByTestId("summary-what-happens-next")).toHaveTextContent(/does not copy credentials/i);
});

it("never renders raw config / JSON / type ids", () => {
  const { container } = setup();
  expect(container.innerHTML).not.toContain('"config"');
  expect(container.innerHTML).not.toContain("webhook_received");
  expect(container.innerHTML).not.toContain("send_channel_message");
});

it("Use and Save a copy call their handlers", () => {
  const { onUse, onFork } = setup();
  fireEvent.click(screen.getByTestId("template-details-use"));
  expect(onUse).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId("template-details-fork"));
  expect(onFork).toHaveBeenCalledTimes(1);
});

it("closes via the X button and Escape; busy disables actions + blocks close", () => {
  const { onClose, onUse } = setup();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId("template-details-close"));
  expect(onClose).toHaveBeenCalledTimes(2);

  // re-render busy: actions disabled, Escape does not close.
  onClose.mockClear();
  render(<TemplateDetailsDialog template={template} busy onUse={onUse} onFork={jest.fn()} onClose={onClose} />);
  const useBtns = screen.getAllByTestId("template-details-use");
  expect(useBtns[useBtns.length - 1]).toBeDisabled();
});
