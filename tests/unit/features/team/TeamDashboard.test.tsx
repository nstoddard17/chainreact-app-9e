/**
 * Tests for features/team/TeamDashboard (Slice 4.TEAM-PAGE-1; settings-shell
 * rebuild in 4.TEAM-PAGE-4).
 *
 * Renders the orchestrator with jsdom + RTL. Covers the settings sub-nav, the
 * default Overview landing (switcher + account summary), section switching to
 * Members + Roles, the personal-account branch, and the manager-only invite
 * gating. Mutations call the typed client (mocked) — we assert render branching
 * and navigation only, not network behavior.
 */
import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

const members = [
  { userId: "u1", role: "owner" as const, joinedAt: "2026-05-01T00:00:00Z", email: "u1@x.io", displayName: "Ada", isYou: true },
  { userId: "u2", role: "member" as const, joinedAt: "2026-05-02T00:00:00Z", email: "u2@x.io", displayName: null, isYou: false },
];

beforeEach(() => mockRefresh.mockReset());

function renderTeam(overrides: Partial<ComponentProps<typeof TeamDashboard>> = {}) {
  return render(
    <TeamDashboard
      accounts={[personal, team]}
      activeAccountId="t1"
      currentUserEmail="u1@x.io"
      members={members}
      invitations={[]}
      canManage
      memberCap={5}
      teamMaxMembers={5}
      {...overrides}
    />,
  );
}

describe("TeamDashboard — settings shell + sub-nav", () => {
  it("renders the settings sub-nav and lands on Overview (switcher + account summary)", () => {
    renderTeam();
    expect(screen.getByTestId("team-settings-nav")).toBeInTheDocument();
    expect(screen.getByTestId("team-overview")).toBeInTheDocument();
    expect(screen.getByTestId("team-account-switcher")).toBeInTheDocument();
    // Both accounts in the switcher; the inactive one offers a Switch.
    expect(screen.getByTestId("team-account-p1")).toBeInTheDocument();
    expect(screen.getByTestId("team-switch-p1")).toBeInTheDocument();
    // Members/Roles are NOT mounted until navigated to.
    expect(screen.queryByTestId("team-members-panel")).toBeNull();
    expect(screen.queryByTestId("team-roles-table")).toBeNull();
  });

  it("navigates to Members → roster + invite (manager)", () => {
    renderTeam();
    fireEvent.click(screen.getByTestId("team-nav-members"));
    expect(screen.getByTestId("team-members-panel")).toBeInTheDocument();
    expect(screen.getByTestId("team-invite-bar")).toBeInTheDocument();
    expect(screen.getByTestId("team-member-u1")).toBeInTheDocument();
    expect(screen.getByTestId("team-member-u2")).toBeInTheDocument();
  });

  it("navigates to Roles & access → the design-faithful roles table", () => {
    renderTeam();
    fireEvent.click(screen.getByTestId("team-nav-roles-access"));
    expect(screen.getByTestId("team-roles-section")).toBeInTheDocument();
    expect(screen.getByTestId("team-roles-table")).toBeInTheDocument();
  });

  it("shows the Organization-coming-soon limit notice on Members when full", () => {
    const fullMembers = Array.from({ length: 5 }, (_, i) => ({
      userId: `u${i}`,
      role: i === 0 ? ("owner" as const) : ("member" as const),
      joinedAt: "2026-05-01T00:00:00Z",
      email: `u${i}@x.io`,
      displayName: null,
      isYou: i === 0,
    }));
    renderTeam({ members: fullMembers, currentUserEmail: "u0@x.io" });
    fireEvent.click(screen.getByTestId("team-nav-members"));
    const notice = screen.getByTestId("team-limit-notice");
    expect(notice).toHaveTextContent(/coming soon/i);
  });

  it("hides the invite bar for a plain member (read-only roster)", () => {
    renderTeam({ accounts: [{ ...team, role: "member" }], canManage: false });
    fireEvent.click(screen.getByTestId("team-nav-members"));
    expect(screen.queryByTestId("team-invite-bar")).toBeNull();
    expect(screen.getByTestId("team-members-table")).toBeInTheDocument();
  });
});

describe("TeamDashboard — personal active account", () => {
  it("shows only Overview with the create-a-team nudge; no Members/Roles nav", () => {
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
    expect(screen.getByTestId("team-overview")).toBeInTheDocument();
    expect(screen.getByTestId("team-account-switcher")).toBeInTheDocument();
    expect(screen.getByText(/Personal accounts are just for you/i)).toBeInTheDocument();
    expect(screen.getByText(/u1@x.io/)).toBeInTheDocument();
    // Team-only nav + sections stay hidden.
    expect(screen.queryByTestId("team-nav-members")).toBeNull();
    expect(screen.queryByTestId("team-nav-roles-access")).toBeNull();
    expect(screen.queryByTestId("team-members-panel")).toBeNull();
  });
});
