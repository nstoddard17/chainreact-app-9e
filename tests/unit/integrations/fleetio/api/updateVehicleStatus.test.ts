/**
 * @jest-environment node
 *
 * `fleetioUpdateVehicleStatus` API wrapper (FLEETIO-3).
 *
 * Business rules protected:
 *   - Correct method (PATCH) + endpoint (/vehicles/{id}), id path-encoded.
 *   - Both Fleetio auth headers + pinned X-Api-Version.
 *   - Request body contains ONLY the approved status field, as the numeric wire
 *     type; caller input is never spread.
 *   - 200 returns the updated Vehicle projected into the bounded subset (raw
 *     fields dropped).
 *   - Malformed 2xx (no vehicle id) → FleetioMalformedResponseError (no fabricated output).
 *   - 401/403/404/422/5xx/timeout reject safely; no credential/body leak in errors.
 *   - 429 on a write is NOT auto-retried (FleetioRateLimitError, single call).
 */
import { fleetioUpdateVehicleStatus } from "@/integrations/fleetio/api/vehicles";
import {
  FleetioForbiddenError,
  FleetioNotFoundError,
  FleetioRateLimitError,
  FleetioMalformedResponseError,
} from "@/integrations/fleetio/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-update-secret";
const ACCOUNT_TOKEN = "acct-token-update-secret";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

const UPDATED_VEHICLE = {
  id: 42,
  name: "Truck 104",
  vin: "1FUJ",
  license_plate: "TX ABC-1234",
  make: "Freightliner",
  model: "Cascadia",
  year: 2019,
  vehicle_status_id: 8,
  vehicle_status_name: "Out of Service",
  current_meter_value: 152340.5,
  meter_unit: "mi",
  archived_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2026-07-23T12:00:00Z",
  secret_internal: "must-not-leak",
};

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("fleetioUpdateVehicleStatus — wire shape", () => {
  it("PATCHes /vehicles/{id} with both headers, pinned version, and ONLY the numeric status field", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, UPDATED_VEHICLE));
    global.fetch = fetchMock as unknown as typeof fetch;

    const vehicle = await fleetioUpdateVehicleStatus({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      vehicleId: "42",
      vehicleStatusId: 8,
    });

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://secure.fleetio.com/api/vehicles/42");
    expect(init.method).toBe("PATCH");
    expect(init.headers.Authorization).toBe(`Token ${API_KEY}`);
    expect(init.headers["Account-Token"]).toBe(ACCOUNT_TOKEN);
    expect(init.headers["X-Api-Version"]).toBe("2025-05-05");
    // Body is EXACTLY the status field, numeric — nothing else.
    expect(JSON.parse(init.body)).toEqual({ vehicle_status_id: 8 });

    // Returns the projected subset; raw noise dropped.
    expect(vehicle.id).toBe(42);
    expect(vehicle.vehicle_status_id).toBe(8);
    expect(JSON.stringify(vehicle)).not.toContain("must-not-leak");
  });

  it("path-encodes an unsafe id", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, UPDATED_VEHICLE));
    global.fetch = fetchMock as unknown as typeof fetch;
    await fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "a/b", vehicleStatusId: 8 });
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).toBe("https://secure.fleetio.com/api/vehicles/a%2Fb");
  });
});

describe("fleetioUpdateVehicleStatus — response validation", () => {
  it("rejects a malformed 2xx (no vehicle id) without fabricating output", async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, { name: "no id here" })) as unknown as typeof fetch;
    await expect(
      fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42", vehicleStatusId: 8 }),
    ).rejects.toBeInstanceOf(FleetioMalformedResponseError);
  });

  it("rejects a non-JSON 2xx body", async () => {
    global.fetch = jest.fn(async () =>
      new Response("<html/>", { status: 200, headers: { "Content-Type": "text/html" } }),
    ) as unknown as typeof fetch;
    await expect(
      fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42", vehicleStatusId: 8 }),
    ).rejects.toThrow(/non-JSON/);
  });
});

describe("fleetioUpdateVehicleStatus — error mapping (credential-free)", () => {
  const cases: Array<[number, unknown, (e: unknown) => void]> = [
    [401, "bad", (e) => expect(e).toBeInstanceOf(Unauthorized401Error)],
    [403, "nope", (e) => expect(e).toBeInstanceOf(FleetioForbiddenError)],
    [404, "gone", (e) => expect(e).toBeInstanceOf(FleetioNotFoundError)],
  ];
  it.each(cases)("maps %s to its typed error with no credential leak", async (status, body, assertFn) => {
    global.fetch = jest.fn(async () => new Response(String(body), { status })) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42", vehicleStatusId: 8 });
    } catch (e) {
      thrown = e;
    }
    assertFn(thrown);
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
    expect(String((thrown as Error).message)).not.toContain(ACCOUNT_TOKEN);
  });

  it("surfaces a 422 validation error bounded + credential-free (no raw body leak)", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(422, { errors: { vehicle_status_id: ["is not valid for this vehicle"] } }),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42", vehicleStatusId: 999 });
    } catch (e) {
      thrown = e;
    }
    const message = String((thrown as Error).message);
    expect(message).toContain("is not valid for this vehicle"); // safe summary surfaced
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain(ACCOUNT_TOKEN);
  });

  it("rejects a 5xx safely", async () => {
    global.fetch = jest.fn(async () => jsonResponse(500, { error: "boom" })) as unknown as typeof fetch;
    await expect(
      fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42", vehicleStatusId: 8 }),
    ).rejects.toThrow();
  });

  it("maps a timeout/network failure to a typed transient error (no auto-replay)", async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError("fetch failed");
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42", vehicleStatusId: 8 }),
    ).rejects.toThrow(/network failure/);
    // Single attempt — a lost-response write is NOT replayed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-retry a 429 write (single call, typed rate-limit)", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(429, { error: "Too many requests" }, { "Retry-After": "0" }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      fleetioUpdateVehicleStatus({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42", vehicleStatusId: 8 }),
    ).rejects.toBeInstanceOf(FleetioRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
