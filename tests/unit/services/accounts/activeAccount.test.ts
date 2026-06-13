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
const mockSetActiveAccountId = jest.fn();
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
  setActiveAccountId: (...a: unknown[]) => mockSetActiveAccountId(...a),
  clearActiveAccountId: (...a: unknown[]) => mockClearActiveAccountId(...a),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

import {
  resolveActiveAccount,
  setActiveAccount,
} from "@/services/accounts/activeAccount";

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
  mockSetActiveAccountId.mockReset().mockResolvedValue(undefined);
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

describe("setActiveAccount (11d)", () => {
  it("writes active_account_id for a valid member + active target", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(acct(TEAM));
    const r = await setActiveAccount(USER, TEAM);
    expect(r).toEqual({ ok: true, account: acct(TEAM) });
    expect(mockSetActiveAccountId).toHaveBeenCalledWith(USER, TEAM);
  });

  it("rejects a non-member target and does NOT write", async () => {
    mockIsMember.mockResolvedValueOnce(false);
    const r = await setActiveAccount(USER, TEAM);
    expect(r).toEqual({ ok: false, reason: "not_member", accountId: TEAM });
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockSetActiveAccountId).not.toHaveBeenCalled();
  });

  it("rejects a frozen target and does NOT write (previous pointer preserved)", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(acct(TEAM, "pending_deletion"));
    const r = await setActiveAccount(USER, TEAM);
    expect(r).toEqual({ ok: false, reason: "account_frozen", accountId: TEAM });
    expect(mockSetActiveAccountId).not.toHaveBeenCalled();
  });

  it("rejects an unreadable/vanished target and does NOT write", async () => {
    mockIsMember.mockResolvedValueOnce(true);
    mockGetById.mockResolvedValueOnce(null);
    const r = await setActiveAccount(USER, TEAM);
    expect(r).toEqual({ ok: false, reason: "not_member", accountId: TEAM });
    expect(mockSetActiveAccountId).not.toHaveBeenCalled();
  });
});

describe("setActiveAccount → resolveActiveAccount round-trip (11d)", () => {
  it("resolveActiveAccount sees the account set by setActiveAccount", async () => {
    // Stateful active_account_id shared by set + get.
    let storedActive: string | null = null;
    mockSetActiveAccountId.mockImplementation(async (_u: string, a: string) => {
      storedActive = a;
    });
    mockGetActiveAccountId.mockImplementation(async () => storedActive);
    // TEAM is a member + active account throughout.
    mockIsMember.mockResolvedValue(true);
    mockGetById.mockResolvedValue(acct(TEAM));

    const setRes = await setActiveAccount(USER, TEAM);
    expect(setRes.ok).toBe(true);
    expect(storedActive).toBe(TEAM);

    // No explicit id → the resolver honors the freshly-stored active account.
    const resolved = await resolveActiveAccount(USER);
    expect(resolved).toMatchObject({ ok: true, source: "active", accountId: TEAM });
    expect(mockClearActiveAccountId).not.toHaveBeenCalled();
  });
});

describe("resolver wiring is gate-only; background paths never use it (11c)", () => {
  // Walk production source dirs. The resolver is FOREGROUND-gate-only: it may be
  // called by the user-session entry points that need the caller's active
  // account — the route gate (app/api/workflows/_shared.ts) and the SSR
  // workflows page (app/workflows/page.tsx, which must read from the SAME
  // account the client folder/trash APIs mutate). Anything else (and ANY
  // background/cron/webhook/trigger path in particular) referencing it is a leak.
  const ROOT = process.cwd();
  const PROD_DIRS = ["app", "lib", "components", "repositories", "core", "integrations", "services"];
  const DEF_FILE = resolve(ROOT, "services/accounts/activeAccount.ts");
  const GATE_FILE = resolve(ROOT, "app/api/workflows/_shared.ts");
  // Foreground SSR pages that server-render account-scoped lists must read from
  // the SAME active account the client APIs mutate (4.WORKFLOW-FOLDERS-6 /
  // 4.ACCOUNT-SWITCHER-1): /workflows, /apps, /runs. They are the SSR siblings
  // of the route gate. Background paths are still forbidden (see below).
  const FOREGROUND_PAGE_FILES = [
    resolve(ROOT, "app/workflows/page.tsx"),
    resolve(ROOT, "app/apps/page.tsx"),
    resolve(ROOT, "app/runs/page.tsx"),
    // Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-5 — Templates SSR page resolves the active
    // account to scope the "Your templates" list + the use/fork target account.
    resolve(ROOT, "app/templates/page.tsx"),
  ];
  // CS-8: the NotificationBell credential-request notice helper resolves the
  // caller's active account to count their pending reassignment requests. It is
  // imported ONLY by foreground SSR pages (the bell data load) and never by a
  // background path, so it belongs with the foreground gates — the invariant this
  // test protects (no cron/webhook/trigger use of active-account state) is intact.
  const FOREGROUND_HELPER_FILES = [
    resolve(ROOT, "app/notifications/credentialRequestNotice.ts"),
  ];
  // OAUTH-ACCT-BIND — the OAuth connect route is a FOREGROUND, user-session entry
  // point (the user clicks "Connect"). It resolves the caller's active account at
  // connect-start to bind it into the signed OAuth state, so the new integration
  // lands on the account the user is actually on (the bug: it used to default to
  // personal). The dispatcher itself never resolves the active account — the route
  // passes the resolved id in. This is a foreground gate, NOT a background path.
  const FOREGROUND_ROUTE_FILES = [
    resolve(ROOT, "app/api/integrations/oauth/[provider]/connect/route.ts"),
  ];
  // resolveActiveAccount's production callers — the foreground gates + helpers only.
  const RESOLVER_ALLOWED = new Set([
    DEF_FILE,
    GATE_FILE,
    ...FOREGROUND_PAGE_FILES,
    ...FOREGROUND_HELPER_FILES,
    ...FOREGROUND_ROUTE_FILES,
  ]);
  // Background entry points must NEVER consult active-account state (default
  // OR set): cron/webhook/polling resolve the workflow's owning account instead.
  const BACKGROUND_DIRS = ["app/api/cron", "app/api/webhooks", "services/triggers"];

  // The resolver (read path) — only the gate may call it.
  const RESOLVER_REF = /\bresolveActiveAccount\b/;
  // Any active-account machinery (read OR write) — forbidden in background paths.
  const ACTIVE_ACCOUNT_REF =
    /\bresolveActiveAccount\b|\bsetActiveAccount\b|services\/accounts\/activeAccount|api\/account\/active/;

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

  it("only the foreground gates (route gate + SSR pages) call resolveActiveAccount", () => {
    const offenders: string[] = [];
    for (const d of PROD_DIRS) {
      for (const file of walk(resolve(ROOT, d))) {
        if (RESOLVER_ALLOWED.has(resolve(file))) continue;
        if (RESOLVER_REF.test(readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("NO background path (cron / webhook / trigger) imports or uses the resolver or set-active", () => {
    const offenders: string[] = [];
    for (const d of BACKGROUND_DIRS) {
      for (const file of walk(resolve(ROOT, d))) {
        if (ACTIVE_ACCOUNT_REF.test(readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
