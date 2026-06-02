/**
 * Tests for features/team/TeamDashboard (Slice 4.TEAM-PAGE-1).
 *
 * Renders the orchestrator with jsdom + RTL. Covers the active-account branch
 * (personal → notice; team → members panel), the account-switcher passthrough,
 * and the at-limit Organization-coming-soon messaging. Mutations call the typed
 * client (mocked) — we only assert render branching here, not network behavior.
 */
import { render, screen } from "@testing-library/react";
import type { AccountSummary } from "@/lib/api/accounts";
import { TeamDashboard } from "@/features/team/TeamDashboard";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const personal: AccountSummary = {
  id: "p1",
  name: "Personal",
  type: "personal",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};
const team: AccountSummary = {
  id: "t1",
  name: "Acme",
  type: "team",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};

beforeEach(() => mockRefresh.mockReset());

describe("TeamDashboard — personal active account", () => {
  it("shows the personal notice, not the members panel", () => {
    render(
      <TeamDashboard
        accounts={[personal]}
        activeAccountId="p1"
        currentUserEmail="u1@x.io"
        members={[]}
        invitations={[]}
        canManage={false}
        memberCap={1}
        teamMaxMembers={5}
      />,
    );
    expect(screen.getByTestId("team-personal-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("team-members-panel")).toBeNull();
    expect(screen.getByTestId("team-account-switcher")).toBeInTheDocument();
    expect(screen.getByText(/u1@x.io/)).toBeInTheDocument();
  });
});

describe("TeamDashboard — team active account", () => {
  const members = [
    { userId: "u1", role: "owner" as const, joinedAt: "2026-05-01T00:00:00Z", isYou: true },
    { userId: "u2", role: "member" as const, joinedAt: "2026-05-02T00:00:00Z", isYou: false },
  ];

  it("renders the members panel with both account rows in the switcher", () => {
    render(
      <TeamDashboard
        accounts={[personal, team]}
        activeAccountId="t1"
        currentUserEmail="u1@x.io"
        members={members}
        invitations={[]}
        canManage
        memberCap={5}
        teamMaxMembers={5}
      />,
    );
    expect(screen.getByTestId("team-members-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("team-personal-notice")).toBeNull();
    expect(screen.getByTestId("team-account-p1")).toBeInTheDocument();
    expect(screen.getByTestId("team-account-t1")).toBeInTheDocument();
    // The active team carries the Active badge; the inactive one offers Switch.
    expect(screen.getByTestId("team-switch-p1")).toBeInTheDocument();
    // Manager sees the invite bar.
    expect(screen.getByTestId("team-invite-bar")).toBeInTheDocument();
    // Both member rows render.
    expect(screen.getByTestId("team-member-u1")).toBeInTheDocument();
    expect(screen.getByTestId("team-member-u2")).toBeInTheDocument();
  });

  it("shows the Organization-coming-soon limit notice when seats are full", () => {
    const fullMembers = Array.from({ length: 5 }, (_, i) => ({
      userId: `u${i}`,
      role: i === 0 ? ("owner" as const) : ("member" as const),
      joinedAt: "2026-05-01T00:00:00Z",
      isYou: i === 0,
    }));
    render(
      <TeamDashboard
        accounts={[team]}
        activeAccountId="t1"
        currentUserEmail="u0@x.io"
        members={fullMembers}
        invitations={[]}
        canManage
        memberCap={5}
        teamMaxMembers={5}
      />,
    );
    const notice = screen.getByTestId("team-limit-notice");
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent(/coming soon/i);
  });

  it("hides invite bar + pending invites for a plain member (read-only roster)", () => {
    render(
      <TeamDashboard
        accounts={[{ ...team, role: "member" }]}
        activeAccountId="t1"
        currentUserEmail="u2@x.io"
        members={members}
        invitations={[]}
        canManage={false}
        memberCap={5}
        teamMaxMembers={5}
      />,
    );
    expect(screen.queryByTestId("team-invite-bar")).toBeNull();
    expect(screen.getByTestId("team-members-table")).toBeInTheDocument();
  });
});
