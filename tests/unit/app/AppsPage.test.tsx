/**
 * @jest-environment node
 *
 * Tests for app/apps/page.tsx (Slice 4.APPS-PAGE-1).
 *
 * Thin server component: auth gate + parallel data fetch + render.
 * AppsDashboard is mocked to a placeholder so this test isolates the
 * route's three responsibilities: auth gate, integrations fetch, and the
 * route-DTO shape that gets passed to the dashboard.
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

const mockListActive = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...a: unknown[]) => mockListActive(...a),
}));

// CD-3: the page resolves the caller's account role to derive canDisconnect.
jest.mock("@/repositories/accountMemberships", () => ({
  getRole: jest.fn().mockResolvedValue("owner"),
}));

const mockEnsurePersonalAccount = jest.fn(async (userId: string) => ({
  id: `acct-${userId}`,
  type: "personal" as const,
  ownerUserId: userId,
  createdAt: "2026-05-30T00:00:00Z",
  updatedAt: "2026-05-30T00:00:00Z",
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) => mockEnsurePersonalAccount(userId),
}));
// 4.ACCOUNT-SWITCHER-1: the page now resolves the ACTIVE account. Mock it to the
// same personal account so the existing acct-${userId} assertions still hold.
const mockResolveActiveAccount = jest.fn(async (userId: string) => ({
  ok: true as const,
  source: "personal" as const,
  account: {
    id: `acct-${userId}`,
    type: "personal" as const,
    ownerUserId: userId,
    createdAt: "2026-05-30T00:00:00Z",
    updatedAt: "2026-05-30T00:00:00Z",
  },
}));
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (userId: string) => mockResolveActiveAccount(userId),
}));

const mockCountUnread = jest.fn();
const mockListNotifications = jest.fn();
jest.mock("@/repositories/notifications", () => ({
  countUnreadForUser: (...a: unknown[]) => mockCountUnread(...a),
  listForUser: (...a: unknown[]) => mockListNotifications(...a),
}));

const mockListProviders = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  listProviders: () => mockListProviders(),
  getProvider: jest.fn(),
  providerIconUrl: (id: string) => `/integrations/${id}.svg`,
}));

jest.mock("@/features/integrations/ConnectionStatusBanner", () => ({
  ConnectionStatusBanner: () => null,
}));

jest.mock("@/features/apps/AppsDashboard", () => ({
  // Identifiable reference — we inspect the returned React element tree
  // directly (server components aren't rendered here; calling the page
  // function returns the element).
  AppsDashboard: Object.assign(() => null, { displayName: "AppsDashboard" }),
}));

import AppsPage from "@/app/apps/page";
import { AppsDashboard as AppsDashboardRef } from "@/features/apps/AppsDashboard";

beforeEach(() => {
  mockGetUser.mockReset();
  mockRedirect.mockClear();
  mockListActive.mockReset();
  mockListProviders.mockReset();
  mockCountUnread.mockReset();
  mockCountUnread.mockResolvedValue(0);
  mockListNotifications.mockReset();
  mockListNotifications.mockResolvedValue([]);
});

describe("AppsPage — auth", () => {
  it("redirects signed-out users to /auth/sign-in", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockListProviders.mockReturnValue([]);
    mockListActive.mockResolvedValue([]);
    await expect(
      AppsPage({
        searchParams: Promise.resolve({} as Record<string, string>),
      }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("does NOT redirect signed-in users and fetches their integrations scoped to user.id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-123" } } });
    mockListProviders.mockReturnValue([
      {
        id: "slack",
        displayName: "Slack",
        isEnabled: true,
        isExperimental: false,
        capabilities: { oauth: true },
      },
    ]);
    mockListActive.mockResolvedValue([]);
    await getDashboardProps();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockListActive).toHaveBeenCalledWith("acct-u-123");
  });
});

interface DashboardProps {
  items: ReadonlyArray<Record<string, unknown>>;
  categories: ReadonlyArray<Record<string, unknown>>;
}

function findElement(node: unknown, predicate: (el: { type: unknown; props: Record<string, unknown> }) => boolean): { type: unknown; props: Record<string, unknown> } | null {
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
  const result = await AppsPage({
    searchParams: Promise.resolve({} as Record<string, string>),
  });
  const dashboard = findElement(result, (el) => el.type === AppsDashboardRef);
  if (!dashboard) throw new Error("AppsDashboard element not found in render tree");
  return dashboard.props as unknown as DashboardProps;
}

describe("AppsPage — route DTO no-leak", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-123" } } });
  });

  it("passes only the documented item shape into AppsDashboard — no encrypted tokens, no metadata", async () => {
    mockListProviders.mockReturnValue([
      {
        id: "slack",
        displayName: "Slack",
        isEnabled: true,
        isExperimental: false,
        capabilities: { oauth: true },
      },
    ]);
    mockListActive.mockResolvedValue([
      {
        id: "int-1",
        accountId: "acct-u-123",
        connectedByUserId: "u-123",
        provider: "slack",
        providerAccountId: "T-SECRET-9999",
        displayName: "Acme",
        accessTokenEncrypted: "ENC.SHOULD.NEVER.LEAK",
        refreshTokenEncrypted: "ENC.SHOULD.NEVER.LEAK",
        accessTokenExpiresAt: "2026-12-01T00:00:00Z",
        scopes: ["chat:write"],
        accountMetadata: { admin_token: (["xoxa", "leak"].join("-")) },
        disconnectedAt: null,
        createdAt: "2026-04-15T12:00:00Z",
        updatedAt: "2026-04-15T12:00:00Z",
      },
    ]);
    const props = await getDashboardProps();
    const serialized = JSON.stringify(props);
    expect(serialized).not.toContain("ENC.SHOULD.NEVER.LEAK");
    expect(serialized).not.toContain("T-SECRET-9999");
    expect(serialized).not.toContain("admin_token");
    expect(serialized).not.toContain((["xoxa", "leak"].join("-")));
    expect(serialized).not.toContain("accessTokenEncrypted");
  });

  it("passes the category list with 'All' first", async () => {
    mockListProviders.mockReturnValue([
      {
        id: "slack",
        displayName: "Slack",
        isEnabled: true,
        isExperimental: false,
        capabilities: { oauth: true },
      },
    ]);
    mockListActive.mockResolvedValue([]);
    const props = await getDashboardProps();
    expect(props.categories[0]).toMatchObject({ id: "All", label: "All apps" });
  });
});
