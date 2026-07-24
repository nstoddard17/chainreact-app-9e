/**
 * @jest-environment node
 *
 * Fleetio execution seam `runFleetioApiCall` (FLEETIO-2).
 *
 * Business rules protected:
 *   - Uses the CANONICAL account-scoped lookup (`getActiveForExecution`) with
 *     the caller's accountId — cross-account isolation is structural, never via
 *     `connected_by_user_id`.
 *   - Decrypts BOTH credentials (real crypto) and hands them to the apiCall.
 *   - A missing row → clear connect-required error (never a partial call).
 *   - A malformed credential blob → fatal typed error (never a partial call).
 *   - A 401 (dead non-refreshable key) marks the row reconnect-needed (one-shot)
 *     and throws IntegrationActionRequiredError(refresh_not_supported).
 *   - Every OTHER error propagates verbatim and does NOT mark reconnect.
 *   - No credential ever appears in a thrown error message.
 */
import { randomBytes } from "node:crypto";

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

import { runFleetioApiCall } from "@/integrations/fleetio/execute";
import { Unauthorized401Error, IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { encryptToken } from "@/core/encryption/tokens";

const API_KEY = "fleetio-key-exec-secret";
const ACCOUNT_TOKEN = "fleetio-acct-exec-secret";

function activeRow(accountId: string) {
  return {
    id: "int-1",
    accountId,
    provider: "fleetio",
    providerAccountId: "7211",
    accessTokenEncrypted: encryptToken(API_KEY),
    extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: ACCOUNT_TOKEN })),
    needsReconnectAt: null,
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
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("runFleetioApiCall", () => {
  it("looks up the caller's account row and passes BOTH decrypted credentials", async () => {
    mockGetActive.mockResolvedValueOnce(activeRow("acct-A"));
    const apiCall = jest.fn(async () => ({ ok: true }));

    const result = await runFleetioApiCall({ accountId: "acct-A", apiCall });

    expect(mockGetActive).toHaveBeenCalledWith("acct-A", "fleetio", null);
    expect(apiCall).toHaveBeenCalledWith({ apiKey: API_KEY, accountToken: ACCOUNT_TOKEN });
    expect(result).toEqual({ ok: true });
  });

  it("throws a connect-required error when no active row exists (wrong/absent account)", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    const apiCall = jest.fn();
    await expect(
      runFleetioApiCall({ accountId: "acct-B", apiCall }),
    ).rejects.toThrow(/no active Fleetio integration/i);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("marks reconnect-needed (one-shot) and throws IntegrationActionRequiredError on 401", async () => {
    mockGetActive.mockResolvedValueOnce(activeRow("acct-A"));
    const apiCall = jest.fn(async () => {
      throw new Unauthorized401Error("Fleetio GET /vehicles/42 returned HTTP 401");
    });

    let thrown: unknown;
    try {
      await runFleetioApiCall({ accountId: "acct-A", apiCall });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IntegrationActionRequiredError);
    expect((thrown as IntegrationActionRequiredError).reason).toBe("refresh_not_supported");
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-1");
    expect(mockNotifyReconnect).toHaveBeenCalledTimes(1);
    // No credential in the thrown message.
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
    expect(String((thrown as Error).message)).not.toContain(ACCOUNT_TOKEN);
  });

  it("does NOT re-notify when the mark was already set (markNeedsReconnect returns false)", async () => {
    mockGetActive.mockResolvedValueOnce(activeRow("acct-A"));
    mockMarkNeedsReconnect.mockResolvedValueOnce(false);
    const apiCall = jest.fn(async () => {
      throw new Unauthorized401Error();
    });
    await expect(runFleetioApiCall({ accountId: "acct-A", apiCall })).rejects.toBeInstanceOf(
      IntegrationActionRequiredError,
    );
    expect(mockNotifyReconnect).not.toHaveBeenCalled();
  });

  it("propagates a non-401 error verbatim and never marks reconnect", async () => {
    mockGetActive.mockResolvedValueOnce(activeRow("acct-A"));
    const boom = new Error("Fleetio GET /vehicles/42 failed: 500");
    const apiCall = jest.fn(async () => {
      throw boom;
    });
    await expect(runFleetioApiCall({ accountId: "acct-A", apiCall })).rejects.toBe(boom);
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
  });

  it("surfaces a malformed credential blob as a fatal typed error (no partial call)", async () => {
    const badRow = { ...activeRow("acct-A"), extraCredentialsEncrypted: null };
    mockGetActive.mockResolvedValueOnce(badRow);
    const apiCall = jest.fn();
    await expect(runFleetioApiCall({ accountId: "acct-A", apiCall })).rejects.toThrow(
      /missing usable credentials/i,
    );
    expect(apiCall).not.toHaveBeenCalled();
  });
});
