/**
 * Tests for the workspace AccountSwitcher (Slice 4.ACCOUNT-SWITCHER-1).
 * Mocks lib/api/accounts + window.location.reload.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockList = jest.fn();
const mockSetActive = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  const actual = jest.requireActual("@/lib/api/accounts");
  return {
    ...actual,
    listAccounts: (...a: unknown[]) => mockList(...a),
    setActiveAccount: (...a: unknown[]) => mockSetActive(...a),
  };
});

import { AccountSwitcher } from "@/components/app-shell/AccountSwitcher";
import type { AccountSummary } from "@/lib/api/accounts";

function acct(over: Partial<AccountSummary> & { id: string; name: string }): AccountSummary {
  return {
    type: "personal",
    role: "owner",
    isActive: false,
    deletionStatus: "active",
    ...over,
  };
}

const reloadMock = jest.fn();
beforeAll(() => {
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: reloadMock },
    writable: true,
  });
});

beforeEach(() => {
  mockList.mockReset();
  mockSetActive.mockReset();
  reloadMock.mockReset();
});

describe("AccountSwitcher", () => {
  it("shows the active account name + type and lists the member accounts", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "team-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal" }),
        acct({ id: "team-1", name: "Test Team", type: "team", isActive: true }),
      ],
    });
    render(<AccountSwitcher />);
    // Active label resolves from the fetched data.
    await waitFor(() =>
      expect(screen.getByTestId("account-switcher-active-name")).toHaveTextContent("Test Team"),
    );

    await userEvent.click(screen.getByTestId("account-switcher-trigger"));
    const menu = await screen.findByTestId("account-switcher-menu");
    expect(within(menu).getByTestId("account-switcher-item-personal-1")).toHaveTextContent("Personal");
    expect(within(menu).getByTestId("account-switcher-item-team-1")).toHaveTextContent("Test Team");
  });

  it("renders Business (never Organization) for an internal organization account", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "personal-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal", isActive: true }),
        acct({ id: "org-1", name: "Acme Biz", type: "organization" }),
      ],
    });
    render(<AccountSwitcher />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    await userEvent.click(screen.getByTestId("account-switcher-trigger"));
    const item = await screen.findByTestId("account-switcher-item-org-1");
    expect(item).toHaveTextContent("Business");
    expect(item).not.toHaveTextContent("Organization");
  });

  it("switching to another account calls setActiveAccount then reloads", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "personal-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal", isActive: true }),
        acct({ id: "team-1", name: "Test Team", type: "team" }),
      ],
    });
    mockSetActive.mockResolvedValue(undefined);
    render(<AccountSwitcher />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await userEvent.click(screen.getByTestId("account-switcher-trigger"));
    await userEvent.click(await screen.findByTestId("account-switcher-item-team-1"));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith("team-1"));
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it("clicking the already-active account does NOT switch or reload", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "personal-1",
      accounts: [acct({ id: "personal-1", name: "Personal", type: "personal", isActive: true })],
    });
    render(<AccountSwitcher />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    await userEvent.click(screen.getByTestId("account-switcher-trigger"));
    await userEvent.click(await screen.findByTestId("account-switcher-item-personal-1"));
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("a frozen (pending-deletion) account is disabled", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "personal-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal", isActive: true }),
        acct({ id: "team-2", name: "Closing", type: "team", deletionStatus: "pending_deletion" }),
      ],
    });
    render(<AccountSwitcher />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    await userEvent.click(screen.getByTestId("account-switcher-trigger"));
    expect(await screen.findByTestId("account-switcher-item-team-2")).toBeDisabled();
  });
});
