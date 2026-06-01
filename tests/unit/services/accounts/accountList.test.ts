/**
 * @jest-environment node
 *
 * Unit tests for listUserAccountSummaries (4.ACCOUNT-MODEL-18). Mocks the repos
 * so no DB is touched. Proves role merge, effective-active computation
 * (stored-if-listed else personal), isActive marking, personal-first sort,
 * deletionStatus passthrough, single-account case, and READ-ONLY behavior (no
 * write/self-heal repo is even imported).
 */

const mockListByUser = jest.fn();
const mockListForUser = jest.fn();
const mockGetActiveAccountId = jest.fn();

jest.mock("@/repositories/accounts", () => ({
  listForUser: (...a: unknown[]) => mockListForUser(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  listByUser: (...a: unknown[]) => mockListByUser(...a),
}));
jest.mock("@/repositories/userProfiles", () => ({
  getActiveAccountId: (...a: unknown[]) => mockGetActiveAccountId(...a),
}));

import { listUserAccountSummaries } from "@/services/accounts/accountList";

const USER = "user-1";

function acct(id: string, type: string, name: string, deletionStatus = "active") {
  return { id, type, name, deletionStatus, ownerUserId: USER, deletionRequestedAt: null, purgeAfter: null, createdAt: "t", updatedAt: "t" };
}

beforeEach(() => {
  mockListByUser.mockReset();
  mockListForUser.mockReset();
  mockGetActiveAccountId.mockReset();
});

describe("listUserAccountSummaries", () => {
  it("merges role per account, sorts personal first, marks active = personal when stored is null", async () => {
    mockListForUser.mockResolvedValueOnce([
      acct("team-b", "team", "Beta"),
      acct("personal-1", "personal", "Personal"),
      acct("team-a", "team", "Alpha"),
    ]);
    mockListByUser.mockResolvedValueOnce([
      { accountId: "personal-1", role: "owner" },
      { accountId: "team-b", role: "member" },
      { accountId: "team-a", role: "admin" },
    ]);
    mockGetActiveAccountId.mockResolvedValueOnce(null);

    const r = await listUserAccountSummaries(USER);

    expect(r.activeAccountId).toBe("personal-1");
    expect(r.accounts.map((a) => a.id)).toEqual(["personal-1", "team-a", "team-b"]); // personal first, then by name
    expect(r.accounts.map((a) => a.role)).toEqual(["owner", "admin", "member"]);
    expect(r.accounts.find((a) => a.id === "personal-1")!.isActive).toBe(true);
    expect(r.accounts.filter((a) => a.isActive)).toHaveLength(1);
  });

  it("honors a stored active account when it is one the caller belongs to", async () => {
    mockListForUser.mockResolvedValueOnce([
      acct("personal-1", "personal", "Personal"),
      acct("team-a", "team", "Alpha"),
    ]);
    mockListByUser.mockResolvedValueOnce([
      { accountId: "personal-1", role: "owner" },
      { accountId: "team-a", role: "owner" },
    ]);
    mockGetActiveAccountId.mockResolvedValueOnce("team-a");

    const r = await listUserAccountSummaries(USER);
    expect(r.activeAccountId).toBe("team-a");
    expect(r.accounts.find((a) => a.id === "team-a")!.isActive).toBe(true);
    expect(r.accounts.find((a) => a.id === "personal-1")!.isActive).toBe(false);
  });

  it("falls back to personal when the stored active is not in the caller's list (read-only, no write)", async () => {
    mockListForUser.mockResolvedValueOnce([acct("personal-1", "personal", "Personal")]);
    mockListByUser.mockResolvedValueOnce([{ accountId: "personal-1", role: "owner" }]);
    mockGetActiveAccountId.mockResolvedValueOnce("ghost-team"); // stale / removed

    const r = await listUserAccountSummaries(USER);
    expect(r.activeAccountId).toBe("personal-1");
  });

  it("includes a frozen account with its deletionStatus (not filtered out)", async () => {
    mockListForUser.mockResolvedValueOnce([
      acct("personal-1", "personal", "Personal"),
      acct("team-frozen", "team", "Frozen", "pending_deletion"),
    ]);
    mockListByUser.mockResolvedValueOnce([
      { accountId: "personal-1", role: "owner" },
      { accountId: "team-frozen", role: "owner" },
    ]);
    mockGetActiveAccountId.mockResolvedValueOnce(null);

    const r = await listUserAccountSummaries(USER);
    const frozen = r.accounts.find((a) => a.id === "team-frozen")!;
    expect(frozen.deletionStatus).toBe("pending_deletion");
  });

  it("single personal account: one entry, active = personal", async () => {
    mockListForUser.mockResolvedValueOnce([acct("personal-1", "personal", "Personal")]);
    mockListByUser.mockResolvedValueOnce([{ accountId: "personal-1", role: "owner" }]);
    mockGetActiveAccountId.mockResolvedValueOnce(null);

    const r = await listUserAccountSummaries(USER);
    expect(r.accounts).toHaveLength(1);
    expect(r.activeAccountId).toBe("personal-1");
    expect(r.accounts[0]!.isActive).toBe(true);
  });
});
