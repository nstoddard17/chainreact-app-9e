/**
 * @jest-environment node
 *
 * Pins which V2 routes DO and DO NOT render the authenticated AppShell
 * (Slice 4.APP-SHELL-1).
 *
 * Approach: render each route's server component with mocked auth /
 * repos, then walk the returned React element tree looking for the
 * `AppShell` reference. Real fast, no DOM mount, no JSX-string
 * parsing. The shell is identified by component identity (we don't
 * mock the AppShell), so this test fails if a future change quietly
 * removes the wrapper from an included route or adds it to an
 * excluded one.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockRedirect = jest.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), {
    digest: `NEXT_REDIRECT;${path}`,
  });
});
const mockNotFound = jest.fn(() => {
  throw Object.assign(new Error("NEXT_NOT_FOUND"), {
    digest: "NEXT_NOT_FOUND",
  });
});
jest.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
  notFound: () => mockNotFound(),
}));

jest.mock("@/repositories/workflows", () => ({
  // 4.ACCOUNT-MODEL-7: the workflows dashboard page lists by account now.
  listByAccount: jest.fn().mockResolvedValue([]),
  loadDraft: jest.fn(),
  listNamesByIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/repositories/workflowRunStats", () => ({
  getStatsForAccount: jest.fn().mockResolvedValue(new Map()),
}));
jest.mock("@/repositories/workflowFolders", () => ({
  // 4.WORKFLOW-FOLDERS-6 / WF-5: the dashboard page lists folders now.
  listByAccount: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/repositories/workflowRuns", () => ({
  // 4.ACCOUNT-MODEL-8: the /runs page lists by account now.
  listByAccountForDisplay: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: jest.fn().mockResolvedValue([]),
  // ANALYTICS-SOURCES-GITHUB-UI-1: the /analytics page checks the viewer's own
  // GitHub connection for the config-panel note.
  getActiveForExecution: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRole: jest.fn().mockResolvedValue("owner"),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: jest.fn(async (userId: string) => ({
    id: `acct-${userId}`,
    type: "personal" as const,
    ownerUserId: userId,
    createdAt: "2026-05-30T00:00:00Z",
    updatedAt: "2026-05-30T00:00:00Z",
  })),
}));
jest.mock("@/services/accounts/activeAccount", () => ({
  // 4.WORKFLOW-FOLDERS-6 / WF-5 fix: the page resolves the ACTIVE account.
  resolveActiveAccount: jest.fn(async (userId: string) => ({
    ok: true as const,
    source: "personal" as const,
    account: {
      id: `acct-${userId}`,
      type: "personal" as const,
      ownerUserId: userId,
      createdAt: "2026-05-30T00:00:00Z",
      updatedAt: "2026-05-30T00:00:00Z",
    },
  })),
}));
// 5.ONBOARD-1 — the workflows page always derives the onboarding checklist now
// (the feature flag was removed), so this route-scope test must stub that
// service like its other data dependencies. Without it the page reaches for a
// service-role Supabase client that this environment has no credentials for.
jest.mock("@/services/onboarding/checklistState", () => ({
  getOnboardingChecklist: jest.fn(async () => null),
}));

jest.mock("@/repositories/notifications", () => ({
  listForUser: jest.fn().mockResolvedValue([]),
  countUnreadForUser: jest.fn().mockResolvedValue(0),
}));
jest.mock("@/integrations/_registry", () => ({
  listProviders: jest.fn().mockReturnValue([]),
  getProvider: jest.fn(),
  providerIconUrl: (id: string) => `/integrations/${id}.svg`,
}));
// ANALYTICS-1 — the /analytics page resolves the active account then fetches
// dashboards + the overview via these services (both account-scoped).
jest.mock("@/services/analytics/dashboards", () => ({
  listOrSeedDashboards: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/analytics/analyticsOverview", () => ({
  getAnalyticsOverview: jest.fn().mockResolvedValue({
    range: { id: "7d", since: "2026-06-10T00:00:00Z", until: "2026-06-17T00:00:00Z" },
    totals: {
      runs: 0,
      succeeded: 0,
      failed: 0,
      successRate: 0,
      avgDurationMs: null,
      activeWorkflows: 0,
      totalWorkflows: 0,
      connectedApps: 0,
    },
    previousTotals: {
      runs: 0,
      succeeded: 0,
      failed: 0,
      successRate: 0,
      avgDurationMs: null,
      activeWorkflows: 0,
      totalWorkflows: 0,
      connectedApps: 0,
    },
    runsOverTime: [],
    workflows: [],
    apps: [],
    heatmap: { weeks: 16, cells: [], maxCell: 0, total: 0 },
    recentRuns: [],
    truncated: false,
  }),
}));

import { AppShell } from "@/components/app-shell/AppShell";
import { MarketingHome } from "@/features/marketing/MarketingHome";
import { HelpCenterPage } from "@/features/marketing/HelpCenterPage";

function containsElement(
  node: unknown,
  target: unknown,
): boolean {
  if (!node || typeof node !== "object") return false;
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === target) return true;
  if (el.props && "children" in el.props) {
    const children = el.props.children;
    if (Array.isArray(children)) {
      return children.some((c) => containsElement(c, target));
    }
    return containsElement(children, target);
  }
  return false;
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockRedirect.mockClear();
  mockNotFound.mockClear();
});

describe("AppShell — route scope: INCLUDED", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u-1", email: "marcus@example.com" } },
    });
  });

  it("/workflows renders AppShell", async () => {
    const { default: WorkflowsPage } = await import("@/app/workflows/page");
    const result = await WorkflowsPage();
    expect(containsElement(result, AppShell)).toBe(true);
  });

  it("/apps renders AppShell", async () => {
    const { default: AppsPage } = await import("@/app/apps/page");
    const result = await AppsPage({
      searchParams: Promise.resolve({} as Record<string, string>),
    });
    expect(containsElement(result, AppShell)).toBe(true);
  });

  it("/notifications renders AppShell", async () => {
    const { default: NotificationsPage } = await import(
      "@/app/notifications/page"
    );
    const result = await NotificationsPage();
    expect(containsElement(result, AppShell)).toBe(true);
  });

  it("/runs renders AppShell", async () => {
    const { default: RunsPage } = await import("@/app/runs/page");
    const result = await RunsPage();
    expect(containsElement(result, AppShell)).toBe(true);
  });

  it("/analytics renders AppShell (Slice ANALYTICS-1)", async () => {
    const { default: AnalyticsPage } = await import("@/app/analytics/page");
    const result = await AnalyticsPage();
    expect(containsElement(result, AppShell)).toBe(true);
  });
});

describe("AppShell — route scope: EXCLUDED", () => {
  it("/ (marketing) does NOT render AppShell — renders MarketingHome instead", async () => {
    // Signed-out: the homepage renders the marketing surface. Signed-in
    // would redirect away; either way the shell never wraps `/`.
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { default: HomePage } = await import("@/app/page");
    const result = await HomePage();
    expect(containsElement(result, AppShell)).toBe(false);
    expect(containsElement(result, MarketingHome)).toBe(true);
  });

  it("/help (public Help Center, HELP-CENTER-1) does NOT render AppShell — renders HelpCenterPage", async () => {
    // Public marketing-surface route: no auth gate, works signed-in or out
    // (the session is read ONLY for the header CTA variant). This file's
    // registry mock returns no providers, so the page renders with an empty
    // integration-help section — that path is valid.
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { default: HelpPage } = await import("@/app/help/page");
    const result = await HelpPage();
    expect(containsElement(result, AppShell)).toBe(false);
    expect(containsElement(result, HelpCenterPage)).toBe(true);
  });

  it("/help stays shell-less and gate-less for a SIGNED-IN viewer too", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u-1", email: "marcus@example.com" } },
    });
    const { default: HelpPage } = await import("@/app/help/page");
    const result = await HelpPage();
    expect(containsElement(result, AppShell)).toBe(false);
    expect(containsElement(result, HelpCenterPage)).toBe(true);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("/integrations (legacy redirect) never reaches a render — server-redirects to /apps", async () => {
    const { default: LegacyIntegrationsPage } = await import(
      "@/app/integrations/page"
    );
    await expect(
      LegacyIntegrationsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith("/apps");
  });
});
