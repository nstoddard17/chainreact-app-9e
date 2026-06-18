/**
 * @jest-environment node
 *
 * Dashboard authoring authorization (Slice ANALYTICS-1 closeout).
 *
 * Analytics dashboards are shared account objects: only owner/admin may author
 * them (a personal owner has role `owner`, so personal users qualify). Members
 * may read but not mutate. These pin the route-layer gate without a DB.
 */

jest.mock("@/services/accounts/accountAuthz", () => ({
  requireAccountRole: jest.fn(),
}));
jest.mock("@/services/analytics/dashboards", () => ({
  getDashboardAccount: jest.fn(),
}));

import {
  requireDashboardAuthor,
  authorizeDashboardWrite,
} from "@/app/api/analytics/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { getDashboardAccount } from "@/services/analytics/dashboards";

const mockRole = requireAccountRole as jest.MockedFunction<typeof requireAccountRole>;
const mockGetDash = getDashboardAccount as jest.MockedFunction<typeof getDashboardAccount>;

beforeEach(() => jest.clearAllMocks());

describe("requireDashboardAuthor", () => {
  it("allows an owner (incl. personal-account owner)", async () => {
    mockRole.mockResolvedValueOnce({ ok: true, role: "owner" });
    const r = await requireDashboardAuthor("u1", "acct");
    expect(r.ok).toBe(true);
    expect(mockRole).toHaveBeenCalledWith("u1", "acct", ["owner", "admin"]);
  });

  it("allows an admin", async () => {
    mockRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    expect((await requireDashboardAuthor("u1", "acct")).ok).toBe(true);
  });

  it("403s a plain member", async () => {
    mockRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const r = await requireDashboardAuthor("u1", "acct");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("404s a non-member (no existence leak)", async () => {
    mockRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const r = await requireDashboardAuthor("u1", "acct");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(404);
  });
});

describe("authorizeDashboardWrite", () => {
  it("404s when the dashboard does not exist", async () => {
    mockGetDash.mockResolvedValueOnce(null);
    const r = await authorizeDashboardWrite("u1", "dash");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(404);
    expect(mockRole).not.toHaveBeenCalled();
  });

  it("allows an owner/admin of the dashboard's account and returns the account id", async () => {
    mockGetDash.mockResolvedValueOnce({ accountId: "acct-9", isDefault: false });
    mockRole.mockResolvedValueOnce({ ok: true, role: "admin" });
    const r = await authorizeDashboardWrite("u1", "dash");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.accountId).toBe("acct-9");
    expect(mockRole).toHaveBeenCalledWith("u1", "acct-9", ["owner", "admin"]);
  });

  it("403s a member of the dashboard's account who lacks the role", async () => {
    mockGetDash.mockResolvedValueOnce({ accountId: "acct-9", isDefault: false });
    mockRole.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const r = await authorizeDashboardWrite("u1", "dash");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("404s a non-member (no existence leak)", async () => {
    mockGetDash.mockResolvedValueOnce({ accountId: "acct-9", isDefault: false });
    mockRole.mockResolvedValueOnce({ ok: false, reason: "not_member" });
    const r = await authorizeDashboardWrite("u1", "dash");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(404);
  });
});
