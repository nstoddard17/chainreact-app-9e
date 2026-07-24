/**
 * @jest-environment node
 *
 * Route tests for the suggestion API (5.TRUCK-BRIDGE-1 CS-5):
 *   POST /api/accounts/[id]/vehicle-links/suggestions
 *   POST /api/accounts/[id]/vehicle-links/suggestions/dismiss
 *   POST /api/accounts/[id]/vehicle-links/suggestions/bulk-confirm
 *
 * REAL: the routes, the REAL `requireAccountRole`, the REAL suggestion service,
 * the REAL CS-2 matcher, the REAL flags, and the REAL strict body schemas.
 * MOCKED: only boundaries — Supabase auth, the provider inventories, and the
 * link/dismissal/membership/account repositories.
 *
 * Load-bearing checks: both flags gate independently, owner/admin-only,
 * cross-account refusal, bulk confirm 403s while its gate is closed, and no
 * fleet detail (VIN, plate, another account's labels) in any refusal body.
 */
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import type { ResourceLinkDismissalDTO } from "@/contracts/resourceLinkDismissals";
import type { MembershipRole } from "@/contracts/accounts";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

// ── Provider boundary ───────────────────────────────────────────────────────
const mockMotive = jest.fn();
const mockFleetio = jest.fn();
jest.mock("@/services/resourceLinks/vehicleInventory", () => ({
  loadMotiveInventory: (...a: unknown[]) => mockMotive(...a),
  loadFleetioInventory: (...a: unknown[]) => mockFleetio(...a),
}));

// ── DB boundaries ───────────────────────────────────────────────────────────
const links: ResourceLinkDTO[] = [];
const dismissals: ResourceLinkDismissalDTO[] = [];
let nextId = 1;

jest.mock("@/repositories/resourceLinks/accountResourceLinks", () => ({
  listLinks: async (accountId: string) => links.filter((l) => l.accountId === accountId),
  createConfirmedLink: async (input: Record<string, unknown>) => {
    const row = {
      id: `link-${nextId++}`,
      accountId: input.accountId,
      resourceKind: "vehicle",
      sourceProvider: input.sourceProvider,
      sourceExternalId: input.sourceExternalId,
      targetProvider: input.targetProvider,
      targetExternalId: input.targetExternalId,
      sourceLabel: input.sourceLabel ?? null,
      targetLabel: input.targetLabel ?? null,
      matchBasis: input.matchBasis,
      createdByUserId: input.createdByUserId ?? null,
      confirmedByUserId: input.confirmedByUserId ?? null,
      confirmedAt: input.confirmedAt,
      archivedAt: null,
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    } as ResourceLinkDTO;
    links.push(row);
    return row;
  },
  archiveLink: async () => null,
}));

jest.mock("@/repositories/resourceLinks/accountResourceLinkDismissals", () => ({
  listActiveDismissals: async (accountId: string) =>
    dismissals.filter((d) => d.accountId === accountId && d.archivedAt === null),
  createDismissal: async (input: Record<string, unknown>) => {
    const row = {
      id: `dis-${nextId++}`,
      accountId: input.accountId,
      resourceKind: "vehicle",
      sourceProvider: input.sourceProvider,
      sourceExternalId: input.sourceExternalId,
      targetProvider: input.targetProvider,
      targetExternalId: input.targetExternalId,
      matchTier: input.matchTier,
      evidenceFingerprint: input.evidenceFingerprint,
      dismissedByUserId: input.dismissedByUserId ?? null,
      dismissedAt: input.dismissedAt,
      archivedAt: null,
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    } as ResourceLinkDismissalDTO;
    dismissals.push(row);
    return row;
  },
  archiveDismissalForPair: async () => null,
}));

const roles = new Map<string, MembershipRole>();
jest.mock("@/repositories/accountMemberships", () => ({
  getRole: async (accountId: string, userId: string) =>
    roles.get(`${accountId}:${userId}`) ?? null,
  listMemberIdentities: async () => [],
}));
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: async () => "active",
}));

import { POST as confirmRoute } from "@/app/api/accounts/[id]/vehicle-links/suggestions/route";
import { POST as dismissRoute } from "@/app/api/accounts/[id]/vehicle-links/suggestions/dismiss/route";
import { POST as bulkRoute } from "@/app/api/accounts/[id]/vehicle-links/suggestions/bulk-confirm/route";
import {
  RESOURCE_LINKS_UI_FLAG,
  VEHICLE_VIN_BULK_CONFIRM_FLAG,
} from "@/services/resourceLinks/flags";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "55555555-5555-4555-8555-555555555555";
const VIN_A = "1FUJGLDR0CSBP1234";

function signedInAs(userId: string) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId, email: "u@example.test" } },
    error: null,
  });
}
function params() {
  return { params: Promise.resolve({ id: ACCOUNT_A }) };
}
function postReq(body?: unknown) {
  return new Request("https://x/p", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  process.env[RESOURCE_LINKS_UI_FLAG] = "true";
  delete process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG];
  links.length = 0;
  dismissals.length = 0;
  nextId = 1;
  roles.clear();
  roles.set(`${ACCOUNT_A}:${OWNER_A}`, "owner");
  roles.set(`${ACCOUNT_A}:${MEMBER_A}`, "member");
  mockGetUser.mockReset();
  mockMotive.mockReset();
  mockFleetio.mockReset();
  mockMotive.mockResolvedValue({
    status: "ok",
    vehicles: [
      {
        identity: { vehicleId: "motive-1", number: "104", vin: VIN_A, licensePlateNumber: "ABC-1234" },
        label: "Unit 104",
      },
    ],
    hasMore: false,
  });
  mockFleetio.mockResolvedValue({
    status: "ok",
    vehicles: [
      {
        identity: { vehicleId: "42", name: "Truck 104", vin: VIN_A, licensePlate: "ABC-1234" },
        label: "Truck 104",
        archivedAt: null,
      },
    ],
    hasMore: false,
  });
});
afterEach(() => {
  delete process.env[RESOURCE_LINKS_UI_FLAG];
  delete process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG];
});

describe("feature flag gates every suggestion route", () => {
  it("flag OFF ⇒ 404 everywhere, and nothing is written", async () => {
    delete process.env[RESOURCE_LINKS_UI_FLAG];
    signedInAs(OWNER_A);
    for (const res of [
      await confirmRoute(postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42" }), params()),
      await dismissRoute(
        postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42", tier: "vin", evidenceFingerprint: "vin|x" }),
        params(),
      ),
      await bulkRoute(postReq(), params()),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found", code: "NOT_FOUND" });
    }
    expect(links).toHaveLength(0);
    expect(dismissals).toHaveLength(0);
  });

  it("flag ON exposes the routes to an owner", async () => {
    signedInAs(OWNER_A);
    const res = await confirmRoute(
      postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42" }),
      params(),
    );
    expect(res.status).toBe(201);
  });
});

describe("POST .../suggestions — confirm one", () => {
  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(
      (await confirmRoute(postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42" }), params()))
        .status,
    ).toBe(401);
  });

  it("an owner confirms with the SERVER-derived basis", async () => {
    signedInAs(OWNER_A);
    const res = await confirmRoute(
      postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42" }),
      params(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { link: Record<string, unknown> };
    expect(body.link.matchBasis).toBe("suggested_vin");
    expect(links[0]!.accountId).toBe(ACCOUNT_A);
  });

  it("a MEMBER gets 403 FORBIDDEN and nothing is written", async () => {
    signedInAs(MEMBER_A);
    const res = await confirmRoute(
      postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42" }),
      params(),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
    expect(links).toHaveLength(0);
  });

  it("a NON-MEMBER gets 403 and no fleet detail leaks", async () => {
    signedInAs(OUTSIDER);
    const res = await confirmRoute(
      postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42" }),
      params(),
    );
    expect(res.status).toBe(403);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("NOT_ACCOUNT_MEMBER");
    expect(text).not.toContain("Truck 104");
    expect(text).not.toContain(VIN_A);
    expect(links).toHaveLength(0);
  });

  it("400 on a body that tries to claim a match basis (strict schema)", async () => {
    signedInAs(OWNER_A);
    const res = await confirmRoute(
      postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42", matchBasis: "suggested_vin" }),
      params(),
    );
    expect(res.status).toBe(400);
    expect(links).toHaveLength(0);
  });

  it("400 on malformed JSON", async () => {
    signedInAs(OWNER_A);
    const res = await confirmRoute(
      new Request("https://x/p", { method: "POST", body: "not json" }),
      params(),
    );
    expect(res.status).toBe(400);
  });

  it("409 when the target is already claimed", async () => {
    signedInAs(OWNER_A);
    links.push({
      id: "existing", accountId: ACCOUNT_A, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-other",
      targetProvider: "fleetio", targetExternalId: "42",
      sourceLabel: null, targetLabel: null, matchBasis: "manual",
      createdByUserId: null, confirmedByUserId: null,
      confirmedAt: "2026-07-24T12:00:00.000Z", archivedAt: null,
      createdAt: "2026-07-24T12:00:00.000Z", updatedAt: "2026-07-24T12:00:00.000Z",
    });
    const res = await confirmRoute(
      postReq({ sourceVehicleId: "motive-1", targetVehicleId: "42" }),
      params(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("TARGET_ALREADY_LINKED");
  });
});

describe("POST .../suggestions/dismiss", () => {
  const body = {
    sourceVehicleId: "motive-1",
    targetVehicleId: "42",
    tier: "vin" as const,
    evidenceFingerprint: "vin|VIN 1FUJGLDR… matches",
  };

  it("an owner dismisses (200) and it is NOT stored as a link", async () => {
    signedInAs(OWNER_A);
    const res = await dismissRoute(postReq(body), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dismissed: true });
    expect(dismissals).toHaveLength(1);
    expect(links).toHaveLength(0);
  });

  it("a MEMBER gets 403 and nothing is written", async () => {
    signedInAs(MEMBER_A);
    expect((await dismissRoute(postReq(body), params())).status).toBe(403);
    expect(dismissals).toHaveLength(0);
  });

  it("400 on an unknown tier", async () => {
    signedInAs(OWNER_A);
    const res = await dismissRoute(postReq({ ...body, tier: "vibes" }), params());
    expect(res.status).toBe(400);
    expect(dismissals).toHaveLength(0);
  });
});

describe("POST .../suggestions/bulk-confirm", () => {
  it("403 NOT_ENABLED while the VIN bulk gate is closed (the default)", async () => {
    signedInAs(OWNER_A);
    const res = await bulkRoute(postReq(), params());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("NOT_ENABLED");
    // The copy points at the safe alternative rather than dead-ending.
    expect(body.error).toMatch(/one at a time/i);
    expect(links).toHaveLength(0);
  });

  it("confirms when BOTH gates are open", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    signedInAs(OWNER_A);
    const res = await bulkRoute(postReq(), params());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { confirmed: unknown[]; skipped: number };
    expect(body.confirmed).toHaveLength(1);
    expect(body.skipped).toBe(0);
    expect(links[0]!.matchBasis).toBe("suggested_vin");
  });

  it("a MEMBER gets 403 even with both gates open", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    signedInAs(MEMBER_A);
    expect((await bulkRoute(postReq(), params())).status).toBe(403);
    expect(links).toHaveLength(0);
  });

  it("503 when the fleet view is unavailable — nothing is written", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    signedInAs(OWNER_A);
    mockFleetio.mockResolvedValue({ status: "error", vehicles: [], hasMore: false });
    const res = await bulkRoute(postReq(), params());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("LISTS_UNAVAILABLE");
    expect(links).toHaveLength(0);
  });

  it("ignores any client-supplied body — the server picks what to write", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    signedInAs(OWNER_A);
    const res = await bulkRoute(
      postReq({ pairs: [{ sourceVehicleId: "attacker", targetVehicleId: "999" }] }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(links).toHaveLength(1);
    expect(links[0]!.sourceExternalId).toBe("motive-1");
  });
});
