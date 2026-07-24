/**
 * @jest-environment node
 *
 * `fleetio:update_vehicle_status` handler + schema + bounded output (FLEETIO-3).
 *
 * Real: credential decryption, config schema, output shaping, execution seam,
 * and (for the walkthrough) the canonical variable pre-resolution + the real
 * handler registry. Mocked ONLY: the integrations repository boundary and the
 * Fleetio HTTP boundary.
 *
 * Business rules protected:
 *   - Valid direct ids update status and return the bounded post-update output.
 *   - vehicleId + vehicleStatusId map from upstream and resolve BEFORE the handler.
 *   - Missing / whitespace / non-numeric status id rejected before any provider call.
 *   - Missing vehicle id rejected before any provider call.
 *   - 404 → typed not-found; 401 → reconnect-required; the handler throws (no
 *     {success:false}) and never fabricates output.
 *   - The request body carries ONLY the numeric status; raw fields never leak.
 *   - The handler uses the workflow account's Fleetio integration and cannot
 *     reach another account's row.
 *   - Mock-boundary WRITE walkthrough: both mapped values resolve via the REAL
 *     resolver, the REAL registry dispatches, only the bounded output is kept,
 *     no credential anywhere, and Account B's row cannot be used.
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

import { updateVehicleStatus } from "@/integrations/fleetio/actions/updateVehicleStatus";
import { UpdateVehicleStatusConfigSchema } from "@/integrations/fleetio/actions/updateVehicleStatus.schema";
import { getActionHandler } from "@/services/execution/handlers/_registry";
import { resolveStrict, MissingVariableError } from "@/workflow-engine/variables/resolveValue";
import { encryptToken } from "@/core/encryption/tokens";
import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { FleetioNotFoundError } from "@/integrations/fleetio/api/_request";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-uvs-action";
const ACCOUNT_TOKEN = "fleetio-acct-uvs-action";

function rowForAccount(accountId: string) {
  return {
    id: `int-${accountId}`,
    accountId,
    provider: "fleetio",
    providerAccountId: "7211",
    accessTokenEncrypted: encryptToken(API_KEY),
    extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: ACCOUNT_TOKEN })),
    needsReconnectAt: null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const UPDATED = {
  id: 42,
  name: "Truck 104",
  vehicle_status_id: 8,
  vehicle_status_name: "Out of Service",
  archived_at: null,
  updated_at: "2026-07-23T12:00:00Z",
  secret_internal: "must-not-leak",
};

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
    nodeId: "node-uvs",
    config: { vehicleId: "42", vehicleStatusId: "8" },
    triggerEvent: trigger(),
    testMode: false,
    ...over,
  };
}

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

describe("updateVehicleStatus — success + bounded output", () => {
  it("updates status and returns exactly the bounded post-update output", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    const fetchMock = jest.fn(async () => jsonResponse(200, UPDATED));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { output } = await updateVehicleStatus(handlerInput());

    expect(output).toEqual({
      vehicleId: "42",
      vehicleName: "Truck 104",
      vehicleStatusId: "8",
      statusName: "Out of Service",
      archived: false,
      updatedAt: "2026-07-23T12:00:00Z",
    });
    // Request body carried ONLY the numeric status.
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ vehicle_status_id: 8 });
    // No raw field / credential leak.
    const blob = JSON.stringify(output);
    expect(blob).not.toContain("must-not-leak");
    expect(blob).not.toContain(API_KEY);
    expect(blob).not.toContain(ACCOUNT_TOKEN);
  });
});

describe("updateVehicleStatus — schema validation (before any provider call)", () => {
  it("rejects a missing status id before the provider is called", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(updateVehicleStatus(handlerInput({ config: { vehicleId: "42" } }))).rejects.toThrow();
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing vehicle id before the provider is called", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(updateVehicleStatus(handlerInput({ config: { vehicleStatusId: "8" } }))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("schema: trims, rejects empties, and requires a positive-integer status id", () => {
    expect(UpdateVehicleStatusConfigSchema.parse({ vehicleId: " 42 ", vehicleStatusId: " 8 " })).toEqual({
      vehicleId: "42",
      vehicleStatusId: "8",
    });
    expect(() => UpdateVehicleStatusConfigSchema.parse({ vehicleId: "", vehicleStatusId: "8" })).toThrow();
    expect(() => UpdateVehicleStatusConfigSchema.parse({ vehicleId: "42", vehicleStatusId: "  " })).toThrow();
    // Non-numeric / non-positive status ids are rejected before the provider.
    expect(() => UpdateVehicleStatusConfigSchema.parse({ vehicleId: "42", vehicleStatusId: "abc" })).toThrow();
    expect(() => UpdateVehicleStatusConfigSchema.parse({ vehicleId: "42", vehicleStatusId: "0" })).toThrow();
    expect(() => UpdateVehicleStatusConfigSchema.parse({ vehicleId: "42", vehicleStatusId: "-3" })).toThrow();
    expect(() => UpdateVehicleStatusConfigSchema.parse({ vehicleId: "42", vehicleStatusId: "1.5" })).toThrow();
    // No status NAME accepted in place of an id.
    expect(() => UpdateVehicleStatusConfigSchema.parse({ vehicleId: "42", vehicleStatusId: "Active" })).toThrow();
  });

  it("rejects an unknown extra field (strict)", () => {
    expect(() =>
      UpdateVehicleStatusConfigSchema.parse({ vehicleId: "42", vehicleStatusId: "8", color: "red" }),
    ).toThrow();
  });
});

describe("updateVehicleStatus — provider errors", () => {
  it("throws FleetioNotFoundError on 404 (no {success:false}, no fabricated output)", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
    await expect(updateVehicleStatus(handlerInput())).rejects.toBeInstanceOf(FleetioNotFoundError);
  });

  it("surfaces reconnect-required on 401 (marks the row, no refresh attempt)", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => new Response("bad", { status: 401 })) as unknown as typeof fetch;
    await expect(updateVehicleStatus(handlerInput())).rejects.toBeInstanceOf(IntegrationActionRequiredError);
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-acct-A");
  });
});

describe("updateVehicleStatus — account scoping", () => {
  it("uses the workflow account's Fleetio integration", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => jsonResponse(200, UPDATED)) as unknown as typeof fetch;
    await updateVehicleStatus(handlerInput({ accountId: "acct-A" }));
    expect(mockGetActive).toHaveBeenCalledWith("acct-A", "fleetio", null);
  });

  it("cannot use another account's integration: account with no row → connect-required, no write", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(updateVehicleStatus(handlerInput({ accountId: "acct-B" }))).rejects.toThrow(
      /no active Fleetio integration/i,
    );
    expect(mockGetActive).toHaveBeenCalledWith("acct-B", "fleetio", null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("mock-boundary WRITE walkthrough", () => {
  it("resolves both mapped ids via the REAL resolver, dispatches the REAL handler, keeps only bounded output, leaks no credential, and cannot use Account B", async () => {
    // 1/7. Account A owns the connected Fleetio integration.
    mockGetActive.mockImplementation(async (accountId: string) =>
      accountId === "acct-A" ? rowForAccount("acct-A") : null,
    );
    // 9/10. The Fleetio update boundary is mocked; capture the request body.
    const fetchMock = jest.fn(async () => jsonResponse(200, UPDATED));
    global.fetch = fetchMock as unknown as typeof fetch;

    // 3/4. vehicleId from an upstream trigger, status id from a previous node.
    const rawConfig = { vehicleId: "{{trigger.vehicleId}}", vehicleStatusId: "{{previous.statusId}}" };
    // 5. The REAL strict resolver resolves both BEFORE the handler.
    const resolved = resolveStrict(rawConfig, {
      variables: { trigger: { vehicleId: "42" }, previous: { statusId: "8" } },
    });
    expect(resolved).toEqual({ vehicleId: "42", vehicleStatusId: "8" });

    // 6. Dispatch through the REAL handler registry.
    const handler = getActionHandler("fleetio", "update_vehicle_status");
    expect(handler).toBeTruthy();

    const result = await handler!(
      handlerInput({ accountId: "acct-A", config: resolved as Record<string, unknown> }),
    );

    // 10. The request body contained only the intended status update.
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ vehicle_status_id: 8 });

    // 11/12. Only the bounded output; no credential anywhere.
    expect(Object.keys(result.output)).toEqual([
      "vehicleId", "vehicleName", "vehicleStatusId", "statusName", "archived", "updatedAt",
    ]);
    const runBlob = JSON.stringify(result);
    expect(runBlob).not.toContain(API_KEY);
    expect(runBlob).not.toContain(ACCOUNT_TOKEN);

    // 13. Account B cannot be used (its lookup returns null → connect-required).
    await expect(handler!(handlerInput({ accountId: "acct-B", config: resolved as Record<string, unknown> }))).rejects.toThrow(
      /no active Fleetio integration/i,
    );
  });

  it("14. a missing mapped reference prevents the provider call (engine → config failure)", () => {
    // The engine converts MissingVariableError to the standardized config-failure
    // shape and never invokes the handler (Q2). Proven at the resolver seam.
    expect(() =>
      resolveStrict({ vehicleId: "{{trigger.vehicleId}}", vehicleStatusId: "{{previous.statusId}}" }, {
        variables: { trigger: { vehicleId: "42" } }, // previous.statusId missing
      }),
    ).toThrow(MissingVariableError);
  });
});
