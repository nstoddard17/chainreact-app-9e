/**
 * HELP-CENTER-CONTEXTUAL-1 — Apps-surface Help Center links.
 *
 * Pins: a reconnect-needed row renders the "How to reconnect" article link
 * (both the self-reconnectable and someone-else-must-reconnect variants), a
 * not-connected card with a dedicated provider article renders "View setup
 * guide" (resolver-gated: providers without an article render no link), the
 * primary Connect action stays present, and a healthy connected card gains
 * no troubleshooting help.
 */
import { render, screen, within } from "@testing-library/react";

jest.mock("@/features/integrations/ConnectButton", () => ({
  ConnectButton: ({ label }: { label: string }) => (
    <button type="button" data-testid="mock-connect-button">
      {label}
    </button>
  ),
}));

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("@/lib/api/integrations", () => ({
  getIntegrationWorkflowImpact: jest.fn(),
  disconnectIntegration: jest.fn(),
  IntegrationApiError: class extends Error {},
}));

import { AppCard } from "@/features/apps/AppCard";
import { ReconnectRowCopy } from "@/features/apps/ReconnectNeededCopy";
import type { AppCatalogItem } from "@/contracts/apps";

function mkApp(over: Partial<AppCatalogItem> = {}): AppCatalogItem {
  return {
    providerId: "slack",
    name: "Slack",
    description: "Post messages.",
    iconUrl: "/integrations/slack.svg",
    category: "Communication",
    isConnected: false,
    needsReconnect: false,
    canConnect: true,
    restrictedToAdmins: false,
    supportsMultipleAccounts: true,
    accounts: [],
    firstConnectedAt: null,
    ...over,
  };
}

describe("ReconnectRowCopy — Help Center link", () => {
  it("self-reconnectable row keeps its copy and adds the disconnected-app article link", () => {
    render(<ReconnectRowCopy canReconnect={true} />);
    expect(
      screen.getByText(/reconnect this app to keep workflows running/i),
    ).toBeInTheDocument();
    const help = screen.getByTestId("app-card-reconnect-help-link");
    expect(help).toHaveAttribute("href", "/help/fix-a-disconnected-app");
    expect(help).toHaveTextContent("How to reconnect");
  });

  it("someone-else-must-reconnect row also links the article (it explains that rule)", () => {
    render(<ReconnectRowCopy canReconnect={false} />);
    expect(
      screen.getByText(/the person who connected it must reconnect it/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-card-reconnect-help-link")).toHaveAttribute(
      "href",
      "/help/fix-a-disconnected-app",
    );
  });
});

describe("AppCard — provider setup-guide link", () => {
  it("not-connected provider WITH a dedicated article renders the setup guide beside Connect", () => {
    render(<AppCard app={mkApp()} accountId="acct-1" />);
    const guide = screen.getByTestId("app-card-setup-guide-link");
    expect(guide).toHaveAttribute("href", "/help/connect-slack");
    expect(guide).toHaveTextContent("View setup guide");
    // The primary Connect action is untouched.
    expect(screen.getByTestId("mock-connect-button")).toHaveTextContent("Connect Slack");
  });

  it("not-connected provider WITHOUT a dedicated article renders no setup-guide link", () => {
    render(
      <AppCard
        app={mkApp({ providerId: "notion", name: "Notion", iconUrl: "/integrations/notion.svg" })}
        accountId="acct-1"
      />,
    );
    expect(screen.queryByTestId("app-card-setup-guide-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-connect-button")).toBeInTheDocument();
  });

  it("healthy connected card renders neither setup-guide nor reconnect help", () => {
    render(
      <AppCard
        app={mkApp({
          isConnected: true,
          accounts: [
            {
              id: "int-1",
              displayName: "Acme workspace",
              connectedAt: "2026-06-01T00:00:00Z",
              needsReconnect: false,
              canReconnect: true,
              canDisconnect: true,
              sharingStatus: "not_applicable",
              sharedWithAccount: false,
              canShare: false,
              canUnshare: false,
            },
          ],
        })}
        accountId="acct-1"
      />,
    );
    const card = screen.getByTestId("app-card");
    expect(within(card).queryByTestId("app-card-setup-guide-link")).not.toBeInTheDocument();
    expect(
      within(card).queryByTestId("app-card-reconnect-help-link"),
    ).not.toBeInTheDocument();
  });
});
