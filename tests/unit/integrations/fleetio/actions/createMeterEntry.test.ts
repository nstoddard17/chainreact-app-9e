/**
 * @jest-environment node
 *
 * `fleetio:create_meter_entry` handler + schema + bounded output (FLEETIO-4).
 *
 * Real: credential decryption, config schema, output shaping, execution seam,
 * and (for the walkthrough) the canonical variable pre-resolution + the real
 * handler registry. Mocked ONLY: the integrations repository boundary and the
 * Fleetio HTTP boundary.
 *
 * Business rules protected:
 *   - Direct + mapped configs create the entry and return the bounded output.
 *   - A meter reading mapped from a REALISTIC Motive payload resolves and is
 *     sent as a number.
 *   - Explicit zero survives; NaN / Infinity / negative / blank / non-numeric
 *     readings are rejected BEFORE any provider call.
 *   - A missing vehicle id, reading, meter type or reading date rejects before
 *     any provider call; a missing mapped reference never reaches the handler.
 *   - Account A uses Account A's integration; Account B's row is unreachable.
 *   - The handler THROWS typed errors (no {success:false}, no fabricated output).
 *   - Exactly ONE provider write per invocation.
 *   - No credential appears in output, errors, or the captured run blob.
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

import { createMeterEntry } from "@/integrations/fleetio/actions/createMeterEntry";
import { CreateMeterEntryConfigSchema } from "@/integrations/fleetio/actions/createMeterEntry.schema";
import { getActionHandler } from "@/services/execution/handlers/_registry";
import { resolveStrict, MissingVariableError } from "@/workflow-engine/variables/resolveValue";
import { encryptToken } from "@/core/encryption/tokens";
import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { FleetioRateLimitError } from "@/integrations/fleetio/api/_request";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-cme-action";
const ACCOUNT_TOKEN = "fleetio-acct-cme-action";

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CREATED = {
  id: 9001,
  account_id: 7211,
  value: "152340.5",
  meter_type: null,
  vehicle_id: 42,
  void: false,
  category: "manual",
  date: "2026-07-23",
  created_at: "2026-07-23T12:00:00Z",
  secret_internal: "must-not-leak",
};

/**
 * A REALISTIC upstream Motive payload. `odometer` is a real V2 Motive output
 * (`MOTIVE_FUEL_PURCHASE_OUTPUTS` / the `motive:new_fuel_purchase` trigger
 * payload) and is a NUMBER. Note `vehicleId` here is a MOTIVE id — it is
 * deliberately NOT mapped into Fleetio's vehicleId anywhere in this file.
 */
const MOTIVE_STEP_OUTPUT = {
  fuelPurchaseId: "fp-778",
  purchasedAt: "2026-07-23T11:58:00Z",
  odometer: 152340.5,
  odometerUnit: "MI",
  vehicleId: "motive-veh-88231",
};

const VALID_CONFIG = {
  vehicleId: "42",
  value: 152340.5,
  meterType: "primary",
  readingDate: "2026-07-23T12:00:00Z",
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
    nodeId: "node-cme",
    config: { ...VALID_CONFIG },
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

describe("createMeterEntry — success + bounded output", () => {
  it("creates the entry with ONE provider write and returns exactly the bounded output", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    const fetchMock = jest.fn(async () => jsonResponse(201, CREATED));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { output } = await createMeterEntry(handlerInput());

    expect(output).toEqual({
      meterEntryId: "9001",
      vehicleId: "42",
      value: "152340.5",
      meterType: null,
      void: false,
      readingDate: "2026-07-23",
      createdAt: "2026-07-23T12:00:00Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      vehicle_id: 42,
      value: 152340.5,
      date: "2026-07-23T12:00:00Z",
    });

    const blob = JSON.stringify(output);
    expect(blob).not.toContain("must-not-leak");
    expect(blob).not.toContain(API_KEY);
    expect(blob).not.toContain(ACCOUNT_TOKEN);
  });

  it("writes the SECONDARY meter when the user chose engine hours", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    const fetchMock = jest.fn(async () => jsonResponse(201, { ...CREATED, meter_type: "secondary", value: "4210" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { output } = await createMeterEntry(
      handlerInput({ config: { ...VALID_CONFIG, value: 4210, meterType: "secondary" } }),
    );

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).meter_type).toBe("secondary");
    expect(output.meterType).toBe("secondary");
  });

  it("preserves an explicit ZERO reading end to end", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    const fetchMock = jest.fn(async () => jsonResponse(201, { ...CREATED, value: "0" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { output } = await createMeterEntry(handlerInput({ config: { ...VALID_CONFIG, value: 0 } }));

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).value).toBe(0);
    expect(output.value).toBe("0");
  });
});

describe("createMeterEntry — schema validation (before any provider call)", () => {
  function expectNoProviderCall() {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it.each([
    ["missing vehicle id", { value: 1, meterType: "primary", readingDate: "2026-07-23T12:00:00Z" }],
    ["missing reading", { vehicleId: "42", meterType: "primary", readingDate: "2026-07-23T12:00:00Z" }],
    ["missing meter type", { vehicleId: "42", value: 1, readingDate: "2026-07-23T12:00:00Z" }],
    ["missing reading date", { vehicleId: "42", value: 1, meterType: "primary" }],
    ["blank vehicle id", { ...VALID_CONFIG, vehicleId: "   " }],
    ["non-numeric vehicle id", { ...VALID_CONFIG, vehicleId: "abc" }],
    ["negative reading", { ...VALID_CONFIG, value: -5 }],
    ["NaN reading", { ...VALID_CONFIG, value: Number.NaN }],
    ["Infinity reading", { ...VALID_CONFIG, value: Number.POSITIVE_INFINITY }],
    ["non-numeric string reading", { ...VALID_CONFIG, value: "not a number" }],
    ["blank string reading", { ...VALID_CONFIG, value: "   " }],
    ["out-of-range reading", { ...VALID_CONFIG, value: 999_999_999 }],
    ["invalid reading date", { ...VALID_CONFIG, readingDate: "yesterday" }],
    ["unknown meter type", { ...VALID_CONFIG, meterType: "tertiary" }],
    ["unknown extra field", { ...VALID_CONFIG, note: "hello" }],
  ])("rejects %s before the provider is called", async (_label, config) => {
    const fetchMock = expectNoProviderCall();
    await expect(createMeterEntry(handlerInput({ config: config as Record<string, unknown> }))).rejects.toThrow();
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a numeric-string reading and a numeric vehicle id (resolver preserves upstream types)", () => {
    const parsed = CreateMeterEntryConfigSchema.parse({
      vehicleId: 42,
      value: "152340.5",
      meterType: "primary",
      readingDate: "2026-07-23T12:00:00Z",
    });
    expect(parsed.vehicleId).toBe("42");
    expect(parsed.value).toBe(152340.5);
  });

  it("accepts zero and preserves decimals", () => {
    expect(CreateMeterEntryConfigSchema.parse({ ...VALID_CONFIG, value: 0 }).value).toBe(0);
    expect(CreateMeterEntryConfigSchema.parse({ ...VALID_CONFIG, value: "0" }).value).toBe(0);
    expect(CreateMeterEntryConfigSchema.parse({ ...VALID_CONFIG, value: 12.75 }).value).toBe(12.75);
  });

  it("accepts an offset-form ISO date as well as a trailing-Z instant", () => {
    expect(
      CreateMeterEntryConfigSchema.parse({ ...VALID_CONFIG, readingDate: "2023-03-14T13:46:27-06:00" })
        .readingDate,
    ).toBe("2023-03-14T13:46:27-06:00");
  });

  it("does NOT accept raw Fleetio request JSON or arbitrary provider fields", () => {
    expect(() =>
      CreateMeterEntryConfigSchema.parse({ ...VALID_CONFIG, void: true }),
    ).toThrow();
    expect(() =>
      CreateMeterEntryConfigSchema.parse({ vehicle_id: 42, value: 1, date: "2026-07-23T12:00:00Z" }),
    ).toThrow();
  });
});

describe("createMeterEntry — provider errors (throws, never {success:false})", () => {
  it("surfaces reconnect-required on 401 (marks the row, no refresh attempt)", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => new Response("bad", { status: 401 })) as unknown as typeof fetch;
    await expect(createMeterEntry(handlerInput())).rejects.toBeInstanceOf(IntegrationActionRequiredError);
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-acct-A");
  });

  it("throws a bounded 422 (lower/out-of-sequence reading) with no fabricated output", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () =>
      jsonResponse(422, { errors: { value: ["must fall between the entries logged before and after"] } }),
    ) as unknown as typeof fetch;

    let thrown: unknown;
    try {
      await createMeterEntry(handlerInput());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toHaveProperty("success");
    const message = String((thrown as Error).message);
    expect(message).toMatch(/must fall between/);
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(ACCOUNT_TOKEN);
  });

  it("throws a typed rate-limit error on 429 after EXACTLY one write", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ error: "slow down" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "0" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(createMeterEntry(handlerInput())).rejects.toBeInstanceOf(FleetioRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a malformed 2xx rather than returning request values as proof of success", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => jsonResponse(201, { value: "152340.5" })) as unknown as typeof fetch;
    await expect(createMeterEntry(handlerInput())).rejects.toThrow(/unexpected response/i);
  });
});

describe("createMeterEntry — account ownership + isolation", () => {
  it("uses the workflow account's Fleetio integration", async () => {
    mockGetActive.mockResolvedValueOnce(rowForAccount("acct-A"));
    global.fetch = jest.fn(async () => jsonResponse(201, CREATED)) as unknown as typeof fetch;
    await createMeterEntry(handlerInput({ accountId: "acct-A" }));
    expect(mockGetActive).toHaveBeenCalledWith("acct-A", "fleetio", null);
  });

  it("cannot use another account's integration: no row → connection-required, no write", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(createMeterEntry(handlerInput({ accountId: "acct-B" }))).rejects.toThrow(
      /no active Fleetio integration/i,
    );
    expect(mockGetActive).toHaveBeenCalledWith("acct-B", "fleetio", null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("mock-boundary FLAGSHIP walkthrough — Motive reading → Fleetio Meter Entry", () => {
  it("resolves the mapped Motive reading with the REAL resolver, dispatches the REAL handler, writes once, and leaks nothing", async () => {
    // 1. Account A owns the connected Fleetio integration (encrypted key + Account-Token).
    mockGetActive.mockImplementation(async (accountId: string) =>
      accountId === "acct-A" ? rowForAccount("acct-A") : null,
    );
    // 9. The Fleetio HTTP boundary is mocked; capture the outbound request.
    const fetchMock = jest.fn(async () => jsonResponse(201, CREATED));
    global.fetch = fetchMock as unknown as typeof fetch;

    // 3. The Fleetio vehicle id is configured directly (a FLEETIO id — NOT the
    //    Motive vehicle id, which is a different identifier entirely).
    // 4. The meter reading is mapped from the upstream Motive-like step.
    const rawConfig = {
      vehicleId: "42",
      value: "{{motive_step.odometer}}",
      meterType: "primary",
      readingDate: "{{motive_step.purchasedAt}}",
    };
    // 5. The REAL strict resolver resolves the mapping BEFORE the handler runs.
    const resolved = resolveStrict(rawConfig, { variables: { motive_step: MOTIVE_STEP_OUTPUT } });
    // Single-reference templates keep the upstream value's REAL type.
    expect(resolved).toEqual({
      vehicleId: "42",
      value: 152340.5,
      meterType: "primary",
      readingDate: "2026-07-23T11:58:00Z",
    });
    // 16. The walkthrough never treats the Motive vehicle id as a Fleetio one.
    expect(JSON.stringify(resolved)).not.toContain(MOTIVE_STEP_OUTPUT.vehicleId);

    // 6. Dispatch through the REAL handler registry.
    const handler = getActionHandler("fleetio", "create_meter_entry");
    expect(handler).toBeTruthy();

    // 7/8. Account A's row is selected; credentials decrypt only at the call boundary.
    const result = await handler!(
      handlerInput({ accountId: "acct-A", config: resolved as Record<string, unknown> }),
    );

    // 10/11. Exactly the approved meter-entry fields, exactly ONE provider write.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, { body: string }];
    expect(url).toBe("https://secure.fleetio.com/api/meter_entries");
    expect(JSON.parse(init.body)).toEqual({
      vehicle_id: 42,
      value: 152340.5,
      date: "2026-07-23T11:58:00Z",
    });

    // 12. Only the bounded meter-entry output.
    expect(Object.keys(result.output)).toEqual([
      "meterEntryId",
      "vehicleId",
      "value",
      "meterType",
      "void",
      "readingDate",
      "createdAt",
    ]);

    // 13. No secret in run data, output, or errors.
    const runBlob = JSON.stringify(result);
    expect(runBlob).not.toContain(API_KEY);
    expect(runBlob).not.toContain(ACCOUNT_TOKEN);
    expect(runBlob).not.toContain("must-not-leak");

    // 14. Account B's Fleetio integration cannot be selected.
    await expect(
      handler!(handlerInput({ accountId: "acct-B", config: resolved as Record<string, unknown> })),
    ).rejects.toThrow(/no active Fleetio integration/i);
  });

  it("15. a missing Motive reading prevents the provider call entirely", () => {
    // The engine converts MissingVariableError into the standardized config-failure
    // shape and never invokes the handler (Q2). Proven at the resolver seam.
    expect(() =>
      resolveStrict(
        { vehicleId: "42", value: "{{motive_step.odometer}}", meterType: "primary", readingDate: "{{motive_step.purchasedAt}}" },
        { variables: { motive_step: { purchasedAt: "2026-07-23T11:58:00Z" } } }, // odometer missing
      ),
    ).toThrow(MissingVariableError);
  });

  it("a missing mapped VEHICLE reference likewise prevents the provider call", () => {
    expect(() =>
      resolveStrict(
        { vehicleId: "{{lookup.fleetioVehicleId}}", value: 1, meterType: "primary", readingDate: "2026-07-23T12:00:00Z" },
        { variables: { lookup: {} } },
      ),
    ).toThrow(MissingVariableError);
  });
});
