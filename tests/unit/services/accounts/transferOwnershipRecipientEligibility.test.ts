/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-3 — RECIPIENT eligibility for ownership transfer.
 *
 * `transferOwnership` is the only path in the codebase that makes ANOTHER user an owner
 * (team creation makes the creator owner; invitations reject `owner`; the member role-change
 * path is admin↔member only). So this is where "can this person actually be the responsible
 * owner?" has to be answered — and it has to be answered before anything mutates, because a
 * team handed to an account that is about to be purged is a team with no owner.
 *
 * The predicate reuses the existing `accounts.deletion_status` on the recipient's PERSONAL
 * account. No new status column exists or is implied.
 *
 * Critically: **billing tier is not eligibility.** A recipient on Free, or one whose personal
 * subscription is scheduled to cancel, is an active user and a perfectly valid owner.
 */

const mockGetById = jest.fn();
const mockTransfer = jest.fn();
const mockGetPersonalSR = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetById(...a),
  transferAccountOwnershipServiceRole: (...a: unknown[]) => mockTransfer(...a),
  getPersonalAccountForUserServiceRole: (...a: unknown[]) => mockGetPersonalSR(...a),
}));

const mockGetRoleSR = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRoleSR(...a),
}));

import { transferOwnership } from "@/services/accounts/transferOwnership";
import type { AccountRecord } from "@/contracts/accounts";

const TEAM = "11111111-1111-1111-1111-111111111111";
const OWNER = "22222222-2222-2222-2222-222222222222";
const TARGET = "33333333-3333-3333-3333-333333333333";

function account(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: TEAM,
    type: "team",
    name: "Acme",
    ownerUserId: OWNER,
    deletionStatus: "active",
    deletionRequestedAt: null,
    purgeAfter: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

/** The recipient's personal account in a given lifecycle state. */
function recipientPersonal(deletionStatus: AccountRecord["deletionStatus"]): AccountRecord {
  return account({
    id: "personal-of-target",
    type: "personal",
    name: "Personal",
    ownerUserId: TARGET,
    deletionStatus,
    deletionRequestedAt: deletionStatus === "active" ? null : "2026-07-24T00:00:00Z",
    purgeAfter: deletionStatus === "active" ? null : "2026-08-23T00:00:00Z",
  });
}

function transfer() {
  return transferOwnership({
    accountId: TEAM,
    callerUserId: OWNER,
    targetUserId: TARGET,
  });
}

/** Nothing about ownership or roles was touched. */
function expectNoMutation() {
  expect(mockTransfer).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockGetById.mockReset().mockResolvedValue(account());
  mockTransfer.mockReset().mockResolvedValue(undefined);
  mockGetRoleSR.mockReset().mockResolvedValue("member");
  mockGetPersonalSR.mockReset().mockResolvedValue(recipientPersonal("active"));
});

describe("eligible recipients", () => {
  it("an ACTIVE user can receive ownership", async () => {
    const r = await transfer();
    expect(r.ok).toBe(true);
    expect(mockTransfer).toHaveBeenCalledWith({
      accountId: TEAM,
      currentOwnerUserId: OWNER,
      targetUserId: TARGET,
    });
  });

  it("a user on the FREE plan is eligible — billing tier is not ownership eligibility", async () => {
    // There is deliberately no billing read in the eligibility path at all: the predicate
    // only looks at the personal account's lifecycle status.
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("active"));
    const r = await transfer();
    expect(r.ok).toBe(true);
  });

  it("a user whose personal subscription is scheduled to CANCEL is still eligible", async () => {
    // Cancel-at-period-end lives in account_billing and never reaches this decision. The
    // user is active; they remain a valid owner.
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("active"));
    const r = await transfer();
    expect(r.ok).toBe(true);
  });

  it("becomes eligible again once a pending deletion is cancelled", async () => {
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("pending_deletion"));
    expect(await transfer()).toEqual({ ok: false, reason: "target_unavailable" });

    // The user cancels their deletion → status returns to active → eligible.
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("active"));
    expect((await transfer()).ok).toBe(true);
  });
});

describe("ineligible recipients", () => {
  it("a PENDING-DELETION user cannot receive ownership", async () => {
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("pending_deletion"));
    expect(await transfer()).toEqual({ ok: false, reason: "target_unavailable" });
    expectNoMutation();
  });

  it("a user with NO personal account (deleted / unavailable identity) cannot receive ownership", async () => {
    // Fails CLOSED: a missing row is never read as "fine".
    mockGetPersonalSR.mockResolvedValue(null);
    expect(await transfer()).toEqual({ ok: false, reason: "target_unavailable" });
    expectNoMutation();
  });

  it("an UNREADABLE eligibility answer refuses rather than proceeding", async () => {
    mockGetPersonalSR.mockRejectedValue(new Error("db down"));
    expect(await transfer()).toEqual({ ok: false, reason: "transfer_failed" });
    expectNoMutation();
  });

  it("rejection happens BEFORE any ownership or role mutation", async () => {
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("pending_deletion"));
    await transfer();
    // The RPC performs the owner swap AND the old-owner demotion; never reaching it means
    // neither happened, no audit event claimed success, and no notification was sent.
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("leaves the EXISTING owner in place on failure", async () => {
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("pending_deletion"));
    await transfer();
    const after = await mockGetById.mock.results[0]?.value;
    expect(after.ownerUserId).toBe(OWNER);
  });

  it("touches no billing whatsoever", async () => {
    // The eligibility path reads accounts only. If a billing read were ever introduced here
    // it would show up as an unexpected module dependency — asserted structurally below.
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("pending_deletion"));
    await transfer();
    expectNoMutation();
  });

  it("returns ONE typed reason for every unavailable state (no lifecycle disclosure)", async () => {
    for (const state of [recipientPersonal("pending_deletion"), null]) {
      mockGetPersonalSR.mockResolvedValue(state);
      const r = await transfer();
      expect(r).toEqual({ ok: false, reason: "target_unavailable" });
    }
  });

  it("checks eligibility for the TARGET, not the caller", async () => {
    mockGetPersonalSR.mockResolvedValue(recipientPersonal("active"));
    await transfer();
    expect(mockGetPersonalSR).toHaveBeenCalledWith(TARGET);
    expect(mockGetPersonalSR).not.toHaveBeenCalledWith(OWNER);
  });
});

/**
 * The eligibility read and the swap are two statements, so the recipient can begin deletion
 * in the window between them. See the service's RACE RE-VERIFICATION comment for the full
 * ordering analysis; these pin the behavior.
 */
describe("concurrency: recipient begins deletion mid-transfer", () => {
  it("REVERTS the swap when the recipient became ineligible during it", async () => {
    // Eligible at the pre-check, ineligible at the post-check — the exact interleaving that
    // would otherwise leave a team owned by a pending-deletion user.
    mockGetPersonalSR
      .mockResolvedValueOnce(recipientPersonal("active")) // pre-swap
      .mockResolvedValueOnce(recipientPersonal("pending_deletion")); // post-swap

    const r = await transfer();

    expect(r).toEqual({ ok: false, reason: "target_unavailable" });
    // Swap happened, then was reversed: forward call + reverse call.
    expect(mockTransfer).toHaveBeenCalledTimes(2);
    expect(mockTransfer).toHaveBeenNthCalledWith(1, {
      accountId: TEAM,
      currentOwnerUserId: OWNER,
      targetUserId: TARGET,
    });
    // The reversal hands it straight back to the original owner.
    expect(mockTransfer).toHaveBeenNthCalledWith(2, {
      accountId: TEAM,
      currentOwnerUserId: TARGET,
      targetUserId: OWNER,
    });
  });

  it("still reports failure when the REVERSAL itself fails (never a fake success)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetPersonalSR
      .mockResolvedValueOnce(recipientPersonal("active"))
      .mockResolvedValueOnce(recipientPersonal("pending_deletion"));
    mockTransfer
      .mockResolvedValueOnce(undefined) // forward swap succeeds
      .mockRejectedValueOnce(new Error("revert failed")); // reversal fails

    const r = await transfer();

    expect(r).toEqual({ ok: false, reason: "target_unavailable" });
    // The operator gets a loud error; the caller is never told the transfer worked.
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("treats an unreadable POST-swap check as ineligible and reverts", async () => {
    mockGetPersonalSR
      .mockResolvedValueOnce(recipientPersonal("active"))
      .mockRejectedValueOnce(new Error("db down"));

    const r = await transfer();

    expect(r).toEqual({ ok: false, reason: "target_unavailable" });
    expect(mockTransfer).toHaveBeenCalledTimes(2);
  });

  it("does NOT revert on the happy path", async () => {
    const r = await transfer();
    expect(r.ok).toBe(true);
    expect(mockTransfer).toHaveBeenCalledTimes(1);
  });
});

describe("structural", () => {
  it("the transfer service performs no billing read or mutation", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "services/accounts/transferOwnership.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/accountBilling|subscriptionCancellation|stripe/i);
  });
});
