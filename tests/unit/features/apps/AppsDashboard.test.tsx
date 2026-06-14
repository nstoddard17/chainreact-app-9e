/**
 * Tests for features/apps/AppsDashboard (Slice 4.APPS-PAGE-1).
 *
 * Page-level contract:
 *   - Renders the hero h1 ("Apps") + every section.
 *   - Empty / no-matches states render at the right times.
 *   - Search filters by name/description/providerId.
 *   - Status tabs filter connected vs available.
 *   - Category nav filters items.
 *   - Sort A–Z (default) vs Recently connected.
 *   - A11y: single h1, search has label, tabs use role=tab.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/features/integrations/ConnectButton", () => ({
  ConnectButton: ({ label }: { label: string }) => (
    <button type="button" data-testid="mock-connect-button" data-label={label}>
      {label}
    </button>
  ),
}));

// AppCard now calls useRouter(); stub it so the dashboard renders in tests.
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

const baseCategories: readonly AppsCategory[] = [
  { id: "All", label: "All apps", count: 3 },
  { id: "Communication", label: "Communication", count: 2 },
  { id: "Payments", label: "Payments", count: 1 },
];

describe("AppsDashboard — render", () => {
  it("renders the h1, subtitle counts, stat cards, toolbar, category nav, and one row per app", () => {
    render(
      <AppsDashboard
        items={[
          mkApp({ providerId: "slack", name: "Slack" }),
          mkApp({
            providerId: "gmail",
            name: "Gmail",
            category: "Communication",
            isConnected: true,
            accounts: [
              { id: "int-1", displayName: "marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
            ],
            firstConnectedAt: "2026-04-15T12:00:00Z",
          }),
          mkApp({
            providerId: "stripe",
            name: "Stripe",
            category: "Payments",
            description: "Watch charges and update customers.",
          }),
        ]}
        categories={baseCategories}
        accountId="acc-1"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /^apps$/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("apps-dashboard-subtitle")).toHaveTextContent(
      /Showing\s*3\s*of\s*3/i,
    );
    expect(screen.getByTestId("apps-stat-cards")).toBeInTheDocument();
    expect(screen.getByTestId("apps-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("apps-category-nav")).toBeInTheDocument();
    const cards = screen.getAllByTestId("app-card");
    expect(cards).toHaveLength(3);
    // Default sort = A–Z.
    expect(cards.map((c) => c.getAttribute("data-provider-id"))).toEqual([
      "gmail",
      "slack",
      "stripe",
    ]);
  });

  it("exposes exactly one <h1> (a11y baseline)", () => {
    render(<AppsDashboard items={[mkApp()]} categories={baseCategories} accountId="acc-1" />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("AppsDashboard — empty states", () => {
  it("renders no-apps when the catalog is empty", () => {
    render(<AppsDashboard items={[]} categories={[{ id: "All", label: "All apps", count: 0 }]} accountId="acc-1" />);
    expect(screen.getByTestId("apps-empty-no-apps")).toBeInTheDocument();
    expect(screen.queryByTestId("app-card")).toBeNull();
  });

  it("renders no-matches when filters exclude every app (and NOT the no-apps variant)", async () => {
    const user = userEvent.setup();
    render(
      <AppsDashboard
        items={[mkApp({ providerId: "slack", name: "Slack" })]}
        categories={baseCategories}
        accountId="acc-1"
      />,
    );
    await user.type(screen.getByTestId("apps-search-input"), "no-such-app");
    expect(screen.getByTestId("apps-empty-no-matches")).toBeInTheDocument();
    expect(screen.queryByTestId("apps-empty-no-apps")).toBeNull();
  });
});

describe("AppsDashboard — search filters name / description / providerId", () => {
  const items = [
    mkApp({ providerId: "slack", name: "Slack", description: "Post messages." }),
    mkApp({
      providerId: "gmail",
      name: "Gmail",
      description: "Read, send, and label email.",
    }),
    mkApp({
      providerId: "stripe",
      name: "Stripe",
      description: "Watch charges and update customers.",
      category: "Payments",
    }),
  ];

  it("matches on name", async () => {
    const user = userEvent.setup();
    render(<AppsDashboard items={items} categories={baseCategories} accountId="acc-1" />);
    await user.type(screen.getByTestId("apps-search-input"), "Stripe");
    const cards = screen.getAllByTestId("app-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-provider-id", "stripe");
  });

  it("matches on description", async () => {
    const user = userEvent.setup();
    render(<AppsDashboard items={items} categories={baseCategories} accountId="acc-1" />);
    await user.type(screen.getByTestId("apps-search-input"), "charges");
    expect(screen.getAllByTestId("app-card")).toHaveLength(1);
  });

  it("matches on providerId", async () => {
    const user = userEvent.setup();
    render(<AppsDashboard items={items} categories={baseCategories} accountId="acc-1" />);
    await user.type(screen.getByTestId("apps-search-input"), "gmail");
    expect(screen.getAllByTestId("app-card")).toHaveLength(1);
  });
});

describe("AppsDashboard — status tabs", () => {
  const items = [
    mkApp({ providerId: "slack", isConnected: false }),
    mkApp({
      providerId: "gmail",
      name: "Gmail",
      isConnected: true,
      accounts: [
        { id: "int-1", displayName: "marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
      ],
      firstConnectedAt: "2026-04-15T12:00:00Z",
    }),
  ];

  it("Connected tab filters to connected apps only", async () => {
    const user = userEvent.setup();
    render(<AppsDashboard items={items} categories={baseCategories} accountId="acc-1" />);
    await user.click(screen.getByTestId("apps-status-tab-connected"));
    const cards = screen.getAllByTestId("app-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-provider-id", "gmail");
  });

  it("Not-connected tab filters to available apps only", async () => {
    const user = userEvent.setup();
    render(<AppsDashboard items={items} categories={baseCategories} accountId="acc-1" />);
    await user.click(screen.getByTestId("apps-status-tab-available"));
    const cards = screen.getAllByTestId("app-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-provider-id", "slack");
  });
});

describe("AppsDashboard — category nav", () => {
  it("clicking a category filters to that category", async () => {
    const user = userEvent.setup();
    render(
      <AppsDashboard
        items={[
          mkApp({ providerId: "slack", category: "Communication" }),
          mkApp({
            providerId: "stripe",
            name: "Stripe",
            category: "Payments",
          }),
        ]}
        categories={baseCategories}
        accountId="acc-1"
      />,
    );
    await user.click(screen.getByTestId("apps-category-Payments"));
    const cards = screen.getAllByTestId("app-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("data-provider-id", "stripe");
  });
});

describe("AppsDashboard — sort", () => {
  it("'Recently connected' sorts connected apps before unconnected, newest first", async () => {
    const user = userEvent.setup();
    render(
      <AppsDashboard
        items={[
          mkApp({
            providerId: "gmail",
            name: "Gmail",
            isConnected: true,
            firstConnectedAt: "2026-01-10T00:00:00Z",
            accounts: [
              { id: "int-1", displayName: "a", connectedAt: "2026-01-10T00:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
            ],
          }),
          mkApp({
            providerId: "slack",
            name: "Slack",
            isConnected: true,
            firstConnectedAt: "2026-05-01T00:00:00Z",
            accounts: [
              { id: "int-2", displayName: "b", connectedAt: "2026-05-01T00:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
            ],
          }),
          mkApp({ providerId: "stripe", name: "Stripe" }),
        ]}
        categories={baseCategories}
        accountId="acc-1"
      />,
    );
    const select = within(screen.getByTestId("apps-sort")).getByRole("combobox");
    await user.selectOptions(select, "recent");
    const cards = screen.getAllByTestId("app-card");
    expect(cards.map((c) => c.getAttribute("data-provider-id"))).toEqual([
      "slack",
      "gmail",
      "stripe",
    ]);
  });
});
