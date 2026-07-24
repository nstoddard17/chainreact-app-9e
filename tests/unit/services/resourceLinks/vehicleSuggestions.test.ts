/**
 * @jest-environment node
 *
 * Vehicle-match suggestion + health service (5.TRUCK-BRIDGE-1 CS-5).
 *
 * REAL: the service, the REAL `requireAccountRole`, the REAL `isAccountFrozen`,
 * the REAL CS-2 matcher (`proposeVehicleMatches` — every tier, every evidence
 * sentence, every ambiguity flag comes from it), the REAL health core, the REAL
 * flag accessors, and the REAL strict body schemas.
 *
 * MOCKED: only boundaries — the two provider inventories (the Motive/Fleetio
 * network edge), the link + dismissal repositories (predicate-evaluating
 * in-memory stores, so isolation is proven as SEMANTICS), memberships, accounts.
 *
 * Business rules protected:
 *   - every tier proposes with its exact evidence sentence; no scores anywhere.
 *   - blank VIN/plate never match; already-linked vehicles never propose.
 *   - ambiguous proposals are flagged and never bulk-confirmable.
 *   - loading suggestions WRITES NOTHING.
 *   - the server re-derives the tier — a client cannot claim a stronger basis.
 *   - dismissals suppress a pair, survive a reload, and RETURN when the evidence
 *     materially changes.
 *   - bulk confirm is gated OFF, and even when on it never double-claims.
 *   - owner/admin mutate, members read, non-members get nothing.
 *   - account A's suggestions never see account B's fleet, links, or dismissals.
 */
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import type { ResourceLinkDismissalDTO } from "@/contracts/resourceLinkDismissals";
import type { MembershipRole } from "@/contracts/accounts";

// ── Provider boundary (the only external edge) ──────────────────────────────
const mockMotive = jest.fn();
const mockFleetio = jest.fn();
jest.mock("@/services/resourceLinks/vehicleInventory", () => ({
  loadMotiveInventory: (...a: unknown[]) => mockMotive(...a),
  loadFleetioInventory: (...a: unknown[]) => mockFleetio(...a),
}));

// ── DB boundary: links (predicate-evaluating store) ─────────────────────────
const links: ResourceLinkDTO[] = [];
let nextLinkId = 1;
const createLinkSpy = jest.fn();

jest.mock("@/repositories/resourceLinks/accountResourceLinks", () => ({
  listLinks: async (accountId: string, kind: string) =>
    links.filter((l) => l.accountId === accountId && l.resourceKind === kind),
  createConfirmedLink: async (input: Record<string, unknown>) => {
    createLinkSpy(input);
    const accountId = input.accountId as string;
    const source = input.sourceExternalId as string;
    const target = input.targetExternalId as string;
    // Honor the two PARTIAL unique indexes for real.
    if (
      links.some(
        (l) =>
          l.accountId === accountId &&
          l.archivedAt === null &&
          (l.sourceExternalId === source || l.targetExternalId === target),
      )
    ) {
      throw new Error("duplicate key value violates unique constraint");
    }
    const row: ResourceLinkDTO = {
      id: `link-${nextLinkId++}`,
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
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    };
    links.push(row);
    return row;
  },
  archiveLink: async () => null,
}));

// ── DB boundary: dismissals (predicate-evaluating store) ────────────────────
const dismissals: ResourceLinkDismissalDTO[] = [];
let nextDismissalId = 1;

jest.mock("@/repositories/resourceLinks/accountResourceLinkDismissals", () => ({
  listActiveDismissals: async (accountId: string, kind: string) =>
    dismissals.filter(
      (d) => d.accountId === accountId && d.resourceKind === kind && d.archivedAt === null,
    ),
  createDismissal: async (input: Record<string, unknown>) => {
    const row: ResourceLinkDismissalDTO = {
      id: `dis-${nextDismissalId++}`,
      accountId: input.accountId as string,
      resourceKind: "vehicle",
      sourceProvider: input.sourceProvider as string,
      sourceExternalId: input.sourceExternalId as string,
      targetProvider: input.targetProvider as string,
      targetExternalId: input.targetExternalId as string,
      matchTier: input.matchTier as ResourceLinkDismissalDTO["matchTier"],
      evidenceFingerprint: input.evidenceFingerprint as string,
      dismissedByUserId: (input.dismissedByUserId as string | null) ?? null,
      dismissedAt: input.dismissedAt as string,
      archivedAt: null,
      createdAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    };
    if (
      dismissals.some(
        (d) =>
          d.accountId === row.accountId &&
          d.archivedAt === null &&
          d.sourceExternalId === row.sourceExternalId &&
          d.targetExternalId === row.targetExternalId,
      )
    ) {
      throw new Error("duplicate key value violates unique constraint");
    }
    dismissals.push(row);
    return row;
  },
  archiveDismissalForPair: async (
    accountId: string,
    kind: string,
    _sp: string,
    sourceExternalId: string,
    _tp: string,
    targetExternalId: string,
    archivedAt: string,
  ) => {
    const row = dismissals.find(
      (d) =>
        d.accountId === accountId &&
        d.resourceKind === kind &&
        d.sourceExternalId === sourceExternalId &&
        d.targetExternalId === targetExternalId &&
        d.archivedAt === null,
    );
    if (!row) return null;
    const updated = { ...row, archivedAt };
    dismissals[dismissals.indexOf(row)] = updated;
    return updated;
  },
}));

// ── DB boundary: memberships + accounts ─────────────────────────────────────
const roles = new Map<string, MembershipRole>();
jest.mock("@/repositories/accountMemberships", () => ({
  getRole: async (accountId: string, userId: string) =>
    roles.get(`${accountId}:${userId}`) ?? null,
  listMemberIdentities: async () => [],
}));
const frozen = new Set<string>();
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: async (accountId: string) =>
    frozen.has(accountId) ? "pending_deletion" : "active",
}));

import {
  listVehicleSuggestions,
  confirmSuggestion,
  dismissSuggestion,
  bulkConfirmVinMatches,
  assessVehicleLinkHealth,
  evidenceFingerprint,
} from "@/services/resourceLinks/vehicleSuggestions";
import {
  RESOURCE_LINKS_UI_FLAG,
  VEHICLE_VIN_BULK_CONFIRM_FLAG,
} from "@/services/resourceLinks/flags";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const OWNER_B = "44444444-4444-4444-8444-444444444444";
const OUTSIDER = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-07-24T12:00:00.000Z";

const VIN_A = "1FUJGLDR0CSBP1234";

function motiveVehicle(over: Partial<{
  vehicleId: string; number: string | null; vin: string | null; licensePlateNumber: string | null; label: string;
}> = {}) {
  const vehicleId = over.vehicleId ?? "motive-1";
  return {
    identity: {
      vehicleId,
      number: over.number ?? null,
      vin: over.vin ?? null,
      licensePlateNumber: over.licensePlateNumber ?? null,
    },
    label: over.label ?? `Unit ${vehicleId}`,
  };
}

function fleetioVehicle(over: Partial<{
  vehicleId: string; name: string | null; vin: string | null; licensePlate: string | null; label: string; archivedAt: string | null;
}> = {}) {
  const vehicleId = over.vehicleId ?? "42";
  return {
    identity: {
      vehicleId,
      name: over.name ?? null,
      vin: over.vin ?? null,
      licensePlate: over.licensePlate ?? null,
    },
    label: over.label ?? over.name ?? `Vehicle ${vehicleId}`,
    archivedAt: over.archivedAt ?? null,
  };
}

function setInventory(input: {
  motive?: ReturnType<typeof motiveVehicle>[];
  fleetio?: ReturnType<typeof fleetioVehicle>[];
  motiveStatus?: "ok" | "disconnected" | "error";
  fleetioStatus?: "ok" | "disconnected" | "error";
  motiveHasMore?: boolean;
  fleetioHasMore?: boolean;
}) {
  mockMotive.mockResolvedValue({
    status: input.motiveStatus ?? "ok",
    vehicles: input.motive ?? [],
    hasMore: input.motiveHasMore ?? false,
  });
  mockFleetio.mockResolvedValue({
    status: input.fleetioStatus ?? "ok",
    vehicles: input.fleetio ?? [],
    hasMore: input.fleetioHasMore ?? false,
  });
}

beforeEach(() => {
  process.env[RESOURCE_LINKS_UI_FLAG] = "true";
  delete process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG];
  links.length = 0;
  dismissals.length = 0;
  nextLinkId = 1;
  nextDismissalId = 1;
  roles.clear();
  frozen.clear();
  roles.set(`${ACCOUNT_A}:${OWNER_A}`, "owner");
  roles.set(`${ACCOUNT_A}:${MEMBER_A}`, "member");
  roles.set(`${ACCOUNT_B}:${OWNER_B}`, "owner");
  createLinkSpy.mockClear();
  mockMotive.mockReset();
  mockFleetio.mockReset();
  setInventory({});
});
afterEach(() => {
  delete process.env[RESOURCE_LINKS_UI_FLAG];
  delete process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG];
});

async function suggestFor(userId = OWNER_A, accountId = ACCOUNT_A) {
  const result = await listVehicleSuggestions({ accountId, actingUserId: userId });
  if (!result.ok) throw new Error(`expected suggestions, got ${result.reason}`);
  return result.view;
}

describe("matching tiers + evidence", () => {
  it("tier 1 — exact VIN, with the VIN named in the evidence", async () => {
    setInventory({
      motive: [motiveVehicle({ vin: VIN_A, label: "Unit 104" })],
      fleetio: [fleetioVehicle({ vin: VIN_A, name: "Truck 104" })],
    });
    const view = await suggestFor();
    expect(view.suggestions).toHaveLength(1);
    const [s] = view.suggestions;
    expect(s!.tier).toBe("vin");
    expect(s!.confidence).toBe("exact");
    expect(s!.evidence).toBe("VIN 1FUJGLDR… matches");
    expect(s!.sourceLabel).toBe("Unit 104");
    expect(s!.targetLabel).toBe("Truck 104");
  });

  it("tier 2 — normalized plate, evidence shows the plate as typed", async () => {
    setInventory({
      motive: [motiveVehicle({ licensePlateNumber: "ABC-1234" })],
      fleetio: [fleetioVehicle({ licensePlate: "abc 1234" })],
    });
    const [s] = (await suggestFor()).suggestions;
    expect(s!.tier).toBe("plate");
    expect(s!.confidence).toBe("strong");
    expect(s!.evidence).toBe("Plate ABC-1234 matches");
  });

  it("tier 3 — unit number equals Fleetio name", async () => {
    setInventory({
      motive: [motiveVehicle({ number: "104" })],
      fleetio: [fleetioVehicle({ name: "104" })],
    });
    const [s] = (await suggestFor()).suggestions;
    expect(s!.tier).toBe("number");
    expect(s!.confidence).toBe("moderate");
    expect(s!.evidence).toBe('Unit 104 matches "104"');
  });

  it("tier 4 — unit number as a WHOLE TOKEN inside the name", async () => {
    setInventory({
      motive: [motiveVehicle({ number: "104" })],
      fleetio: [fleetioVehicle({ name: "Truck 104" })],
    });
    const [s] = (await suggestFor()).suggestions;
    expect(s!.tier).toBe("name");
    expect(s!.confidence).toBe("weak");
    expect(s!.evidence).toBe('Unit 104 appears in "Truck 104"');
  });

  it("does NOT match a partial token (unit 10 vs \"Truck 104\")", async () => {
    setInventory({
      motive: [motiveVehicle({ number: "10" })],
      fleetio: [fleetioVehicle({ name: "Truck 104" })],
    });
    expect((await suggestFor()).suggestions).toEqual([]);
  });

  it("uses only the STRONGEST tier for a pair (one row, never four)", async () => {
    setInventory({
      motive: [motiveVehicle({ vin: VIN_A, number: "104", licensePlateNumber: "ABC1234" })],
      fleetio: [fleetioVehicle({ vin: VIN_A, name: "104", licensePlate: "ABC1234" })],
    });
    const view = await suggestFor();
    expect(view.suggestions).toHaveLength(1);
    expect(view.suggestions[0]!.tier).toBe("vin");
  });

  it("never emits a confidence percentage or numeric score", async () => {
    setInventory({
      motive: [motiveVehicle({ number: "104" })],
      fleetio: [fleetioVehicle({ name: "Truck 104" })],
    });
    const blob = JSON.stringify((await suggestFor()).suggestions);
    expect(blob).not.toMatch(/%|score|"confidence":\s*\d/i);
    expect(blob).not.toContain("probability");
  });

  it("never ships VIN or plate to the client — only the rendered evidence", async () => {
    setInventory({
      motive: [motiveVehicle({ vin: VIN_A, licensePlateNumber: "TX ABC-1234" })],
      fleetio: [fleetioVehicle({ vin: VIN_A, licensePlate: "TX ABC-1234" })],
    });
    const blob = JSON.stringify((await suggestFor()).suggestions);
    // The evidence sentence carries a SHORTENED VIN; the full VIN never travels.
    expect(blob).not.toContain(VIN_A);
    expect(blob).not.toContain("TX ABC-1234");
  });
});

describe("blank values never match", () => {
  it.each([
    ["both VINs blank", { vin: "" }, { vin: "" }],
    ["both VINs whitespace", { vin: "   " }, { vin: "  " }],
    ["both VINs null", { vin: null }, { vin: null }],
    ["both plates blank", { licensePlateNumber: "" }, { licensePlate: "" }],
    ["both plates null", { licensePlateNumber: null }, { licensePlate: null }],
    ["both numbers/names blank", { number: "" }, { name: "" }],
  ])("%s produces no suggestion", async (_label, m, f) => {
    setInventory({
      motive: [motiveVehicle(m as never)],
      fleetio: [fleetioVehicle(f as never)],
    });
    expect((await suggestFor()).suggestions).toEqual([]);
  });
});

describe("already-linked vehicles are excluded", () => {
  it("a source that already holds a link is never proposed", async () => {
    links.push({
      id: "existing", accountId: ACCOUNT_A, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-1",
      targetProvider: "fleetio", targetExternalId: "999",
      sourceLabel: null, targetLabel: null, matchBasis: "manual",
      createdByUserId: null, confirmedByUserId: null, confirmedAt: NOW,
      archivedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", vin: VIN_A })],
      fleetio: [fleetioVehicle({ vin: VIN_A })],
    });
    expect((await suggestFor()).suggestions).toEqual([]);
  });

  it("an ARCHIVED link does NOT exclude — the vehicle is free again", async () => {
    links.push({
      id: "archived", accountId: ACCOUNT_A, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-1",
      targetProvider: "fleetio", targetExternalId: "999",
      sourceLabel: null, targetLabel: null, matchBasis: "manual",
      createdByUserId: null, confirmedByUserId: null, confirmedAt: NOW,
      archivedAt: "2026-07-25T00:00:00Z", createdAt: NOW, updatedAt: NOW,
    });
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", vin: VIN_A })],
      fleetio: [fleetioVehicle({ vin: VIN_A })],
    });
    expect((await suggestFor()).suggestions).toHaveLength(1);
  });
});

describe("ambiguity", () => {
  it("flags rivals at the same tier and makes them NON-bulk-confirmable", async () => {
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", vin: VIN_A })],
      fleetio: [
        fleetioVehicle({ vehicleId: "42", vin: VIN_A, name: "Truck 104" }),
        fleetioVehicle({ vehicleId: "43", vin: VIN_A, name: "Truck 104 spare" }),
      ],
    });
    const view = await suggestFor();
    expect(view.suggestions).toHaveLength(2);
    for (const s of view.suggestions) {
      expect(s.ambiguous).toBe(true);
      expect(s.bulkConfirmable).toBe(false);
    }
    expect(view.bulkConfirmableCount).toBe(0);
  });

  it("an unambiguous VIN match IS bulk-eligible (eligibility, not permission)", async () => {
    setInventory({
      motive: [motiveVehicle({ vin: VIN_A })],
      fleetio: [fleetioVehicle({ vin: VIN_A })],
    });
    const view = await suggestFor();
    expect(view.suggestions[0]!.bulkConfirmable).toBe(true);
    expect(view.bulkConfirmableCount).toBe(1);
    // The GATE now defaults OPEN (VEHICLE-LINKS-BULK-1)...
    expect(view.bulkConfirmEnabled).toBe(true);
    // ...but eligibility is independent of the gate: the "false" kill switch
    // closes the gate WITHOUT changing which matches are eligible.
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "false";
    const closed = await suggestFor();
    expect(closed.bulkConfirmEnabled).toBe(false);
    expect(closed.suggestions[0]!.bulkConfirmable).toBe(true);
    expect(closed.bulkConfirmableCount).toBe(1);
  });
});

describe("loading suggestions writes nothing", () => {
  it("no link and no dismissal is created by a read", async () => {
    setInventory({
      motive: [motiveVehicle({ vin: VIN_A })],
      fleetio: [fleetioVehicle({ vin: VIN_A })],
    });
    await suggestFor();
    expect(createLinkSpy).not.toHaveBeenCalled();
    expect(links).toHaveLength(0);
    expect(dismissals).toHaveLength(0);
  });
});

describe("provider status is distinguished from 'no matches'", () => {
  it("a disconnected side reports 'disconnected', not an empty match list", async () => {
    setInventory({ motiveStatus: "disconnected" });
    const view = await suggestFor();
    expect(view.status).toBe("disconnected");
    expect(view.suggestions).toEqual([]);
  });

  it("a failed list reports 'unavailable' — NOT 'no matches'", async () => {
    setInventory({
      motiveStatus: "error",
      fleetio: [fleetioVehicle({ vin: VIN_A })],
    });
    const view = await suggestFor();
    expect(view.status).toBe("unavailable");
    expect(view.suggestions).toEqual([]);
  });

  it("flags a truncated inventory so a missing match is explainable", async () => {
    setInventory({
      motive: [motiveVehicle({ vin: VIN_A })],
      fleetio: [fleetioVehicle({ vin: VIN_A })],
      fleetioHasMore: true,
    });
    expect((await suggestFor()).partialInventory).toBe(true);
  });
});

describe("dismiss", () => {
  const dismissBody = (fingerprint: string) => ({
    sourceVehicleId: "motive-1",
    targetVehicleId: "42",
    tier: "name" as const,
    evidenceFingerprint: fingerprint,
  });

  beforeEach(() => {
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", number: "104" })],
      fleetio: [fleetioVehicle({ vehicleId: "42", name: "Truck 104" })],
    });
  });

  it("a dismissed suggestion does not come back on the next load", async () => {
    const before = await suggestFor();
    expect(before.suggestions).toHaveLength(1);
    const fingerprint = before.suggestions[0]!.evidenceFingerprint;

    expect(
      await dismissSuggestion({
        accountId: ACCOUNT_A, actingUserId: OWNER_A, body: dismissBody(fingerprint), now: NOW,
      }),
    ).toEqual({ ok: true });

    expect((await suggestFor()).suggestions).toEqual([]);
    // ...and it is NOT stored as a link.
    expect(links).toHaveLength(0);
    expect(dismissals).toHaveLength(1);
  });

  it("the dismissal RETURNS when the evidence materially changes", async () => {
    const before = await suggestFor();
    await dismissSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: dismissBody(before.suggestions[0]!.evidenceFingerprint), now: NOW,
    });
    expect((await suggestFor()).suggestions).toEqual([]);

    // The fleet manager fixes the VIN on both sides — now it's an EXACT match,
    // a materially different claim the user has never judged.
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", number: "104", vin: VIN_A })],
      fleetio: [fleetioVehicle({ vehicleId: "42", name: "Truck 104", vin: VIN_A })],
    });
    const after = await suggestFor();
    expect(after.suggestions).toHaveLength(1);
    expect(after.suggestions[0]!.tier).toBe("vin");
  });

  it("dismissing one pair never suppresses a different pair", async () => {
    setInventory({
      motive: [
        motiveVehicle({ vehicleId: "motive-1", number: "104" }),
        motiveVehicle({ vehicleId: "motive-2", number: "205" }),
      ],
      fleetio: [
        fleetioVehicle({ vehicleId: "42", name: "Truck 104" }),
        fleetioVehicle({ vehicleId: "43", name: "Truck 205" }),
      ],
    });
    const before = await suggestFor();
    expect(before.suggestions).toHaveLength(2);
    const first = before.suggestions[0]!;

    await dismissSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: {
        sourceVehicleId: first.sourceVehicleId,
        targetVehicleId: first.targetVehicleId,
        tier: first.tier,
        evidenceFingerprint: first.evidenceFingerprint,
      },
      now: NOW,
    });

    const after = await suggestFor();
    expect(after.suggestions).toHaveLength(1);
    expect(after.suggestions[0]!.sourceVehicleId).not.toBe(first.sourceVehicleId);
  });

  it("re-dismissing the same pair REPLACES the stored claim (no accumulation)", async () => {
    const before = await suggestFor();
    const fp = before.suggestions[0]!.evidenceFingerprint;
    await dismissSuggestion({ accountId: ACCOUNT_A, actingUserId: OWNER_A, body: dismissBody(fp), now: NOW });
    await dismissSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: dismissBody("name|a different claim"), now: "2026-07-26T00:00:00.000Z",
    });
    expect(dismissals.filter((d) => d.archivedAt === null)).toHaveLength(1);
    expect(dismissals.filter((d) => d.archivedAt !== null)).toHaveLength(1);
  });

  it("a MEMBER cannot dismiss, and nothing is written", async () => {
    const before = await suggestFor();
    expect(
      await dismissSuggestion({
        accountId: ACCOUNT_A, actingUserId: MEMBER_A,
        body: dismissBody(before.suggestions[0]!.evidenceFingerprint), now: NOW,
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(dismissals).toHaveLength(0);
  });

  it("rejects a malformed body before writing", async () => {
    expect(
      await dismissSuggestion({
        accountId: ACCOUNT_A, actingUserId: OWNER_A,
        body: { sourceVehicleId: "motive-1", targetVehicleId: "42", tier: "vibes", evidenceFingerprint: "x" },
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "invalid_input" });
    expect(dismissals).toHaveLength(0);
  });

  it("confirming a pair archives any live dismissal for it", async () => {
    const before = await suggestFor();
    await dismissSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: dismissBody(before.suggestions[0]!.evidenceFingerprint), now: NOW,
    });
    const confirmed = await confirmSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
    });
    expect(confirmed.ok).toBe(true);
    expect(dismissals.filter((d) => d.archivedAt === null)).toHaveLength(0);
  });
});

describe("confirm one suggestion", () => {
  beforeEach(() => {
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", number: "104", label: "Unit 104" })],
      fleetio: [fleetioVehicle({ vehicleId: "42", name: "Truck 104" })],
    });
  });

  it("records the SERVER-derived match basis, not one the client claimed", async () => {
    const result = await confirmSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      // No matchBasis in the body — the schema has no such field.
      body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(createLinkSpy).toHaveBeenCalledWith(
      expect.objectContaining({ matchBasis: "suggested_name", sourceLabel: "Unit 104", targetLabel: "Truck 104" }),
    );
  });

  it("rejects an attempt to smuggle a stronger match basis (strict body)", async () => {
    const result = await confirmSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: { sourceVehicleId: "motive-1", targetVehicleId: "42", matchBasis: "suggested_vin" },
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "invalid_input" });
    expect(createLinkSpy).not.toHaveBeenCalled();
  });

  it("records 'manual' when the chosen pair is not a current proposal", async () => {
    // The user picked a DIFFERENT Fleetio vehicle for an ambiguous row.
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", number: "104" })],
      fleetio: [
        fleetioVehicle({ vehicleId: "42", name: "Truck 104" }),
        fleetioVehicle({ vehicleId: "99", name: "Unrelated" }),
      ],
    });
    const result = await confirmSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: { sourceVehicleId: "motive-1", targetVehicleId: "99" }, now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(createLinkSpy).toHaveBeenCalledWith(expect.objectContaining({ matchBasis: "manual" }));
  });

  it("refuses when the source is already linked — a suggestion never replaces", async () => {
    links.push({
      id: "existing", accountId: ACCOUNT_A, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-1",
      targetProvider: "fleetio", targetExternalId: "999",
      sourceLabel: null, targetLabel: null, matchBasis: "manual",
      createdByUserId: null, confirmedByUserId: null, confirmedAt: NOW,
      archivedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    expect(
      await confirmSuggestion({
        accountId: ACCOUNT_A, actingUserId: OWNER_A,
        body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
      }),
    ).toEqual({ ok: false, reason: "source_already_linked" });
    expect(createLinkSpy).not.toHaveBeenCalled();
  });

  it("refuses when the target is already claimed by another Motive vehicle", async () => {
    links.push({
      id: "existing", accountId: ACCOUNT_A, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-other",
      targetProvider: "fleetio", targetExternalId: "42",
      sourceLabel: null, targetLabel: null, matchBasis: "manual",
      createdByUserId: null, confirmedByUserId: null, confirmedAt: NOW,
      archivedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    expect(
      await confirmSuggestion({
        accountId: ACCOUNT_A, actingUserId: OWNER_A,
        body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
      }),
    ).toEqual({ ok: false, reason: "target_already_linked" });
  });

  it("a MEMBER cannot confirm; a NON-MEMBER learns nothing", async () => {
    expect(
      await confirmSuggestion({
        accountId: ACCOUNT_A, actingUserId: MEMBER_A,
        body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
      }),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      await confirmSuggestion({
        accountId: ACCOUNT_A, actingUserId: OUTSIDER,
        body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
      }),
    ).toEqual({ ok: false, reason: "not_member" });
    expect(links).toHaveLength(0);
  });

  it("refuses on a FROZEN account", async () => {
    frozen.add(ACCOUNT_A);
    expect(
      await confirmSuggestion({
        accountId: ACCOUNT_A, actingUserId: OWNER_A,
        body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
      }),
    ).toEqual({ ok: false, reason: "account_frozen" });
  });

  it("returns a view with no accountId and no raw user id", async () => {
    const result = await confirmSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blob = JSON.stringify(result.link);
    expect(blob).not.toContain(ACCOUNT_A);
    expect(blob).not.toContain(OWNER_A);
  });
});

describe("bulk confirm — gated, and safe when open", () => {
  beforeEach(() => {
    setInventory({
      motive: [
        motiveVehicle({ vehicleId: "motive-1", vin: VIN_A, label: "Unit 104" }),
        motiveVehicle({ vehicleId: "motive-2", vin: "2ABCDEF0000000000", label: "Unit 205" }),
      ],
      fleetio: [
        fleetioVehicle({ vehicleId: "42", vin: VIN_A, name: "Truck 104" }),
        fleetioVehicle({ vehicleId: "43", vin: "2ABCDEF0000000000", name: "Truck 205" }),
      ],
    });
  });

  it("is AVAILABLE by default with no env var set (VEHICLE-LINKS-BULK-1)", async () => {
    // beforeEach deletes the flag ⇒ default ON. The server recomputes the
    // eligible set and links the unambiguous VIN matches — no env var required.
    const result = await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confirmed.length).toBeGreaterThan(0);
  });

  it('is REFUSED only when ENABLE_VEHICLE_VIN_BULK_CONFIRM is explicitly "false"', async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "false";
    expect(
      await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW }),
    ).toEqual({ ok: false, reason: "not_enabled" });
    expect(links).toHaveLength(0);
  });

  it("stays refused when the surface flag is explicitly off, even with the bulk flag on", async () => {
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    expect(
      await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW }),
    ).toEqual({ ok: false, reason: "not_enabled" });
  });

  it("confirms ONLY unambiguous VIN matches when enabled", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    const result = await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confirmed).toHaveLength(2);
    expect(links.map((l) => l.matchBasis)).toEqual(["suggested_vin", "suggested_vin"]);
  });

  it("NEVER bulk-confirms an ambiguous VIN match", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", vin: VIN_A })],
      fleetio: [
        fleetioVehicle({ vehicleId: "42", vin: VIN_A }),
        fleetioVehicle({ vehicleId: "43", vin: VIN_A }),
      ],
    });
    const result = await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW });
    expect(result.ok && result.confirmed).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it("never bulk-confirms a lower tier", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", number: "104" })],
      fleetio: [fleetioVehicle({ vehicleId: "42", name: "Truck 104" })],
    });
    const result = await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW });
    expect(result.ok && result.confirmed).toHaveLength(0);
  });

  it("skips a DISMISSED VIN match rather than confirming it", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    const view = await suggestFor();
    const first = view.suggestions[0]!;
    await dismissSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: {
        sourceVehicleId: first.sourceVehicleId, targetVehicleId: first.targetVehicleId,
        tier: first.tier, evidenceFingerprint: first.evidenceFingerprint,
      },
      now: NOW,
    });
    const result = await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW });
    expect(result.ok && result.confirmed).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(links[0]!.sourceExternalId).not.toBe(first.sourceVehicleId);
  });

  it("refuses to bulk-write from an UNAVAILABLE fleet view", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    setInventory({ motiveStatus: "error", fleetio: [fleetioVehicle({ vin: VIN_A })] });
    expect(
      await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW }),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(links).toHaveLength(0);
  });

  it("counts a lost race as skipped rather than failing the batch", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    // Another admin claims Fleetio 42 between the read and the writes.
    links.push({
      id: "raced", accountId: ACCOUNT_A, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-9",
      targetProvider: "fleetio", targetExternalId: "42",
      sourceLabel: null, targetLabel: null, matchBasis: "manual",
      createdByUserId: null, confirmedByUserId: null, confirmedAt: NOW,
      archivedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    const result = await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: OWNER_A, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Fleetio 42 was already claimed, so its proposal was excluded upstream; the
    // other truck still links.
    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0]!.targetVehicleId).toBe("43");
  });

  it("a MEMBER cannot bulk confirm", async () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    expect(
      await bulkConfirmVinMatches({ accountId: ACCOUNT_A, actingUserId: MEMBER_A, now: NOW }),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(links).toHaveLength(0);
  });
});

describe("permissions on reads", () => {
  it("a MEMBER may read suggestions", async () => {
    setInventory({
      motive: [motiveVehicle({ vin: VIN_A })],
      fleetio: [fleetioVehicle({ vin: VIN_A })],
    });
    const result = await listVehicleSuggestions({ accountId: ACCOUNT_A, actingUserId: MEMBER_A });
    expect(result.ok).toBe(true);
    expect(result.ok && result.view.suggestions).toHaveLength(1);
  });

  it("a NON-MEMBER may not, and no provider call is made", async () => {
    const result = await listVehicleSuggestions({ accountId: ACCOUNT_A, actingUserId: OUTSIDER });
    expect(result).toEqual({ ok: false, reason: "not_member" });
    expect(mockMotive).not.toHaveBeenCalled();
    expect(mockFleetio).not.toHaveBeenCalled();
  });
});

describe("account isolation", () => {
  it("A's suggestions use A's inventory, links, and dismissals only", async () => {
    // B holds a link that would suppress the pair — for B, not for A.
    links.push({
      id: "b-link", accountId: ACCOUNT_B, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-1",
      targetProvider: "fleetio", targetExternalId: "42",
      sourceLabel: "B Unit", targetLabel: "B Truck", matchBasis: "manual",
      createdByUserId: null, confirmedByUserId: null, confirmedAt: NOW,
      archivedAt: null, createdAt: NOW, updatedAt: NOW,
    });
    // ...and a dismissal for the same pair.
    dismissals.push({
      id: "b-dis", accountId: ACCOUNT_B, resourceKind: "vehicle",
      sourceProvider: "motive", sourceExternalId: "motive-1",
      targetProvider: "fleetio", targetExternalId: "42",
      matchTier: "vin", evidenceFingerprint: evidenceFingerprint("vin", "VIN 1FUJGLDR… matches"),
      dismissedByUserId: null, dismissedAt: NOW, archivedAt: null,
      createdAt: NOW, updatedAt: NOW,
    });

    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", vin: VIN_A })],
      fleetio: [fleetioVehicle({ vehicleId: "42", vin: VIN_A })],
    });

    // A sees the suggestion — B's link and B's dismissal are invisible to A.
    const a = await suggestFor(OWNER_A, ACCOUNT_A);
    expect(a.suggestions).toHaveLength(1);
    expect(JSON.stringify(a.suggestions)).not.toContain("B Truck");

    // B sees nothing: its own link already claims both sides.
    const b = await suggestFor(OWNER_B, ACCOUNT_B);
    expect(b.suggestions).toEqual([]);
  });

  it("A's dismissal does not suppress the same pair for B", async () => {
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", vin: VIN_A })],
      fleetio: [fleetioVehicle({ vehicleId: "42", vin: VIN_A })],
    });
    const a = await suggestFor(OWNER_A, ACCOUNT_A);
    await dismissSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: {
        sourceVehicleId: "motive-1", targetVehicleId: "42",
        tier: a.suggestions[0]!.tier, evidenceFingerprint: a.suggestions[0]!.evidenceFingerprint,
      },
      now: NOW,
    });
    expect((await suggestFor(OWNER_A, ACCOUNT_A)).suggestions).toEqual([]);
    expect((await suggestFor(OWNER_B, ACCOUNT_B)).suggestions).toHaveLength(1);
  });

  it("confirming in A writes A's account id, never a caller-supplied one", async () => {
    setInventory({
      motive: [motiveVehicle({ vehicleId: "motive-1", vin: VIN_A })],
      fleetio: [fleetioVehicle({ vehicleId: "42", vin: VIN_A })],
    });
    await confirmSuggestion({
      accountId: ACCOUNT_A, actingUserId: OWNER_A,
      body: { sourceVehicleId: "motive-1", targetVehicleId: "42" }, now: NOW,
    });
    expect(createLinkSpy).toHaveBeenCalledWith(expect.objectContaining({ accountId: ACCOUNT_A }));
    expect(links[0]!.accountId).toBe(ACCOUNT_A);
  });
});

describe("link health orchestration", () => {
  const link = {
    id: "link-1", sourceVehicleId: "motive-1", targetVehicleId: "42",
    sourceLabel: "Unit 104", targetLabel: "Truck 104",
    matchBasis: "manual" as const, confirmedByLabel: null, confirmedAt: NOW,
  };

  it("reports ok when both sides are visible", async () => {
    const health = await assessVehicleLinkHealth({
      links: [link],
      motive: { status: "ok", vehicles: [motiveVehicle({ vehicleId: "motive-1" })], hasMore: false },
      fleetio: { status: "ok", vehicles: [fleetioVehicle({ vehicleId: "42" })], hasMore: false },
    });
    expect(health).toEqual([{ linkId: "link-1", statuses: ["ok"], needsAttention: false }]);
  });

  it("reports a genuinely missing Fleetio target", async () => {
    const health = await assessVehicleLinkHealth({
      links: [link],
      motive: { status: "ok", vehicles: [motiveVehicle({ vehicleId: "motive-1" })], hasMore: false },
      fleetio: { status: "ok", vehicles: [], hasMore: false },
    });
    expect(health[0]!.statuses).toEqual(["target_missing"]);
    expect(health[0]!.needsAttention).toBe(true);
  });

  it("reports an ARCHIVED Fleetio target distinctly", async () => {
    const health = await assessVehicleLinkHealth({
      links: [link],
      motive: { status: "ok", vehicles: [motiveVehicle({ vehicleId: "motive-1" })], hasMore: false },
      fleetio: {
        status: "ok",
        vehicles: [fleetioVehicle({ vehicleId: "42", archivedAt: "2026-07-01T00:00:00Z" })],
        hasMore: false,
      },
    });
    expect(health[0]!.statuses).toEqual(["target_archived"]);
  });

  it("an OUTAGE reports unknown, never missing — the fleet is not 'deleted'", async () => {
    const health = await assessVehicleLinkHealth({
      links: [link],
      motive: { status: "error", vehicles: [], hasMore: false },
      fleetio: { status: "disconnected", vehicles: [], hasMore: false },
    });
    expect(health[0]!.statuses).toEqual(["source_unknown", "target_unknown"]);
    expect(health[0]!.needsAttention).toBe(false);
    expect(JSON.stringify(health)).not.toContain("missing");
  });
});
