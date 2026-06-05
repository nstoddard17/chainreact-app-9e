/**
 * @jest-environment node
 *
 * Tests for app/account/page.tsx (Slice 4.ACCOUNT-SETTINGS-1).
 *
 * Thin server component: auth gate → list accounts + resolve the personal
 * account record → render AccountSettings. AccountSettings is mocked to a
 * placeholder so we inspect the props the page computes: the active-account
 * view, the isPersonal gate, and the personal deletion lifecycle state.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
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

const mockEnsurePersonal = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonal(...a),
}));

const mockGetDisplayName = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({
  getDisplayName: (...a: unknown[]) => mockGetDisplayName(...a),
}));

const mockGetUsage = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getUsage: (...a: unknown[]) => mockGetUsage(...a),
}));

const mockListMembers = jest.fn();
jest.mock("@/services/accounts/membership", () => ({
  listMembers: (...a: unknown[]) => mockListMembers(...a),
}));

const mockCountUnread = jest.fn();
const mockListNotifications = jest.fn();
jest.mock("@/repositories/notifications", () => ({
  countUnreadForUser: (...a: unknown[]) => mockCountUnread(...a),
  listForUser: (...a: unknown[]) => mockListNotifications(...a),
}));

jest.mock("@/features/account/AccountSettings", () => ({
  AccountSettings: Object.assign(() => null, { displayName: "AccountSettings" }),
}));

import AccountPage from "@/app/account/page";
import { AccountSettings as AccountSettingsRef } from "@/features/account/AccountSettings";

beforeEach(() => {
  mockGetUser.mockReset();
  mockRedirect.mockClear();
  mockListSummaries.mockReset();
  mockEnsurePersonal.mockReset();
  mockCountUnread.mockReset().mockResolvedValue(0);
  mockListNotifications.mockReset().mockResolvedValue([]);
  mockGetDisplayName.mockReset().mockResolvedValue(null);
  mockGetUsage.mockReset().mockResolvedValue(null);
  mockListMembers.mockReset().mockResolvedValue([]);
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
  role: "admin" as const,
  isActive: true,
  deletionStatus: "active" as const,
};

function personalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    type: "personal",
    name: "Personal",
    ownerUserId: "u1",
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  };
}

interface SettingsProps {
  active: { name: string; type: string; role: string } | null;
  isPersonal: boolean;
  deletionStatus: string;
  purgeAfter: string | null;
  userEmail: string;
  displayName: string | null;
  emailVerified: boolean;
  signInMethod: string;
  billing: {
    usage: { tasksUsed: number; tasksLimit: number; periodStartedAt: string | null } | null;
    memberLimit: number | null;
    memberCount: number | null;
    folderLimit: number;
    frozen: boolean;
  };
  initialSection?: string;
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

async function getSettingsProps(
  params: Record<string, string | string[] | undefined> = {},
): Promise<SettingsProps> {
  const result = await AccountPage({ searchParams: Promise.resolve(params) });
  const el = findElement(result, (e) => e.type === AccountSettingsRef);
  if (!el) throw new Error("AccountSettings not found in render tree");
  return el.props as unknown as SettingsProps;
}

describe("AccountPage — auth", () => {
  it("redirects signed-out users to /auth/sign-in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(
      AccountPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith("/auth/sign-in");
  });
});

describe("AccountPage — personal active account", () => {
  it("passes isPersonal + the personal deletion state through", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({ activeAccountId: "p1", accounts: [personal] });
    mockEnsurePersonal.mockResolvedValue(personalRecord());

    const props = await getSettingsProps();
    expect(props.isPersonal).toBe(true);
    expect(props.active).toEqual({ name: "Personal", type: "personal", role: "owner" });
    expect(props.deletionStatus).toBe("active");
    expect(props.purgeAfter).toBeNull();
    expect(props.userEmail).toBe("u1@x.io");
    expect(props.displayName).toBeNull();
    // No ?section → default (Account).
    expect(props.initialSection).toBe("account");
  });

  it("passes the caller's stored display name through to the Profile section", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({ activeAccountId: "p1", accounts: [personal] });
    mockEnsurePersonal.mockResolvedValue(personalRecord());
    mockGetDisplayName.mockResolvedValue("Ada Lovelace");

    const props = await getSettingsProps();
    expect(mockGetDisplayName).toHaveBeenCalledWith("u1");
    expect(props.displayName).toBe("Ada Lovelace");
  });

  it("resolves a ?section deep-link to a known section (else default)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({ activeAccountId: "p1", accounts: [personal] });
    mockEnsurePersonal.mockResolvedValue(personalRecord());

    expect((await getSettingsProps({ section: "danger-zone" })).initialSection).toBe("danger-zone");
    // Unknown value falls back to the default.
    expect((await getSettingsProps({ section: "bogus" })).initialSection).toBe("account");
  });

  it("surfaces a pending personal account (frozen) with its purgeAfter", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({ activeAccountId: "p1", accounts: [personal] });
    mockEnsurePersonal.mockResolvedValue(
      personalRecord({ deletionStatus: "pending_deletion", purgeAfter: "2026-07-05T00:00:00Z" }),
    );

    const props = await getSettingsProps();
    expect(props.deletionStatus).toBe("pending_deletion");
    expect(props.purgeAfter).toBe("2026-07-05T00:00:00Z");
  });
});

describe("AccountPage — security summary", () => {
  beforeEach(() => {
    mockListSummaries.mockResolvedValue({ activeAccountId: "p1", accounts: [personal] });
    mockEnsurePersonal.mockResolvedValue(personalRecord());
  });

  it("derives emailVerified=false + Email & password when the session has no confirmation/providers", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    const props = await getSettingsProps();
    expect(props.emailVerified).toBe(false);
    expect(props.signInMethod).toBe("Email & password");
  });

  it("derives emailVerified=true from email_confirmed_at", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "u1@x.io",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          app_metadata: { providers: ["email"] },
        },
      },
    });
    const props = await getSettingsProps();
    expect(props.emailVerified).toBe(true);
    expect(props.signInMethod).toBe("Email & password");
  });
});

describe("AccountPage — billing summary", () => {
  it("passes real usage + member/folder limits for a team active account", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({ activeAccountId: "t1", accounts: [personal, team] });
    mockEnsurePersonal.mockResolvedValue(personalRecord());
    mockGetUsage.mockResolvedValue({ tasksUsed: 7, tasksLimit: 100, periodStartedAt: "2026-06-01T00:00:00Z" });
    mockListMembers.mockResolvedValue([{ userId: "a" }, { userId: "b" }]);

    const props = await getSettingsProps();
    expect(mockGetUsage).toHaveBeenCalledWith("t1");
    expect(mockListMembers).toHaveBeenCalledWith("t1");
    expect(props.billing.usage).toEqual({ tasksUsed: 7, tasksLimit: 100, periodStartedAt: "2026-06-01T00:00:00Z" });
    expect(props.billing.memberLimit).toBe(5); // team
    expect(props.billing.memberCount).toBe(2);
    expect(props.billing.folderLimit).toBe(100); // team
    expect(props.billing.frozen).toBe(false);
  });

  it("does not load a member count for a personal active account; usage may be null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({ activeAccountId: "p1", accounts: [personal] });
    mockEnsurePersonal.mockResolvedValue(personalRecord());
    mockGetUsage.mockResolvedValue(null);

    const props = await getSettingsProps();
    expect(mockListMembers).not.toHaveBeenCalled();
    expect(props.billing.usage).toBeNull();
    expect(props.billing.memberLimit).toBe(1); // personal
    expect(props.billing.folderLimit).toBe(10); // personal
  });
});

describe("AccountPage — team active account", () => {
  it("passes isPersonal=false and the team view (no destructive scope)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockListSummaries.mockResolvedValue({
      activeAccountId: "t1",
      accounts: [personal, team],
    });
    mockEnsurePersonal.mockResolvedValue(personalRecord());

    const props = await getSettingsProps();
    expect(props.isPersonal).toBe(false);
    expect(props.active).toEqual({ name: "Acme", type: "team", role: "admin" });
  });
});
