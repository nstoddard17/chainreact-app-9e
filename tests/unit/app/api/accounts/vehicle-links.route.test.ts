/**
 * @jest-environment node
 *
 * Route tests for the Vehicle Links API (5.TRUCK-BRIDGE-1 CS-4):
 *   GET/POST  /api/accounts/[id]/vehicle-links
 *   DELETE    /api/accounts/[id]/vehicle-links/[linkId]
 *   GET       /api/accounts/[id]/vehicle-options
 *
 * REAL: the routes, the REAL `requireAccountRole` authorization helper, the REAL
 * `vehicleLinkService` (authorization + conflicts + projection), the REAL
 * `isAccountFrozen` guard, the REAL flag accessor, and the REAL
 * `fleetio:vehicles` / `motive:vehicles` resolver registry lookup.
 *
 * MOCKED: only boundaries — Supabase auth (the session), the CS-1 link
 * repository, the memberships repository, the accounts repository, and the
 * integrations repository. No provider HTTP call is ever made (asserted).
 *
 * Load-bearing checks: flag-OFF 404s before any gate, owner/admin-only
 * mutations, member reads, cross-account refusal, conflict → 409 with safe
 * copy, and no credential/DB text in any response body.
 */
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import type { MembershipRole } from "@/contracts/accounts";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

// ── DB boundary: the CS-1 link repository (predicate-evaluating store) ──────
const store: ResourceLinkDTO[] = [];
let nextId = 1;

jest.mock("@/repositories/resourceLinks/accountResourceLinks", () => ({
  listLinks: async (accountId: string, kind: string) =>
    store.filter((l) => l.accountId === accountId && l.resourceKind === kind),
  createConfirmedLink: async (input: Record<string, unknown>) => {
    const row: ResourceLinkDTO = {
      id: `link-${nextId++}`,
      accountId: input.accountId as string,
      resourceKind: "vehicle",
      sourceProvider: input.sourceProvider as string,
      sourceExternalId: input.sourceExternalId as string,
      targetProvider: input.targetProvider as string,
      targetExternalId: input.targetExternalId as string,
      sourceLabel: (input.sourceLabel as string | null) ?? null,
      targetLabel: (input.targetLabel as string | null) ?? null,
      matchBasis: input.matchBasis as ResourceLinkDTO["matchBasis"],
      createdByUserId: (input.createdByUserId as string | null) ?? null,
      confirmedByUserId: (input.confirmedByUserId as string | null) ?? null,
      confirmedAt: input.confirmedAt as string,
      archivedAt: null,
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    };
    store.push(row);
    return row;
  },
  archiveLink: async (accountId: string, linkId: string, archivedAt: string) => {
    const row = store.find(
      (l) => l.id === linkId && l.accountId === accountId && l.archivedAt === null,
    );
    if (!row) return null;
    const updated = { ...row, archivedAt };
    store[store.indexOf(row)] = updated;
    return updated;
  },
}));

// ── DB boundary: memberships ────────────────────────────────────────────────
const roles = new Map<string, MembershipRole>();
jest.mock("@/repositories/accountMemberships", () => ({
  getRole: async (accountId: string, userId: string) =>
    roles.get(`${accountId}:${userId}`) ?? null,
  listMemberIdentities: async () => [],
}));

// ── DB boundary: accounts (freeze) ──────────────────────────────────────────
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: async () => "active",
}));

// ── DB boundary: integrations (for the vehicle-options route) ───────────────
const mockGetActive = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
}));

import { GET as listLinksRoute, POST as createLinkRoute } from "@/app/api/accounts/[id]/vehicle-links/route";
import { DELETE as archiveLinkRoute } from "@/app/api/accounts/[id]/vehicle-links/[linkId]/route";
import { GET as vehicleOptionsRoute } from "@/app/api/accounts/[id]/vehicle-options/route";
import { RESOURCE_LINKS_UI_FLAG } from "@/services/resourceLinks/flags";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "55555555-5555-4555-8555-555555555555";

const ORIGINAL_FETCH = global.fetch;
let fetchSpy: jest.Mock;

function signedInAs(userId: string) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId, email: "u@example.test" } },
    error: null,
  });
}
function params(accountId = ACCOUNT_A) {
  return { params: Promise.resolve({ id: accountId }) };
}
function linkParams(linkId: string, accountId = ACCOUNT_A) {
  return { params: Promise.resolve({ id: accountId, linkId }) };
}
function getReq(url = "https://x/api/accounts/a/vehicle-links") {
  return new Request(url);
}
function postReq(body: unknown) {
  return new Request("https://x/api/accounts/a/vehicle-links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  sourceVehicleId: "motive-veh-88231",
  sourceLabel: "Unit 104",
  targetVehicleId: "42",
  targetLabel: "Truck 104",
};

beforeEach(() => {
  process.env[RESOURCE_LINKS_UI_FLAG] = "true";
  store.length = 0;
  nextId = 1;
  roles.clear();
  roles.set(`${ACCOUNT_A}:${OWNER_A}`, "owner");
  roles.set(`${ACCOUNT_A}:${MEMBER_A}`, "member");
  roles.set(`${ACCOUNT_B}:${OUTSIDER}`, "owner");
  mockGetUser.mockReset();
  mockGetActive.mockReset();
  fetchSpy = jest.fn();
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterEach(() => {
  delete process.env[RESOURCE_LINKS_UI_FLAG];
  global.fetch = ORIGINAL_FETCH;
});

describe("feature flag gates the whole surface", () => {
  it("flag OFF ⇒ 404 on every route, BEFORE auth or any role check", async () => {
    delete process.env[RESOURCE_LINKS_UI_FLAG];
    signedInAs(OWNER_A);

    for (const res of [
      await listLinksRoute(getReq(), params()),
      await createLinkRoute(postReq(VALID_BODY), params()),
      await archiveLinkRoute(getReq(), linkParams("link-1")),
      await vehicleOptionsRoute(getReq("https://x/o?provider=motive"), params()),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found", code: "NOT_FOUND" });
    }
    // Nothing was written and no session was even consulted for the answer.
    expect(store).toHaveLength(0);
  });

  it('flag set to anything other than the string "true" stays OFF', async () => {
    for (const value of ["1", "TRUE", "yes", ""]) {
      process.env[RESOURCE_LINKS_UI_FLAG] = value;
      signedInAs(OWNER_A);
      expect((await listLinksRoute(getReq(), params())).status).toBe(404);
    }
  });

  it("flag ON exposes the surface to a member", async () => {
    signedInAs(MEMBER_A);
    const res = await listLinksRoute(getReq(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ links: [], canManage: false });
  });
});

describe("GET /api/accounts/[id]/vehicle-links", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await listLinksRoute(getReq(), params())).status).toBe(401);
  });

  it("a member reads the links and gets canManage: false", async () => {
    signedInAs(OWNER_A);
    await createLinkRoute(postReq(VALID_BODY), params());

    signedInAs(MEMBER_A);
    const res = await listLinksRoute(getReq(), params());
    const body = (await res.json()) as { links: unknown[]; canManage: boolean };
    expect(res.status).toBe(200);
    expect(body.links).toHaveLength(1);
    expect(body.canManage).toBe(false);
  });

  it("an owner gets canManage: true", async () => {
    signedInAs(OWNER_A);
    const body = (await (await listLinksRoute(getReq(), params())).json()) as {
      canManage: boolean;
    };
    expect(body.canManage).toBe(true);
  });

  it("a NON-MEMBER gets 403 and no link data", async () => {
    signedInAs(OWNER_A);
    await createLinkRoute(postReq(VALID_BODY), params());

    signedInAs(OUTSIDER);
    const res = await listLinksRoute(getReq(), params());
    expect(res.status).toBe(403);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("NOT_ACCOUNT_MEMBER");
    expect(text).not.toContain("Truck 104");
    expect(text).not.toContain("motive-veh-88231");
  });

  it("the response carries no accountId, user id, or credential", async () => {
    signedInAs(OWNER_A);
    await createLinkRoute(postReq(VALID_BODY), params());
    const text = JSON.stringify(await (await listLinksRoute(getReq(), params())).json());
    expect(text).not.toContain(ACCOUNT_A);
    expect(text).not.toContain(OWNER_A);
    expect(text).not.toMatch(/token|apiKey|api_key|secret/i);
  });
});

describe("POST /api/accounts/[id]/vehicle-links", () => {
  it("an owner creates the link (201) with matchBasis manual", async () => {
    signedInAs(OWNER_A);
    const res = await createLinkRoute(postReq(VALID_BODY), params());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { link: Record<string, unknown> };
    expect(body.link.sourceVehicleId).toBe("motive-veh-88231");
    expect(body.link.targetVehicleId).toBe("42");
    expect(body.link.matchBasis).toBe("manual");
    expect(store[0]!.accountId).toBe(ACCOUNT_A);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a MEMBER gets 403 FORBIDDEN and nothing is written", async () => {
    signedInAs(MEMBER_A);
    const res = await createLinkRoute(postReq(VALID_BODY), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(store).toHaveLength(0);
  });

  it("a NON-MEMBER gets 403 NOT_ACCOUNT_MEMBER and nothing is written", async () => {
    signedInAs(OUTSIDER);
    const res = await createLinkRoute(postReq(VALID_BODY), params());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NOT_ACCOUNT_MEMBER");
    expect(store).toHaveLength(0);
  });

  it("a caller-supplied accountId in the BODY is rejected (400), never honored", async () => {
    signedInAs(OWNER_A);
    const res = await createLinkRoute(
      postReq({ ...VALID_BODY, accountId: ACCOUNT_B }),
      params(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_INPUT");
    expect(store).toHaveLength(0);
  });

  it("400 on a malformed JSON body", async () => {
    signedInAs(OWNER_A);
    const res = await createLinkRoute(
      new Request("https://x/p", { method: "POST", body: "not json" }),
      params(),
    );
    expect(res.status).toBe(400);
  });

  it("a SOURCE conflict is 409 SOURCE_ALREADY_LINKED and names the current target", async () => {
    signedInAs(OWNER_A);
    await createLinkRoute(postReq(VALID_BODY), params());
    const res = await createLinkRoute(
      postReq({ ...VALID_BODY, targetVehicleId: "907", targetLabel: "Rig 7" }),
      params(),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; conflict: Record<string, unknown> };
    expect(body.code).toBe("SOURCE_ALREADY_LINKED");
    expect(body.conflict.targetLabel).toBe("Truck 104");
    // The existing mapping was NOT silently replaced.
    expect(store.filter((l) => l.archivedAt === null)).toHaveLength(1);
    expect(store[0]!.targetExternalId).toBe("42");
  });

  it("replaceExisting: true succeeds and archives the previous link", async () => {
    signedInAs(OWNER_A);
    await createLinkRoute(postReq(VALID_BODY), params());
    const res = await createLinkRoute(
      postReq({
        ...VALID_BODY,
        targetVehicleId: "907",
        targetLabel: "Rig 7",
        replaceExisting: true,
      }),
      params(),
    );
    expect(res.status).toBe(201);
    expect(store.filter((l) => l.archivedAt !== null)).toHaveLength(1);
    expect(store.filter((l) => l.archivedAt === null)[0]!.targetExternalId).toBe("907");
  });

  it("a TARGET conflict is 409 TARGET_ALREADY_LINKED and names the other Motive vehicle", async () => {
    signedInAs(OWNER_A);
    await createLinkRoute(postReq(VALID_BODY), params());
    const res = await createLinkRoute(
      postReq({ ...VALID_BODY, sourceVehicleId: "motive-veh-99999", sourceLabel: "Unit 205" }),
      params(),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; conflict: Record<string, unknown> };
    expect(body.code).toBe("TARGET_ALREADY_LINKED");
    expect(body.conflict.sourceLabel).toBe("Unit 104");
  });
});

describe("DELETE /api/accounts/[id]/vehicle-links/[linkId]", () => {
  async function seedLink(): Promise<string> {
    signedInAs(OWNER_A);
    const res = await createLinkRoute(postReq(VALID_BODY), params());
    return ((await res.json()) as { link: { id: string } }).link.id;
  }

  it("an owner archives the link (200) and it leaves the active list", async () => {
    const linkId = await seedLink();
    const res = await archiveLinkRoute(getReq(), linkParams(linkId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ archived: true });

    const list = (await (await listLinksRoute(getReq(), params())).json()) as {
      links: unknown[];
    };
    expect(list.links).toEqual([]);
    // Archived, not deleted.
    expect(store).toHaveLength(1);
    expect(store[0]!.archivedAt).not.toBeNull();
  });

  it("the vehicle can be RE-LINKED after archival", async () => {
    const linkId = await seedLink();
    await archiveLinkRoute(getReq(), linkParams(linkId));
    const res = await createLinkRoute(
      postReq({ ...VALID_BODY, targetVehicleId: "907", targetLabel: "Rig 7" }),
      params(),
    );
    expect(res.status).toBe(201);
  });

  it("a MEMBER gets 403 and the link stays active", async () => {
    const linkId = await seedLink();
    signedInAs(MEMBER_A);
    const res = await archiveLinkRoute(getReq(), linkParams(linkId));
    expect(res.status).toBe(403);
    expect(store[0]!.archivedAt).toBeNull();
  });

  it("another account's owner gets 403 naming A, and 404 naming their OWN account", async () => {
    const linkId = await seedLink();
    signedInAs(OUTSIDER);

    expect((await archiveLinkRoute(getReq(), linkParams(linkId, ACCOUNT_A))).status).toBe(403);
    const own = await archiveLinkRoute(getReq(), linkParams(linkId, ACCOUNT_B));
    expect(own.status).toBe(404);
    // A's link is untouched, and the 404 body reveals nothing about it.
    expect(store[0]!.archivedAt).toBeNull();
    const text = JSON.stringify(await own.json());
    expect(text).not.toContain("Truck 104");
    expect(text).not.toContain("motive-veh-88231");
  });

  it("an unknown link id and an already-archived link both return the SAME 404", async () => {
    const linkId = await seedLink();
    await archiveLinkRoute(getReq(), linkParams(linkId));
    const archivedAgain = await archiveLinkRoute(getReq(), linkParams(linkId));
    const neverExisted = await archiveLinkRoute(
      getReq(),
      linkParams("99999999-9999-4999-8999-999999999999"),
    );
    expect(archivedAgain.status).toBe(404);
    expect(neverExisted.status).toBe(404);
    expect(await archivedAgain.json()).toEqual(await neverExisted.json());
  });
});

describe("GET /api/accounts/[id]/vehicle-options", () => {
  it("400 for a provider outside the two-value allow-list (not a resolver proxy)", async () => {
    signedInAs(OWNER_A);
    for (const provider of ["slack", "fleetio:vehicles", "", "native"]) {
      const res = await vehicleOptionsRoute(
        getReq(`https://x/o?provider=${encodeURIComponent(provider)}`),
        params(),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("INVALID_PROVIDER");
    }
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("403 for a non-member — no integration lookup happens", async () => {
    signedInAs(OUTSIDER);
    const res = await vehicleOptionsRoute(getReq("https://x/o?provider=motive"), params());
    expect(res.status).toBe(403);
    expect(mockGetActive).not.toHaveBeenCalled();
  });

  it("reports 'disconnected' (not an error) when the account has no integration", async () => {
    signedInAs(OWNER_A);
    mockGetActive.mockResolvedValueOnce(null);
    const res = await vehicleOptionsRoute(getReq("https://x/o?provider=fleetio"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "disconnected", items: [], hasMore: false });
    // The lookup is scoped to the PATH account, resolved server-side.
    expect(mockGetActive).toHaveBeenCalledWith(ACCOUNT_A, "fleetio", null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("collapses a provider failure to a message-free 'error'", async () => {
    signedInAs(OWNER_A);
    mockGetActive.mockRejectedValueOnce(new Error("pg: secret connection string leaked"));
    const res = await vehicleOptionsRoute(getReq("https://x/o?provider=motive"), params());
    const body = await res.json();
    expect(body).toEqual({ status: "error", items: [], hasMore: false });
    expect(JSON.stringify(body)).not.toMatch(/pg:|secret|connection string/i);
  });
});
