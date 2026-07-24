/**
 * @jest-environment node
 *
 * `fleetio:vehicle_statuses` options resolver (FLEETIO-2).
 *
 * Business rules protected:
 *   - Stable status-id values + human-readable name labels.
 *   - Deterministic ordering by provider `position` then id.
 *   - Empty catalog → empty option set (not an error).
 *   - Invalid credentials / role gap / outage / rate-limit → typed resolver errors.
 *   - No raw record / provider URL leakage; one bounded page.
 */
import { randomBytes } from "node:crypto";
import { fleetioVehicleStatusesResolver } from "@/integrations/fleetio/options/vehicleStatuses";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import { encryptToken } from "@/core/encryption/tokens";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-vs-resolver";
const ACCOUNT_TOKEN = "fleetio-acct-vs-resolver";

function ctx(over: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration: {
      id: "int-1",
      accountId: "acct-A",
      provider: "fleetio",
      providerAccountId: "7211",
      accessTokenEncrypted: encryptToken(API_KEY),
      extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: ACCOUNT_TOKEN })),
    } as unknown as OptionsResolverContext["integration"],
    q: "",
    deps: {},
    ...over,
  };
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("fleetioVehicleStatusesResolver", () => {
  it("returns id/name options ordered by provider position (then id)", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          { id: 3, name: "Out of Service", position: 3 },
          { id: 1, name: "Active", position: 1 },
          { id: 2, name: "In Shop", position: 2 },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await fleetioVehicleStatusesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "1", label: "Active" },
      { value: "2", label: "In Shop" },
      { value: "3", label: "Out of Service" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("sorts statuses without a position after those with one (id tiebreak)", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          { id: 9, name: "No Pos B" },
          { id: 1, name: "First", position: 1 },
          { id: 4, name: "No Pos A" },
        ],
      }),
    ) as unknown as typeof fetch;
    const result = await fleetioVehicleStatusesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["1", "4", "9"]);
  });

  it("empty catalog → empty option set", async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, { records: [] })) as unknown as typeof fetch;
    const result = await fleetioVehicleStatusesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("no integration → INTEGRATION_DISCONNECTED", async () => {
    await expect(fleetioVehicleStatusesResolver.resolve(ctx({ integration: null }))).rejects.toMatchObject(
      { code: "INTEGRATION_DISCONNECTED" },
    );
  });

  it("401 → PROVIDER_REAUTH_REQUIRED, 5xx → PROVIDER_ERROR, credential-free", async () => {
    global.fetch = jest.fn(async () => new Response("x", { status: 401 })) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioVehicleStatusesResolver.resolve(ctx());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect(String((thrown as Error).message)).not.toContain(API_KEY);

    global.fetch = jest.fn(async () => jsonResponse(500, {})) as unknown as typeof fetch;
    await expect(fleetioVehicleStatusesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("429 rate limit → PROVIDER_ERROR", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(429, { error: "Too many requests" }, { "Retry-After": "120" }),
    ) as unknown as typeof fetch;
    await expect(fleetioVehicleStatusesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});
