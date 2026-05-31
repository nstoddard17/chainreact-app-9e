/**
 * @jest-environment node
 *
 * Unit tests for the active-account resolver (4.ACCOUNT-MODEL-11b). Mocks the
 * accounts / memberships / userProfiles repos + ensurePersonalAccount so no DB
 * is touched. Proves the precedence + membership-verification + self-heal +
 * freeze contract from account-switcher-plan.md, and a structural guard that
 * nothing in production code wires the resolver yet (no routes/UI/background).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const mockIsMember = jest.fn();
const mockGetById = jest.fn();
const mockGetActiveAccountId = jest.fn();
const mockClearActiveAccountId = jest.fn();
const mockEnsurePersonalAccount = jest.fn();

jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));
jest.mock("@/repositories/accounts", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));
jest.mock("@/repositories/userProfiles", () => ({
  getActiveAccountId: (...a: unknown[]) => mockGetActiveAccountId(...a),
  clearActiveAccountId: (...a: unknown[]) => mockClearActiveAccountId(...a),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

import { resolveActiveAccount } from "@/services/accounts/activeAccount";

const USER = "user-1";
const PERSONAL = "acct-personal";
const TEAM = "acct-team";
const VICTIM = "acct-victim";

function acct(id: string, deletionStatus: "active" | "pending_deletion" = "active") {
  return {
    id,
    type: "personal",
    name: "Acct",
    ownerUserId: USER,
    deletionStatus,
    deletionRequestedAt: deletionStatus === "pending_deletion" ? "t" : null,
    purgeAfter: deletionStatus === "pending_deletion" ? "t2" : null,
    createdAt: "t0",
    updatedAt: "t1",
  };
}

beforeEach(() => {
  mockIsMember.mockReset();
  mockGetById.mockReset();
  mockGetActiveAccountId.mockReset();
  mockClearActiveAccountId.mockReset().mockResolvedValue(undefined);
  mockEnsurePersonalAccount.mockReset().mockResolvedValue(acct(PERSONAL));
});

describe("resolveActiveAccount — explicit account id", () => {
  it("resolves an explicit member account", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(acct(TEAM));
    const r = await resolveActiveAccount(USER, { explicitAccountId: TEAM });
    expect(r).toMatchObject({ ok: true, source: "explicit", accountId: TEAM });
    // Explicit path never consults the personal fallback.
    expect(mockEnsurePersonalAccount).not.toHaveBeenCalled();
  });

  it("returns not_member for an explicit non-member account (NO fallback)", async () => {
    mockIsMember.mockResolvedValueOnce(false);
    const r = await resolveActiveAccount(USER, { explicitAccountId: TEAM });
    expect(r).toEqual({ ok: false, reason: "not_member", accountId: TEAM });
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockEnsurePersonalAccount).not.toHaveBeenCalled();
  });

  it("returns account_frozen for an explicit frozen account (NO fallback)", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(acct(TEAM, "pending_deletion"));
    const r = await resolveActiveAccount(USER, { explicitAccountId: TEAM });
    expect(r).toEqual({ ok: false, reason: "account_frozen", accountId: TEAM });
    expect(mockEnsurePersonalAccount).not.toHaveBeenCalled();
  });

  it("returns not_member when a member row exists but the account is unreadable", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(null);
    const r = await resolveActiveAccount(USER, { explicitAccountId: TEAM });
    expect(r).toEqual({ ok: false, reason: "not_member", accountId: TEAM });
  });
});

describe("resolveActiveAccount — stored active pointer", () => {
  it("resolves a valid (member, active, non-personal) stored active account", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(TEAM);
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(acct(TEAM));
    const r = await resolveActiveAccount(USER);
    expect(r).toMatchObject({ ok: true, source: "active", accountId: TEAM });
    expect(mockClearActiveAccountId).not.toHaveBeenCalled();
  });

  it("clears a stale/deleted stored active and falls back to personal", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(TEAM);
    mockIsMember.mockResolvedValueOnce(true); // membership lingered
    mockGetById.mockResolvedValueOnce(null); // account gone
    const r = await resolveActiveAccount(USER);
    expect(r).toMatchObject({ ok: true, source: "personal", accountId: PERSONAL });
    expect(mockClearActiveAccountId).toHaveBeenCalledWith(USER);
  });

  it("clears a non-member stored active and falls back to personal", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(TEAM);
    mockIsMember.mockResolvedValueOnce(false);
    const r = await resolveActiveAccount(USER);
    expect(r).toMatchObject({ ok: true, source: "personal", accountId: PERSONAL });
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockClearActiveAccountId).toHaveBeenCalledWith(USER);
  });

  it("clears a frozen stored active and falls back to personal when a live fallback exists", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(TEAM);
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(acct(TEAM, "pending_deletion"));
    const r = await resolveActiveAccount(USER);
    expect(r).toMatchObject({ ok: true, source: "personal", accountId: PERSONAL });
    expect(mockClearActiveAccountId).toHaveBeenCalledWith(USER);
  });

  it("NULL stored active falls back to personal", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(null);
    const r = await resolveActiveAccount(USER);
    expect(r).toMatchObject({ ok: true, source: "personal", accountId: PERSONAL });
    expect(mockClearActiveAccountId).not.toHaveBeenCalled();
  });

  it("a forged stored active_account_id cannot leak another account", async () => {
    // Attacker wrote a victim account id into their own active_account_id.
    mockGetActiveAccountId.mockResolvedValueOnce(VICTIM);
    mockIsMember.mockResolvedValueOnce(false); // not a member of the victim account
    const r = await resolveActiveAccount(USER);
    expect(r).toMatchObject({ ok: true, source: "personal", accountId: PERSONAL });
    // The victim account is never returned or even read.
    expect(mockGetById).not.toHaveBeenCalledWith(VICTIM);
    if (r.ok) expect(r.accountId).not.toBe(VICTIM);
    expect(mockClearActiveAccountId).toHaveBeenCalledWith(USER);
  });
});

describe("resolveActiveAccount — personal floor + freeze", () => {
  it("default launch path (no explicit, no stored) resolves the personal account", async () => {
    mockGetActiveAccountId.mockResolvedValueOnce(null);
    const r = await resolveActiveAccount(USER);
    expect(r).toMatchObject({ ok: true, source: "personal", accountId: PERSONAL });
  });

  it("a frozen personal floor returns account_frozen (launch freeze preserved)", async () => {
    mockEnsurePersonalAccount.mockResolvedValueOnce(acct(PERSONAL, "pending_deletion"));
    mockGetActiveAccountId.mockResolvedValueOnce(null);
    const r = await resolveActiveAccount(USER);
    expect(r).toEqual({ ok: false, reason: "account_frozen", accountId: PERSONAL });
  });

  it("a stored pointer AT the personal account is NOT cleared (freeze behavior preserved)", async () => {
    // Frozen personal account, stored pointer == personal id.
    mockEnsurePersonalAccount.mockResolvedValueOnce(acct(PERSONAL, "pending_deletion"));
    mockGetActiveAccountId.mockResolvedValueOnce(PERSONAL);
    const r = await resolveActiveAccount(USER);
    expect(r).toEqual({ ok: false, reason: "account_frozen", accountId: PERSONAL });
    // Pointer at the personal account is preserved, not self-healed away.
    expect(mockClearActiveAccountId).not.toHaveBeenCalled();
    // And membership/getById for the stored==personal id is skipped entirely.
    expect(mockIsMember).not.toHaveBeenCalled();
  });
});

describe("resolver wiring is gate-only; background paths never use it (11c)", () => {
  // Walk production source dirs. After 11c the resolver has exactly ONE caller —
  // the route gate (app/api/workflows/_shared.ts). Anything else (and ANY
  // background/cron/webhook/trigger path in particular) referencing it is a leak.
  const ROOT = process.cwd();
  const PROD_DIRS = ["app", "lib", "components", "repositories", "core", "integrations", "services"];
  const DEF_FILE = resolve(ROOT, "services/accounts/activeAccount.ts");
  const GATE_FILE = resolve(ROOT, "app/api/workflows/_shared.ts");
  const ALLOWED = new Set([DEF_FILE, GATE_FILE]);
  // Background entry points must NEVER consult active-account state.
  const BACKGROUND_DIRS = ["app/api/cron", "app/api/webhooks", "services/triggers"];

  const RESOLVER_REF = /resolveActiveAccount|services\/accounts\/activeAccount/;

  function walk(dir: string): string[] {
    let out: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        out = out.concat(walk(p));
      } else if (/\.(ts|tsx)$/.test(name)) {
        out.push(p);
      }
    }
    return out;
  }

  it("only the route gate (workflows/_shared.ts) references the resolver", () => {
    const offenders: string[] = [];
    for (const d of PROD_DIRS) {
      for (const file of walk(resolve(ROOT, d))) {
        if (ALLOWED.has(resolve(file))) continue;
        if (RESOLVER_REF.test(readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("NO background path (cron / webhook / trigger) imports or uses the resolver", () => {
    const offenders: string[] = [];
    for (const d of BACKGROUND_DIRS) {
      for (const file of walk(resolve(ROOT, d))) {
        if (RESOLVER_REF.test(readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
