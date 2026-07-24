/**
 * @jest-environment node
 *
 * Fleetio Vehicle Statuses API wrapper (FLEETIO-2).
 *
 * Business rules protected:
 *   - Sends both auth headers + pinned version to GET /vehicle_statuses.
 *   - Parses the bounded status subset (id, name, position) — raw fields dropped.
 *   - Empty catalog → empty array (not an error).
 *   - 401/403/5xx reject safely with no credential in the message.
 */
import { fleetioListVehicleStatuses } from "@/integrations/fleetio/api/vehicleStatuses";
import { FleetioForbiddenError } from "@/integrations/fleetio/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-secret-vs";
const ACCOUNT_TOKEN = "acct-token-secret-vs";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("fleetioListVehicleStatuses", () => {
  it("sends auth headers + pinned version and parses the bounded subset", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          { id: 1, name: "Active", default: true, color: "green", position: 1, account_id: 9 },
          { id: 2, name: "In Shop", position: 2 },
        ],
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const statuses = await fleetioListVehicleStatuses({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      perPage: 100,
    });

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(new URL(url).pathname).toBe("/api/vehicle_statuses");
    expect(init.headers.Authorization).toBe(`Token ${API_KEY}`);
    expect(init.headers["Account-Token"]).toBe(ACCOUNT_TOKEN);
    expect(init.headers["X-Api-Version"]).toBe("2025-05-05");

    expect(statuses).toEqual([
      { id: 1, name: "Active", position: 1 },
      { id: 2, name: "In Shop", position: 2 },
    ]);
    // Raw noise dropped.
    expect(JSON.stringify(statuses)).not.toContain("account_id");
    expect(JSON.stringify(statuses)).not.toContain("color");
  });

  it("returns an empty array for an empty catalog", async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, { records: [] })) as unknown as typeof fetch;
    const statuses = await fleetioListVehicleStatuses({
      apiKey: API_KEY,
      accountToken: ACCOUNT_TOKEN,
      perPage: 100,
    });
    expect(statuses).toEqual([]);
  });

  it("maps 401 → Unauthorized401Error and 403 → FleetioForbiddenError, credential-free", async () => {
    global.fetch = jest.fn(async () => new Response("x", { status: 401 })) as unknown as typeof fetch;
    await expect(
      fleetioListVehicleStatuses({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, perPage: 100 }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);

    global.fetch = jest.fn(async () => new Response("x", { status: 403 })) as unknown as typeof fetch;
    await expect(
      fleetioListVehicleStatuses({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, perPage: 100 }),
    ).rejects.toBeInstanceOf(FleetioForbiddenError);
  });
});
