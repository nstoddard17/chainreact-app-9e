/**
 * @jest-environment node
 *
 * `fleetio:find_linked_vehicle` handler + schema + bounded output
 * (5.TRUCK-BRIDGE-1 CS-3).
 *
 * Real: the strict action schema, the canonical variable resolver
 * (`resolveStrict`), the real handler registry, the real bounded output
 * shaping, and the real typed error. Mocked ONLY: the repository/database
 * boundary — and the mock is not a stub that returns a canned row, it is a
 * small in-memory table that ACTUALLY EVALUATES the account / kind / provider /
 * external-id / archived predicates. Cross-account isolation and archival
 * exclusion are therefore proven as SEMANTICS, not as recorded filter calls
 * (the CS-1 repository-suite posture).
 *
 * Business rules protected:
 *   - Direct AND mapped `{{trigger.vehicleId}}` source ids both resolve.
 *   - `resolveStrict` runs BEFORE the handler; a missing mapped reference
 *     prevents the repository from ever being reached.
 *   - Blank / unknown-provider / extra-field configs reject before any
 *     repository access.
 *   - Account A resolves A's target; account B's identical Motive id resolves
 *     to B's OWN target; A can infer nothing about B.
 *   - Missing link AND archived link both produce the same typed
 *     `UNMAPPED_VEHICLE` — never `{success:false}`, never a fabricated id.
 *   - The output is exactly four approved keys; no raw repository field leaks.
 *   - ZERO provider HTTP calls, ever.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

/** In-memory `account_resource_links` rows — the mocked DB boundary's data. */
const linkRows: ResourceLinkDTO[] = [];

const mockFindActiveLink = jest.fn(
  async (
    accountId: string,
    resourceKind: string,
    sourceProvider: string,
    sourceExternalId: string,
    targetProvider: string,
  ): Promise<ResourceLinkDTO | null> =>
    // The REAL predicate set the repository applies, evaluated for real.
    linkRows.find(
      (r) =>
        r.accountId === accountId &&
        r.resourceKind === resourceKind &&
        r.sourceProvider === sourceProvider &&
        r.sourceExternalId === sourceExternalId &&
        r.targetProvider === targetProvider &&
        r.archivedAt === null,
    ) ?? null,
);

jest.mock("@/repositories/resourceLinks/accountResourceLinks", () => ({
  findActiveLink: (...args: unknown[]) =>
    (mockFindActiveLink as unknown as (...a: unknown[]) => unknown)(...args),
}));

import {
  findLinkedVehicle,
  UnmappedVehicleError,
} from "@/integrations/fleetio/actions/findLinkedVehicle";
import { FindLinkedVehicleConfigSchema } from "@/integrations/fleetio/actions/findLinkedVehicle.schema";
import { CreateMeterEntryConfigSchema } from "@/integrations/fleetio/actions/createMeterEntry.schema";
import { fleetioFindLinkedVehicleMeta } from "@/integrations/fleetio/actions/findLinkedVehicle.meta";
import { getActionHandler } from "@/services/execution/handlers/_registry";
import { resolveStrict, MissingVariableError } from "@/workflow-engine/variables/resolveValue";

const ORIGINAL_FETCH = global.fetch;

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** The SAME Motive vehicle id both fleets happen to hold. */
const SHARED_MOTIVE_ID = "motive-veh-88231";

function link(over: Partial<ResourceLinkDTO> = {}): ResourceLinkDTO {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    accountId: ACCOUNT_A,
    resourceKind: "vehicle",
    sourceProvider: "motive",
    sourceExternalId: SHARED_MOTIVE_ID,
    targetProvider: "fleetio",
    targetExternalId: "42",
    sourceLabel: "Unit 104",
    targetLabel: "Truck 104",
    matchBasis: "suggested_vin",
    createdByUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    confirmedByUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    confirmedAt: "2026-07-20T10:00:00.000Z",
    archivedAt: null,
    createdAt: "2026-07-20T09:59:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...over,
  };
}

/** A realistic `motive:new_fuel_purchase` trigger payload. */
const MOTIVE_TRIGGER_PAYLOAD = {
  fuelPurchaseId: "fp-778",
  vehicleId: SHARED_MOTIVE_ID,
  vehicleNumber: "104",
  occurredAt: "2026-07-23T11:58:00Z",
};

function trigger(): TriggerEvent {
  return {
    provider: "motive",
    eventType: "new_fuel_purchase",
    eventId: "evt-1",
    occurredAt: "2026-07-23T11:58:00Z",
    accountId: null,
    payload: { ...MOTIVE_TRIGGER_PAYLOAD },
  } as unknown as TriggerEvent;
}

const VALID_CONFIG = { sourceProvider: "motive", sourceVehicleId: SHARED_MOTIVE_ID };

function handlerInput(over: Partial<ActionHandlerInput> = {}): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: ACCOUNT_A,
    runId: "run-1",
    nodeId: "find_linked",
    config: { ...VALID_CONFIG },
    triggerEvent: trigger(),
    testMode: false,
    ...over,
  };
}

/** Installs a fetch spy so "zero provider HTTP calls" is asserted, not assumed. */
function installFetchSpy(): jest.Mock {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

let fetchSpy: jest.Mock;

beforeEach(() => {
  linkRows.length = 0;
  mockFindActiveLink.mockClear();
  fetchSpy = installFetchSpy();
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("findLinkedVehicle — resolves the linked Fleetio vehicle", () => {
  it("returns EXACTLY the bounded output for a DIRECT source vehicle id, with zero HTTP calls", async () => {
    linkRows.push(link());

    const { output } = await findLinkedVehicle(handlerInput());

    expect(output).toEqual({
      vehicleId: "42",
      vehicleName: "Truck 104",
      sourceVehicleId: SHARED_MOTIVE_ID,
      linkedAt: "2026-07-20T10:00:00.000Z",
    });
    expect(Object.keys(output)).toEqual([
      "vehicleId",
      "vehicleName",
      "sourceVehicleId",
      "linkedAt",
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("queries with the EXACT lookup key: account + kind + source provider + source id + fleetio", async () => {
    linkRows.push(link());
    await findLinkedVehicle(handlerInput());
    expect(mockFindActiveLink).toHaveBeenCalledTimes(1);
    expect(mockFindActiveLink).toHaveBeenCalledWith(
      ACCOUNT_A,
      "vehicle",
      "motive",
      SHARED_MOTIVE_ID,
      "fleetio",
    );
  });

  it("uses input.accountId — a config-supplied account id is a PARSE ERROR, not authorization", async () => {
    linkRows.push(link({ accountId: ACCOUNT_B, targetExternalId: "999" }));
    await expect(
      findLinkedVehicle(
        handlerInput({
          accountId: ACCOUNT_A,
          config: { ...VALID_CONFIG, accountId: ACCOUNT_B } as Record<string, unknown>,
        }),
      ),
    ).rejects.toThrow();
    expect(mockFindActiveLink).not.toHaveBeenCalled();
  });

  it("leaks no raw repository field into the output", async () => {
    const row = link();
    linkRows.push(row);
    const { output } = await findLinkedVehicle(handlerInput());
    const blob = JSON.stringify(output);
    expect(blob).not.toContain(row.id);
    expect(blob).not.toContain(row.accountId);
    expect(blob).not.toContain(row.createdByUserId!);
    expect(blob).not.toContain(row.confirmedByUserId!);
    expect(blob).not.toContain(row.matchBasis);
    expect(blob).not.toContain(row.sourceLabel!);
    expect(output).not.toHaveProperty("found");
  });

  it("accepts a NUMERIC source vehicle id (the resolver preserves upstream types)", async () => {
    linkRows.push(link({ sourceExternalId: "88231" }));
    const { output } = await findLinkedVehicle(
      handlerInput({ config: { sourceProvider: "motive", sourceVehicleId: 88231 } }),
    );
    expect(output.sourceVehicleId).toBe("88231");
    expect(output.vehicleId).toBe("42");
  });

  it("trims a padded source vehicle id before looking it up", async () => {
    linkRows.push(link());
    const { output } = await findLinkedVehicle(
      handlerInput({ config: { sourceProvider: "motive", sourceVehicleId: `  ${SHARED_MOTIVE_ID}  ` } }),
    );
    expect(mockFindActiveLink).toHaveBeenCalledWith(
      ACCOUNT_A,
      "vehicle",
      "motive",
      SHARED_MOTIVE_ID,
      "fleetio",
    );
    expect(output.vehicleId).toBe("42");
  });
});

describe("findLinkedVehicle — schema validation (before ANY repository access)", () => {
  it.each([
    ["missing telematics system", { sourceVehicleId: SHARED_MOTIVE_ID }],
    ["missing vehicle id", { sourceProvider: "motive" }],
    ["blank vehicle id", { sourceProvider: "motive", sourceVehicleId: "" }],
    ["whitespace-only vehicle id", { sourceProvider: "motive", sourceVehicleId: "   " }],
    ["unknown source provider", { sourceProvider: "samsara", sourceVehicleId: SHARED_MOTIVE_ID }],
    ["fleetio as a source provider", { sourceProvider: "fleetio", sourceVehicleId: "42" }],
    ["NaN vehicle id", { sourceProvider: "motive", sourceVehicleId: Number.NaN }],
    ["Infinity vehicle id", { sourceProvider: "motive", sourceVehicleId: Number.POSITIVE_INFINITY }],
    ["over-long vehicle id", { sourceProvider: "motive", sourceVehicleId: "x".repeat(257) }],
    ["an unresolved template", { sourceProvider: "{{a.b}}", sourceVehicleId: SHARED_MOTIVE_ID }],
    ["a target provider field", { ...VALID_CONFIG, targetProvider: "fleetio" }],
    ["a link id field", { ...VALID_CONFIG, linkId: "11111111-1111-4111-8111-111111111111" }],
    ["a fleetio vehicle id field", { ...VALID_CONFIG, vehicleId: "42" }],
    ["a resource kind field", { ...VALID_CONFIG, resourceKind: "vehicle" }],
    ["an integration id field", { ...VALID_CONFIG, integrationId: "int-1" }],
  ])("rejects %s before the repository is touched", async (_label, config) => {
    linkRows.push(link());
    await expect(
      findLinkedVehicle(handlerInput({ config: config as Record<string, unknown> })),
    ).rejects.toThrow();
    expect(mockFindActiveLink).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("bounds the source vehicle id at the SAME 256 chars the link table stores", () => {
    expect(() =>
      FindLinkedVehicleConfigSchema.parse({
        sourceProvider: "motive",
        sourceVehicleId: "x".repeat(256),
      }),
    ).not.toThrow();
    expect(() =>
      FindLinkedVehicleConfigSchema.parse({
        sourceProvider: "motive",
        sourceVehicleId: "x".repeat(257),
      }),
    ).toThrow();
  });

  it("offers exactly one source-provider option and applies no default", () => {
    expect(() => FindLinkedVehicleConfigSchema.parse({ sourceVehicleId: "x" })).toThrow();
    expect(
      FindLinkedVehicleConfigSchema.parse({ sourceProvider: "motive", sourceVehicleId: "x" }),
    ).toEqual({ sourceProvider: "motive", sourceVehicleId: "x" });
  });
});

describe("findLinkedVehicle — unmapped and archived", () => {
  it("throws typed UNMAPPED_VEHICLE when no link exists, naming the fix", async () => {
    let thrown: unknown;
    try {
      await findLinkedVehicle(handlerInput());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnmappedVehicleError);
    expect((thrown as UnmappedVehicleError).code).toBe("UNMAPPED_VEHICLE");
    expect((thrown as Error).name).toBe("UnmappedVehicleError");
    expect((thrown as Error).message).toMatch(/Apps → Vehicle Links/);
    expect((thrown as Error).message).toContain(SHARED_MOTIVE_ID);
    expect((thrown as Error).message).toContain("Motive");
    // Never a synthetic envelope, never a fabricated vehicle id.
    expect(thrown).not.toHaveProperty("success");
    expect(thrown).not.toHaveProperty("output");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an ARCHIVED link follows the SAME unmapped path and never resolves", async () => {
    linkRows.push(link({ archivedAt: "2026-07-22T08:00:00.000Z" }));

    let thrown: unknown;
    try {
      await findLinkedVehicle(handlerInput());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnmappedVehicleError);
    expect((thrown as UnmappedVehicleError).code).toBe("UNMAPPED_VEHICLE");
    // The archived row's target is never surfaced, in output or in the error.
    expect((thrown as Error).message).not.toContain("42");
    expect((thrown as Error).message).not.toContain("Truck 104");
  });

  it("the archived message is BYTE-IDENTICAL to the never-linked message", async () => {
    const missing = await findLinkedVehicle(handlerInput()).catch((e: Error) => e.message);
    linkRows.push(link({ archivedAt: "2026-07-22T08:00:00.000Z" }));
    const archived = await findLinkedVehicle(handlerInput()).catch((e: Error) => e.message);
    expect(archived).toBe(missing);
  });
});

describe("findLinkedVehicle — account isolation", () => {
  beforeEach(() => {
    // Both fleets run the SAME Motive vehicle id, mapped to DIFFERENT trucks.
    linkRows.push(link({ accountId: ACCOUNT_A, targetExternalId: "42", targetLabel: "Truck 104" }));
    linkRows.push(
      link({
        id: "22222222-2222-4222-8222-222222222222",
        accountId: ACCOUNT_B,
        targetExternalId: "907",
        targetLabel: "B-Fleet Rig 7",
        confirmedByUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      }),
    );
  });

  it("account A resolves A's target", async () => {
    const { output } = await findLinkedVehicle(handlerInput({ accountId: ACCOUNT_A }));
    expect(output.vehicleId).toBe("42");
    expect(output.vehicleName).toBe("Truck 104");
  });

  it("account B's IDENTICAL Motive id resolves to B's OWN target", async () => {
    const { output } = await findLinkedVehicle(handlerInput({ accountId: ACCOUNT_B }));
    expect(output.vehicleId).toBe("907");
    expect(output.vehicleName).toBe("B-Fleet Rig 7");
  });

  it("neither account's result contains the other's target, label, or confirmer", async () => {
    const a = JSON.stringify((await findLinkedVehicle(handlerInput({ accountId: ACCOUNT_A }))).output);
    const b = JSON.stringify((await findLinkedVehicle(handlerInput({ accountId: ACCOUNT_B }))).output);
    expect(a).not.toContain("907");
    expect(a).not.toContain("B-Fleet Rig 7");
    expect(a).not.toContain("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    expect(b).not.toContain("Truck 104");
    expect(b).not.toContain("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(b).not.toContain(ACCOUNT_A);
  });

  it("account A cannot INFER that account B has a link: same failure either way", async () => {
    const otherId = "motive-veh-only-in-B";
    linkRows.push(
      link({
        id: "33333333-3333-4333-8333-333333333333",
        accountId: ACCOUNT_B,
        sourceExternalId: otherId,
        targetExternalId: "5150",
        targetLabel: "B-Fleet Rig 9",
      }),
    );

    // A asks for an id B HAS mapped …
    const withRival = await findLinkedVehicle(
      handlerInput({
        accountId: ACCOUNT_A,
        config: { sourceProvider: "motive", sourceVehicleId: otherId },
      }),
    ).catch((e: Error) => e);
    // … and for an id NOBODY has mapped.
    const withoutRival = await findLinkedVehicle(
      handlerInput({
        accountId: ACCOUNT_A,
        config: { sourceProvider: "motive", sourceVehicleId: "motive-veh-nowhere" },
      }),
    ).catch((e: Error) => e);

    expect(withRival).toBeInstanceOf(UnmappedVehicleError);
    expect(withoutRival).toBeInstanceOf(UnmappedVehicleError);
    expect((withRival as UnmappedVehicleError).code).toBe(
      (withoutRival as UnmappedVehicleError).code,
    );
    // Identical shape; the ONLY difference is the id the caller itself supplied.
    expect((withRival as Error).message.replace(otherId, "<id>")).toBe(
      (withoutRival as Error).message.replace("motive-veh-nowhere", "<id>"),
    );
    expect((withRival as Error).message).not.toContain("5150");
    expect((withRival as Error).message).not.toContain("B-Fleet Rig 9");
    expect((withRival as Error).message).not.toContain(ACCOUNT_B);
  });

  it("never falls back across accounts for an account with NO links at all", async () => {
    const empty = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await expect(findLinkedVehicle(handlerInput({ accountId: empty }))).rejects.toBeInstanceOf(
      UnmappedVehicleError,
    );
  });
});

describe("focused walkthrough — Motive trigger → linked Fleetio vehicle → Create Meter Entry", () => {
  it("resolves the mapped Motive id with the REAL resolver, dispatches the REAL registry, and feeds Create Meter Entry", async () => {
    // 1. Account A has a CONFIRMED Motive→Fleetio vehicle link.
    linkRows.push(link({ accountId: ACCOUNT_A, targetExternalId: "42", targetLabel: "Truck 104" }));
    // 8. Account B has the SAME Motive id mapped to its own Fleetio vehicle.
    linkRows.push(
      link({
        id: "22222222-2222-4222-8222-222222222222",
        accountId: ACCOUNT_B,
        targetExternalId: "907",
        targetLabel: "B-Fleet Rig 7",
      }),
    );

    // 2/3. A Motive-shaped trigger emits `vehicleId`; the REAL strict resolver
    //      resolves the mapped source id BEFORE the handler runs.
    const rawConfig = { sourceProvider: "motive", sourceVehicleId: "{{trigger.vehicleId}}" };
    const resolved = resolveStrict(rawConfig, { variables: { trigger: MOTIVE_TRIGGER_PAYLOAD } });
    expect(resolved).toEqual({ sourceProvider: "motive", sourceVehicleId: SHARED_MOTIVE_ID });

    // 4. The REAL action registry dispatches fleetio:find_linked_vehicle.
    const handler = getActionHandler("fleetio", "find_linked_vehicle");
    expect(handler).toBeTruthy();

    // 5. It returns Account A's Fleetio vehicle id.
    const result = await handler!(
      handlerInput({ accountId: ACCOUNT_A, config: resolved as Record<string, unknown> }),
    );
    expect(result.output).toEqual({
      vehicleId: "42",
      vehicleName: "Truck 104",
      sourceVehicleId: SHARED_MOTIVE_ID,
      linkedAt: "2026-07-20T10:00:00.000Z",
    });

    // 6. No provider HTTP call occurred — and the action needs no integration.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fleetioFindLinkedVehicleMeta.requiresIntegration).toBe(false);

    // 7. The result maps straight into Create Meter Entry's Vehicle field and
    //    passes that action's REAL strict schema (proven at the seam, without
    //    invoking the write itself — that flow is FLEETIO-4's own suite).
    const meterConfig = resolveStrict(
      {
        vehicleId: "{{find_linked.vehicleId}}",
        value: "{{get_fuel.odometer}}",
        meterType: "primary",
        readingDate: "{{trigger.occurredAt}}",
      },
      {
        variables: {
          find_linked: result.output,
          get_fuel: { odometer: 152340.5 },
          trigger: MOTIVE_TRIGGER_PAYLOAD,
        },
      },
    );
    expect(CreateMeterEntryConfigSchema.parse(meterConfig)).toEqual({
      vehicleId: "42",
      value: 152340.5,
      meterType: "primary",
      readingDate: "2026-07-23T11:58:00Z",
    });

    // 8. Account B's identical Motive id resolves to B's OWN target.
    const bResult = await handler!(
      handlerInput({ accountId: ACCOUNT_B, config: resolved as Record<string, unknown> }),
    );
    expect(bResult.output.vehicleId).toBe("907");

    // 10. No secret or cross-account data appears in either output.
    const blob = JSON.stringify(result) + JSON.stringify(bResult);
    expect(blob).not.toContain(ACCOUNT_A);
    expect(blob).not.toContain(ACCOUNT_B);
    expect(blob).not.toContain("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(blob).not.toContain("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(JSON.stringify(result)).not.toContain("907");
    expect(JSON.stringify(bResult)).not.toContain("Truck 104");
  });

  it("9. an ARCHIVED link stops execution before Create Meter Entry runs", async () => {
    linkRows.push(link({ accountId: ACCOUNT_A, archivedAt: "2026-07-22T08:00:00.000Z" }));

    const resolved = resolveStrict(
      { sourceProvider: "motive", sourceVehicleId: "{{trigger.vehicleId}}" },
      { variables: { trigger: MOTIVE_TRIGGER_PAYLOAD } },
    );
    const handler = getActionHandler("fleetio", "find_linked_vehicle")!;

    await expect(
      handler(handlerInput({ accountId: ACCOUNT_A, config: resolved as Record<string, unknown> })),
    ).rejects.toBeInstanceOf(UnmappedVehicleError);

    // The step failed, so no `find_linked` variable exists — the engine's strict
    // resolver refuses to build Create Meter Entry's config at all, which is how
    // the run stops BEFORE the Fleetio write.
    expect(() =>
      resolveStrict(
        { vehicleId: "{{find_linked.vehicleId}}", value: 1, meterType: "primary", readingDate: "2026-07-23T11:58:00Z" },
        { variables: { trigger: MOTIVE_TRIGGER_PAYLOAD } },
      ),
    ).toThrow(MissingVariableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a MISSING mapped reference prevents the repository from ever being reached", () => {
    // The engine converts MissingVariableError into the standardized config
    // failure and never invokes the handler. Proven at the resolver seam.
    expect(() =>
      resolveStrict(
        { sourceProvider: "motive", sourceVehicleId: "{{trigger.vehicleId}}" },
        { variables: { trigger: { fuelPurchaseId: "fp-778" } } }, // no vehicleId
      ),
    ).toThrow(MissingVariableError);
    expect(mockFindActiveLink).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
