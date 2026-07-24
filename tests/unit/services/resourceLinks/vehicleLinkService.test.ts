/**
 * @jest-environment node
 *
 * Vehicle-link management service (5.TRUCK-BRIDGE-1 CS-4).
 *
 * REAL: the service, the real `requireAccountRole` authorization helper, the real
 * `isAccountFrozen` guard, the real `CreateVehicleLinkBodySchema`, and the real
 * row→view projection.
 *
 * MOCKED: only the database boundaries — the CS-1 resource-link repository (an
 * in-memory table that actually EVALUATES the account / archived predicates, so
 * isolation is proven as semantics, not as recorded filter calls), the membership
 * repository (roles + identities), and the accounts repository (freeze status).
 *
 * Business rules protected:
 *   - owner + admin may create / replace / archive; member may read only.
 *   - a non-member may do nothing, and learns nothing.
 *   - account A never reads or mutates account B's links, even with B's link id.
 *   - manual pairing writes matchBasis 'manual', both labels, and both
 *     provenance ids — and never an account id from the caller.
 *   - source conflicts require EXPLICIT replaceExisting; target conflicts refuse
 *     outright.
 *   - archived links disappear from the active list and free the pair for re-link.
 *   - the view carries no accountId, no raw user id, no row internals.
 */
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import type { MembershipRole } from "@/contracts/accounts";

// ── DB boundary: the CS-1 repository, backed by a predicate-evaluating store ──
const store: ResourceLinkDTO[] = [];
let insertCalls: unknown[] = [];
let nextId = 1;

const repo = {
  listLinks: jest.fn(async (accountId: string, kind: string) =>
    store
      .filter((l) => l.accountId === accountId && l.resourceKind === kind)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  ),
  createConfirmedLink: jest.fn(async (input: Record<string, unknown>) => {
    insertCalls.push(input);
    const accountId = input.accountId as string;
    const source = input.sourceExternalId as string;
    const target = input.targetExternalId as string;
    // The two PARTIAL unique indexes, honored for real (active rows only).
    const clash = store.find(
      (l) =>
        l.accountId === accountId &&
        l.archivedAt === null &&
        (l.sourceExternalId === source || l.targetExternalId === target),
    );
    if (clash) {
      throw new Error(
        "account_resource_links.createConfirmedLink failed: duplicate key value violates unique constraint",
      );
    }
    const row: ResourceLinkDTO = {
      id: `link-${nextId++}`,
      accountId,
      resourceKind: "vehicle",
      sourceProvider: input.sourceProvider as string,
      sourceExternalId: source,
      targetProvider: input.targetProvider as string,
      targetExternalId: target,
      sourceLabel: (input.sourceLabel as string | null) ?? null,
      targetLabel: (input.targetLabel as string | null) ?? null,
      matchBasis: input.matchBasis as ResourceLinkDTO["matchBasis"],
      createdByUserId: (input.createdByUserId as string | null) ?? null,
      confirmedByUserId: (input.confirmedByUserId as string | null) ?? null,
      confirmedAt: input.confirmedAt as string,
      archivedAt: null,
      createdAt: new Date(2026, 6, 24, 12, nextId).toISOString(),
      updatedAt: new Date(2026, 6, 24, 12, nextId).toISOString(),
    };
    store.push(row);
    return row;
  }),
  archiveLink: jest.fn(async (accountId: string, linkId: string, archivedAt: string) => {
    // The repository's real predicate set: id AND account AND still-active.
    const row = store.find(
      (l) => l.id === linkId && l.accountId === accountId && l.archivedAt === null,
    );
    if (!row) return null;
    const updated = { ...row, archivedAt };
    store[store.indexOf(row)] = updated;
    return updated;
  }),
};

jest.mock("@/repositories/resourceLinks/accountResourceLinks", () => ({
  listLinks: (...a: unknown[]) => (repo.listLinks as (...x: unknown[]) => unknown)(...a),
  createConfirmedLink: (...a: unknown[]) =>
    (repo.createConfirmedLink as (...x: unknown[]) => unknown)(...a),
  archiveLink: (...a: unknown[]) => (repo.archiveLink as (...x: unknown[]) => unknown)(...a),
}));

// ── DB boundary: memberships (roles + safe identities) ──────────────────────
const roles = new Map<string, MembershipRole>();
const roleKey = (accountId: string, userId: string) => `${accountId}:${userId}`;

/**
 * Display names deliberately do NOT embed the user id, so a no-leak assertion
 * ("the raw user id never appears in the view") tests the service rather than
 * colliding with the fixture.
 */
const DISPLAY_NAMES = new Map<string, string>();

jest.mock("@/repositories/accountMemberships", () => ({
  getRole: async (accountId: string, userId: string) =>
    roles.get(`${accountId}:${userId}`) ?? null,
  listMemberIdentities: async (accountId: string) =>
    [...roles.keys()]
      .filter((k) => k.startsWith(`${accountId}:`))
      .map((k) => {
        const userId = k.slice(accountId.length + 1);
        return {
          userId,
          email: `${DISPLAY_NAMES.get(userId) ?? "someone"}@example.test`,
          displayName: DISPLAY_NAMES.get(userId) ?? null,
        };
      }),
}));

// ── DB boundary: accounts (freeze status) ───────────────────────────────────
const frozenAccounts = new Set<string>();
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: async (accountId: string) =>
    frozenAccounts.has(accountId) ? "pending_deletion" : "active",
}));

import {
  listVehicleLinks,
  createVehicleLink,
  archiveVehicleLink,
  unlinkedVehicles,
} from "@/services/resourceLinks/vehicleLinkService";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const ADMIN_A = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const OWNER_B = "44444444-4444-4444-8444-444444444444";
const OUTSIDER = "55555555-5555-4555-8555-555555555555";

const NOW = "2026-07-24T12:00:00.000Z";
const MOTIVE_ID = "motive-veh-88231";
const FLEETIO_ID = "42";

function body(over: Record<string, unknown> = {}) {
  return {
    sourceVehicleId: MOTIVE_ID,
    sourceLabel: "Unit 104",
    targetVehicleId: FLEETIO_ID,
    targetLabel: "Truck 104",
    ...over,
  };
}

beforeEach(() => {
  store.length = 0;
  insertCalls = [];
  nextId = 1;
  roles.clear();
  frozenAccounts.clear();
  roles.set(roleKey(ACCOUNT_A, OWNER_A), "owner");
  roles.set(roleKey(ACCOUNT_A, ADMIN_A), "admin");
  roles.set(roleKey(ACCOUNT_A, MEMBER_A), "member");
  roles.set(roleKey(ACCOUNT_B, OWNER_B), "owner");
  DISPLAY_NAMES.clear();
  DISPLAY_NAMES.set(OWNER_A, "Dana Owner");
  DISPLAY_NAMES.set(ADMIN_A, "Alex Admin");
  DISPLAY_NAMES.set(MEMBER_A, "Sam Member");
  DISPLAY_NAMES.set(OWNER_B, "Bee Owner");
  jest.clearAllMocks();
});

describe("permissions — owner/admin may mutate, member may read", () => {
  it("an OWNER can create a link", async () => {
    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("an ADMIN can create and archive a link", async () => {
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: ADMIN_A,
      body: body(),
      now: NOW,
    });
    expect(created.ok).toBe(true);
    const linkId = created.ok ? created.link.id : "";
    expect(
      await archiveVehicleLink({
        accountId: ACCOUNT_A,
        actingUserId: ADMIN_A,
        linkId,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it("a MEMBER can READ links", async () => {
    await createVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: body(), now: NOW });
    const result = await listVehicleLinks({ accountId: ACCOUNT_A, actingUserId: MEMBER_A });
    expect(result.ok).toBe(true);
    expect(result.ok && result.links).toHaveLength(1);
  });

  it("a MEMBER cannot create — and nothing is written", async () => {
    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: MEMBER_A,
      body: body(),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(repo.createConfirmedLink).not.toHaveBeenCalled();
    expect(store).toHaveLength(0);
  });

  it("a MEMBER cannot archive — and nothing is mutated", async () => {
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    const linkId = created.ok ? created.link.id : "";
    expect(
      await archiveVehicleLink({ accountId: ACCOUNT_A, actingUserId: MEMBER_A, linkId }),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(repo.archiveLink).not.toHaveBeenCalled();
    expect(store[0]!.archivedAt).toBeNull();
  });

  it("a NON-MEMBER cannot read, create, or archive", async () => {
    await createVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: body(), now: NOW });
    const linkId = store[0]!.id;

    expect(await listVehicleLinks({ accountId: ACCOUNT_A, actingUserId: OUTSIDER })).toEqual({
      ok: false,
      reason: "not_member",
    });
    expect(
      await createVehicleLink({
        accountId: ACCOUNT_A,
        actingUserId: OUTSIDER,
        body: body({ sourceVehicleId: "other" }),
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "not_member" });
    expect(
      await archiveVehicleLink({ accountId: ACCOUNT_A, actingUserId: OUTSIDER, linkId }),
    ).toEqual({ ok: false, reason: "not_member" });
  });

  it("refuses every mutation on a FROZEN account (reads still work)", async () => {
    frozenAccounts.add(ACCOUNT_A);
    expect(
      await createVehicleLink({
        accountId: ACCOUNT_A,
        actingUserId: OWNER_A,
        body: body(),
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "account_frozen" });
    expect(await listVehicleLinks({ accountId: ACCOUNT_A, actingUserId: OWNER_A })).toEqual({
      ok: true,
      links: [],
    });
  });

  it("authorizes on membership role ONLY — never on who created or confirmed a link", async () => {
    // OWNER_A creates it; ADMIN_A (a different user) can still archive it.
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    const linkId = created.ok ? created.link.id : "";
    expect(store[0]!.confirmedByUserId).toBe(OWNER_A);
    expect(
      await archiveVehicleLink({ accountId: ACCOUNT_A, actingUserId: ADMIN_A, linkId }),
    ).toEqual({ ok: true });
  });
});

describe("manual pairing stores the correct confirmed link", () => {
  it("writes matchBasis 'manual', both labels, provenance, and the server's account id", async () => {
    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      accountId: ACCOUNT_A,
      resourceKind: "vehicle",
      sourceProvider: "motive",
      sourceExternalId: MOTIVE_ID,
      targetProvider: "fleetio",
      targetExternalId: FLEETIO_ID,
      sourceLabel: "Unit 104",
      targetLabel: "Truck 104",
      matchBasis: "manual",
      createdByUserId: OWNER_A,
      confirmedByUserId: OWNER_A,
      confirmedAt: NOW,
    });
  });

  it("IGNORES a caller-supplied account id, match basis, or confirmedAt (strict body)", async () => {
    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body({ accountId: ACCOUNT_B, matchBasis: "suggested_vin", confirmedAt: "1999-01-01T00:00:00Z" }),
      now: NOW,
    });
    // `.strict()` makes each of those a rejected body, not a silently-honored field.
    expect(result).toEqual({ ok: false, reason: "invalid_input" });
    expect(repo.createConfirmedLink).not.toHaveBeenCalled();
  });

  it("rejects a blank or missing vehicle id before touching the repository", async () => {
    for (const bad of [
      body({ sourceVehicleId: "   " }),
      body({ targetVehicleId: "" }),
      { targetVehicleId: FLEETIO_ID },
      { sourceVehicleId: MOTIVE_ID },
    ]) {
      expect(
        await createVehicleLink({
          accountId: ACCOUNT_A,
          actingUserId: OWNER_A,
          body: bad,
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "invalid_input" });
    }
    expect(repo.createConfirmedLink).not.toHaveBeenCalled();
  });

  it("returns a view with NO accountId, NO raw user id, and NO row internals", async () => {
    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.link).sort()).toEqual([
      "confirmedAt",
      "confirmedByLabel",
      "id",
      "matchBasis",
      "sourceLabel",
      "sourceVehicleId",
      "targetLabel",
      "targetVehicleId",
    ]);
    const blob = JSON.stringify(result.link);
    expect(blob).not.toContain(ACCOUNT_A);
    expect(blob).not.toContain(OWNER_A);
    // The confirmer appears as a display label, never as a user id.
    expect(result.link.confirmedByLabel).toBe("Dana Owner");
  });
});

describe("conflicts are handled safely", () => {
  it("a SOURCE conflict is refused and names the current target — nothing is overwritten", async () => {
    await createVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: body(), now: NOW });

    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body({ targetVehicleId: "907", targetLabel: "Rig 7" }),
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("source_already_linked");
    expect(result.ok === false && result.conflict).toEqual({
      sourceLabel: "Unit 104",
      targetLabel: "Truck 104",
    });
    // The original link is untouched and still active.
    expect(store).toHaveLength(1);
    expect(store[0]!.targetExternalId).toBe(FLEETIO_ID);
    expect(store[0]!.archivedAt).toBeNull();
  });

  it("replaceExisting: true archives the old link and creates the new one", async () => {
    await createVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: body(), now: NOW });

    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body({ targetVehicleId: "907", targetLabel: "Rig 7", replaceExisting: true }),
      now: "2026-07-25T09:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.link.targetVehicleId).toBe("907");

    // Old row archived (not deleted — history survives), new row active.
    const archived = store.filter((l) => l.archivedAt !== null);
    const active = store.filter((l) => l.archivedAt === null);
    expect(archived).toHaveLength(1);
    expect(archived[0]!.targetExternalId).toBe(FLEETIO_ID);
    expect(active).toHaveLength(1);
    expect(active[0]!.targetExternalId).toBe("907");

    // The Linked list shows exactly the new mapping.
    const list = await listVehicleLinks({ accountId: ACCOUNT_A, actingUserId: OWNER_A });
    expect(list.ok && list.links.map((l) => l.targetVehicleId)).toEqual(["907"]);
  });

  it("a TARGET conflict is refused OUTRIGHT — replaceExisting does not override it", async () => {
    await createVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: body(), now: NOW });

    for (const extra of [{}, { replaceExisting: true }]) {
      const result = await createVehicleLink({
        accountId: ACCOUNT_A,
        actingUserId: OWNER_A,
        body: body({ sourceVehicleId: "motive-veh-99999", sourceLabel: "Unit 205", ...extra }),
        now: NOW,
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe("target_already_linked");
      // Names the OTHER Motive vehicle, so the user knows what to remove.
      expect(result.ok === false && result.conflict?.sourceLabel).toBe("Unit 104");
    }
    // The other truck's mapping is never auto-archived to satisfy this one.
    expect(store).toHaveLength(1);
    expect(store[0]!.archivedAt).toBeNull();
  });

  it("re-confirming the SAME pair is idempotent success, not a conflict", async () => {
    const first = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    const again = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    expect(again.ok).toBe(true);
    if (!first.ok || !again.ok) throw new Error("expected both confirms to succeed");
    // The SAME row comes back — no second insert, no conflict.
    expect(again.link.id).toBe(first.link.id);
    expect(store).toHaveLength(1);
    expect(repo.createConfirmedLink).toHaveBeenCalledTimes(1);
  });

  it("a unique-index RACE surfaces as a safe conflict, never a raw DB error", async () => {
    // Simulate a concurrent insert landing between the pre-check and the write.
    repo.createConfirmedLink.mockImplementationOnce(async () => {
      throw new Error(
        'account_resource_links.createConfirmedLink failed: duplicate key value violates unique constraint "account_resource_links_source_unique"',
      );
    });
    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(JSON.stringify(result)).not.toMatch(/unique constraint|duplicate key/i);
  });
});

describe("archive / re-link", () => {
  it("an archived link disappears from the active list", async () => {
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    const linkId = created.ok ? created.link.id : "";
    await archiveVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, linkId, now: NOW });

    const list = await listVehicleLinks({ accountId: ACCOUNT_A, actingUserId: OWNER_A });
    expect(list.ok && list.links).toEqual([]);
    // Archived, NOT deleted — the row survives so a past run stays explainable.
    expect(store).toHaveLength(1);
    expect(store[0]!.archivedAt).toBe(NOW);
  });

  it("re-linking the same vehicle AFTER archival succeeds", async () => {
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    await archiveVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      linkId: created.ok ? created.link.id : "",
      now: NOW,
    });

    const relinked = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body({ targetVehicleId: "907", targetLabel: "Rig 7" }),
      now: "2026-07-26T09:00:00.000Z",
    });
    expect(relinked.ok).toBe(true);
    const list = await listVehicleLinks({ accountId: ACCOUNT_A, actingUserId: OWNER_A });
    expect(list.ok && list.links.map((l) => l.targetVehicleId)).toEqual(["907"]);
  });

  it("archiving twice returns not_found the second time (no timestamp move)", async () => {
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    const linkId = created.ok ? created.link.id : "";
    expect(
      await archiveVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, linkId, now: NOW }),
    ).toEqual({ ok: true });
    expect(
      await archiveVehicleLink({
        accountId: ACCOUNT_A,
        actingUserId: OWNER_A,
        linkId,
        now: "2026-08-01T00:00:00.000Z",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(store[0]!.archivedAt).toBe(NOW);
  });

  it("an unknown link id returns not_found", async () => {
    expect(
      await archiveVehicleLink({
        accountId: ACCOUNT_A,
        actingUserId: OWNER_A,
        linkId: "99999999-9999-4999-8999-999999999999",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("account isolation", () => {
  it("account A's list never contains account B's links", async () => {
    await createVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: body(), now: NOW });
    await createVehicleLink({
      accountId: ACCOUNT_B,
      actingUserId: OWNER_B,
      body: body({ targetVehicleId: "907", targetLabel: "B-Fleet Rig 7" }),
      now: NOW,
    });

    const a = await listVehicleLinks({ accountId: ACCOUNT_A, actingUserId: OWNER_A });
    const b = await listVehicleLinks({ accountId: ACCOUNT_B, actingUserId: OWNER_B });
    expect(a.ok && a.links.map((l) => l.targetVehicleId)).toEqual([FLEETIO_ID]);
    expect(b.ok && b.links.map((l) => l.targetVehicleId)).toEqual(["907"]);
    expect(JSON.stringify(a.ok && a.links)).not.toContain("B-Fleet Rig 7");
  });

  it("the SAME Motive id may be linked in both accounts, to different targets", async () => {
    expect(
      (await createVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: body(), now: NOW })).ok,
    ).toBe(true);
    expect(
      (
        await createVehicleLink({
          accountId: ACCOUNT_B,
          actingUserId: OWNER_B,
          body: body({ targetVehicleId: "907" }),
          now: NOW,
        })
      ).ok,
    ).toBe(true);
  });

  it("account B's owner cannot archive account A's link, even holding its id", async () => {
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    const aLinkId = created.ok ? created.link.id : "";

    // Naming A's account → not a member. Naming their OWN account with A's link
    // id → not_found (the repository's account predicate). Neither reveals a thing.
    expect(
      await archiveVehicleLink({ accountId: ACCOUNT_A, actingUserId: OWNER_B, linkId: aLinkId }),
    ).toEqual({ ok: false, reason: "not_member" });
    expect(
      await archiveVehicleLink({ accountId: ACCOUNT_B, actingUserId: OWNER_B, linkId: aLinkId }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(store[0]!.archivedAt).toBeNull();
  });

  it("a cross-account link id is indistinguishable from one that never existed", async () => {
    const created = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body(),
      now: NOW,
    });
    const real = await archiveVehicleLink({
      accountId: ACCOUNT_B,
      actingUserId: OWNER_B,
      linkId: created.ok ? created.link.id : "",
    });
    const fake = await archiveVehicleLink({
      accountId: ACCOUNT_B,
      actingUserId: OWNER_B,
      linkId: "99999999-9999-4999-8999-999999999999",
    });
    expect(real).toEqual(fake);
  });

  it("A's target conflict check never consults B's links", async () => {
    // B claims Fleetio 42; A must still be free to claim its own Fleetio 42.
    await createVehicleLink({ accountId: ACCOUNT_B, actingUserId: OWNER_B, body: body(), now: NOW });
    const result = await createVehicleLink({
      accountId: ACCOUNT_A,
      actingUserId: OWNER_A,
      body: body({ sourceVehicleId: "motive-veh-different" }),
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });
});

describe("unlinkedVehicles — pure set difference", () => {
  const vehicles = [
    { value: "motive-1", label: "Unit 101" },
    { value: "motive-2", label: "Unit 102" },
    { value: "motive-3", label: "Unit 103" },
  ];

  it("excludes every vehicle with an active link", () => {
    const links = [
      { sourceVehicleId: "motive-2" },
      { sourceVehicleId: "motive-3" },
    ] as never;
    expect(unlinkedVehicles(vehicles, links)).toEqual([
      { sourceVehicleId: "motive-1", label: "Unit 101" },
    ]);
  });

  it("returns everything when nothing is linked, and nothing when all are", () => {
    expect(unlinkedVehicles(vehicles, [])).toHaveLength(3);
    expect(
      unlinkedVehicles(
        vehicles,
        vehicles.map((v) => ({ sourceVehicleId: v.value })) as never,
      ),
    ).toEqual([]);
  });

  it("makes no provider call and mutates no input", () => {
    const frozen = [...vehicles];
    unlinkedVehicles(vehicles, [{ sourceVehicleId: "motive-1" }] as never);
    expect(vehicles).toEqual(frozen);
  });
});
