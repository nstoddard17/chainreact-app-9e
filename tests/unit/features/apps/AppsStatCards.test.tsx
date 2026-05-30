/**
 * Tests for features/apps/AppsStatCards (Slice 4.APPS-PAGE-1).
 *
 * Three truthful stat cards derived from the already-fetched catalog.
 * Pins the locked deferral: NO "Powering N workflows" or "Need attention"
 * tiles (their data isn't surfaced on the DTO yet).
 */
import { render, screen } from "@testing-library/react";

import { AppsStatCards } from "@/features/apps/AppsStatCards";
import type { AppCatalogItem } from "@/contracts/apps";

function mkApp(over: Partial<AppCatalogItem>): AppCatalogItem {
  return {
    providerId: "slack",
    name: "Slack",
    description: "",
    iconUrl: null,
    category: "Communication",
    isConnected: false,
    canConnect: true,
    supportsMultipleAccounts: true,
    accounts: [],
    firstConnectedAt: null,
    ...over,
  };
}

describe("AppsStatCards", () => {
  it("derives every value from the items prop (no extra fetch)", () => {
    render(
      <AppsStatCards
        items={[
          mkApp({ providerId: "slack", category: "Communication", isConnected: true, accounts: [{ id: "1", displayName: null, connectedAt: "x" }, { id: "2", displayName: null, connectedAt: "y" }] }),
          mkApp({ providerId: "stripe", category: "Payments", isConnected: true, accounts: [{ id: "3", displayName: null, connectedAt: "x" }] }),
          mkApp({ providerId: "notion", category: "Productivity", isConnected: false }),
        ]}
      />,
    );
    expect(screen.getByTestId("apps-stat-available")).toHaveTextContent("3");
    expect(screen.getByTestId("apps-stat-available")).toHaveTextContent(
      /Across 3 categories/i,
    );
    expect(screen.getByTestId("apps-stat-connected")).toHaveTextContent("2");
    expect(screen.getByTestId("apps-stat-connected")).toHaveTextContent(
      /Across 3 accounts/i,
    );
    expect(screen.getByTestId("apps-stat-accounts")).toHaveTextContent("3");
  });

  it("renders graceful empty-account copy when nothing is connected", () => {
    render(
      <AppsStatCards
        items={[mkApp({ providerId: "slack" })]}
      />,
    );
    expect(screen.getByTestId("apps-stat-connected")).toHaveTextContent(
      /No accounts yet/i,
    );
    expect(screen.getByTestId("apps-stat-accounts")).toHaveTextContent(
      /Connect your first app/i,
    );
  });

  it("does NOT render the design's 'Powering workflows' or 'Need attention' tiles (locked deferrals)", () => {
    render(
      <AppsStatCards items={[mkApp({ providerId: "slack", isConnected: true, accounts: [{ id: "1", displayName: null, connectedAt: "x" }] })]} />,
    );
    expect(screen.queryByText(/Powering/i)).toBeNull();
    expect(screen.queryByText(/Need attention/i)).toBeNull();
  });
});
