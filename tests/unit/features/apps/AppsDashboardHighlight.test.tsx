/**
 * 5.ONBOARD-1 Batch 3 — `/apps?highlight=<provider>` primitive.
 *
 * Contract: scroll the matching card into view once, ring + focus it
 * transiently, consume the query param, and NEVER auto-start OAuth or bypass
 * permission gating (the ConnectButton is only ever rendered, never clicked).
 */
import { act, render, screen } from "@testing-library/react";

const mockStartOAuth = jest.fn();
jest.mock("@/features/integrations/ConnectButton", () => ({
  ConnectButton: ({ label }: { label: string }) => (
    <button
      type="button"
      data-testid="mock-connect-button"
      onClick={() => mockStartOAuth()}
    >
      {label}
    </button>
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

import { AppsDashboard } from "@/features/apps/AppsDashboard";
import type { AppCatalogItem, AppsCategory } from "@/contracts/apps";

function mkApp(over: Partial<AppCatalogItem> = {}): AppCatalogItem {
  return {
    providerId: "slack",
    name: "Slack",
    description: "Post messages, DMs, and reactions.",
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

const categories: readonly AppsCategory[] = [
  { id: "All", label: "All apps", count: 2 },
];

function renderDashboard(highlight: string | null) {
  return render(
    <AppsDashboard
      items={[mkApp(), mkApp({ providerId: "gmail", name: "Gmail" })]}
      categories={categories}
      accountId="acc-1"
      highlightProvider={highlight}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  window.history.replaceState(null, "", "/apps?highlight=slack");
});

afterEach(() => {
  jest.useRealTimers();
});

describe("AppsDashboard — provider highlight", () => {
  it("scrolls, rings, and focuses the matching card, then clears the highlight", () => {
    const scrollSpy = jest.spyOn(HTMLElement.prototype, "scrollIntoView");
    renderDashboard("slack");
    const card = screen
      .getAllByTestId("app-card")
      .find((c) => c.getAttribute("data-provider-id") === "slack")!;
    expect(card).toHaveAttribute("data-highlighted", "true");
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(card).toHaveFocus();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(card).not.toHaveAttribute("data-highlighted");
  });

  it("consumes the highlight query param so it cannot re-fire", () => {
    renderDashboard("slack");
    expect(window.location.pathname + window.location.search).toBe("/apps");
  });

  it("NEVER auto-starts OAuth — connect stays an explicit click", () => {
    renderDashboard("slack");
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockStartOAuth).not.toHaveBeenCalled();
  });

  it("unknown provider is a quiet no-op", () => {
    const scrollSpy = jest.spyOn(HTMLElement.prototype, "scrollIntoView");
    renderDashboard("does-not-exist");
    expect(scrollSpy).not.toHaveBeenCalled();
    for (const card of screen.getAllByTestId("app-card")) {
      expect(card).not.toHaveAttribute("data-highlighted");
    }
  });

  it("no highlight prop → byte-identical rendering path (no scroll, no ring)", () => {
    const scrollSpy = jest.spyOn(HTMLElement.prototype, "scrollIntoView");
    renderDashboard(null);
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
