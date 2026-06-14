/**
 * @jest-environment node
 *
 * Tests for services/integrations/slackHealthCheck (V2-READY-29).
 *
 * Mocks the repo (list/mark/clear), the auth.test wrapper, the notifier, the
 * decryptor, and the flag — but keeps `integrations/slack/api/errors` REAL so
 * SlackApiError + isSlackAuthError classification is exercised end-to-end (the
 * thrown error must be the same class the service checks `instanceof` against).
 */

const mockList = jest.fn();
const mockMark = jest.fn();
const mockClear = jest.fn();
const mockAuthTest = jest.fn();
const mockNotify = jest.fn();
const mockDecrypt = jest.fn();
const mockFlag = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  listActiveByProviderServiceRole: (...a: unknown[]) => mockList(...a),
  markNeedsReconnect: (...a: unknown[]) => mockMark(...a),
  clearNeedsReconnect: (...a: unknown[]) => mockClear(...a),
}));
jest.mock("@/integrations/slack/api/authTest", () => ({
  authTest: (...a: unknown[]) => mockAuthTest(...a),
}));
jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: (...a: unknown[]) => mockNotify(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...a: unknown[]) => mockDecrypt(...a),
}));
jest.mock("@/services/integrations/integrationHealthFlags", () => ({
  isIntegrationHealthCheckEnabled: () => mockFlag(),
}));

import { runSlackHealthCheck } from "@/services/integrations/slackHealthCheck";
import { SlackApiError } from "@/integrations/slack/api/errors";
import type { IntegrationRecord } from "@/repositories/integrations";

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  mockList.mockReset();
  mockMark.mockReset();
  mockClear.mockReset();
  mockAuthTest.mockReset();
  mockNotify.mockReset();
  mockDecrypt.mockReset();
  mockFlag.mockReset();

  mockFlag.mockReturnValue(true); // enabled by default; one test flips it off
  mockDecrypt.mockImplementation((enc: string) => `dec(${enc})`);
  mockMark.mockResolvedValue(true); // default: first-mark transition
  mockClear.mockResolvedValue(undefined);
  mockNotify.mockResolvedValue(undefined);
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

let idSeq = 0;
function row(over: Partial<IntegrationRecord> = {}): IntegrationRecord {
  idSeq += 1;
  return {
    id: `int-${idSeq}`,
    accountId: `acct-${idSeq}`,
    connectedByUserId: `user-${idSeq}`,
    provider: "slack",
    providerAccountId: `T${idSeq}`,
    displayName: "Slack",
    accessTokenEncrypted: `enc-${idSeq}`,
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: ["chat:write"],
    accountMetadata: {},
    disconnectedAt: null,
    needsReconnectAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("runSlackHealthCheck — flag gating", () => {
  it("is a no-op when the flag is OFF (loads nothing, mutates nothing)", async () => {
    mockFlag.mockReturnValue(false);

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(result).toEqual({
      enabled: false,
      checked: 0,
      healthy: 0,
      cleared: 0,
      authFailed: 0,
      markedNeedsReconnect: 0,
      skipped: 0,
      errors: 0,
    });
    expect(mockList).not.toHaveBeenCalled();
    expect(mockAuthTest).not.toHaveBeenCalled();
    expect(mockMark).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("passes the provider + limit to the service-role list helper", async () => {
    mockList.mockResolvedValueOnce([]);
    await runSlackHealthCheck({ limit: 42 });
    expect(mockList).toHaveBeenCalledWith("slack", 42);
  });
});

describe("runSlackHealthCheck — healthy path", () => {
  it("clears needs_reconnect_at when a previously-marked token validates", async () => {
    const r = row({ needsReconnectAt: "2026-06-10T00:00:00.000Z" });
    mockList.mockResolvedValueOnce([r]);
    mockAuthTest.mockResolvedValueOnce({ ok: true });

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(mockClear).toHaveBeenCalledWith(r.id);
    expect(mockMark).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      enabled: true,
      checked: 1,
      healthy: 1,
      cleared: 1,
      authFailed: 0,
      markedNeedsReconnect: 0,
      skipped: 0,
      errors: 0,
    });
  });

  it("does NOT clear when a healthy token had no prior signal (avoids needless write)", async () => {
    mockList.mockResolvedValueOnce([row({ needsReconnectAt: null })]);
    mockAuthTest.mockResolvedValueOnce({ ok: true });

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(mockClear).not.toHaveBeenCalled();
    expect(result).toMatchObject({ healthy: 1, cleared: 0 });
  });
});

describe("runSlackHealthCheck — confirmed auth failures mark + notify once", () => {
  const AUTH_CODES = [
    "invalid_auth",
    "not_authed",
    "account_inactive",
    "token_revoked",
    "token_expired",
    "missing_scope",
    "http_401",
    "http_403",
  ];

  it.each(AUTH_CODES)("marks + notifies once on %s (first-mark transition)", async (code) => {
    const r = row();
    mockList.mockResolvedValueOnce([r]);
    mockAuthTest.mockRejectedValueOnce(new SlackApiError(code));
    mockMark.mockResolvedValueOnce(true);

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(mockMark).toHaveBeenCalledWith(r.id);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(r);
    expect(mockClear).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      checked: 1,
      authFailed: 1,
      markedNeedsReconnect: 1,
      skipped: 0,
      errors: 0,
    });
  });

  it("does NOT re-notify when the row was already marked (mark returns false)", async () => {
    const r = row();
    mockList.mockResolvedValueOnce([r]);
    mockAuthTest.mockRejectedValueOnce(new SlackApiError("invalid_auth"));
    mockMark.mockResolvedValueOnce(false); // already reconnect-needed

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(mockMark).toHaveBeenCalledWith(r.id);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      authFailed: 1,
      markedNeedsReconnect: 0,
    });
  });
});

describe("runSlackHealthCheck — transient / ambiguous failures never mark", () => {
  const TRANSIENT_CODES = ["ratelimited", "internal_error", "service_unavailable", "http_429", "http_500", "http_503"];

  it.each(TRANSIENT_CODES)("skips on transient Slack failure %s (no mark, no notify)", async (code) => {
    mockList.mockResolvedValueOnce([row()]);
    mockAuthTest.mockRejectedValueOnce(new SlackApiError(code));

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(mockMark).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 1, skipped: 1, errors: 0, authFailed: 0 });
  });

  it("does NOT mark on a network error (non-Slack throw) — counts as error", async () => {
    mockList.mockResolvedValueOnce([row()]);
    mockAuthTest.mockRejectedValueOnce(new Error("ECONNRESET"));

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(mockMark).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 1, errors: 1, skipped: 0, authFailed: 0 });
  });

  it("does NOT mark on a decrypt failure — counts as error, never probes", async () => {
    mockList.mockResolvedValueOnce([row()]);
    mockDecrypt.mockImplementationOnce(() => {
      throw new Error("decrypt failed");
    });

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(mockAuthTest).not.toHaveBeenCalled();
    expect(mockMark).not.toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 1, errors: 1 });
  });
});

describe("runSlackHealthCheck — mixed batch + isolation + no-leak", () => {
  it("aggregates a mixed batch and isolates per-row outcomes", async () => {
    const healthyCleared = row({ id: "h-clear", needsReconnectAt: "2026-06-10T00:00:00.000Z" });
    const healthyPlain = row({ id: "h-plain" });
    const authFail = row({ id: "auth-fail" });
    const transient = row({ id: "transient" });
    const networkErr = row({ id: "net-err" });
    // Override accessTokenEncrypted so decrypt(identity) yields predictable tokens.
    healthyCleared.accessTokenEncrypted = "enc-for-h-clear";
    healthyPlain.accessTokenEncrypted = "enc-for-h-plain";
    authFail.accessTokenEncrypted = "enc-for-auth-fail";
    transient.accessTokenEncrypted = "enc-for-transient";
    networkErr.accessTokenEncrypted = "enc-for-net-err";
    mockList.mockResolvedValueOnce([healthyCleared, healthyPlain, authFail, transient, networkErr]);

    // Route by integration via decrypt → token, then per-token verdict.
    mockDecrypt.mockImplementation((enc: string) => enc);
    mockAuthTest.mockImplementation(({ botToken }: { botToken: string }) => {
      switch (botToken) {
        case "enc-for-h-clear":
        case "enc-for-h-plain":
          return Promise.resolve({ ok: true });
        case "enc-for-auth-fail":
          return Promise.reject(new SlackApiError("token_revoked"));
        case "enc-for-transient":
          return Promise.reject(new SlackApiError("ratelimited"));
        case "enc-for-net-err":
          return Promise.reject(new Error("network"));
        default:
          return Promise.resolve({ ok: true });
      }
    });

    const result = await runSlackHealthCheck({ limit: 500 });

    expect(result).toEqual({
      enabled: true,
      checked: 5,
      healthy: 2,
      cleared: 1,
      authFailed: 1,
      markedNeedsReconnect: 1,
      skipped: 1,
      errors: 1,
    });
    expect(mockClear).toHaveBeenCalledWith("h-clear");
    expect(mockMark).toHaveBeenCalledWith("auth-fail");
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("result contains only numeric aggregate counts (no tokens / ids / provider data)", async () => {
    const r = row({ accessTokenEncrypted: "SECRET-TOKEN", providerAccountId: "T-SECRET", connectedByUserId: "U-SECRET" });
    mockList.mockResolvedValueOnce([r]);
    mockAuthTest.mockRejectedValueOnce(new SlackApiError("invalid_auth"));

    const result = await runSlackHealthCheck({ limit: 500 });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SECRET-TOKEN");
    expect(serialized).not.toContain("T-SECRET");
    expect(serialized).not.toContain("U-SECRET");
    expect(serialized).not.toContain("int-"); // no integration ids
    // Every value is a number except `enabled` (boolean).
    for (const [k, v] of Object.entries(result)) {
      if (k === "enabled") expect(typeof v).toBe("boolean");
      else expect(typeof v).toBe("number");
    }
  });
});
