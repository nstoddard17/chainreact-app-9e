/**
 * @jest-environment node
 *
 * Tests for app/team/page.tsx (Slice 4.TEAM-PAGE-1).
 *
 * Thin server component: auth gate → list accounts → conditionally fetch
 * roster/invites for an active team → render TeamDashboard. TeamDashboard is
 * mocked to a placeholder so we inspect the props the page computes: the
 * account list passthrough, the conditional member/invite fetch (team vs
 * personal, manager vs member), and the `isYou` marking.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockRedirect = jest.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${path}` });
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

const mockListSummaries = jest.fn();
jest.mock("@/services/accounts/accountList", () => ({
  listUserAccountSummaries: (...a: unknown[]) => mockListSummaries(...a),
}));

const mockListMembers = jest.fn();
jest.mock("@/services/accounts/membership", () => ({
  listMembers: (...a: unknown[]) => mockListMembers(...a),
}));

const mockListInvitations = jest.fn();
jest.mock("@/services/accounts/invitations", () => ({
  listInvitations: (...a: unknown[]) => mockListInvitations(...a),
}));

const mockCountUnread = jest.fn();
const mockListNotifications = jest.fn();
jest.mock("@/repositories/notifications", () => ({
  countUnreadForUser: (...a: unknown[]) => mockCountUnread(...a),
  listForUser: (...a: unknown[]) => mockListNotifications(...a),
}));

jest.mock("@/features/team/TeamDashboard", () => ({
  TeamDashboard: Object.assign(() => null, { displayName: "TeamDashboard" }),
}));

import TeamPage from "@/app/team/page";
import { TeamDashboard as TeamDashboardRef } from "@/features/team/TeamDashboard";

beforeEach(() => {
  mockGetUser.mockReset();
  mockRedirect.mockClear();
  mockListSummaries.mockReset();
  mockListMembers.mockReset();
  mockListInvitations.mockReset();
  mockCountUnread.mockReset();
  mockCountUnread.mockResolvedValue(0);
  mockListNotifications.mockReset();
  mockListNotifications.mockResolvedValue([]);
});

const personal = {
  id: "p1",
  name: "Personal",
  type: "personal" as const,
  role: "owner" as const,
  isActive: true,
  deletionStatus: "active" as const,
};
const team = {
  id: "t1",
  name: "Acme",
  type: "team" as const,
  role: "owner" as const,
  isActive: true,
  deletionStatus: "active" as const,
};

interface DashboardProps {
  accounts: ReadonlyArray<Record<string, unknown>>;
  activeAccountId: string | null;
  members: ReadonlyArray<Record<string, unknown>>;
  invitations: ReadonlyArray<Record<string, unknown>>;
  canManage: boolean;
  memberCap: number | null;
  teamMaxMembers: number;
}

function findElement(
  node: unknown,
  predicate: (el: { type: unknown; props: Record<string, unknown> }) => boolean,
): { type: unknown; props: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && el.props !== undefined) {
    if (predicate(el as { type: unknown; props: Record<string, unknown> })) {
      return el as { type: unknown; props: Record<string, unknown> };
    }
    const children = el.props.children;
    if (Array.isArray(children)) {
      for (const c of children) {
        const found = findElement(c, predicate);
        if (found) return found;
      }
    } else {
      const found = findElement(children, predicate);
      if (found) return found;
    }
  }
  return null;
}

async function getDashboardProps(): Promise<DashboardProps> {
  const result = await TeamPage();
  const dash = findElement(result, (el) => el.type === TeamDashboardRef);
  if (!dash) throw new Error("TeamDashboard not found in render tree");
  return dash.props as unknown as DashboardProps;
}

describe("TeamPage — auth", () => {
  it("redirects signed-out users to /auth/sign-in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(TeamPage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith("/auth/sign-in");
  });
});

describe("TeamPage — personal active account", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({
      activeAccountId: "p1",
      accounts: [personal],
    });
  });

  it("does NOT fetch roster or invites when the active account is personal", async () => {
    const props = await getDashboardProps();
    expect(mockListMembers).not.toHaveBeenCalled();
    expect(mockListInvitations).not.toHaveBeenCalled();
    expect(props.members).toEqual([]);
    expect(props.invitations).toEqual([]);
    expect(props.canManage).toBe(false);
    expect(props.memberCap).toBe(1); // personal cap
    expect(props.activeAccountId).toBe("p1");
  });
});

describe("TeamPage — team active account (owner)", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({
      activeAccountId: "t1",
      accounts: [personal, { ...team, isActive: true }, { ...personal, isActive: false }],
    });
    mockListMembers.mockResolvedValue([
      { userId: "u1", role: "owner", joinedAt: "2026-05-01T00:00:00Z", invitedByUserId: null },
      { userId: "u2", role: "member", joinedAt: "2026-05-02T00:00:00Z", invitedByUserId: "u1" },
    ]);
    mockListInvitations.mockResolvedValue([
      { id: "i1", email: "p@x.io", role: "member", status: "pending", expiresAt: "2026-06-09T00:00:00Z", createdAt: "2026-06-02T00:00:00Z" },
    ]);
  });

  it("fetches roster + invites and marks the signed-in user with isYou", async () => {
    const props = await getDashboardProps();
    expect(mockListMembers).toHaveBeenCalledWith("t1");
    expect(mockListInvitations).toHaveBeenCalledWith("t1");
    expect(props.canManage).toBe(true);
    expect(props.memberCap).toBe(5);
    expect(props.teamMaxMembers).toBe(5);
    expect(props.members).toEqual([
      { userId: "u1", role: "owner", joinedAt: "2026-05-01T00:00:00Z", isYou: true },
      { userId: "u2", role: "member", joinedAt: "2026-05-02T00:00:00Z", isYou: false },
    ]);
    expect(props.invitations).toHaveLength(1);
  });

  it("never leaks invitedByUserId into the member DTO", async () => {
    const props = await getDashboardProps();
    expect(JSON.stringify(props.members)).not.toContain("invitedByUserId");
  });
});

describe("TeamPage — team active account (plain member)", () => {
  it("fetches roster but NOT invites for a non-manager", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u2", email: "u2@x.io" } } });
    mockListSummaries.mockResolvedValue({
      activeAccountId: "t1",
      accounts: [{ ...team, role: "member" }],
    });
    mockListMembers.mockResolvedValue([
      { userId: "u2", role: "member", joinedAt: "2026-05-02T00:00:00Z", invitedByUserId: "u1" },
    ]);
    const props = await getDashboardProps();
    expect(mockListMembers).toHaveBeenCalledWith("t1");
    expect(mockListInvitations).not.toHaveBeenCalled();
    expect(props.canManage).toBe(false);
    expect(props.invitations).toEqual([]);
  });
});
