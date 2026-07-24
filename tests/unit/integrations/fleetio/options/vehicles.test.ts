/**
 * @jest-environment node
 *
 * `fleetio:vehicles` options resolver (FLEETIO-2).
 *
 * Real: credential decryption + label/paging logic. Mocked: the Fleetio HTTP
 * boundary. `ctx.integration` is the ALREADY-account-scoped row the shared
 * options route resolves (Fleetio is an ACCOUNT credential) — the resolver adds
 * no auth of its own, so account isolation is proven by the route's tests; here
 * we prove the resolver reads creds ONLY from `ctx.integration`.
 *
 * Business rules protected:
 *   - Returns options with stable vehicle-id values + recognizable labels.
 *   - Search is passed server-side (filter[name][like]); archived excluded by
 *     the endpoint default (no client filter).
 *   - One page; hasMore mirrors the opaque next_cursor; no provider URL/link leaks.
 *   - Label fallbacks never emit "undefined"/empty separators.
 *   - Empty results → empty option set (not an error).
 *   - Invalid credentials / role gap / provider outage → typed resolver errors.
 *   - A malformed credential blob → PROVIDER_REAUTH_REQUIRED (reconnect).
 *   - The resolver uses ctx.integration's creds — a different row = different creds.
 */
import { randomBytes } from "node:crypto";
import { fleetioVehiclesResolver } from "@/integrations/fleetio/options/vehicles";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import { encryptToken } from "@/core/encryption/tokens";

const ORIGINAL_FETCH = global.fetch;
const API_KEY = "fleetio-key-resolver";
const ACCOUNT_TOKEN = "fleetio-acct-resolver";

function integrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-A",
    provider: "fleetio",
    providerAccountId: "7211",
    accessTokenEncrypted: encryptToken(API_KEY),
    extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: ACCOUNT_TOKEN })),
    ...overrides,
  } as unknown as OptionsResolverContext["integration"];
}

function ctx(over: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration: integrationRow(),
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

describe("fleetioVehiclesResolver", () => {
  it("returns stable-id options with recognizable labels + status description; hasMore from cursor", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          { id: 1, name: "Truck 104", vehicle_status_name: "Active" },
          { id: 2, name: "Van 7", vehicle_status_name: "In Shop" },
        ],
        next_cursor: "CUR",
      }),
    ) as unknown as typeof fetch;

    const result = await fleetioVehiclesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "1", label: "Truck 104", description: "Active" },
      { value: "2", label: "Van 7", description: "In Shop" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("passes search to Fleetio as filter[name][like] and reads creds from ctx.integration", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(200, { records: [], next_cursor: null }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fleetioVehiclesResolver.resolve(ctx({ q: "truck" }));

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(new URL(url).searchParams.get("filter[name][like]")).toBe("truck");
    // Credentials come from ctx.integration (a different row → different creds).
    expect(init.headers.Authorization).toBe(`Token ${API_KEY}`);
    expect(init.headers["Account-Token"]).toBe(ACCOUNT_TOKEN);
  });

  it("does not leak provider hosts / pagination links into options", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { records: [{ id: 5, name: "Bus 1" }], next_cursor: "https://secure.fleetio.com/next?x=1" }),
    ) as unknown as typeof fetch;
    const result = await fleetioVehiclesResolver.resolve(ctx());
    // hasMore is a boolean; the raw cursor/link never appears in items.
    expect(result.hasMore).toBe(true);
    expect(JSON.stringify(result.items)).not.toContain("secure.fleetio.com");
    expect(JSON.stringify(result.items)).not.toContain("http");
  });

  it("label fallbacks: name-only, and missing name → 'Vehicle <id>' (never 'undefined')", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          { id: 10, name: "Truck 9" },
          { id: 11, name: null },
          { id: 12, name: "   " },
        ],
        next_cursor: null,
      }),
    ) as unknown as typeof fetch;
    const result = await fleetioVehiclesResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["Truck 9", "Vehicle 11", "Vehicle 12"]);
    expect(JSON.stringify(result.items)).not.toContain("undefined");
  });

  it("empty results → empty option set (not an error), one page", async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, { records: [], next_cursor: null })) as unknown as typeof fetch;
    const result = await fleetioVehiclesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("no integration → INTEGRATION_DISCONNECTED", async () => {
    let thrown: unknown;
    try {
      await fleetioVehiclesResolver.resolve(ctx({ integration: null }));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("INTEGRATION_DISCONNECTED");
  });

  it("401 → PROVIDER_REAUTH_REQUIRED (reconnect), credential-free message", async () => {
    global.fetch = jest.fn(async () => new Response("bad", { status: 401 })) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioVehiclesResolver.resolve(ctx());
    } catch (e) {
      thrown = e;
    }
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_REAUTH_REQUIRED");
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
  });

  it("403 role gap → PROVIDER_REAUTH_REQUIRED", async () => {
    global.fetch = jest.fn(async () => new Response("x", { status: 403 })) as unknown as typeof fetch;
    await expect(fleetioVehiclesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_REAUTH_REQUIRED",
    });
  });

  it("provider outage (5xx) → PROVIDER_ERROR", async () => {
    global.fetch = jest.fn(async () => jsonResponse(500, { error: "boom" })) as unknown as typeof fetch;
    await expect(fleetioVehiclesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("malformed credential blob → PROVIDER_REAUTH_REQUIRED (reconnect)", async () => {
    const badRow = integrationRow({ extraCredentialsEncrypted: null });
    await expect(fleetioVehiclesResolver.resolve(ctx({ integration: badRow }))).rejects.toMatchObject({
      code: "PROVIDER_REAUTH_REQUIRED",
    });
  });
});
