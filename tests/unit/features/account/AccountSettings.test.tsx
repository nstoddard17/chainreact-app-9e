/**
 * Tests for features/account/AccountSettings (Slice 4.ACCOUNT-SETTINGS-1).
 *
 * Covers the account-settings surface: overview, the personal-account deletion
 * flow (typed phrase + password → request), pending/scheduled state + cancel,
 * the owned-Team/Business remediation blocker, and the Team-page pointer for a
 * shared active account. The deletion client and next/link are mocked.
 */
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/features/account/AccountSettings";
import type { AccountSummary } from "@/lib/api/accounts";

const mockRequest = jest.fn();
const mockCancel = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  class AccountDeletionError extends Error {
    code: string;
    status: number;
    ownedAccounts?: unknown;
    constructor(message: string, code = "UNKNOWN", status = 500, ownedAccounts?: unknown) {
      super(message);
      this.code = code;
      this.status = status;
      this.ownedAccounts = ownedAccounts;
    }
  }
  return {
    AccountDeletionError,
    requestAccountDeletion: (...a: unknown[]) => mockRequest(...a),
    cancelAccountDeletion: (...a: unknown[]) => mockCancel(...a),
  };
});

import { AccountDeletionError } from "@/lib/api/accounts";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const personalActive: AccountSummary = {
  id: "p1",
  name: "Personal",
  type: "personal",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};

const teamActive: AccountSummary = {
  id: "t1",
  name: "Acme",
  type: "team",
  role: "admin",
  isActive: true,
  deletionStatus: "active",
};

const orgActive: AccountSummary = {
  id: "o1",
  name: "Acme Biz",
  type: "organization",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};

function view(a: AccountSummary) {
  return { name: a.name, type: a.type, role: a.role };
}

beforeEach(() => {
  mockRequest.mockReset();
  mockCancel.mockReset();
});

describe("AccountSettings — overview", () => {
  it("renders the active account overview (name + type + role)", () => {
    render(
      <AccountSettings
        active={view(personalActive)}
        isPersonal
        deletionStatus="active"
        purgeAfter={null}
      />,
    );
    expect(screen.getByTestId("account-settings")).toBeInTheDocument();
    // Name + type label both read "Personal"; the personal danger zone renders.
    expect(screen.getAllByText("Personal").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("account-deletion-card")).toBeInTheDocument();
  });

  it("labels an internal organization account as Business (never Organization)", () => {
    render(
      <AccountSettings
        active={view(orgActive)}
        isPersonal={false}
        deletionStatus="active"
        purgeAfter={null}
      />,
    );
    const settings = screen.getByTestId("account-settings");
    expect(settings).toHaveTextContent("Business");
    expect(settings).not.toHaveTextContent(/Organization/);
  });
});

describe("AccountSettings — personal deletion", () => {
  it("requires the typed phrase and a password before the confirm enables", async () => {
    const user = userEvent.setup();
    render(
      <AccountSettings active={view(personalActive)} isPersonal deletionStatus="active" purgeAfter={null} />,
    );
    await user.click(screen.getByTestId("account-delete-open"));
    const confirm = screen.getByTestId("account-delete-confirm");
    expect(confirm).toBeDisabled();

    await user.type(screen.getByTestId("account-delete-password"), "hunter2");
    expect(confirm).toBeDisabled(); // phrase still missing

    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    expect(confirm).toBeEnabled();
  });

  it("submits the request and renders the pending/scheduled state with a cancel", async () => {
    mockRequest.mockResolvedValue({
      deletionStatus: "pending_deletion",
      requestedAt: "2026-06-05T00:00:00Z",
      purgeAfter: "2026-07-05T00:00:00Z",
    });
    const user = userEvent.setup();
    render(
      <AccountSettings active={view(personalActive)} isPersonal deletionStatus="active" purgeAfter={null} />,
    );
    await user.click(screen.getByTestId("account-delete-open"));
    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    await user.type(screen.getByTestId("account-delete-password"), "pw");
    await user.click(screen.getByTestId("account-delete-confirm"));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith({ password: "pw", confirmText: "delete my account" }),
    );
    const pending = await screen.findByTestId("account-deletion-pending");
    expect(pending).toHaveTextContent(/pending deletion/i);
    expect(pending).toHaveTextContent(/July 5, 2026/);
    expect(screen.getByTestId("account-deletion-cancel")).toBeInTheDocument();
  });

  it("renders an already-pending account as frozen with a cancel (no destructive form)", () => {
    render(
      <AccountSettings
        active={view(personalActive)}
        isPersonal
        deletionStatus="pending_deletion"
        purgeAfter="2026-07-05T00:00:00Z"
      />,
    );
    expect(screen.getByTestId("account-deletion-pending")).toBeInTheDocument();
    expect(screen.getByTestId("account-deletion-cancel")).toBeInTheDocument();
    // The normal destructive form is NOT shown.
    expect(screen.queryByTestId("account-delete-open")).toBeNull();
  });

  it("cancel deletion calls the cancel API and restores the active state", async () => {
    mockCancel.mockResolvedValue({ deletionStatus: "active", requestedAt: null, purgeAfter: null });
    const user = userEvent.setup();
    render(
      <AccountSettings
        active={view(personalActive)}
        isPersonal
        deletionStatus="pending_deletion"
        purgeAfter="2026-07-05T00:00:00Z"
      />,
    );
    await user.click(screen.getByTestId("account-deletion-cancel"));
    await waitFor(() => expect(mockCancel).toHaveBeenCalled());
    // Back to the active danger-zone form.
    expect(await screen.findByTestId("account-delete-open")).toBeInTheDocument();
    expect(screen.queryByTestId("account-deletion-pending")).toBeNull();
  });

  it("renders the request re-auth error inline and keeps the form open", async () => {
    mockRequest.mockRejectedValue(
      new AccountDeletionError("Password confirmation failed.", "REAUTH_FAILED", 401),
    );
    const user = userEvent.setup();
    render(
      <AccountSettings active={view(personalActive)} isPersonal deletionStatus="active" purgeAfter={null} />,
    );
    await user.click(screen.getByTestId("account-delete-open"));
    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    await user.type(screen.getByTestId("account-delete-password"), "wrong");
    await user.click(screen.getByTestId("account-delete-confirm"));

    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(
      /password confirmation failed/i,
    );
    expect(screen.getByTestId("account-delete-form")).toBeInTheDocument();
  });
});

describe("AccountSettings — owned Team/Business blocker", () => {
  it("renders the owned accounts with the Business label + a Team-page link", async () => {
    mockRequest.mockRejectedValue(
      new AccountDeletionError(
        "Transfer ownership or delete the Team/Business accounts you own…",
        "ACCOUNT_HAS_OWNED_TEAMS",
        409,
        [
          { id: "t1", name: "Acme Team", type: "team", typeLabel: "Team" },
          { id: "o1", name: "Acme Biz", type: "organization", typeLabel: "Business" },
        ],
      ),
    );
    const user = userEvent.setup();
    render(
      <AccountSettings active={view(personalActive)} isPersonal deletionStatus="active" purgeAfter={null} />,
    );
    await user.click(screen.getByTestId("account-delete-open"));
    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    await user.type(screen.getByTestId("account-delete-password"), "pw");
    await user.click(screen.getByTestId("account-delete-confirm"));

    const blocked = await screen.findByTestId("account-deletion-blocked");
    expect(blocked).toHaveTextContent(/transfer ownership or delete these accounts/i);
    expect(screen.getByTestId("account-owned-t1")).toHaveTextContent("Acme Team");
    expect(screen.getByTestId("account-owned-o1")).toHaveTextContent("Business");
    expect(blocked).not.toHaveTextContent(/Organization/);
    expect(screen.getByTestId("account-blocked-team-link")).toHaveAttribute("href", "/team");
  });
});

describe("AccountSettings — shared active account", () => {
  it("shows a Team-page pointer and NOT the deletion form for a Team active account", () => {
    render(
      <AccountSettings active={view(teamActive)} isPersonal={false} deletionStatus="active" purgeAfter={null} />,
    );
    expect(screen.getByTestId("account-team-pointer")).toHaveTextContent(
      /manage members, ownership transfer, and leave team from the Team page/i,
    );
    expect(screen.getByTestId("account-team-link")).toHaveAttribute("href", "/team");
    // No personal-deletion controls on a shared account.
    expect(screen.queryByTestId("account-delete-open")).toBeNull();
    expect(screen.queryByTestId("account-deletion-card")).toBeNull();
  });
});
