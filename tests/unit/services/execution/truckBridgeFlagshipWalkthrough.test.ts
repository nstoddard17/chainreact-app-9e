/**
 * @jest-environment node
 *
 * 5.TRUCK-BRIDGE-1 CS-6 — the FLAGSHIP walkthrough, through the REAL engine.
 *
 *   motive:new_fuel_purchase   (trigger)
 *     → motive:get_fuel_purchase        (odometer reading)
 *       → fleetio:find_linked_vehicle   (Motive id → Fleetio id, no HTTP)
 *         → fleetio:create_meter_entry  (the one write)
 *
 * ── What is REAL here ───────────────────────────────────────────────────────
 * The `WorkflowEngine` itself, its BFS traversal, its pre-dispatch readiness
 * gate driven by the REAL discovery registry, the REAL `resolveStrict` variable
 * resolver, the REAL handler registry, all three REAL handlers, the REAL
 * account-scoped resource-link lookup path, the REAL credential decryption, the
 * REAL bounded output shaping, and the REAL error classification.
 *
 * ── What is mocked (and nothing else) ───────────────────────────────────────
 * The database (workflows, workflow_runs, integrations, resource links) and the
 * Motive/Fleetio HTTP boundary. Billing/notification collaborators are stubbed
 * because they are orthogonal infrastructure with their own suites — none of
 * them touches the vehicle-link path under test.
 *
 * Deliberately NOT mocked: `@/services/execution/handlers/_registry` and
 * `@/services/discovery/_registry`. The engine looks up the real handlers and
 * the real metas, so a registration or readiness regression fails HERE.
 */
import { randomBytes } from "node:crypto";
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

// ── DB: workflows + runs ────────────────────────────────────────────────────
const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));

const persistedRuns: Array<Record<string, unknown>> = [];
jest.mock("@/repositories/workflowRuns", () => ({
  recordRun: async () => undefined,
  createWorkflowRunStart: async () => ({ created: true }),
  claimQueuedWorkflowRun: async () => ({ claimed: false }),
  finalizeWorkflowRun: async (payload: Record<string, unknown>) => {
    persistedRuns.push(payload);
    return { finalized: true };
  },
  markWorkflowRunFailedBeforeExecution: async (payload: Record<string, unknown>) => {
    persistedRuns.push(payload);
    return { updated: true };
  },
}));

// ── Orthogonal infrastructure (own suites) ──────────────────────────────────
jest.mock("@/services/billing/executionBillingGate", () => ({
  executionBillingGate: async () => ({ ok: true, used: 1, limit: 100 }),
}));
jest.mock("@/services/billing/advancedBranchingEntitlement", () => ({
  resolveAdvancedBranchingEntitlementServiceRole: async () => ({
    entitled: true, plan: "pro", planStatus: "active", fallback: false,
  }),
}));
jest.mock("@/services/billing/taskUsageRecorder", () => ({
  computeRunTaskUsage: () => ({ total: 1, byNode: {} }),
  recordRunActuals: async () => undefined,
}));
jest.mock("@/services/billing/reserveReconcileShadowMode", () => ({
  recordShadowComparison: async () => undefined,
}));
jest.mock("@/services/billing/billingShadowComparisons", () => ({
  recordBillingShadowComparison: async () => undefined,
}));
jest.mock("@/services/billing/reserveReconcileBilling", () => ({
  createBillingReservation: async () => ({ ok: true, reservationId: null }),
  reconcileBillingReservation: async () => undefined,
}));
jest.mock("@/services/billing/workflowCostEstimator", () => ({
  estimateWorkflowTaskCost: () => 1,
}));
jest.mock("@/repositories/accountBilling", () => ({
  reserveTasks: jest.fn(), reconcileReservation: jest.fn(), releaseReservation: jest.fn(),
  releaseExpiredReservations: jest.fn(), deductTasks: jest.fn(), getUsage: jest.fn(),
}));
const mockNotify = jest.fn();
jest.mock("@/services/notifications/notifyWorkflowFailure", () => ({
  notifyWorkflowFailure: (...a: unknown[]) => mockNotify(...a),
}));
jest.mock("@/services/integrations/connectionResolution", () => ({
  buildWorkflowCredentialPlan: async () => ({ byNode: {} }),
}));
jest.mock("@/services/workflows/activeRevision", () => ({
  getDefinitionForExecution: async (wf: { draftDefinition: unknown }) => ({
    definition: wf.draftDefinition, source: "draft", revisionId: null,
  }),
}));

// ── DB: integrations (per-account, encrypted like production) ───────────────
const mockGetActive = jest.fn();
const mockMarkNeedsReconnect = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
  markNeedsReconnect: (...a: unknown[]) => mockMarkNeedsReconnect(...a),
}));
jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: async () => undefined,
}));

// ── DB: resource links (predicate-evaluating, like the real repository) ─────
const linkRows: ResourceLinkDTO[] = [];
const findActiveLinkSpy = jest.fn();
jest.mock("@/repositories/resourceLinks/accountResourceLinks", () => ({
  findActiveLink: async (
    accountId: string,
    resourceKind: string,
    sourceProvider: string,
    sourceExternalId: string,
    targetProvider: string,
  ) => {
    findActiveLinkSpy(accountId, resourceKind, sourceProvider, sourceExternalId, targetProvider);
    return (
      linkRows.find(
        (l) =>
          l.accountId === accountId &&
          l.resourceKind === resourceKind &&
          l.sourceProvider === sourceProvider &&
          l.sourceExternalId === sourceExternalId &&
          l.targetProvider === targetProvider &&
          l.archivedAt === null,
      ) ?? null
    );
  },
}));

import { WorkflowEngine } from "@/services/execution/engine";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { encryptToken } from "@/core/encryption/tokens";
import { humanizeActionError } from "@/core/errors/humanizeActionError";
import { failedRunCta } from "@/core/errors/failedRunCta";

// ── Fixtures ────────────────────────────────────────────────────────────────

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

/** The SAME Motive vehicle id in both fleets — the isolation test's whole point. */
const SHARED_MOTIVE_VEHICLE_ID = "motive-veh-88231";
const FUEL_PURCHASE_ID = "fp-778";
const ODOMETER = 152340.5;

const MOTIVE_TOKEN_A = "motive-token-account-a";
const MOTIVE_TOKEN_B = "motive-token-account-b";
const FLEETIO_KEY_A = "fleetio-key-account-a";
const FLEETIO_TOKEN_A = "fleetio-acct-token-account-a";
const FLEETIO_KEY_B = "fleetio-key-account-b";
const FLEETIO_TOKEN_B = "fleetio-acct-token-account-b";

const ORIGINAL_FETCH = global.fetch;

function motiveRow(accountId: string, token: string) {
  return {
    id: `int-motive-${accountId}`,
    accountId,
    provider: "motive",
    providerAccountId: `company-${accountId.slice(0, 4)}`,
    accessTokenEncrypted: encryptToken(token),
    refreshTokenEncrypted: null,
    expiresAt: null,
    needsReconnectAt: null,
  };
}
function fleetioRow(accountId: string, key: string, accountToken: string) {
  return {
    id: `int-fleetio-${accountId}`,
    accountId,
    provider: "fleetio",
    providerAccountId: "7211",
    accessTokenEncrypted: encryptToken(key),
    extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken })),
    needsReconnectAt: null,
  };
}

function link(over: Partial<ResourceLinkDTO> = {}): ResourceLinkDTO {
  return {
    id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
    accountId: ACCOUNT_A,
    resourceKind: "vehicle",
    sourceProvider: "motive",
    sourceExternalId: SHARED_MOTIVE_VEHICLE_ID,
    targetProvider: "fleetio",
    targetExternalId: "42",
    sourceLabel: "Unit 104",
    targetLabel: "Truck 104",
    matchBasis: "manual",
    createdByUserId: USER_A,
    confirmedByUserId: USER_A,
    confirmedAt: "2026-07-20T10:00:00.000Z",
    archivedAt: null,
    createdAt: "2026-07-20T09:59:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

/** The four-node flagship definition, exactly as §4.7 of the plan describes. */
function flagshipDefinition(): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes = [
    {
      id: "t1",
      kind: "trigger",
      provider: "motive",
      type: "new_fuel_purchase",
      config: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "get_fuel",
      kind: "action",
      provider: "motive",
      type: "get_fuel_purchase",
      // The trigger's payload is exposed under the canonical `trigger` alias.
      config: { fuelPurchaseId: "{{trigger.payload.fuelPurchaseId}}" },
      position: { x: 0, y: 100 },
    },
    {
      id: "find_linked",
      kind: "action",
      provider: "fleetio",
      type: "find_linked_vehicle",
      config: {
        sourceProvider: "motive",
        sourceVehicleId: "{{trigger.payload.vehicleId}}",
      },
      position: { x: 0, y: 200 },
    },
    {
      id: "meter",
      kind: "action",
      provider: "fleetio",
      type: "create_meter_entry",
      config: {
        // The FLEETIO id from the bridge — never the Motive one.
        vehicleId: "{{find_linked.vehicleId}}",
        value: "{{get_fuel.odometer}}",
        meterType: "primary",
        readingDate: "{{trigger.payload.purchasedAt}}",
      },
      position: { x: 0, y: 300 },
    },
  ] as unknown as WorkflowNode[];
  const edges = [
    { id: "e1", from: "t1", to: "get_fuel" },
    { id: "e2", from: "get_fuel", to: "find_linked" },
    { id: "e3", from: "find_linked", to: "meter" },
  ] as WorkflowEdge[];
  return { nodes, edges };
}

function workflowFor(accountId: string, createdByUserId: string) {
  return {
    id: "wf-flagship",
    accountId,
    createdByUserId,
    name: "Fuel purchase → Fleetio meter entry",
    state: "active" as const,
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: flagshipDefinition(),
    deletedAt: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
  };
}

/** A realistic `motive:new_fuel_purchase` trigger event. */
function motiveTriggerEvent(): TriggerEvent {
  return {
    provider: "motive",
    eventType: "new_fuel_purchase",
    eventId: "evt-fp-778",
    occurredAt: "2026-07-23T11:58:00Z",
    providerAccountId: "company-aaaa",
    payload: {
      changeKind: "new_fuel_purchase",
      companyId: "company-aaaa",
      fuelPurchaseId: FUEL_PURCHASE_ID,
      purchasedAt: "2026-07-23T11:58:00Z",
      vehicleId: SHARED_MOTIVE_VEHICLE_ID,
      vehicleNumber: "104",
      driverId: "drv-1",
      driverEmail: "driver@example.test",
    },
  } as unknown as TriggerEvent;
}

const MOTIVE_FUEL_PURCHASE_WIRE = {
  fuel_purchase: {
    id: FUEL_PURCHASE_ID,
    purchased_at: "2026-07-23T11:58:00Z",
    odometer: ODOMETER,
    odometer_unit: "MI",
    fuel: 110.4,
    fuel_unit: "gal",
    total_cost: 421.55,
    currency: "USD",
    vendor: "Pilot",
    vehicle: { id: SHARED_MOTIVE_VEHICLE_ID, number: "104" },
    secret_internal: "motive-must-not-leak",
  },
};

const FLEETIO_METER_ENTRY_CREATED = {
  id: 9001,
  account_id: 7211,
  value: String(ODOMETER),
  meter_type: null,
  vehicle_id: 42,
  void: false,
  date: "2026-07-23",
  created_at: "2026-07-23T12:00:00Z",
  secret_internal: "fleetio-must-not-leak",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * One fetch mock standing in for BOTH providers, routed by URL. Every call is
 * recorded so the assertions can prove exactly how many writes happened and
 * exactly what the outbound body contained.
 */
function installProviderBoundary(options: {
  fleetioMeterEntryResponse?: () => Response;
  motiveFuelPurchaseResponse?: () => Response;
} = {}): { calls: FetchCall[]; mock: jest.Mock } {
  const calls: FetchCall[] = [];
  // Structurally typed rather than `RequestInit`: the DOM lib's globals are not
  // in this suite's ESLint environment, and only these three fields are read.
  type CapturedInit = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
  const mock = jest.fn(async (url: string, init?: CapturedInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({
      url,
      method,
      body,
      headers: init?.headers ?? {},
    });

    if (url.includes("/fuel_purchases/")) {
      return (
        options.motiveFuelPurchaseResponse?.() ??
        jsonResponse(200, MOTIVE_FUEL_PURCHASE_WIRE)
      );
    }
    if (url.includes("/meter_entries")) {
      return (
        options.fleetioMeterEntryResponse?.() ??
        jsonResponse(201, FLEETIO_METER_ENTRY_CREATED)
      );
    }
    throw new Error(`Unexpected provider call in walkthrough: ${method} ${url}`);
  });
  global.fetch = mock as unknown as typeof fetch;
  return { calls, mock };
}

/** Route integration lookups by account so cross-account isolation is real. */
function installIntegrations(input: {
  accounts: Record<string, { motive?: boolean; fleetio?: boolean }>;
}) {
  mockGetActive.mockImplementation(async (accountId: string, provider: string) => {
    const cfg = input.accounts[accountId];
    if (!cfg) return null;
    if (provider === "motive") {
      if (!cfg.motive) return null;
      return motiveRow(accountId, accountId === ACCOUNT_A ? MOTIVE_TOKEN_A : MOTIVE_TOKEN_B);
    }
    if (provider === "fleetio") {
      if (!cfg.fleetio) return null;
      return accountId === ACCOUNT_A
        ? fleetioRow(ACCOUNT_A, FLEETIO_KEY_A, FLEETIO_TOKEN_A)
        : fleetioRow(ACCOUNT_B, FLEETIO_KEY_B, FLEETIO_TOKEN_B);
    }
    return null;
  });
}

async function runFlagship(accountId: string, userId: string) {
  mockGetWorkflow.mockResolvedValue(workflowFor(accountId, userId));
  return new WorkflowEngine({ resolveStrict }).runWorkflow({
    workflowId: "wf-flagship",
    triggerNodeId: "t1",
    triggerEvent: motiveTriggerEvent(),
  });
}

const ALL_SECRETS = [
  MOTIVE_TOKEN_A, MOTIVE_TOKEN_B,
  FLEETIO_KEY_A, FLEETIO_TOKEN_A, FLEETIO_KEY_B, FLEETIO_TOKEN_B,
];

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  linkRows.length = 0;
  persistedRuns.length = 0;
  findActiveLinkSpy.mockClear();
  mockGetWorkflow.mockReset();
  mockGetActive.mockReset();
  mockMarkNeedsReconnect.mockReset();
  mockMarkNeedsReconnect.mockResolvedValue(false);
  mockNotify.mockReset();
  mockNotify.mockResolvedValue({ claimed: true, results: [] });
  installIntegrations({
    accounts: {
      [ACCOUNT_A]: { motive: true, fleetio: true },
      [ACCOUNT_B]: { motive: true, fleetio: true },
    },
  });
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

// ────────────────────────────────────────────────────────────────────────────

describe("flagship walkthrough — the happy path, end to end", () => {
  it("runs all four nodes and writes exactly one Fleetio meter entry", async () => {
    // 1. Account A owns a CONFIRMED Motive→Fleetio vehicle link.
    linkRows.push(link());
    const { calls } = installProviderBoundary();

    const result = await runFlagship(ACCOUNT_A, USER_A);

    expect(result.status).toBe("succeeded");
    const byNode = Object.fromEntries(result.steps.map((s) => [s.nodeId, s]));

    // 2. Get Fuel Purchase returned the odometer reading.
    expect(byNode.get_fuel!.status).toBe("succeeded");
    expect(byNode.get_fuel!.output).toMatchObject({ found: true, odometer: ODOMETER });

    // 3. Find Linked Fleetio Vehicle resolved the link — with NO HTTP call.
    expect(byNode.find_linked!.status).toBe("succeeded");
    expect(byNode.find_linked!.output).toEqual({
      vehicleId: "42",
      vehicleName: "Truck 104",
      sourceVehicleId: SHARED_MOTIVE_VEHICLE_ID,
      linkedAt: "2026-07-20T10:00:00.000Z",
    });
    // The lookup is keyed on the account, kind, both providers and the id.
    expect(findActiveLinkSpy).toHaveBeenCalledTimes(1);
    expect(findActiveLinkSpy).toHaveBeenCalledWith(
      ACCOUNT_A, "vehicle", "motive", SHARED_MOTIVE_VEHICLE_ID, "fleetio",
    );

    // 4/5. Exactly TWO provider calls in the whole run: one Motive read and one
    //      Fleetio write. The bridge itself contributed none.
    expect(calls).toHaveLength(2);
    const meterWrites = calls.filter((c) => c.url.includes("/meter_entries"));
    expect(meterWrites).toHaveLength(1);
    expect(meterWrites[0]!.method).toBe("POST");

    // 6. The outbound Fleetio body carries ONLY the approved fields — and the
    //    FLEETIO vehicle id, never the Motive one.
    expect(meterWrites[0]!.body).toEqual({
      vehicle_id: 42,
      value: ODOMETER,
      date: "2026-07-23T11:58:00Z",
    });
    expect(JSON.stringify(meterWrites[0]!.body)).not.toContain(SHARED_MOTIVE_VEHICLE_ID);

    expect(byNode.meter!.status).toBe("succeeded");
    expect(byNode.meter!.output).toMatchObject({ meterEntryId: "9001", vehicleId: "42" });
  });

  it("11. leaks no credential, row id, account id, or provider junk into the run", async () => {
    linkRows.push(link());
    installProviderBoundary();

    const result = await runFlagship(ACCOUNT_A, USER_A);
    const runBlob = JSON.stringify(result) + JSON.stringify(persistedRuns);

    for (const secret of ALL_SECRETS) expect(runBlob).not.toContain(secret);
    expect(runBlob).not.toContain("motive-must-not-leak");
    expect(runBlob).not.toContain("fleetio-must-not-leak");
    // The link's DATABASE row id and the owning account id never surface.
    expect(runBlob).not.toContain(linkRows[0]!.id);
    expect(runBlob).not.toContain(ACCOUNT_A);
    expect(runBlob).not.toContain(ACCOUNT_B);
    // Nor the confirmer's user id.
    expect(runBlob).not.toContain(USER_A);
  });

  it("resolves every mapped reference with the REAL strict resolver", () => {
    // Proven at the seam as well as through the engine: a missing upstream
    // field is a MissingVariableError, never a silently-empty config.
    expect(() =>
      resolveStrict(
        { vehicleId: "{{find_linked.vehicleId}}" },
        { variables: { find_linked: {} } },
      ),
    ).toThrow();
  });
});

describe("cross-account isolation on the mapping itself", () => {
  it("7/8. the same Motive id resolves to a DIFFERENT Fleetio vehicle per account", async () => {
    linkRows.push(link({ accountId: ACCOUNT_A, targetExternalId: "42", targetLabel: "Truck 104" }));
    linkRows.push(
      link({
        id: "22222222-2222-4222-8222-bbbbbbbbbbbb",
        accountId: ACCOUNT_B,
        targetExternalId: "907",
        targetLabel: "B-Fleet Rig 7",
        createdByUserId: USER_B,
        confirmedByUserId: USER_B,
      }),
    );

    const a = installProviderBoundary();
    const aResult = await runFlagship(ACCOUNT_A, USER_A);
    const aWrite = a.calls.find((c) => c.url.includes("/meter_entries"))!;

    const b = installProviderBoundary();
    const bResult = await runFlagship(ACCOUNT_B, USER_B);
    const bWrite = b.calls.find((c) => c.url.includes("/meter_entries"))!;

    expect(aResult.status).toBe("succeeded");
    expect(bResult.status).toBe("succeeded");
    // Same Motive vehicle in; different Fleetio vehicle out.
    expect((aWrite.body as { vehicle_id: number }).vehicle_id).toBe(42);
    expect((bWrite.body as { vehicle_id: number }).vehicle_id).toBe(907);

    // Account A never sees B's link, label, or credential — and vice versa.
    const aBlob = JSON.stringify(aResult);
    const bBlob = JSON.stringify(bResult);
    expect(aBlob).not.toContain("B-Fleet Rig 7");
    expect(aBlob).not.toContain("907");
    expect(aBlob).not.toContain(FLEETIO_KEY_B);
    expect(bBlob).not.toContain("Truck 104");
    expect(bBlob).not.toContain(FLEETIO_KEY_A);
  });

  it("account B's link does NOT satisfy account A's lookup", async () => {
    // Only B holds a mapping for the shared Motive id.
    linkRows.push(
      link({ id: "b-only", accountId: ACCOUNT_B, targetExternalId: "907", targetLabel: "B Rig" }),
    );
    const { calls } = installProviderBoundary();

    const result = await runFlagship(ACCOUNT_A, USER_A);

    expect(result.status).toBe("failed");
    const failed = result.steps.find((s) => s.status === "failed")!;
    expect(failed.nodeId).toBe("find_linked");
    expect(failed.error?.code).toBe("UNMAPPED_VEHICLE");
    // No Fleetio write, and nothing about B's fleet in the failure.
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(0);
    const blob = JSON.stringify(result);
    expect(blob).not.toContain("B Rig");
    expect(blob).not.toContain("907");
  });
});

describe("9. a missing or archived link stops the run BEFORE the Fleetio write", () => {
  it("no link at all ⇒ UNMAPPED_VEHICLE, meter node skipped, zero writes", async () => {
    const { calls } = installProviderBoundary();

    const result = await runFlagship(ACCOUNT_A, USER_A);

    expect(result.status).toBe("failed");
    const byNode = Object.fromEntries(result.steps.map((s) => [s.nodeId, s]));
    expect(byNode.get_fuel!.status).toBe("succeeded");
    expect(byNode.find_linked!.status).toBe("failed");
    expect(byNode.find_linked!.error?.code).toBe("UNMAPPED_VEHICLE");
    // The write node never ran.
    expect(byNode.meter?.status).not.toBe("succeeded");
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(0);
  });

  it("an ARCHIVED link behaves identically to no link", async () => {
    linkRows.push(link({ archivedAt: "2026-07-22T08:00:00.000Z" }));
    const { calls } = installProviderBoundary();

    const result = await runFlagship(ACCOUNT_A, USER_A);

    expect(result.status).toBe("failed");
    const failed = result.steps.find((s) => s.status === "failed")!;
    expect(failed.nodeId).toBe("find_linked");
    expect(failed.error?.code).toBe("UNMAPPED_VEHICLE");
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(0);
    // The archived link's target is never revealed.
    expect(JSON.stringify(result)).not.toContain("Truck 104");
  });

  it("both cases persist the SAME user-facing classification", async () => {
    installProviderBoundary();
    await runFlagship(ACCOUNT_A, USER_A);
    const missing = persistedRuns.at(-1)!.errorClassification;

    persistedRuns.length = 0;
    linkRows.push(link({ archivedAt: "2026-07-22T08:00:00.000Z" }));
    installProviderBoundary();
    await runFlagship(ACCOUNT_A, USER_A);
    const archived = persistedRuns.at(-1)!.errorClassification;

    expect(archived).toEqual(missing);
    expect(missing).toMatchObject({
      title: "Vehicle isn't linked yet",
      description:
        "This Motive vehicle is not linked to Fleetio yet. Link it in Apps → Vehicle Links, then run the workflow again.",
      action: "link_vehicles",
    });
    // The persisted copy never names the vehicle, so it is safe to notify on.
    expect(JSON.stringify(missing)).not.toContain(SHARED_MOTIVE_VEHICLE_ID);
  });

  it("the persisted classification drives the Link vehicles CTA", async () => {
    installProviderBoundary();
    await runFlagship(ACCOUNT_A, USER_A);
    const classification = persistedRuns.at(-1)!.errorClassification as {
      action: Parameters<typeof failedRunCta>[0];
    };
    expect(failedRunCta(classification.action, { workflowId: "wf-flagship" })).toEqual({
      label: "Link vehicles",
      href: "/apps/vehicle-links",
    });
  });
});

describe("10. a disconnected Fleetio blocks the WRITE, not the lookup", () => {
  it("the bridge still resolves; the meter entry fails with reconnect guidance", async () => {
    linkRows.push(link());
    // Motive connected, Fleetio NOT.
    installIntegrations({
      accounts: {
        [ACCOUNT_A]: { motive: true, fleetio: false },
        [ACCOUNT_B]: { motive: true, fleetio: true },
      },
    });
    const { calls } = installProviderBoundary();

    const result = await runFlagship(ACCOUNT_A, USER_A);

    const byNode = Object.fromEntries(result.steps.map((s) => [s.nodeId, s]));
    // The lookup SUCCEEDED — it reads ChainReact's own table, not Fleetio.
    expect(byNode.find_linked!.status).toBe("succeeded");
    expect(byNode.find_linked!.output).toMatchObject({ vehicleId: "42" });
    // The WRITE is what failed, and it names the connection as the fix.
    expect(byNode.meter!.status).toBe("failed");
    expect(byNode.meter!.error?.message).toMatch(/no active Fleetio integration/i);
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(0);
  });

  it("a 401 from Fleetio surfaces as reconnect-required after ONE attempt", async () => {
    linkRows.push(link());
    const { calls } = installProviderBoundary({
      fleetioMeterEntryResponse: () => new Response("unauthorized", { status: 401 }),
    });

    const result = await runFlagship(ACCOUNT_A, USER_A);

    const byNode = Object.fromEntries(result.steps.map((s) => [s.nodeId, s]));
    expect(byNode.find_linked!.status).toBe("succeeded");
    expect(byNode.meter!.status).toBe("failed");
    expect(byNode.meter!.error?.code).toBe("INTEGRATION_REAUTH_REQUIRED");
    // Fleetio cannot refresh, so the row is marked for reconnect — once.
    expect(mockMarkNeedsReconnect).toHaveBeenCalledTimes(1);
    // Exactly ONE write attempt: a non-refreshable 401 is never replayed.
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(1);
  });
});

describe("12. a failed meter-entry write is never auto-replayed", () => {
  it.each([
    ["a 422 validation failure", () => jsonResponse(422, { errors: { value: ["must fall between"] } })],
    ["a 500 server error", () => jsonResponse(500, { error: "boom" })],
  ])("%s produces exactly one POST", async (_label, responder) => {
    linkRows.push(link());
    const { calls } = installProviderBoundary({ fleetioMeterEntryResponse: responder });

    const result = await runFlagship(ACCOUNT_A, USER_A);

    expect(result.status).toBe("failed");
    // The engine invokes a handler exactly once and the wrapper never replays a
    // POST — a duplicated meter entry would corrupt PM scheduling.
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(1);
  });

  it("a 429 is likewise not replayed for a write", async () => {
    linkRows.push(link());
    const { calls } = installProviderBoundary({
      fleetioMeterEntryResponse: () =>
        new Response(JSON.stringify({ error: "slow down" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "0" },
        }),
    });

    await runFlagship(ACCOUNT_A, USER_A);
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(1);
  });
});

describe("personal-account behavior (no team membership anywhere)", () => {
  /**
   * A personal account is just an account. The flagship path must not require
   * membership, a team, or an active-account switch — which is exactly why the
   * engine threads `workflow.accountId` and nothing else.
   */
  const PERSONAL_ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const PERSONAL_USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  it("resolves the mapping from the personal account and writes once", async () => {
    installIntegrations({ accounts: { [PERSONAL_ACCOUNT]: { motive: true, fleetio: true } } });
    linkRows.push(
      link({ id: "personal-link", accountId: PERSONAL_ACCOUNT, targetExternalId: "77", targetLabel: "My Truck" }),
    );
    const { calls } = installProviderBoundary();

    const result = await runFlagship(PERSONAL_ACCOUNT, PERSONAL_USER);

    expect(result.status).toBe("succeeded");
    expect(findActiveLinkSpy).toHaveBeenCalledWith(
      PERSONAL_ACCOUNT, "vehicle", "motive", SHARED_MOTIVE_VEHICLE_ID, "fleetio",
    );
    const write = calls.find((c) => c.url.includes("/meter_entries"))!;
    expect((write.body as { vehicle_id: number }).vehicle_id).toBe(77);
  });

  it("a personal account never resolves a TEAM account's mapping", async () => {
    installIntegrations({ accounts: { [PERSONAL_ACCOUNT]: { motive: true, fleetio: true } } });
    // The only link belongs to the team account.
    linkRows.push(link({ accountId: ACCOUNT_A }));
    const { calls } = installProviderBoundary();

    const result = await runFlagship(PERSONAL_ACCOUNT, PERSONAL_USER);

    expect(result.status).toBe("failed");
    expect(result.steps.find((s) => s.status === "failed")!.error?.code).toBe("UNMAPPED_VEHICLE");
    expect(calls.filter((c) => c.url.includes("/meter_entries"))).toHaveLength(0);
  });
});

describe("the unmapped classification is safe to surface anywhere", () => {
  it("is identifier-free even when the handler message names the vehicle", () => {
    const humanized = humanizeActionError({
      code: "UNMAPPED_VEHICLE",
      message: `Motive vehicle "${SHARED_MOTIVE_VEHICLE_ID}" isn't linked to a Fleetio vehicle yet.`,
    });
    expect(JSON.stringify(humanized)).not.toContain(SHARED_MOTIVE_VEHICLE_ID);
    expect(humanized.action).toBe("link_vehicles");
  });
});
