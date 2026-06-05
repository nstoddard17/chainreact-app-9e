/**
 * Tests for the mobile workspace switcher (Slice 4.ACCOUNT-SWITCHER-MOBILE-1).
 *
 * The mobile counterpart of the desktop `AccountSwitcher`, rendered inline in
 * the nav drawer. Shares the same `useAccountSwitcher` hook + `AccountSwitcherList`
 * markup, so these pins mirror the desktop switcher's behavior contract on the
 * mobile surface: render/access, switch-then-reload, already-active no-op, and
 * frozen-disabled. Mocks lib/api/accounts + window.location.reload.
 */
import { render, screen, waitFor } from "@testing-library/react";
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

import { AppMobileAccountSwitcher } from "@/components/app-shell/AppMobileAccountSwitcher";
import type { AccountSummary } from "@/lib/api/accounts";

function acct(
  over: Partial<AccountSummary> & { id: string; name: string },
): AccountSummary {
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

describe("AppMobileAccountSwitcher", () => {
  it("renders inline (no popover) and lists the member accounts with their type", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "team-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal" }),
        acct({ id: "team-1", name: "Test Team", type: "team", isActive: true }),
      ],
    });
    render(<AppMobileAccountSwitcher />);

    // Items are visible immediately — no trigger to open (inline drawer section).
    const personal = await screen.findByTestId(
      "app-shell-mobile-account-item-personal-1",
    );
    expect(personal).toHaveTextContent("Personal");
    const team = screen.getByTestId("app-shell-mobile-account-item-team-1");
    expect(team).toHaveTextContent("Test Team");
    expect(team).toHaveTextContent("Team");
    // The active account is marked.
    expect(team).toHaveAttribute("aria-current", "true");
  });

  it("renders Business (never Organization) for an internal organization account", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "personal-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal", isActive: true }),
        acct({ id: "org-1", name: "Acme Biz", type: "organization" }),
      ],
    });
    render(<AppMobileAccountSwitcher />);
    const item = await screen.findByTestId("app-shell-mobile-account-item-org-1");
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
    render(<AppMobileAccountSwitcher />);

    await userEvent.click(
      await screen.findByTestId("app-shell-mobile-account-item-team-1"),
    );

    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith("team-1"));
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it("clicking the already-active account does NOT switch or reload", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "personal-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal", isActive: true }),
      ],
    });
    render(<AppMobileAccountSwitcher />);

    await userEvent.click(
      await screen.findByTestId("app-shell-mobile-account-item-personal-1"),
    );
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
    render(<AppMobileAccountSwitcher />);

    expect(
      await screen.findByTestId("app-shell-mobile-account-item-team-2"),
    ).toBeDisabled();
  });

  it("surfaces a switch error without reloading when setActiveAccount fails", async () => {
    mockList.mockResolvedValue({
      activeAccountId: "personal-1",
      accounts: [
        acct({ id: "personal-1", name: "Personal", type: "personal", isActive: true }),
        acct({ id: "team-1", name: "Test Team", type: "team" }),
      ],
    });
    mockSetActive.mockRejectedValue(new Error("boom"));
    render(<AppMobileAccountSwitcher />);

    await userEvent.click(
      await screen.findByTestId("app-shell-mobile-account-item-team-1"),
    );

    expect(
      await screen.findByTestId("app-shell-mobile-account-error"),
    ).toHaveTextContent(/couldn't switch account/i);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
