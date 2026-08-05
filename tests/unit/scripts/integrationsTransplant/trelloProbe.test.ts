/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-REMAINING-SEVEN-1 — Trello identity probe.
 *
 * Trello authenticates every API call as a (deployment API key, user token)
 * PAIR. The probe must therefore construct `key=<TRELLO_CLIENT_ID>&token=<the
 * transplanted token>` — and must FAIL CLOSED (never call the provider, never
 * report success) when the deployment key is unavailable, which is exactly the
 * condition that stopped the first apply batch.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getProbe } from "@/scripts/integrations-transplant/verificationProbes";

const CLIENT_ID = "test-trello-api-key";
const TOKEN = "test-trello-user-token";

const creds = {
  accessToken: TOKEN,
  extras: null,
  providerAccountId: "member-id-123",
  accountMetadata: {},
};

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  delete process.env.TRELLO_CLIENT_ID;
});

describe("trello identity probe", () => {
  it("fails closed WITHOUT calling the provider when TRELLO_CLIENT_ID is unset", async () => {
    delete process.env.TRELLO_CLIENT_ID;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getProbe("trello")!(creds);

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("constructs the key+token pair against GET /1/members/me when the client id IS set", async () => {
    process.env.TRELLO_CLIENT_ID = CLIENT_ID;
    const fetchSpy = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ id: "member-id-123" }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getProbe("trello")!(creds);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(calledUrl).toContain("https://api.trello.com/1/members/me");
    expect(calledUrl).toContain(`key=${encodeURIComponent(CLIENT_ID)}`);
    expect(calledUrl).toContain(`token=${encodeURIComponent(TOKEN)}`);
    // Read-only: a GET with no body.
    const init = fetchSpy.mock.calls[0]![1] as { method?: string; body?: unknown };
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
    // Identity is extracted for comparison against provider_account_id.
    expect(result).toMatchObject({ ok: true, identity: "member-id-123", identitySupported: true });
  });

  it("reports unauthorized (never ok) when Trello rejects the pair", async () => {
    process.env.TRELLO_CLIENT_ID = CLIENT_ID;
    global.fetch = jest.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const result = await getProbe("trello")!(creds);
    expect(result).toMatchObject({ ok: false, failure: "unauthorized" });
  });
});

describe("CLI probe-config passthrough", () => {
  const cliSource = readFileSync(
    path.join(process.cwd(), "scripts", "integrations-transplant", "cli.ts"),
    "utf8",
  );

  it("forwards TRELLO_CLIENT_ID from the merged env to the probe environment", () => {
    expect(cliSource).toMatch(/PROBE_CONFIG_VARS\s*=\s*\[\s*"TRELLO_CLIENT_ID"/);
    expect(cliSource).toMatch(/process\.env\[name\] = value/);
  });

  it("still never loads .env.local", () => {
    const loaded = cliSource.match(/"\.env[^"]*"/g) ?? [];
    expect(loaded.sort()).toEqual(['".env.development.local"', '".env.transplant.local"']);
  });
});
