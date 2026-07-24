/**
 * @jest-environment node
 *
 * `/apps/vehicle-links` page gating (5.TRUCK-BRIDGE-1 CS-4).
 *
 * REAL: the page server component, the REAL flag accessor, and the REAL
 * `unlinkedVehicles` set difference. MOCKED: only boundaries — Supabase auth,
 * active-account resolution, the memberships/notifications repositories, the
 * link service, the vehicle-options service, and the two React components (this
 * asserts the page's GATING and PROP CONTRACT, not its markup — the markup has
 * its own jsdom suite).
 *
 * Business rules protected:
 *   - flag OFF ⇒ notFound(), before any account-scoped read,
 *   - flag ON ⇒ the page renders and threads server-derived props,
 *   - an unauthenticated caller is redirected and reads nothing,
 *   - a non-member of the resolved account gets notFound(),
 *   - `canManage` is derived from the caller's ROLE, server-side,
 *   - the Unlinked list is the set difference computed on the server.
 */
const notFoundError = new Error("NEXT_NOT_FOUND");
const redirectError = new Error("NEXT_REDIRECT");
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw notFoundError;
  },
  redirect: () => {
    throw redirectError;
  },
}));

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockResolveActive = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...a: unknown[]) => mockResolveActive(...a),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: async () => ({ id: "personal-account" }),
}));

const mockGetRole = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRole: (...a: unknown[]) => mockGetRole(...a),
}));

jest.mock("@/repositories/notifications", () => ({
  countUnreadForUser: async () => 0,
  listForUser: async () => [],
}));
jest.mock("@/app/notifications/credentialRequestNotice", () => ({
  applyCredentialRequestNotice: async (
    _userId: string,
    unreadNotifications: number,
    recentNotifications: unknown[],
  ) => ({ unreadNotifications, recentNotifications }),
}));
jest.mock("@/app/notifications/notificationPreview", () => ({
  NOTIFICATION_BELL_PREVIEW_LIMIT: 5,
  toNotificationPreview: (r: unknown) => r,
}));

const mockListLinks = jest.fn();
jest.mock("@/services/resourceLinks/vehicleLinkService", () => {
  const actual = jest.requireActual("@/services/resourceLinks/vehicleLinkService");
  return {
    // The REAL pure set difference — this is behavior worth asserting.
    unlinkedVehicles: actual.unlinkedVehicles,
    listVehicleLinks: (...a: unknown[]) => mockListLinks(...a),
  };
});

const mockListOptions = jest.fn();
jest.mock("@/services/resourceLinks/vehicleOptions", () => ({
  listVehicleOptions: (...a: unknown[]) => mockListOptions(...a),
}));

let dashboardProps: Record<string, unknown> | null = null;
jest.mock("@/features/apps/vehicleLinks/VehicleLinksDashboard", () => ({
  VehicleLinksDashboard: (props: Record<string, unknown>) => {
    dashboardProps = props;
    return null;
  },
}));
jest.mock("@/components/app-shell/AppShell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

import { renderToStaticMarkup } from "react-dom/server";
import VehicleLinksPage from "@/app/apps/vehicle-links/page";
import { RESOURCE_LINKS_UI_FLAG } from "@/services/resourceLinks/flags";

/**
 * Run the async server component AND render its tree, so the mocked dashboard
 * actually receives (and records) its props. Awaiting the page alone only
 * produces an element — nothing would be invoked.
 */
async function renderPage(): Promise<void> {
  renderToStaticMarkup(await VehicleLinksPage());
}

const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";

const LINK = {
  id: "link-1",
  sourceVehicleId: "motive-veh-88231",
  sourceLabel: "Unit 104",
  targetVehicleId: "42",
  targetLabel: "Truck 104",
  matchBasis: "manual" as const,
  confirmedByLabel: "Dana Owner",
  confirmedAt: "2026-07-20T10:00:00.000Z",
};

beforeEach(() => {
  process.env[RESOURCE_LINKS_UI_FLAG] = "true";
  dashboardProps = null;
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: { id: USER, email: "u@example.test" } },
    error: null,
  });
  mockResolveActive.mockReset();
  mockResolveActive.mockResolvedValue({ ok: true, account: { id: ACCOUNT } });
  mockGetRole.mockReset();
  mockGetRole.mockResolvedValue("owner");
  mockListLinks.mockReset();
  mockListLinks.mockResolvedValue({ ok: true, links: [LINK] });
  mockListOptions.mockReset();
  mockListOptions.mockResolvedValue({
    status: "ok",
    items: [
      { value: "motive-veh-88231", label: "Unit 104" },
      { value: "motive-veh-99999", label: "Unit 205" },
    ],
    hasMore: false,
  });
});
afterEach(() => {
  delete process.env[RESOURCE_LINKS_UI_FLAG];
});

describe("feature flag", () => {
  it("flag OFF ⇒ notFound() before any auth or account-scoped read", async () => {
    delete process.env[RESOURCE_LINKS_UI_FLAG];
    await expect(renderPage()).rejects.toBe(notFoundError);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockListLinks).not.toHaveBeenCalled();
    expect(mockListOptions).not.toHaveBeenCalled();
  });

  it('only the exact string "true" enables the page', async () => {
    for (const value of ["1", "TRUE", "yes", ""]) {
      process.env[RESOURCE_LINKS_UI_FLAG] = value;
      await expect(renderPage()).rejects.toBe(notFoundError);
    }
  });

  it("flag ON renders the dashboard", async () => {
    await renderPage();
    expect(dashboardProps).not.toBeNull();
  });
});

describe("auth + membership gating", () => {
  it("redirects an unauthenticated caller and reads nothing", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(renderPage()).rejects.toBe(redirectError);
    expect(mockListLinks).not.toHaveBeenCalled();
    expect(mockListOptions).not.toHaveBeenCalled();
  });

  it("notFound() for a non-member of the resolved account — no link read", async () => {
    mockGetRole.mockResolvedValueOnce(null);
    await expect(renderPage()).rejects.toBe(notFoundError);
    expect(mockListLinks).not.toHaveBeenCalled();
    expect(mockListOptions).not.toHaveBeenCalled();
  });

  it("scopes every read to the ACTIVE account, with the session user id", async () => {
    await renderPage();
    expect(mockListLinks).toHaveBeenCalledWith({ accountId: ACCOUNT, actingUserId: USER });
    expect(mockListOptions).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      userId: USER,
      side: "motive",
    });
  });
});

describe("props threaded to the client", () => {
  it("derives canManage from the caller's role, server-side", async () => {
    for (const [role, expected] of [
      ["owner", true],
      ["admin", true],
      ["member", false],
    ] as const) {
      mockGetRole.mockResolvedValueOnce(role);
      await renderPage();
      expect(dashboardProps!.canManage).toBe(expected);
    }
  });

  it("computes the Unlinked list as a server-side set difference", async () => {
    await renderPage();
    // Unit 104 is linked, so only Unit 205 is unlinked.
    expect(dashboardProps!.unlinked).toEqual([
      { sourceVehicleId: "motive-veh-99999", label: "Unit 205" },
    ]);
    expect(dashboardProps!.links).toEqual([LINK]);
    expect(dashboardProps!.motiveStatus).toBe("ok");
  });

  it("passes a DISCONNECTED Motive status through instead of an empty fleet", async () => {
    mockListOptions.mockResolvedValueOnce({ status: "disconnected", items: [], hasMore: false });
    await renderPage();
    expect(dashboardProps!.motiveStatus).toBe("disconnected");
    expect(dashboardProps!.unlinked).toEqual([]);
    // Links still render — a disconnected Motive doesn't hide existing mappings.
    expect(dashboardProps!.links).toEqual([LINK]);
  });

  it("never threads an accountId-bearing raw link row or a user id", async () => {
    await renderPage();
    const blob = JSON.stringify(dashboardProps!.links);
    expect(blob).not.toContain(USER);
    expect(blob).not.toContain("createdByUserId");
    expect(blob).not.toContain("accountId");
  });
});
