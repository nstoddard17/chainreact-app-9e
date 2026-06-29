/**
 * Tests for features/apps/AppCard (Slice 4.APPS-PAGE-1).
 *
 * Covers the no-fake-actions invariants locked in the slice plan:
 *   - "Connect" button renders only when (!isConnected && canConnect).
 *   - "Reconnect" (Connected App Recovery UX) renders only when (isConnected && canConnect),
 *     reuses the OAuth start flow, and is distinct from "Connect another".
 *   - NO disconnect / manage buttons (those APIs aren't wired).
 *   - NO per-account workflow pills (no integration↔workflow link yet).
 *   - "Connect another" only on connected + canConnect + supportsMultipleAccounts.
 *   - Expand affordance has aria-expanded + aria-controls semantics.
 *   - Status pill conveys state via icon + text + variant (a11y).
 */
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/features/integrations/ConnectButton", () => ({
  ConnectButton: ({
    provider,
    label,
    variant,
    testId,
    title,
    reconnect,
  }: {
    provider: string;
    label: string;
    variant?: string;
    testId?: string;
    title?: string;
    reconnect?: { integrationId: string; accountId: string };
  }) => (
    <button
      type="button"
      data-testid={testId ?? "mock-connect-button"}
      data-provider={provider}
      data-label={label}
      data-variant={variant ?? "primary"}
      {...(title !== undefined && { title })}
      {...(reconnect !== undefined && {
        "data-reconnect-integration-id": reconnect.integrationId,
        "data-reconnect-account-id": reconnect.accountId,
      })}
    >
      {label}
    </button>
  ),
}));

// AppCard calls useRouter(); the Disconnect path triggers router.refresh().
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// The Disconnect dialog reaches the server via the typed client API; stub it so
// AppCard tests never hit the network. The dialog's own behavior is covered in
// DisconnectDialog.test.tsx.
const mockGetImpact = jest.fn();
const mockDisconnect = jest.fn();
jest.mock("@/lib/api/integrations", () => ({
  getIntegrationWorkflowImpact: (...a: unknown[]) => mockGetImpact(...a),
  disconnectIntegration: (...a: unknown[]) => mockDisconnect(...a),
  IntegrationApiError: class extends Error {},
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockGetImpact.mockReset().mockResolvedValue({ affectedWorkflowCount: 0, workflows: [] });
  mockDisconnect.mockReset().mockResolvedValue({
    disconnected: true,
    alreadyDisconnected: false,
    providerRevoked: true,
    workflowsDisabled: 0,
  });
});

import { AppCard } from "@/features/apps/AppCard";
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

describe("AppCard — not connected", () => {
  it("renders a Connect button only when canConnect", () => {
    render(<AppCard app={mkApp({ canConnect: true })} accountId="acc-1" />);
    const buttons = screen.getAllByTestId("mock-connect-button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("data-provider", "slack");
    expect(buttons[0]).toHaveAttribute("data-label", "Connect Slack");
  });

  it("does NOT render a Connect button when canConnect=false (manifest.isEnabled=false or no oauth)", () => {
    render(<AppCard app={mkApp({ canConnect: false })} accountId="acc-1" />);
    expect(screen.queryByTestId("mock-connect-button")).toBeNull();
  });

  it("status pill says 'Not connected' with icon + variant (never color-only)", () => {
    render(<AppCard app={mkApp({ isConnected: false })} accountId="acc-1" />);
    const pill = screen.getByTestId("app-status-pill");
    expect(pill).toHaveAttribute("data-state", "not-connected");
    expect(pill).toHaveTextContent(/not connected/i);
  });

  it("does NOT render a Reconnect button when not connected", () => {
    render(<AppCard app={mkApp({ isConnected: false, canConnect: true })} accountId="acc-1" />);
    expect(screen.queryByTestId("app-card-reconnect")).toBeNull();
  });
});

describe("AppCard — connected", () => {
  const connected = mkApp({
    isConnected: true,
    accounts: [
      { id: "int-1", displayName: "Personal · marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
      { id: "int-2", displayName: "Acme · ops@example.com", connectedAt: "2026-05-01T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
    ],
    firstConnectedAt: "2026-04-15T12:00:00Z",
  });

  it("status pill says 'Connected'", () => {
    render(<AppCard app={connected} accountId="acc-1" />);
    expect(screen.getByTestId("app-status-pill")).toHaveAttribute(
      "data-state",
      "connected",
    );
  });

  it("does NOT render a top-level Connect button on a connected provider", () => {
    render(<AppCard app={connected} accountId="acc-1" />);
    expect(screen.queryByTestId("mock-connect-button")).toBeNull();
  });

  it("does NOT render a provider-level Reconnect on the collapsed card (4.APPS-RECONNECT)", () => {
    // The `connected` fixture is multi-account with canReconnect:false — but even
    // a provider-level Reconnect must never appear on the collapsed card. The
    // intent is per-account only.
    render(<AppCard app={connected} accountId="acc-1" />);
    expect(screen.queryByTestId("app-card-reconnect")).toBeNull();
  });

  it("exposes an expand affordance with aria-expanded + aria-controls", async () => {
    const user = userEvent.setup();
    render(<AppCard app={connected} accountId="acc-1" />);
    const expand = screen.getByTestId("app-card-expand");
    expect(expand).toHaveAttribute("aria-expanded", "false");
    await user.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    const body = screen.getByTestId("app-card-body");
    expect(expand).toHaveAttribute("aria-controls", body.id);
  });

  it("expanded view lists each account with displayName + 'Connected on <date>' (no workflows, no manage, no disconnect)", async () => {
    const user = userEvent.setup();
    render(<AppCard app={connected} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    const accounts = screen.getAllByTestId("app-card-account");
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toHaveTextContent("Personal · marcus@example.com");
    expect(accounts[0]).toHaveTextContent(/Connected on Apr 15, 2026/);
    // No manage / workflow pills; and with canDisconnect/canReconnect:false (this
    // fixture) neither per-account Disconnect NOR per-account Reconnect renders.
    for (const acc of accounts) {
      expect(within(acc).queryByRole("button", { name: /manage/i })).toBeNull();
      expect(within(acc).queryByTestId("app-card-disconnect")).toBeNull();
      expect(within(acc).queryByTestId("app-card-reconnect")).toBeNull();
      expect(within(acc).queryByText(/workflow/i)).toBeNull();
    }
  });

  // ── CS-5a — sharing pill + Share/Stop-sharing controls ──────────────────────
  type AccountSummary = AppCatalogItem["accounts"][number];
  function shareAccount(over: Partial<AccountSummary>): AccountSummary {
    return {
      id: "int-1", displayName: "Personal · marcus@example.com", connectedAt: "2026-04-15T12:00:00Z",
      canDisconnect: false, canReconnect: false,
      sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false,
      ...over,
    };
  }

  it("private personal row: shows 'Private to you' pill + 'Share with team'; opens the share confirmation", async () => {
    const user = userEvent.setup();
    const app = mkApp({
      providerId: "gmail", name: "Gmail", isConnected: true,
      accounts: [shareAccount({ sharingStatus: "private_to_connector", canShare: true })],
    });
    render(<AppCard app={app} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    expect(screen.getByTestId("app-card-sharing-pill")).toHaveTextContent("Private to you");
    await user.click(screen.getByTestId("app-card-share"));
    expect(screen.getByTestId("share-warning")).toHaveTextContent(
      "Team members will be able to run workflows using this connection.",
    );
  });

  it("shared row: shows 'Shared with team' pill + 'Stop sharing'; opens the stop-sharing confirmation", async () => {
    const user = userEvent.setup();
    const app = mkApp({
      providerId: "gmail", name: "Gmail", isConnected: true,
      accounts: [shareAccount({ sharingStatus: "shared_with_account", sharedWithAccount: true, canUnshare: true })],
    });
    render(<AppCard app={app} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    expect(screen.getByTestId("app-card-sharing-pill")).toHaveTextContent("Shared with team");
    await user.click(screen.getByTestId("app-card-unshare"));
    expect(screen.getByTestId("share-warning")).toHaveTextContent(
      "Team workflows using this connection may become creator-only again.",
    );
  });

  it("not_applicable row (account provider / flag off): no sharing pill, no share controls", async () => {
    const user = userEvent.setup();
    const app = mkApp({ isConnected: true, accounts: [shareAccount({})] });
    render(<AppCard app={app} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    expect(screen.queryByTestId("app-card-sharing-pill")).toBeNull();
    expect(screen.queryByTestId("app-card-share")).toBeNull();
    expect(screen.queryByTestId("app-card-unshare")).toBeNull();
  });

  it("expanded view renders 'Connect another' when supportsMultipleAccounts && canConnect", async () => {
    const user = userEvent.setup();
    render(<AppCard app={connected} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    const buttons = screen
      .getAllByTestId("mock-connect-button")
      .filter((b) => b.getAttribute("data-label") === "Connect another");
    expect(buttons).toHaveLength(1);
  });

  it("expanded view does NOT render 'Connect another' when supportsMultipleAccounts=false", async () => {
    const user = userEvent.setup();
    render(
      <AppCard app={{ ...connected, supportsMultipleAccounts: false }} accountId="acc-1" />,
    );
    await user.click(screen.getByTestId("app-card-expand"));
    const buttons = screen
      .queryAllByTestId("mock-connect-button")
      .filter((b) => b.getAttribute("data-label") === "Connect another");
    expect(buttons).toHaveLength(0);
  });
});

describe("AppCard — provider icon", () => {
  it("renders the public /integrations/<id>.svg when iconUrl is present", () => {
    render(<AppCard app={mkApp({ iconUrl: "/integrations/slack.svg" })} accountId="acc-1" />);
    const img = screen.getByTestId("app-card-icon").querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/integrations/slack.svg");
  });

  it("falls back to initials when iconUrl is null", () => {
    render(<AppCard app={mkApp({ name: "Notion", iconUrl: null })} accountId="acc-1" />);
    expect(screen.getByTestId("app-card-icon")).toHaveTextContent("NO");
  });
});

describe("AppCard — per-account Disconnect (CD-3)", () => {
  const disconnectable = mkApp({
    isConnected: true,
    accounts: [
      { id: "int-1", displayName: "Personal · marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: true, canReconnect: true, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
    ],
    firstConnectedAt: "2026-04-15T12:00:00Z",
  });
  const notDisconnectable = mkApp({
    isConnected: true,
    accounts: [
      { id: "int-1", displayName: "Personal · marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
    ],
    firstConnectedAt: "2026-04-15T12:00:00Z",
  });

  it("renders Disconnect in the EXPANDED account row only when canDisconnect is true", async () => {
    const user = userEvent.setup();
    render(<AppCard app={disconnectable} accountId="acc-1" />);
    // Not a top-level action: absent before expanding.
    expect(screen.queryByTestId("app-card-disconnect")).toBeNull();
    await user.click(screen.getByTestId("app-card-expand"));
    const acc = screen.getByTestId("app-card-account");
    const btn = within(acc).getByTestId("app-card-disconnect");
    expect(btn).toHaveTextContent("Disconnect");
    expect(btn).toHaveAttribute("data-account-id", "int-1");
    // Tooltip differentiates it from Reconnect ("Refresh…") / Connect another ("Add…").
    expect(btn).toHaveAttribute("title", "Remove this connection");
  });

  it("does NOT render Disconnect when canDisconnect is false", async () => {
    const user = userEvent.setup();
    render(<AppCard app={notDisconnectable} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    expect(screen.queryByTestId("app-card-disconnect")).toBeNull();
  });

  it("clicking Disconnect opens the confirmation dialog (which loads workflow-impact)", async () => {
    const user = userEvent.setup();
    render(<AppCard app={disconnectable} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    await user.click(screen.getByTestId("app-card-disconnect"));
    expect(screen.getByTestId("disconnect-dialog")).toBeInTheDocument();
    expect(mockGetImpact).toHaveBeenCalledWith("acc-1", "int-1");
  });

  it("confirming disconnect refreshes the page and shows the success notice", async () => {
    const user = userEvent.setup();
    render(<AppCard app={disconnectable} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    await user.click(screen.getByTestId("app-card-disconnect"));
    await screen.findByTestId("disconnect-dialog");
    await user.click(screen.getByTestId("disconnect-confirm"));

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith("acc-1", "int-1"));
    // Page is re-fetched so the soft-disconnected row drops out of the active set.
    expect(mockRefresh).toHaveBeenCalled();
    // Dialog closes and a safe success notice (role=status) is shown.
    expect(screen.queryByTestId("disconnect-dialog")).toBeNull();
    expect(await screen.findByTestId("app-card-disconnect-notice")).toHaveTextContent(
      /Disconnected Slack\./,
    );
  });
});

describe("AppCard — per-account Reconnect (4.APPS-RECONNECT)", () => {
  const multiAccount = mkApp({
    isConnected: true,
    canConnect: true,
    accounts: [
      { id: "int-1", displayName: "Personal · marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: true, canReconnect: true, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
      { id: "int-2", displayName: "Acme · ops@example.com", connectedAt: "2026-05-01T12:00:00Z", canDisconnect: true, canReconnect: true, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
    ],
    firstConnectedAt: "2026-04-15T12:00:00Z",
  });
  const singleAccount = mkApp({
    isConnected: true,
    canConnect: true,
    supportsMultipleAccounts: false,
    accounts: [
      { id: "int-1", displayName: "Personal · marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: true, canReconnect: true, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
    ],
    firstConnectedAt: "2026-04-15T12:00:00Z",
  });
  const noReconnect = mkApp({
    isConnected: true,
    canConnect: true,
    accounts: [
      { id: "int-1", displayName: "Personal · marcus@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
    ],
    firstConnectedAt: "2026-04-15T12:00:00Z",
  });

  it("multi-account provider renders Reconnect PER ROW (not provider-level), each targeting its own row id", async () => {
    const user = userEvent.setup();
    render(<AppCard app={multiAccount} accountId="acc-9" />);
    // No provider-level reconnect on the collapsed card.
    expect(screen.queryByTestId("app-card-reconnect")).toBeNull();
    await user.click(screen.getByTestId("app-card-expand"));

    const rows = screen.getAllByTestId("app-card-account");
    expect(rows).toHaveLength(2);
    const r0 = within(rows[0]!).getByTestId("app-card-reconnect");
    const r1 = within(rows[1]!).getByTestId("app-card-reconnect");
    // Each row's Reconnect sends ONLY that row's opaque id + the active account.
    expect(r0).toHaveAttribute("data-reconnect-integration-id", "int-1");
    expect(r0).toHaveAttribute("data-reconnect-account-id", "acc-9");
    expect(r1).toHaveAttribute("data-reconnect-integration-id", "int-2");
    expect(r1).toHaveAttribute("data-reconnect-account-id", "acc-9");
    // Honest copy + recovery affordance.
    expect(r0).toHaveAttribute("title", "Reconnect this account");
    expect(r0).toHaveAttribute("data-label", "Reconnect");
    expect(r0).toHaveAttribute("data-variant", "reconnect");
  });

  it("single-account provider still has a clear per-account Reconnect on its row", async () => {
    const user = userEvent.setup();
    render(<AppCard app={singleAccount} accountId="acc-9" />);
    expect(screen.queryByTestId("app-card-reconnect")).toBeNull(); // not provider-level
    await user.click(screen.getByTestId("app-card-expand"));
    const row = screen.getByTestId("app-card-account");
    const reconnect = within(row).getByTestId("app-card-reconnect");
    expect(reconnect).toHaveAttribute("data-reconnect-integration-id", "int-1");
    expect(reconnect).toHaveAttribute("data-reconnect-account-id", "acc-9");
    // "Connect another" is NOT shown for a single-account-only provider — so the
    // only credential actions are this row's Reconnect + Disconnect.
    const connectAnother = screen
      .queryAllByTestId("mock-connect-button")
      .filter((b) => b.getAttribute("data-label") === "Connect another");
    expect(connectAnother).toHaveLength(0);
  });

  it("does NOT render per-row Reconnect when canReconnect is false", async () => {
    const user = userEvent.setup();
    render(<AppCard app={noReconnect} accountId="acc-9" />);
    await user.click(screen.getByTestId("app-card-expand"));
    expect(screen.queryByTestId("app-card-reconnect")).toBeNull();
  });

  it("keeps 'Connect another' provider-level/additive in the expanded header (distinct from per-row Reconnect)", async () => {
    const user = userEvent.setup();
    render(<AppCard app={multiAccount} accountId="acc-9" />);
    await user.click(screen.getByTestId("app-card-expand"));
    // 'Connect another' has NO reconnect ids (it ADDS an account, not refresh).
    const connectAnother = screen
      .getAllByTestId("mock-connect-button")
      .filter((b) => b.getAttribute("data-label") === "Connect another");
    expect(connectAnother).toHaveLength(1);
    expect(connectAnother[0]).not.toHaveAttribute("data-reconnect-integration-id");
    expect(connectAnother[0]).toHaveAttribute("title", "Add another account");
  });
});

describe("AppCard — APPS-PERM-2 admin-required copy", () => {
  it("member viewing a NOT-connected account provider sees the admin-required copy and NO Connect button", () => {
    render(
      <AppCard
        app={mkApp({ isConnected: false, canConnect: false, restrictedToAdmins: true })}
        accountId="acc-1"
      />,
    );
    expect(screen.getByTestId("app-card-admin-required")).toHaveTextContent(
      "Only an owner or admin can connect this app for the team.",
    );
    expect(screen.queryByTestId("mock-connect-button")).toBeNull();
  });

  it("owner/admin viewing the same NOT-connected account provider sees Connect and NO admin copy", () => {
    render(
      <AppCard
        app={mkApp({ isConnected: false, canConnect: true, restrictedToAdmins: false })}
        accountId="acc-1"
      />,
    );
    expect(screen.queryByTestId("app-card-admin-required")).toBeNull();
    expect(screen.getByTestId("mock-connect-button")).toHaveAttribute("data-label", "Connect Slack");
  });

  it("member viewing a CONNECTED account provider sees the manage-restriction copy in the expanded body (no actions)", async () => {
    const user = userEvent.setup();
    const app = mkApp({
      isConnected: true,
      canConnect: false,
      restrictedToAdmins: true,
      accounts: [
        { id: "int-1", displayName: "Acme · ops@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
      ],
      firstConnectedAt: "2026-04-15T12:00:00Z",
    });
    render(<AppCard app={app} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    expect(screen.getByTestId("app-card-admin-required")).toHaveTextContent(
      "Only an owner or admin can reconnect or disconnect this team connection.",
    );
    // The action-less state is explained, not silent: no manage buttons render.
    expect(screen.queryByTestId("app-card-reconnect")).toBeNull();
    expect(screen.queryByTestId("app-card-disconnect")).toBeNull();
    const connectAnother = screen
      .queryAllByTestId("mock-connect-button")
      .filter((b) => b.getAttribute("data-label") === "Connect another");
    expect(connectAnother).toHaveLength(0);
  });

  it("personal provider for a member is NOT restricted — no admin copy, Connect still shows", () => {
    render(
      <AppCard
        app={mkApp({ providerId: "gmail", name: "Gmail", isConnected: false, canConnect: true, restrictedToAdmins: false })}
        accountId="acc-1"
      />,
    );
    expect(screen.queryByTestId("app-card-admin-required")).toBeNull();
    expect(screen.getByTestId("mock-connect-button")).toHaveAttribute("data-label", "Connect Gmail");
  });

  it("NO LEAK: admin-required copy contains no identity / token / scope / provider_account_id", async () => {
    const user = userEvent.setup();
    const app = mkApp({
      isConnected: true,
      canConnect: false,
      restrictedToAdmins: true,
      accounts: [
        { id: "int-1", displayName: "Acme · ops@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
      ],
      firstConnectedAt: "2026-04-15T12:00:00Z",
    });
    render(<AppCard app={app} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));
    const note = screen.getByTestId("app-card-admin-required").textContent ?? "";
    expect(note).not.toMatch(/@/); // no email
    expect(note).not.toMatch(/token|scope|owner_id|provider_account/i);
  });
});

describe("AppCard — reconnect-needed signal (V2-READY-28)", () => {
  const needsReconnectApp = mkApp({
    isConnected: true,
    needsReconnect: true,
    canConnect: true,
    accounts: [
      { id: "int-1", displayName: "Acme · ops@example.com", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: true, canReconnect: true, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: true },
    ],
    firstConnectedAt: "2026-04-15T12:00:00Z",
  });

  it("shows the provider-level 'Reconnect needed' status pill", () => {
    render(<AppCard app={needsReconnectApp} accountId="acc-1" />);
    const pill = screen.getByTestId("app-status-pill");
    expect(pill).toHaveAttribute("data-state", "needs-reconnect");
    expect(pill).toHaveTextContent(/reconnect needed/i);
  });

  it("shows a per-account reconnect-needed chip + safe copy when expanded", async () => {
    const user = userEvent.setup();
    render(<AppCard app={needsReconnectApp} accountId="acc-1" />);
    await user.click(screen.getByTestId("app-card-expand"));

    const row = screen.getByTestId("app-card-account");
    expect(within(row).getByTestId("app-card-reconnect-needed")).toHaveTextContent(/reconnect needed/i);
    // CS-APPS-RECOVERY-FINAL-1 — a reconnectable row reassures the viewer why to act
    // (keep workflows running) and that reconnect is a low-stakes per-account refresh.
    const copy = within(row).getByTestId("app-card-reconnect-needed-copy");
    expect(copy).toHaveTextContent(/reconnect this app to keep workflows running\./i);
    expect(copy).toHaveTextContent(/reconnect only refreshes this account's connection\./i);
    // The existing per-account Reconnect control still renders (canReconnect).
    expect(within(row).getByTestId("app-card-reconnect")).toBeInTheDocument();
  });

  it("does NOT leak any provider/account identifier in the reconnect-needed UI", () => {
    render(<AppCard app={needsReconnectApp} accountId="acc-1" />);
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/needs_reconnect_at|needsReconnectAt/);
    expect(html).not.toMatch(/token|xoxb|scope|provider_account|team_id/i);
  });

  it("a healthy connected provider shows the normal 'Connected' pill (no reconnect chip)", () => {
    const healthy = mkApp({
      isConnected: true,
      needsReconnect: false,
      accounts: [
        { id: "int-1", displayName: "Acme", connectedAt: "2026-04-15T12:00:00Z", canDisconnect: false, canReconnect: false, sharingStatus: "not_applicable", sharedWithAccount: false, canShare: false, canUnshare: false, needsReconnect: false },
      ],
      firstConnectedAt: "2026-04-15T12:00:00Z",
    });
    render(<AppCard app={healthy} accountId="acc-1" />);
    expect(screen.getByTestId("app-status-pill")).toHaveAttribute("data-state", "connected");
    expect(screen.queryByTestId("app-card-reconnect-needed")).toBeNull();
  });
});

// ── CS-APPS-RECOVERY-2 — collapsed-card reconnect discoverability ────────────

describe("AppCard — collapsed reconnect discoverability (CS-APPS-RECOVERY-2)", () => {
  type Acc = AppCatalogItem["accounts"][number];
  function row(over: Partial<Acc>): Acc {
    return {
      id: "int-1",
      displayName: "Acme · ops@example.com",
      connectedAt: "2026-04-15T12:00:00Z",
      canDisconnect: false,
      canReconnect: false,
      sharingStatus: "not_applicable",
      sharedWithAccount: false,
      canShare: false,
      canUnshare: false,
      needsReconnect: false,
      ...over,
    };
  }
  function connectedApp(accounts: Acc[]): AppCatalogItem {
    return mkApp({
      providerId: "gmail",
      name: "Gmail",
      isConnected: true,
      canConnect: true,
      needsReconnect: accounts.some((a) => a.needsReconnect),
      accounts,
      firstConnectedAt: accounts[0]?.connectedAt ?? null,
    });
  }

  it("shows a collapsed Reconnect targeting the flagged row when exactly one reconnectable row needs reconnect", () => {
    const app = connectedApp([
      row({ id: "healthy", canReconnect: true }),
      row({ id: "broken", needsReconnect: true, canReconnect: true }),
    ]);
    render(<AppCard app={app} accountId="acc-9" />);
    const btn = screen.getByTestId("app-card-collapsed-reconnect");
    // Reuses the existing per-row reconnect flow with the EXACT row + account ids.
    expect(btn).toHaveAttribute("data-reconnect-integration-id", "broken");
    expect(btn).toHaveAttribute("data-reconnect-account-id", "acc-9");
    expect(btn).toHaveAttribute("data-variant", "reconnect");
    expect(screen.queryByTestId("app-card-collapsed-review")).toBeNull();
  });

  it("shows a Review action (expands the card) when multiple reconnectable rows need reconnect — never guesses", async () => {
    const user = userEvent.setup();
    const app = connectedApp([
      row({ id: "b1", needsReconnect: true, canReconnect: true }),
      row({ id: "b2", needsReconnect: true, canReconnect: true }),
    ]);
    render(<AppCard app={app} accountId="acc-1" />);
    expect(screen.queryByTestId("app-card-collapsed-reconnect")).toBeNull();
    const review = screen.getByTestId("app-card-collapsed-review");
    expect(screen.queryByTestId("app-card-body")).toBeNull(); // collapsed until clicked
    await user.click(review);
    expect(screen.getByTestId("app-card-body")).toBeInTheDocument(); // expanded
    // Once expanded, the collapsed affordance hands off to per-row controls.
    expect(screen.queryByTestId("app-card-collapsed-review")).toBeNull();
  });

  it("does NOT show an actionable collapsed Reconnect when the flagged row is not reconnectable (blocked)", () => {
    const app = connectedApp([row({ id: "broken", needsReconnect: true, canReconnect: false })]);
    render(<AppCard app={app} accountId="acc-1" />);
    expect(screen.queryByTestId("app-card-collapsed-reconnect")).toBeNull();
    expect(screen.queryByTestId("app-card-collapsed-review")).toBeNull();
    // The status pill still warns (non-action), so the card isn't silently broken.
    expect(screen.getByTestId("app-status-pill")).toHaveAttribute("data-state", "needs-reconnect");
  });

  it("healthy connected card shows neither collapsed Reconnect nor Review", () => {
    const app = connectedApp([row({ id: "ok", canReconnect: true })]);
    render(<AppCard app={app} accountId="acc-1" />);
    expect(screen.queryByTestId("app-card-collapsed-reconnect")).toBeNull();
    expect(screen.queryByTestId("app-card-collapsed-review")).toBeNull();
    expect(screen.getByTestId("app-status-pill")).toHaveAttribute("data-state", "connected");
  });

  // ── CS-APPS-RECOVERY-COPY — clearer who/what/scope copy ─────────────────────
  describe("reconnect-needed copy clarity", () => {
    it("a reconnectable row shows the workflow-continuity + scope reassurance copy", async () => {
      const user = userEvent.setup();
      const app = connectedApp([row({ id: "broken", needsReconnect: true, canReconnect: true })]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      const copy = screen.getByTestId("app-card-reconnect-needed-copy");
      // (2) reconnect keeps workflows running, (3) reconnect only refreshes THIS account.
      expect(copy).toHaveTextContent(/reconnect this app to keep workflows running\./i);
      expect(copy).toHaveTextContent(/reconnect only refreshes this account's connection\./i);
    });

    it("does NOT show reassurance copy on a healthy connected row (no needsReconnect)", async () => {
      const user = userEvent.setup();
      const app = connectedApp([row({ id: "ok", canReconnect: true })]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      // The whole copy block is gated on needsReconnect — no noise on a working row.
      expect(screen.queryByTestId("app-card-reconnect-needed-copy")).toBeNull();
      expect(screen.queryByText(/keep workflows running/i)).toBeNull();
      expect(screen.queryByText(/only refreshes this account's connection/i)).toBeNull();
    });

    it("a row the viewer CANNOT reconnect says the original connector must do it (no dead button, no actionable reassurance)", async () => {
      const user = userEvent.setup();
      const app = connectedApp([row({ id: "broken", needsReconnect: true, canReconnect: false })]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      const copy = screen.getByTestId("app-card-reconnect-needed-copy");
      expect(copy).toHaveTextContent(/the person who connected it must reconnect it/i);
      // The "keep workflows running" CTA only appears where the viewer can actually act.
      expect(copy).not.toHaveTextContent(/keep workflows running/i);
      // No actionable Reconnect control for this viewer (canReconnect false).
      expect(screen.queryByTestId("app-card-reconnect")).toBeNull();
    });

    it("shows the 'other accounts still active' note only on a mixed-health multi-account card", async () => {
      const user = userEvent.setup();
      const mixed = connectedApp([
        row({ id: "ok", canReconnect: true }),
        row({ id: "broken", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={mixed} accountId="acc-1" />);
      // Mixed cards surface the collapsed Reconnect (one flagged row); expand to read the note.
      await user.click(screen.getByTestId("app-card-expand"));
      expect(screen.getByTestId("app-card-others-active-note")).toHaveTextContent(
        /your other connected accounts are still active/i,
      );
    });

    it("does NOT show the 'others active' note when every account needs reconnecting", async () => {
      const user = userEvent.setup();
      const allBroken = connectedApp([
        row({ id: "b1", needsReconnect: true, canReconnect: true }),
        row({ id: "b2", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={allBroken} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      expect(screen.queryByTestId("app-card-others-active-note")).toBeNull();
    });

    it("does NOT show the 'others active' note for a single-account card", async () => {
      const user = userEvent.setup();
      const single = connectedApp([row({ id: "broken", needsReconnect: true, canReconnect: true })]);
      render(<AppCard app={single} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      expect(screen.queryByTestId("app-card-others-active-note")).toBeNull();
    });
  });

  // ── CS-APPS-RECOVERY-REVIEW-SCROLL — guide the user to the flagged rows ──────
  describe("Review reconnects scroll/focus polish", () => {
    let scrollSpy: jest.Mock;
    beforeEach(() => {
      // jsdom's scrollIntoView is a no-op; replace with a spy so we can assert it
      // ran. Restored in afterEach.
      scrollSpy = jest.fn();
      (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
        scrollSpy;
    });
    afterEach(() => {
      delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown })
        .scrollIntoView;
    });

    function rowById(id: string): HTMLElement | undefined {
      return screen
        .getAllByTestId("app-card-account")
        .find((el) => el.getAttribute("data-account-id") === id);
    }

    it("expands the card AND scrolls + focuses the FIRST reconnect-needed row (skips healthy rows above it)", async () => {
      const user = userEvent.setup();
      const app = connectedApp([
        row({ id: "healthy", canReconnect: true }),
        row({ id: "b1", needsReconnect: true, canReconnect: true }),
        row({ id: "b2", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-collapsed-review"));
      // Card expanded.
      expect(screen.getByTestId("app-card-body")).toBeInTheDocument();
      // Focus + scroll land on the first FLAGGED row (b1), not the healthy row 0.
      await waitFor(() => expect(rowById("b1")).toBe(document.activeElement));
      expect(scrollSpy).toHaveBeenCalled();
      // Accessible target: programmatically focusable + announces why focus moved.
      expect(rowById("b1")).toHaveAttribute("tabindex", "-1");
      expect(rowById("b1")).toHaveAttribute(
        "aria-label",
        "Acme · ops@example.com needs reconnecting",
      );
      // The healthy row is NOT made a focus target.
      expect(rowById("healthy")).not.toHaveAttribute("tabindex");
    });

    it("does NOT scroll/focus when the card is expanded via the chevron (not Review)", async () => {
      const user = userEvent.setup();
      const app = connectedApp([
        row({ id: "b1", needsReconnect: true, canReconnect: true }),
        row({ id: "b2", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      expect(screen.getByTestId("app-card-body")).toBeInTheDocument();
      expect(scrollSpy).not.toHaveBeenCalled();
      expect(rowById("b1")).not.toBe(document.activeElement);
    });

    it("direct one-row Reconnect path uses no review scroll/focus (stays collapsed, no scroll)", () => {
      // Exactly one reconnectable flagged row → collapsed Reconnect (ConnectButton),
      // never the Review action. The scroll/focus effect must not fire on this path.
      const app = connectedApp([
        row({ id: "healthy", canReconnect: true }),
        row({ id: "broken", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={app} accountId="acc-1" />);
      expect(screen.getByTestId("app-card-collapsed-reconnect")).toBeInTheDocument();
      expect(screen.queryByTestId("app-card-collapsed-review")).toBeNull();
      expect(screen.queryByTestId("app-card-body")).toBeNull(); // not auto-expanded
      expect(scrollSpy).not.toHaveBeenCalled();
    });
  });

  // ── CS-APPS-RECOVERY-ROW-ORDER — needs-reconnect rows render first ──────────
  describe("expanded row ordering", () => {
    const renderedIds = (): (string | null)[] =>
      screen
        .getAllByTestId("app-card-account")
        .map((el) => el.getAttribute("data-account-id"));

    it("renders reconnect-needed rows before healthy rows", async () => {
      const user = userEvent.setup();
      const app = connectedApp([
        row({ id: "h1", canReconnect: true }),
        row({ id: "b1", needsReconnect: true, canReconnect: true }),
        row({ id: "h2", canReconnect: true }),
        row({ id: "b2", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      expect(renderedIds()).toEqual(["b1", "b2", "h1", "h2"]);
    });

    it("keeps original relative order WITHIN the reconnect-needed group", async () => {
      const user = userEvent.setup();
      const app = connectedApp([
        row({ id: "b1", needsReconnect: true, canReconnect: true }),
        row({ id: "h1", canReconnect: true }),
        row({ id: "b2", needsReconnect: true, canReconnect: true }),
        row({ id: "b3", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      expect(renderedIds().slice(0, 3)).toEqual(["b1", "b2", "b3"]);
    });

    it("preserves original order for a healthy-only card (no reordering)", async () => {
      const user = userEvent.setup();
      const app = connectedApp([
        row({ id: "h1", canReconnect: true }),
        row({ id: "h2", canReconnect: true }),
        row({ id: "h3", canReconnect: true }),
      ]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-expand"));
      expect(renderedIds()).toEqual(["h1", "h2", "h3"]);
    });

    it("after Review, the first reconnect-needed row is rendered first AND focused", async () => {
      const user = userEvent.setup();
      (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
        jest.fn();
      const app = connectedApp([
        row({ id: "healthy", canReconnect: true }),
        row({ id: "b1", needsReconnect: true, canReconnect: true }),
        row({ id: "b2", needsReconnect: true, canReconnect: true }),
      ]);
      render(<AppCard app={app} accountId="acc-1" />);
      await user.click(screen.getByTestId("app-card-collapsed-review"));
      expect(renderedIds()).toEqual(["b1", "b2", "healthy"]);
      await waitFor(() =>
        expect(
          screen
            .getAllByTestId("app-card-account")
            .find((el) => el.getAttribute("data-account-id") === "b1"),
        ).toBe(document.activeElement),
      );
      delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown })
        .scrollIntoView;
    });
  });
});
