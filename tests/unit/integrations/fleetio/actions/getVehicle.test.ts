/**
 * @jest-environment node
 *
 * `fleetio:get_vehicle` handler + schema + bounded output (FLEETIO-2).
 *
 * Real: credential decryption, config schema, output shaping, execution seam,
 * and (for the walkthrough) the canonical variable pre-resolution + the real
 * handler registry. Mocked ONLY: the integrations repository boundary and the
 * Fleetio HTTP boundary.
 *
 * Business rules protected:
 *   - Valid vehicleId → the exact bounded output; raw provider fields never leak.
 *   - Q5: explicit `0` / `false` / `""` are preserved (typed presence, not truthiness).
 *   - Missing required vehicleId is rejected by the schema before any provider call.
 *   - Vehicle-not-found (404) surfaces FleetioNotFoundError (no {found:false} envelope).
 *   - The handler resolves credentials from the SELECTED account and cannot reach
 *     another account's integration.
 *   - 401 surfaces the reconnect-required error.
 *   - Mock-boundary walkthrough: a dynamic {{trigger.vehicleId}} resolves through
 *     the REAL resolver before the REAL registered handler runs; the run keeps
 *     only the bounded output; no credential appears anywhere.
 */
import { randomBytes } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

const mockGetActive = jest.fn();
const mockMarkNeedsReconnect = jest.fn();
const mockNotifyReconnect = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
  markNeedsReconnect: (...a: unknown[]) => mockMarkNeedsReconnect(...a),
}));
jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: (...a: unknown[]) => mockNotifyReconnect(...a),
}));

import { getVehicle } from "@/integrations/fleetio/actions/getVehicle";
import { GetVehicleConfigSchema } from "@/integrations/fleetio/actions/getVehicle.schema";
import { getActionHandler } from "@/services/execution/handlers/_registry";
import { resolveStrict, MissingVariableError } from "@/workflow-engine/variables/resolveValue";
import { encryptToken } from "@/core/encryption/tokens";
import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { FleetioNotFoundError } from "@/integrations/fleetio/api/_request";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-action-secret";
const ACCOUNT_TOKEN = "fleetio-acct-action-secret";

function rowForAccount(accountId: string) {
  return {
    id: "int-1",
    accountId,
    provider: "fleetio",
    providerAccountId: "7211",
    accessTokenEncrypted: encryptToken(API_KEY),
    extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: ACCOUNT_TOKEN })),
    needsReconnectAt: null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function trigger(): TriggerEvent {
  return {
    provider: "fleetio",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-01T00:00:00Z",
    accountId: null,
    payload: { vehicleId: "42" },
  } as unknown as TriggerEvent;
}

function handlerInput(over: Partial<ActionHandlerInput> = {}): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-A",
    runId: "run-1",
    nodeId: "node-get-vehicle",
    config: { vehicleId: "42" },
    triggerEvent: trigger(),
    testMode: false,
    ...over,
  };
}

const FULL_VEHICLE = {
  id: 42,
  name: "Truck 104",
  vin: "1FUJ",
  license_plate: "TX ABC-1234",
  make: "Freightliner",
  model: "Cascadia",
  year: 2019,
  vehicle_status_id: 7,
  vehicle_status_name: "Active",
  current_meter_value: 152340.5,
  meter_unit: "mi",
  archived_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  secret_internal: "must-not-leak",
};

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mockGetActive.mockReset();
  mockMarkNeedsReconnect.mockReset();
  mockMarkNeedsReconnect.mockResolvedValue(true);
  mockNotifyReconnect.mockReset();
  mockNotifyReconnect.mockResolvedValue(undefined);
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("getVehicle handler — success", () => {
  it("returns the exact bounded output and never leaks raw provider fields", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => jsonResponse(200, FULL_VEHICLE)) as unknown as typeof fetch;

    const { output } = await getVehicle(handlerInput());

    expect(output).toEqual({
      vehicleId: "42",
      name: "Truck 104",
      vin: "1FUJ",
      licensePlate: "TX ABC-1234",
      make: "Freightliner",
      model: "Cascadia",
      year: 2019,
      statusId: 7,
      statusName: "Active",
      primaryMeterValue: 152340.5,
      primaryMeterUnit: "mi",
      archived: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    });
    const blob = JSON.stringify(output);
    expect(blob).not.toContain("must-not-leak");
    expect(blob).not.toContain(API_KEY);
    expect(blob).not.toContain(ACCOUNT_TOKEN);
    expect(blob).not.toContain("secret_internal");
  });

  it("preserves Q5 explicit values: meter 0, year 0, archived false, empty-string name", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        ...FULL_VEHICLE,
        name: "",
        year: 0,
        current_meter_value: 0,
        archived_at: null,
      }),
    ) as unknown as typeof fetch;

    const { output } = await getVehicle(handlerInput());
    expect(output.name).toBe(""); // explicit empty string, not null
    expect(output.year).toBe(0);
    expect(output.primaryMeterValue).toBe(0);
    expect(output.archived).toBe(false);
  });

  it("sets archived:true when archived_at is present, null optionals stay null", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        id: 9,
        name: "Old Rig",
        archived_at: "2025-01-01T00:00:00Z",
        vin: null,
        license_plate: null,
        year: null,
        vehicle_status_id: null,
        current_meter_value: null,
      }),
    ) as unknown as typeof fetch;

    const { output } = await getVehicle(handlerInput({ config: { vehicleId: "9" } }));
    expect(output.archived).toBe(true);
    expect(output.vin).toBeNull();
    expect(output.year).toBeNull();
    expect(output.primaryMeterValue).toBeNull();
  });
});

describe("getVehicle handler — validation + errors", () => {
  it("rejects a missing vehicleId at the schema BEFORE any provider call", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(getVehicle(handlerInput({ config: {} }))).rejects.toThrow();
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("schema rejects an empty vehicleId", () => {
    expect(() => GetVehicleConfigSchema.parse({ vehicleId: "" })).toThrow();
    expect(() => GetVehicleConfigSchema.parse({ vehicleId: "  " })).toThrow();
    expect(GetVehicleConfigSchema.parse({ vehicleId: " 42 " }).vehicleId).toBe("42");
  });

  it("surfaces FleetioNotFoundError on 404 (no {found:false} envelope)", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(getVehicle(handlerInput({ config: { vehicleId: "999" } }))).rejects.toBeInstanceOf(
      FleetioNotFoundError,
    );
  });

  it("surfaces the reconnect-required error on 401", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => new Response("bad", { status: 401 })) as unknown as typeof fetch;
    await expect(getVehicle(handlerInput())).rejects.toBeInstanceOf(IntegrationActionRequiredError);
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-1");
  });
});

describe("getVehicle handler — account scoping", () => {
  it("resolves the integration for the SELECTED account (input.accountId)", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => jsonResponse(200, FULL_VEHICLE)) as unknown as typeof fetch;
    await getVehicle(handlerInput({ accountId: "acct-A" }));
    expect(mockGetActive).toHaveBeenCalledWith("acct-A", "fleetio", null);
  });

  it("cannot use another account's integration: an account with no row → connect-required", async () => {
    // Account B has no Fleetio row (the account-scoped lookup returns null).
    mockGetActive.mockResolvedValueOnce(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(getVehicle(handlerInput({ accountId: "acct-B" }))).rejects.toThrow(
      /no active Fleetio integration/i,
    );
    expect(mockGetActive).toHaveBeenCalledWith("acct-B", "fleetio", null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("mock-boundary walkthrough — engine registry + real variable resolution", () => {
  it("resolves a dynamic {{trigger.vehicleId}} then runs the REAL registered handler; only the bounded output is kept, no credential anywhere", async () => {
    // 1. The account has a connected Fleetio integration (encrypted creds).
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    // 5. The Fleetio HTTP boundary is mocked.
    global.fetch = jest.fn(async () => jsonResponse(200, FULL_VEHICLE)) as unknown as typeof fetch;

    // 2/3. The workflow node config maps the id from an upstream trigger output.
    const rawConfig = { vehicleId: "{{trigger.vehicleId}}" };
    const resolved = resolveStrict(rawConfig, {
      variables: { trigger: { vehicleId: "42" } },
    });
    expect(resolved).toEqual({ vehicleId: "42" }); // resolved BEFORE the handler

    // 6. Dispatch through the REAL handler registry (proves registration).
    const handler = getActionHandler("fleetio", "get_vehicle");
    expect(handler).toBeTruthy();

    const result = await handler!(
      handlerInput({ config: resolved as Record<string, unknown> }),
    );

    // 7. The run keeps only the bounded vehicle output.
    expect(result.output).toMatchObject({ vehicleId: "42", name: "Truck 104", archived: false });
    expect(Object.keys(result.output)).toEqual([
      "vehicleId", "name", "vin", "licensePlate", "make", "model", "year",
      "statusId", "statusName", "primaryMeterValue", "primaryMeterUnit",
      "archived", "createdAt", "updatedAt",
    ]);

    // 8. No credential appears in the persisted run output.
    const runBlob = JSON.stringify(result);
    expect(runBlob).not.toContain(API_KEY);
    expect(runBlob).not.toContain(ACCOUNT_TOKEN);
  });

  it("a missing dynamic reference makes the REAL resolver throw (engine → config failure, handler never called)", () => {
    // The engine converts this to the standardized config-failure shape and does
    // NOT invoke the handler (Q2 contract). Proven here at the resolver seam.
    expect(() =>
      resolveStrict({ vehicleId: "{{trigger.vehicleId}}" }, { variables: {} }),
    ).toThrow(MissingVariableError);
  });
});
