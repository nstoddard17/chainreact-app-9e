/**
 * @jest-environment node
 *
 * Account-scoped vehicle-option loading (5.TRUCK-BRIDGE-1 CS-4).
 *
 * REAL: the service, the real options registry lookup, and the REAL
 * `motive:vehicles` / `fleetio:vehicles` resolvers (including their real label
 * building and error sanitization). MOCKED: only the integrations repository
 * (the account's connection row) and the provider HTTP boundary.
 *
 * Business rules protected:
 *   - the integration is looked up for the ACCOUNT passed in, never a personal
 *     fallback and never a caller-supplied value,
 *   - no connection ⇒ `disconnected` (a setup step), NOT `error`,
 *   - any provider failure ⇒ `error` with NO message, so no host / status /
 *     body / credential can reach the browser,
 *   - the existing resolvers are reused unchanged — this module registers none.
 */
import { randomBytes } from "node:crypto";

const mockGetActive = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
  markNeedsReconnect: jest.fn(),
}));

import {
  listVehicleOptions,
  isVehicleOptionSide,
  VEHICLE_OPTION_SOURCES,
} from "@/services/resourceLinks/vehicleOptions";
import { getOptionsResolver, listOptionsResolvers } from "@/services/options/_registry";
import { encryptToken } from "@/core/encryption/tokens";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const FLEETIO_KEY = "fleetio-key-vehicle-options";
const FLEETIO_TOKEN = "fleetio-acct-vehicle-options";

const ORIGINAL_FETCH = global.fetch;

function fleetioRow() {
  return {
    id: "int-fleetio",
    accountId: ACCOUNT_A,
    provider: "fleetio",
    providerAccountId: "7211",
    accessTokenEncrypted: encryptToken(FLEETIO_KEY),
    extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: FLEETIO_TOKEN })),
    needsReconnectAt: null,
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mockGetActive.mockReset();
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("side allow-list", () => {
  it("accepts exactly motive and fleetio", () => {
    expect(isVehicleOptionSide("motive")).toBe(true);
    expect(isVehicleOptionSide("fleetio")).toBe(true);
    for (const bad of ["slack", "native", "", "fleetio:vehicles", "MOTIVE"]) {
      expect(isVehicleOptionSide(bad)).toBe(false);
    }
  });

  it("maps to the EXISTING registered resolvers (adds none)", () => {
    expect(VEHICLE_OPTION_SOURCES).toEqual({
      motive: "motive:vehicles",
      fleetio: "fleetio:vehicles",
    });
    expect(getOptionsResolver("motive:vehicles")?.provider).toBe("motive");
    expect(getOptionsResolver("fleetio:vehicles")?.provider).toBe("fleetio");
    // CS-4 registered no new Fleetio/Motive resolver.
    const sources = listOptionsResolvers()
      .filter((r) => r.provider === "fleetio" || r.provider === "motive")
      .map((r) => r.source)
      .sort();
    expect(sources).toEqual([
      "fleetio:vehicle_statuses",
      "fleetio:vehicles",
      "motive:drivers",
      "motive:vehicles",
    ]);
  });
});

describe("account scoping", () => {
  it("looks up the integration for the ACCOUNT it was given", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    await listVehicleOptions({ accountId: ACCOUNT_A, userId: USER, side: "fleetio" });
    expect(mockGetActive).toHaveBeenCalledWith(ACCOUNT_A, "fleetio", null);
  });

  it("reports disconnected — not an error — when the account has no connection", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(
      await listVehicleOptions({ accountId: ACCOUNT_A, userId: USER, side: "motive" }),
    ).toEqual({ status: "disconnected", items: [], hasMore: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("success path (real fleetio:vehicles resolver)", () => {
  it("returns the resolver's bounded option projection and nothing else", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          {
            id: 42,
            name: "Truck 104",
            vehicle_status_name: "Active",
            vehicle_type_name: "Truck",
            archived_at: null,
            vin: "1FUJGLDR0CSBP1234",
            license_plate: "TX ABC-1234",
            secret_internal: "must-not-leak",
          },
        ],
        next_cursor: null,
      }),
    ) as unknown as typeof fetch;

    const result = await listVehicleOptions({
      accountId: ACCOUNT_A,
      userId: USER,
      side: "fleetio",
    });

    expect(result.status).toBe("ok");
    expect(result.items).toEqual([
      { value: "42", label: "Truck 104", description: "Active" },
    ]);
    // No credential, no VIN/plate, no raw record field leaks into the picker.
    const blob = JSON.stringify(result);
    expect(blob).not.toContain(FLEETIO_KEY);
    expect(blob).not.toContain(FLEETIO_TOKEN);
    expect(blob).not.toContain("must-not-leak");
    expect(blob).not.toContain("1FUJGLDR0CSBP1234");
    expect(blob).not.toContain("TX ABC-1234");
  });

  it("clamps and trims the search query", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    const fetchMock = jest.fn(async () =>
      jsonResponse(200, { records: [], next_cursor: null }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await listVehicleOptions({
      accountId: ACCOUNT_A,
      userId: USER,
      side: "fleetio",
      q: `  ${"x".repeat(400)}  `,
    });
    const [url] = fetchMock.mock.calls[0]! as unknown as [string];
    // 256-char clamp, applied before the resolver sees it.
    expect(url).toContain(`${"x".repeat(256)}`);
    expect(url).not.toContain(`${"x".repeat(257)}`);
  });
});

describe("failure path", () => {
  it("collapses a provider 5xx to a message-free error", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(500, { error: "internal database exploded at 10.0.0.4" }),
    ) as unknown as typeof fetch;

    const result = await listVehicleOptions({
      accountId: ACCOUNT_A,
      userId: USER,
      side: "fleetio",
    });
    expect(result).toEqual({ status: "error", items: [], hasMore: false });
    expect(JSON.stringify(result)).not.toMatch(/10\.0\.0\.4|exploded|fleetio\.com/i);
  });

  it("collapses a 401 to error rather than throwing into the page render", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    global.fetch = jest.fn(async () => new Response("bad", { status: 401 })) as unknown as typeof fetch;
    expect(
      await listVehicleOptions({ accountId: ACCOUNT_A, userId: USER, side: "fleetio" }),
    ).toEqual({ status: "error", items: [], hasMore: false });
  });

  it("collapses an integration-lookup failure to error", async () => {
    mockGetActive.mockRejectedValueOnce(new Error("pg: connection string=secret"));
    const result = await listVehicleOptions({
      accountId: ACCOUNT_A,
      userId: USER,
      side: "motive",
    });
    expect(result).toEqual({ status: "error", items: [], hasMore: false });
    expect(JSON.stringify(result)).not.toMatch(/secret|connection string/i);
  });
});
