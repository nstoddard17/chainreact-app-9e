/**
 * RESPONSIVE-TEAM-4 — Team management responsive behaviour.
 *
 * jsdom has no layout engine, so GEOMETRY belongs to the continuous real-browser
 * sweep (18 states × 158 widths, 360→1600). What this file protects is what the
 * sweep cannot see: that the roster's two presentations are ONE set of controls,
 * that every permission difference survived the rework, and that not a byte of
 * what gets SUBMITTED changed.
 *
 * The permission tests here are deliberately not "responsive" tests. The single
 * biggest risk in converting a table to cards is quietly changing who is offered
 * which action, so who-can-do-what is asserted against the rendered controls.
 */
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeamDashboard } from "@/features/team/TeamDashboard";
import { MembersTable } from "@/features/team/MembersTable";
import type { AccountSummary } from "@/lib/api/accounts";
import type { TeamInvitationView, TeamMemberView } from "@/features/team/teamTypes";

const mockCreateInvitation = jest.fn();
const mockChangeMemberRole = jest.fn();
const mockRemoveMember = jest.fn();
const mockWorkflowImpact = jest.fn();
const mockLeaveImpact = jest.fn();
const mockLeaveAccount = jest.fn();
const mockTransferOwnership = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/lib/api/accounts", () => {
  class AccountApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "VALIDATION", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    AccountApiError,
    createInvitation: (...a: unknown[]) => mockCreateInvitation(...a),
    changeMemberRole: (...a: unknown[]) => mockChangeMemberRole(...a),
    removeMember: (...a: unknown[]) => mockRemoveMember(...a),
    getMemberWorkflowImpact: (...a: unknown[]) => mockWorkflowImpact(...a),
    getLeaveImpact: (...a: unknown[]) => mockLeaveImpact(...a),
    leaveAccount: (...a: unknown[]) => mockLeaveAccount(...a),
    transferOwnership: (...a: unknown[]) => mockTransferOwnership(...a),
    revokeInvitation: jest.fn(),
    changeInvitationRole: jest.fn(),
    changeInvitationEmail: jest.fn(),
    setActiveAccount: jest.fn(),
    createTeam: jest.fn(),
    listCredentialRequests: jest.fn().mockResolvedValue([]),
    acceptCredentialRequest: jest.fn(),
    declineCredentialRequest: jest.fn(),
  };
});

const LONG_NAME = "Alexandra Featherstonehaugh-McAllister de la Cruz-Wintersgill";
const LONG_EMAIL =
  "alexandra.featherstonehaugh-mcallister@northwind-traders-global-operations.example";

const ACC = "00000000-0000-4000-8000-00000000000a";

function acct(over: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: ACC,
    name: "Northwind Traders",
    type: "team",
    role: "owner",
    deletionStatus: "active",
    ...over,
  } as AccountSummary;
}

function member(over: Partial<TeamMemberView> & { userId: string }): TeamMemberView {
  return {
    role: "member",
    joinedAt: "2026-04-12T00:00:00Z",
    email: null,
    displayName: null,
    isYou: false,
    ...over,
  };
}

const OWNER_YOU = member({
  userId: "u-owner",
  role: "owner",
  displayName: "Sam Okafor",
  email: "sam@example.com",
  isYou: true,
});
const ADMIN_LONG = member({
  userId: "u-admin",
  role: "admin",
  displayName: LONG_NAME,
  email: LONG_EMAIL,
});
const MEMBER = member({
  userId: "u-member",
  role: "member",
  displayName: "Priya Raghunathan",
  email: "priya@example.com",
});

const INVITES: readonly TeamInvitationView[] = [
  {
    id: "inv-1",
    email: LONG_EMAIL,
    role: "member",
    status: "pending",
    expiresAt: null,
    createdAt: "2026-07-18T00:00:00Z",
  },
];

function renderTeam(over: Partial<Parameters<typeof TeamDashboard>[0]> = {}) {
  return render(
    <TeamDashboard
      accounts={[acct()]}
      activeAccountId={ACC}
      currentUserEmail="sam@example.com"
      members={[OWNER_YOU, ADMIN_LONG, MEMBER]}
      invitations={INVITES}
      canManage
      memberCap={5}
      teamMaxMembers={5}
      {...over}
    />,
  );
}

async function goToMembers(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("team-nav-members"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWorkflowImpact.mockResolvedValue(0);
  mockLeaveImpact.mockResolvedValue(0);
  mockCreateInvitation.mockResolvedValue({
    invitation: {
      id: "inv-new",
      email: "new@example.com",
      role: "member",
      status: "pending",
      expiresAt: null,
      createdAt: "2026-07-31T00:00:00Z",
    },
    acceptPath: "/invite/accept?token=FIXTURE",
    emailDelivery: { status: "sent" },
  });
});

// ── Member row presentation ──────────────────────────────────────────────────

describe("the member row is a table AND a card from one set of markup", () => {
  it("renders exactly one control set per member — no desktop/mobile duplicate", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    // A duplicated row would offer the same member two Remove buttons, and the
    // two copies could drift apart in what they permit.
    expect(screen.getAllByTestId(`team-remove-${ADMIN_LONG.userId}`)).toHaveLength(1);
    expect(screen.getAllByTestId(`team-member-${ADMIN_LONG.userId}`)).toHaveLength(1);
    expect(screen.getAllByLabelText("Member role")).toHaveLength(2); // admin + member rows
  });

  it("stacks below sm and becomes an aligned grid above it", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    const row = screen.getByTestId(`team-member-${ADMIN_LONG.userId}`);
    const layout = row.firstElementChild as HTMLElement;
    // Behaviour: the row still holds identity, the role control and the action…
    expect(within(row).getByText(LONG_NAME)).toBeInTheDocument();
    expect(within(row).getByLabelText("Member role")).toBeInTheDocument();
    expect(within(row).getByTestId(`team-remove-${ADMIN_LONG.userId}`)).toBeInTheDocument();
    // …and the mechanism that lets it: column first, grid only from `sm`.
    expect(layout.className).toContain("flex-col");
    expect(layout.className).toContain("sm:grid");
  });

  it("declares a minimum readable width for member identity", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    const row = screen.getByTestId(`team-member-${ADMIN_LONG.userId}`);
    const identity = row.querySelector("[data-legible-min]") as HTMLElement;
    // The browser sweep enforces this number at all 158 widths; the component is
    // what declares it, so the declaration itself is worth protecting.
    expect(identity).not.toBeNull();
    expect(Number(identity.getAttribute("data-legible-min"))).toBeGreaterThanOrEqual(180);
  });

  it("wraps a long name and breaks a long email instead of clipping them", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    const row = screen.getByTestId(`team-member-${ADMIN_LONG.userId}`);
    expect(within(row).getByText(LONG_NAME).className).toContain("break-words");
    // An email is one unbroken token — only `break-all` can split it.
    expect(within(row).getByText(LONG_EMAIL).className).toContain("break-all");
  });

  it("labels the joined date in card mode, where the column header is gone", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    const row = screen.getByTestId(`team-member-${MEMBER.userId}`);
    expect(row).toHaveTextContent(/Joined/);
  });
});

// ── Permissions are unchanged ────────────────────────────────────────────────

describe("who may do what is exactly as before", () => {
  it("gives the owner row no role control and no remove action", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    const ownerRow = screen.getByTestId(`team-member-${OWNER_YOU.userId}`);
    expect(within(ownerRow).queryByLabelText("Member role")).toBeNull();
    expect(screen.queryByTestId(`team-remove-${OWNER_YOU.userId}`)).toBeNull();
    // The owner's role is still stated, just not editable.
    expect(within(ownerRow).getByTestId("team-role-badge-owner")).toBeInTheDocument();
  });

  it("gives a plain member a read-only roster with no controls anywhere", async () => {
    const user = userEvent.setup();
    renderTeam({
      accounts: [acct({ role: "member" })],
      canManage: false,
      invitations: [],
      members: [member({ ...OWNER_YOU, isYou: false }), ADMIN_LONG, { ...MEMBER, isYou: true }],
    });
    await goToMembers(user);
    expect(screen.queryAllByLabelText("Member role")).toHaveLength(0);
    expect(screen.queryByTestId("team-invite-bar")).toBeNull();
    expect(screen.queryByTestId("team-pending-invites")).toBeNull();
    for (const m of [OWNER_YOU, ADMIN_LONG, MEMBER]) {
      expect(screen.queryByTestId(`team-remove-${m.userId}`)).toBeNull();
    }
  });

  it("never offers a manager an action against themselves", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    expect(screen.queryByTestId(`team-remove-${OWNER_YOU.userId}`)).toBeNull();
  });

  it("submits the role change unchanged by the layout rework", async () => {
    const user = userEvent.setup();
    mockChangeMemberRole.mockResolvedValue(undefined);
    renderTeam();
    await goToMembers(user);
    const row = screen.getByTestId(`team-member-${MEMBER.userId}`);
    await user.selectOptions(within(row).getByLabelText("Member role"), "admin");
    await waitFor(() => expect(mockChangeMemberRole).toHaveBeenCalledTimes(1));
    expect(mockChangeMemberRole).toHaveBeenCalledWith(ACC, MEMBER.userId, "admin");
  });
});

// ── Remove-member confirmation ───────────────────────────────────────────────

describe("remove-member confirmation stays reachable and unchanged", () => {
  it("keeps the two-step confirmation and its explicit labels", async () => {
    const user = userEvent.setup();
    mockWorkflowImpact.mockResolvedValue(7);
    renderTeam();
    await goToMembers(user);
    await user.click(screen.getByTestId(`team-remove-${ADMIN_LONG.userId}`));

    const confirm = await screen.findByTestId(`team-remove-confirm-${ADMIN_LONG.userId}`);
    // The destructive control keeps a full label — never an ambiguous icon.
    expect(
      within(confirm).getByTestId(`team-remove-confirm-button-${ADMIN_LONG.userId}`),
    ).toHaveTextContent("Remove member");
    expect(within(confirm).getByTestId(`team-remove-cancel-${ADMIN_LONG.userId}`)).toBeVisible();
    // The advisory impact warning is still surfaced.
    await waitFor(() =>
      expect(screen.getByTestId(`team-remove-impact-${ADMIN_LONG.userId}`)).toHaveTextContent(
        /runs 7 workflows/,
      ),
    );
  });

  it("wraps the confirmation footer rather than pushing it out of the row", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    await user.click(screen.getByTestId(`team-remove-${ADMIN_LONG.userId}`));
    const button = await screen.findByTestId(
      `team-remove-confirm-button-${ADMIN_LONG.userId}`,
    );
    expect(button.parentElement!.className).toContain("flex-wrap");
  });

  it("removes exactly the member that was confirmed", async () => {
    const user = userEvent.setup();
    mockRemoveMember.mockResolvedValue(undefined);
    renderTeam();
    await goToMembers(user);
    await user.click(screen.getByTestId(`team-remove-${ADMIN_LONG.userId}`));
    await user.click(
      await screen.findByTestId(`team-remove-confirm-button-${ADMIN_LONG.userId}`),
    );
    await waitFor(() => expect(mockRemoveMember).toHaveBeenCalledWith(ACC, ADMIN_LONG.userId));
  });
});

// ── Invitations ──────────────────────────────────────────────────────────────

describe("invitations stay readable and actionable", () => {
  it("keeps the invitee address readable and its controls reachable", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    const row = screen.getByTestId("team-invite-inv-1");
    const identity = row.querySelector("[data-legible-min]") as HTMLElement;
    expect(identity).not.toBeNull();
    expect(within(row).getByText(LONG_EMAIL).className).toContain("break-all");
    expect(within(row).getByTestId("team-invite-role-inv-1")).toBeVisible();
    expect(within(row).getByTestId("team-invite-change-email-inv-1")).toBeVisible();
    expect(within(row).getByTestId("team-revoke-inv-1")).toBeVisible();
  });

  it("stacks the invitation row before its controls can squeeze the address", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    const row = screen.getByTestId("team-invite-inv-1");
    const layout = row.firstElementChild as HTMLElement;
    expect(layout.className).toContain("flex-col");
    expect(layout.className).toContain("sm:flex-row");
    // The control cluster wraps rather than holding one rigid line.
    const controls = screen.getByTestId("team-invite-role-inv-1").parentElement!;
    expect(controls.className).toContain("flex-wrap");
  });

  it("submits exactly the invitation the user typed", async () => {
    const user = userEvent.setup();
    renderTeam();
    await goToMembers(user);
    await user.type(screen.getByLabelText("Invite by email"), "  new@example.com  ");
    await user.selectOptions(screen.getByLabelText("Invite role"), "admin");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(mockCreateInvitation).toHaveBeenCalledTimes(1));
    // Trimmed address + chosen role, exactly as before the layout change.
    expect(mockCreateInvitation).toHaveBeenCalledWith(ACC, "new@example.com", "admin");
  });

  it("keeps a submission error visible next to the form", async () => {
    const user = userEvent.setup();
    // Must be a real `AccountApiError` — the component only surfaces the server's
    // own wording for that type, and a plain Error would silently fall back to the
    // generic message, making this test pass for the wrong reason.
    const { AccountApiError } = jest.requireMock("@/lib/api/accounts") as {
      AccountApiError: new (m: string, c?: string, s?: number) => Error;
    };
    mockCreateInvitation.mockRejectedValue(
      new AccountApiError("That address already has a pending invitation.", "CONFLICT", 409),
    );
    renderTeam();
    await goToMembers(user);
    await user.type(screen.getByLabelText("Invite by email"), "dup@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    const bar = screen.getByTestId("team-invite-bar");
    await waitFor(() =>
      expect(within(bar).getByRole("alert")).toHaveTextContent(/already has a pending/),
    );
  });

  it("keeps seat-limit messaging visible and the invite control disabled at the cap", async () => {
    const user = userEvent.setup();
    renderTeam({ members: [OWNER_YOU, ADMIN_LONG, MEMBER], memberCap: 4 });
    await goToMembers(user);
    expect(screen.getByTestId("team-limit-notice")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send invite" })).toBeDisabled();
  });
});

// ── Ownership transfer and leaving ───────────────────────────────────────────

describe("ownership transfer and leaving stay reachable and unchanged", () => {
  it("keeps the transfer flow, its candidate picker and its step-up field", async () => {
    const user = userEvent.setup();
    renderTeam();
    await user.click(screen.getByTestId("team-transfer-open"));

    const form = screen.getByTestId("team-transfer-form");
    expect(within(form).getByTestId("team-transfer-target")).toBeVisible();
    // Step-up authentication is untouched — the password is still required.
    expect(within(form).getByTestId("team-transfer-password")).toBeVisible();
    expect(within(form).getByTestId("team-transfer-confirm")).toBeDisabled();
  });

  it("submits the transfer with the chosen target and the typed password", async () => {
    const user = userEvent.setup();
    mockTransferOwnership.mockResolvedValue(undefined);
    renderTeam();
    await user.click(screen.getByTestId("team-transfer-open"));
    await user.selectOptions(screen.getByTestId("team-transfer-target"), MEMBER.userId);
    await user.type(screen.getByTestId("team-transfer-password"), "hunter2-not-real");
    await user.click(screen.getByTestId("team-transfer-confirm"));

    await waitFor(() => expect(mockTransferOwnership).toHaveBeenCalledTimes(1));
    expect(mockTransferOwnership).toHaveBeenCalledWith(ACC, {
      targetUserId: MEMBER.userId,
      password: "hunter2-not-real",
    });
  });

  it("protects the last owner: leaving stays blocked and explained", () => {
    renderTeam({ members: [OWNER_YOU], invitations: [] });
    expect(screen.getByTestId("team-leave-open")).toBeDisabled();
    expect(screen.getByTestId("team-leave-sole-owner")).toBeVisible();
  });

  it("keeps the leave flow reachable for a non-sole-owner with its warnings", async () => {
    const user = userEvent.setup();
    mockLeaveImpact.mockResolvedValue(4);
    renderTeam({
      accounts: [acct({ role: "admin" })],
      members: [member({ ...OWNER_YOU, isYou: false }), { ...ADMIN_LONG, isYou: true }],
    });
    await user.click(screen.getByTestId("team-leave-open"));

    const form = screen.getByTestId("team-leave-form");
    expect(within(form).getByTestId("team-leave-confirm")).toHaveTextContent("Leave team");
    expect(within(form).getByTestId("team-leave-cancel")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("team-leave-impact")).toHaveTextContent(/You run 4 workflows/),
    );
  });

  it("wraps both destructive footers instead of letting them push", async () => {
    const user = userEvent.setup();
    renderTeam();
    await user.click(screen.getByTestId("team-transfer-open"));
    expect(screen.getByTestId("team-transfer-confirm").parentElement!.className).toContain(
      "flex-wrap",
    );
  });
});

// ── Direct MembersTable contract ─────────────────────────────────────────────

describe("MembersTable hides column headings when the rows become cards", () => {
  it("keeps the heading row present for the table presentation only", () => {
    render(
      <MembersTable
        accountId={ACC}
        members={[OWNER_YOU, MEMBER]}
        canManage
        onChanged={() => {}}
      />,
    );
    const heading = screen.getByTestId("team-members-table-head");
    // Hidden by default, shown as a grid from `sm` — a row of column labels above
    // a list of cards would label nothing.
    expect(heading.className).toContain("hidden");
    expect(heading.className).toContain("sm:grid");
  });
});
