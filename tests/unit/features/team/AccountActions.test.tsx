/**
 * Tests for features/team/AccountActions (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-6 / TL-5).
 *
 * Covers the Team-page transfer-ownership + leave-team UI that surfaces the
 * already-built backend. The typed account client and next/navigation are
 * mocked — we assert role-gated visibility, the transfer/leave flows, the
 * leave-impact warning, and error rendering. No real network.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountActions } from "@/features/team/AccountActions";
import { AccountApiError, type AccountSummary } from "@/lib/api/accounts";
import type { TeamMemberView } from "@/features/team/teamTypes";

const mockTransfer = jest.fn();
const mockLeave = jest.fn();
const mockLeaveImpact = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  class AccountApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "FORBIDDEN", status = 403) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    AccountApiError,
    transferOwnership: (...a: unknown[]) => mockTransfer(...a),
    leaveAccount: (...a: unknown[]) => mockLeave(...a),
    getLeaveImpact: (...a: unknown[]) => mockLeaveImpact(...a),
  };
});

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const base = { joinedAt: "2026-05-01T00:00:00Z" };

function teamAccount(role: AccountSummary["role"], type: AccountSummary["type"] = "team"): AccountSummary {
  return { id: "t1", name: "Acme", type, role, isActive: true, deletionStatus: "active" };
}

// owner (you) + an admin + a member
const ownerMembers: TeamMemberView[] = [
  { ...base, userId: "me", role: "owner", email: "me@x.io", displayName: "Me", isYou: true },
  { ...base, userId: "u2", role: "admin", email: "ada@x.io", displayName: "Ada", isYou: false },
  { ...base, userId: "u3", role: "member", email: "bob@x.io", displayName: null, isYou: false },
];

// you are a plain member; someone else is owner
const memberMembers: TeamMemberView[] = [
  { ...base, userId: "owner", role: "owner", email: "o@x.io", displayName: "Owner", isYou: false },
  { ...base, userId: "me", role: "member", email: "me@x.io", displayName: "Me", isYou: true },
];

beforeEach(() => {
  mockTransfer.mockReset();
  mockLeave.mockReset();
  mockLeaveImpact.mockReset().mockResolvedValue(0);
  mockPush.mockReset();
  mockRefresh.mockReset();
});

describe("AccountActions — transfer ownership visibility", () => {
  it("shows the transfer action only to the owner", () => {
    const { rerender } = render(
      <AccountActions account={teamAccount("owner")} members={ownerMembers} onChanged={() => {}} />,
    );
    expect(screen.getByTestId("team-transfer-open")).toBeInTheDocument();

    rerender(
      <AccountActions account={teamAccount("member")} members={memberMembers} onChanged={() => {}} />,
    );
    expect(screen.queryByTestId("team-transfer-open")).toBeNull();
  });

  it("lists eligible member/admin targets and never the current owner", async () => {
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("owner")} members={ownerMembers} onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-transfer-open"));
    const select = screen.getByTestId("team-transfer-target") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["u2", "u3"]); // not "me" (owner/self)
    expect(optionValues).not.toContain("me");
  });
});

describe("AccountActions — transfer flow", () => {
  it("requires a password before the confirm is enabled", async () => {
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("owner")} members={ownerMembers} onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-transfer-open"));
    const confirm = screen.getByTestId("team-transfer-confirm");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId("team-transfer-password"), "hunter2");
    expect(confirm).toBeEnabled();
  });

  it("submits the chosen target + password, refreshes, and shows success", async () => {
    mockTransfer.mockResolvedValue({ ok: true });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("owner")} members={ownerMembers} onChanged={onChanged} />,
    );
    await user.click(screen.getByTestId("team-transfer-open"));
    await user.selectOptions(screen.getByTestId("team-transfer-target"), "u3");
    await user.type(screen.getByTestId("team-transfer-password"), "hunter2");
    await user.click(screen.getByTestId("team-transfer-confirm"));

    await waitFor(() =>
      expect(mockTransfer).toHaveBeenCalledWith("t1", { targetUserId: "u3", password: "hunter2" }),
    );
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByTestId("team-transfer-success")).toBeInTheDocument();
  });

  it("renders the backend error (e.g. re-auth failed) and keeps the form open", async () => {
    mockTransfer.mockRejectedValue(new AccountApiError("Password confirmation failed.", "UNAUTHENTICATED", 401));
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("owner")} members={ownerMembers} onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-transfer-open"));
    await user.type(screen.getByTestId("team-transfer-password"), "wrong");
    await user.click(screen.getByTestId("team-transfer-confirm"));

    expect(await screen.findByTestId("team-transfer-error")).toHaveTextContent(
      /password confirmation failed/i,
    );
    expect(screen.getByTestId("team-transfer-form")).toBeInTheDocument();
  });
});

describe("AccountActions — leave team", () => {
  it("shows an enabled Leave action for a plain member/admin", () => {
    render(
      <AccountActions account={teamAccount("member")} members={memberMembers} onChanged={() => {}} />,
    );
    expect(screen.getByTestId("team-leave-open")).toBeEnabled();
    expect(screen.queryByTestId("team-leave-sole-owner")).toBeNull();
  });

  it("blocks a sole owner from leaving and points them at transfer", () => {
    render(
      <AccountActions account={teamAccount("owner")} members={ownerMembers} onChanged={() => {}} />,
    );
    expect(screen.getByTestId("team-leave-open")).toBeDisabled();
    expect(screen.getByTestId("team-leave-sole-owner")).toHaveTextContent(
      /transfer ownership before leaving this team/i,
    );
  });

  it("shows the leave-impact warning when the caller has personal-app workflows (count > 0)", async () => {
    mockLeaveImpact.mockResolvedValue(2);
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("member")} members={memberMembers} onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-leave-open"));
    expect(mockLeaveImpact).toHaveBeenCalledWith("t1");
    const warning = await screen.findByTestId("team-leave-impact");
    expect(warning).toHaveTextContent(
      /run 2 workflows with personal app steps.*creator or assigned owner.*may stop running/i,
    );
    expect(screen.getByTestId("team-leave-confirm")).toBeInTheDocument();
  });

  it("does NOT show the impact warning when the count is 0, but still allows leaving", async () => {
    mockLeaveImpact.mockResolvedValue(0);
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("member")} members={memberMembers} onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-leave-open"));
    await screen.findByTestId("team-leave-form");
    expect(screen.queryByTestId("team-leave-impact")).toBeNull();
    expect(screen.getByTestId("team-leave-confirm")).toBeInTheDocument();
  });

  it("leaves on confirm, refreshes, and routes to a safe page", async () => {
    mockLeaveImpact.mockResolvedValue(0);
    mockLeave.mockResolvedValue(undefined);
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("member")} members={memberMembers} onChanged={onChanged} />,
    );
    await user.click(screen.getByTestId("team-leave-open"));
    await screen.findByTestId("team-leave-form");
    await user.click(screen.getByTestId("team-leave-confirm"));

    await waitFor(() => expect(mockLeave).toHaveBeenCalledWith("t1"));
    expect(onChanged).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/workflows");
  });

  it("renders the sole-owner backend error if a leave still fails", async () => {
    mockLeaveImpact.mockResolvedValue(0);
    mockLeave.mockRejectedValue(
      new AccountApiError("Transfer ownership before leaving — an account must keep an owner.", "CONFLICT", 409),
    );
    const user = userEvent.setup();
    render(
      <AccountActions account={teamAccount("member")} members={memberMembers} onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-leave-open"));
    await screen.findByTestId("team-leave-form");
    await user.click(screen.getByTestId("team-leave-confirm"));

    expect(await screen.findByTestId("team-leave-error")).toHaveTextContent(
      /an account must keep an owner/i,
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
