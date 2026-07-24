/**
 * @jest-environment node
 *
 * Fleetio Vehicles API wrappers (FLEETIO-2).
 *
 * Business rules protected:
 *   - Get Vehicle sends BOTH auth headers + the PINNED X-Api-Version, path-
 *     encodes the id, and parses a valid response into the typed subset.
 *   - A 404 becomes a typed FleetioNotFoundError (bad/removed id).
 *   - 401/403/429/5xx/malformed-JSON reject per the shared wrapper mapping;
 *     no credential ever appears in a thrown error.
 *   - List Vehicles requests ONE bounded page, passes search server-side as
 *     filter[name][like], excludes archived (endpoint default — no client
 *     filter needed), and surfaces the opaque next_cursor (never a URL/link).
 *   - Raw provider fields never leak into the typed projections.
 */
import {
  fleetioGetVehicle,
  fleetioListVehicles,
} from "@/integrations/fleetio/api/vehicles";
import {
  FleetioNotFoundError,
  FleetioForbiddenError,
  FleetioRateLimitError,
} from "@/integrations/fleetio/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-secret-vehicles";
const ACCOUNT_TOKEN = "acct-token-secret-vehicles";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

const RAW_VEHICLE = {
  id: 42,
  name: "Truck 104",
  vin: "1FUJGLDR8CLBP8834",
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
  // Raw noise that must NOT leak into the typed subset:
  account_id: 999,
  default_image_url_medium: "https://secure.fleetio.com/img/x.png",
  secret_internal: "should-not-appear",
};

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("fleetioGetVehicle", () => {
  it("sends both auth headers + pinned version, path-encodes the id, parses the subset", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, RAW_VEHICLE));
    global.fetch = fetchMock as unknown as typeof fetch;

    const vehicle = await fleetioGetVehicle({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      vehicleId: "42",
    });

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://secure.fleetio.com/api/vehicles/42");
    expect(init.headers.Authorization).toBe(`Token ${API_KEY}`);
    expect(init.headers["Account-Token"]).toBe(ACCOUNT_TOKEN);
    expect(init.headers["X-Api-Version"]).toBe("2025-05-05");

    // Only the approved subset — raw noise dropped.
    expect(vehicle).toEqual({
      id: 42,
      name: "Truck 104",
      vin: "1FUJGLDR8CLBP8834",
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
    });
    expect(JSON.stringify(vehicle)).not.toContain("should-not-appear");
    expect(JSON.stringify(vehicle)).not.toContain("account_id");
  });

  it("percent-encodes an id with unsafe characters into the path", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, RAW_VEHICLE));
    global.fetch = fetchMock as unknown as typeof fetch;
    await fleetioGetVehicle({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "a/b 1" });
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).toBe("https://secure.fleetio.com/api/vehicles/a%2Fb%201");
  });

  it("throws FleetioNotFoundError on 404 (bad / removed id)", async () => {
    global.fetch = jest.fn(async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioGetVehicle({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "999" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(FleetioNotFoundError);
    expect((thrown as FleetioNotFoundError).resource).toBe("vehicle 999");
  });

  it("maps 401 to Unauthorized401Error without leaking credentials", async () => {
    global.fetch = jest.fn(async () => new Response("bad", { status: 401 })) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioGetVehicle({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Unauthorized401Error);
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
    expect(String((thrown as Error).message)).not.toContain(ACCOUNT_TOKEN);
  });

  it("maps 403 to FleetioForbiddenError (role gap)", async () => {
    global.fetch = jest.fn(async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    await expect(
      fleetioGetVehicle({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42" }),
    ).rejects.toBeInstanceOf(FleetioForbiddenError);
  });

  it("rejects a 5xx safely with no credential in the message", async () => {
    global.fetch = jest.fn(async () => jsonResponse(500, { error: "boom" })) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioGetVehicle({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42" });
    } catch (e) {
      thrown = e;
    }
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
    expect(String((thrown as Error).message)).not.toContain(ACCOUNT_TOKEN);
  });

  it("rejects a malformed (non-JSON) 2xx body", async () => {
    global.fetch = jest.fn(async () =>
      new Response("<html>not json</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    ) as unknown as typeof fetch;
    await expect(
      fleetioGetVehicle({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, vehicleId: "42" }),
    ).rejects.toThrow(/non-JSON/);
  });
});

describe("fleetioListVehicles", () => {
  it("requests one bounded page and passes search as filter[name][like]", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          { id: 1, name: "Truck 104", vehicle_status_name: "Active", vehicle_type_name: "Truck", archived_at: null },
          { id: 2, name: "Van 7", vehicle_status_name: "In Shop", vehicle_type_name: "Van", archived_at: null },
        ],
        next_cursor: "CURSOR_ABC",
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { vehicles, nextCursor } = await fleetioListVehicles({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      perPage: 100,
      q: "truck",
    });

    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/vehicles");
    expect(parsed.searchParams.get("per_page")).toBe("100");
    expect(parsed.searchParams.get("filter[name][like]")).toBe("truck");
    // Archived exclusion is the endpoint default — no client-side archived filter.
    expect(url).not.toContain("archived");

    expect(vehicles.map((v) => v.id)).toEqual([1, 2]);
    expect(nextCursor).toBe("CURSOR_ABC");
  });

  it("omits the name filter when q is empty and returns null cursor at the last page", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(200, { records: [{ id: 3, name: "Bus 1" }], next_cursor: null }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { nextCursor } = await fleetioListVehicles({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      perPage: 100,
      q: "   ",
    });
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    expect(url).not.toContain("filter");
    expect(nextCursor).toBeNull();
  });

  it("tolerates a missing records array (returns empty)", async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const { vehicles, nextCursor } = await fleetioListVehicles({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      perPage: 100,
    });
    expect(vehicles).toEqual([]);
    expect(nextCursor).toBeNull();
  });

  it("propagates a 429 as FleetioRateLimitError (never silently empties)", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(429, { error: "Too many requests" }, { "Retry-After": "120" }),
    ) as unknown as typeof fetch;
    await expect(
      fleetioListVehicles({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, perPage: 100 }),
    ).rejects.toBeInstanceOf(FleetioRateLimitError);
  });
});
