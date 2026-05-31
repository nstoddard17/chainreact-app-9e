/**
 * @jest-environment node
 *
 * Unit tests for createTeamAccount (4.ACCOUNT-MODEL-13). Mocks the repos +
 * setActiveAccount so no DB is touched. Proves the create sequence (account →
 * owner membership → free billing → auto-activate), that the personal account is
 * never read/written, and that the creator owns the team.
 */

const mockCreateTeamAccount = jest.fn();
const mockInsertOwner = jest.fn();
const mockInitBilling = jest.fn();
const mockSetActiveAccount = jest.fn();

jest.mock("@/repositories/accounts", () => ({
  createTeamAccountServiceRole: (...a: unknown[]) => mockCreateTeamAccount(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  insertOwnerMembershipServiceRole: (...a: unknown[]) => mockInsertOwner(...a),
}));
jest.mock("@/repositories/accountBilling", () => ({
  initAccountBillingServiceRole: (...a: unknown[]) => mockInitBilling(...a),
}));
jest.mock("@/services/accounts/activeAccount", () => ({
  setActiveAccount: (...a: unknown[]) => mockSetActiveAccount(...a),
}));

import { createTeamAccount } from "@/services/accounts/createTeamAccount";

const USER = "user-1";
const TEAM_ID = "team-1";

function teamAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: TEAM_ID,
    type: "team",
    name: "Acme",
    ownerUserId: USER,
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "t0",
    updatedAt: "t1",
    ...overrides,
  };
}

beforeEach(() => {
  mockCreateTeamAccount.mockReset().mockResolvedValue(teamAccount());
  mockInsertOwner.mockReset().mockResolvedValue(undefined);
  mockInitBilling.mockReset().mockResolvedValue(undefined);
  mockSetActiveAccount.mockReset().mockResolvedValue({ ok: true, account: teamAccount() });
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
  (console.warn as jest.Mock).mockRestore?.();
});

describe("createTeamAccount", () => {
  it("creates a team (type='team'), owner membership, free billing, and auto-activates", async () => {
    const result = await createTeamAccount({ userId: USER, name: "Acme" });

    expect(result).toEqual({ id: TEAM_ID, name: "Acme", type: "team" });
    expect(mockCreateTeamAccount).toHaveBeenCalledWith({ name: "Acme", ownerUserId: USER });
    expect(mockInsertOwner).toHaveBeenCalledWith(TEAM_ID, USER);
    expect(mockInitBilling).toHaveBeenCalledWith(TEAM_ID);
    expect(mockSetActiveAccount).toHaveBeenCalledWith(USER, TEAM_ID);
  });

  it("trims the name before creating", async () => {
    await createTeamAccount({ userId: USER, name: "  Acme  " });
    expect(mockCreateTeamAccount).toHaveBeenCalledWith({ name: "Acme", ownerUserId: USER });
  });

  it("throws (defensive floor) on an empty name and writes nothing", async () => {
    await expect(createTeamAccount({ userId: USER, name: "   " })).rejects.toThrow(
      /name is required/,
    );
    expect(mockCreateTeamAccount).not.toHaveBeenCalled();
  });

  it("never touches the personal account (no personal read/write in the create path)", async () => {
    // The only accounts-repo call is createTeamAccountServiceRole — no
    // ensurePersonalAccount, no getById on a personal account.
    await createTeamAccount({ userId: USER, name: "Acme" });
    expect(mockCreateTeamAccount).toHaveBeenCalledTimes(1);
  });

  it("still returns the created team if auto-activation fails (best-effort)", async () => {
    mockSetActiveAccount.mockResolvedValueOnce({ ok: false, reason: "not_member", accountId: TEAM_ID });
    const result = await createTeamAccount({ userId: USER, name: "Acme" });
    expect(result).toEqual({ id: TEAM_ID, name: "Acme", type: "team" });
  });
});
