/**
 * Tests for features/team/MembersTable identity rendering (Slice 4.TEAM-PAGE-2).
 *
 * Covers the display fallback chain name → email → short user id, the "You"
 * badge, and that the owner row is never manageable. Mutations aren't exercised
 * here (the typed client is mocked); we assert render output only.
 */
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembersTable } from "@/features/team/MembersTable";
import type { TeamMemberView } from "@/features/team/teamTypes";

const mockChangeRole = jest.fn();
const mockRemoveMember = jest.fn();
const mockGetImpact = jest.fn();
jest.mock("@/lib/api/accounts", () => ({
  AccountApiError: class extends Error {},
  changeMemberRole: (...a: unknown[]) => mockChangeRole(...a),
  removeMember: (...a: unknown[]) => mockRemoveMember(...a),
  getMemberWorkflowImpact: (...a: unknown[]) => mockGetImpact(...a),
}));

function renderTable(members: TeamMemberView[], canManage = true) {
  return render(
    <MembersTable
      accountId="t1"
      members={members}
      canManage={canManage}
      onChanged={() => {}}
    />,
  );
}

const base = { joinedAt: "2026-05-01T00:00:00Z" };

describe("MembersTable — display identity", () => {
  it("shows displayName as the primary line with email as secondary", () => {
    renderTable([
      { ...base, userId: "u1", role: "member", email: "ada@x.io", displayName: "Ada Lovelace", isYou: false },
    ]);
    const row = screen.getByTestId("team-member-u1");
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(row).getByText("ada@x.io")).toBeInTheDocument();
  });

  it("falls back to email as primary when displayName is missing — and never shows the raw id alongside an email", () => {
    renderTable([
      { ...base, userId: "u2abcdef0000", role: "member", email: "bob@x.io", displayName: null, isYou: false },
    ]);
    const row = screen.getByTestId("team-member-u2abcdef0000");
    expect(within(row).getByText("bob@x.io")).toBeInTheDocument();
    // The short id is suppressed once we have an email to show.
    expect(within(row).queryByText("u2abcdef…")).toBeNull();
  });

  it("shows the name on top and the email underneath when both exist", () => {
    renderTable([
      { ...base, userId: "u4", role: "member", email: "dana@x.io", displayName: "Dana Scully", isYou: false },
    ]);
    const row = screen.getByTestId("team-member-u4");
    expect(within(row).getByText("Dana Scully")).toBeInTheDocument();
    expect(within(row).getByText("dana@x.io")).toBeInTheDocument();
    // No raw id when name + email are present.
    expect(within(row).queryByText("u4")).toBeNull();
  });

  it("falls back to a short user id when neither name nor email is available", () => {
    renderTable([
      { ...base, userId: "abcdef1234567890", role: "member", email: null, displayName: null, isYou: false },
    ]);
    const row = screen.getByTestId("team-member-abcdef1234567890");
    expect(within(row).getByText("Team member")).toBeInTheDocument();
    expect(within(row).getByText("abcdef12…")).toBeInTheDocument();
  });

  it("marks the signed-in user with a You badge", () => {
    renderTable([
      { ...base, userId: "me", role: "owner", email: "me@x.io", displayName: "Morgan", isYou: true },
    ]);
    const row = screen.getByTestId("team-member-me");
    expect(within(row).getByText("You")).toBeInTheDocument();
    expect(within(row).getByText("Morgan")).toBeInTheDocument();
  });

  it("never shows manage controls for the owner row", () => {
    renderTable([
      { ...base, userId: "owner", role: "owner", email: "o@x.io", displayName: "Owner", isYou: false },
    ]);
    expect(screen.queryByTestId("team-remove-owner")).toBeNull();
  });

  it("shows remove control for a manageable non-owner, non-self row", () => {
    renderTable([
      { ...base, userId: "u3", role: "member", email: "c@x.io", displayName: "Cara", isYou: false },
    ]);
    expect(screen.getByTestId("team-remove-u3")).toBeInTheDocument();
  });
});

// ─── Slice 4.TEAM-WORKFLOWS-7 (TW-5) — removal warning ──────────────────────
describe("MembersTable — removal workflow-impact warning", () => {
  const member: TeamMemberView = {
    joinedAt: "2026-05-01T00:00:00Z",
    userId: "u9",
    role: "member",
    email: "c@x.io",
    displayName: "Cara",
    isYou: false,
  };

  beforeEach(() => {
    mockChangeRole.mockReset();
    mockRemoveMember.mockReset().mockResolvedValue(undefined);
    mockGetImpact.mockReset();
  });

  it("shows the impact warning when the member created personal-provider workflows (count > 0)", async () => {
    mockGetImpact.mockResolvedValue(2);
    const user = userEvent.setup();
    render(
      <MembersTable accountId="t1" members={[member]} canManage onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-remove-u9"));
    expect(mockGetImpact).toHaveBeenCalledWith("t1", "u9");
    const warning = await screen.findByTestId("team-remove-impact-u9");
    expect(warning).toHaveTextContent(
      /created 2 workflows with personal app steps.*may stop running/i,
    );
    // The removal action is still available (advisory, non-blocking).
    expect(screen.getByTestId("team-remove-confirm-button-u9")).toBeInTheDocument();
  });

  it("does NOT show a warning when the count is 0, but still allows removal", async () => {
    mockGetImpact.mockResolvedValue(0);
    const user = userEvent.setup();
    render(
      <MembersTable accountId="t1" members={[member]} canManage onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-remove-u9"));
    await screen.findByTestId("team-remove-confirm-u9");
    expect(screen.queryByTestId("team-remove-impact-u9")).toBeNull();
    expect(screen.getByTestId("team-remove-confirm-button-u9")).toBeInTheDocument();
  });

  it("removal proceeds on confirm — the warning never blocks it", async () => {
    mockGetImpact.mockResolvedValue(3);
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(
      <MembersTable accountId="t1" members={[member]} canManage onChanged={onChanged} />,
    );
    await user.click(screen.getByTestId("team-remove-u9"));
    await screen.findByTestId("team-remove-impact-u9");
    await user.click(screen.getByTestId("team-remove-confirm-button-u9"));
    await waitFor(() => expect(mockRemoveMember).toHaveBeenCalledWith("t1", "u9"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("Cancel dismisses the confirmation without removing", async () => {
    mockGetImpact.mockResolvedValue(1);
    const user = userEvent.setup();
    render(
      <MembersTable accountId="t1" members={[member]} canManage onChanged={() => {}} />,
    );
    await user.click(screen.getByTestId("team-remove-u9"));
    await screen.findByTestId("team-remove-confirm-u9");
    await user.click(screen.getByTestId("team-remove-cancel-u9"));
    expect(screen.queryByTestId("team-remove-confirm-u9")).toBeNull();
    expect(mockRemoveMember).not.toHaveBeenCalled();
    // The plain Remove control is back.
    expect(screen.getByTestId("team-remove-u9")).toBeInTheDocument();
  });
});
