/**
 * @jest-environment node
 *
 * Extra-credentials persistence wiring (FLEETIO-1 — migration 20260727000000).
 *
 * Business rules protected:
 *   - `upsertActive` writes `extra_credentials_encrypted` on INSERT and
 *     replaces it on the re-connect UPDATE; single-credential providers
 *     (tokens without the field) write NULL — never `undefined`, never a
 *     leftover stale blob.
 *   - `updateTokens` (refresh path) does NOT touch the column unless the
 *     caller explicitly carries it — an OAuth refresh can't wipe another
 *     flow's credential.
 *   - `disconnectByIdServiceRole` clears the blob (defense-in-depth, same
 *     rationale as the refresh token).
 *   - `rowToRecord` surfaces the column so execution-side consumers can
 *     decrypt it.
 */

const captured: { insert?: Record<string, unknown>; update?: Record<string, unknown> } = {};

const rowFixture = {
  id: "int-1",
  account_id: "acct-1",
  connected_by_user_id: "user-1",
  provider: "fleetio",
  provider_account_id: "7211",
  display_name: "Acme Trucking",
  access_token_encrypted: "ENC-KEY",
  refresh_token_encrypted: null,
  access_token_expires_at: null,
  extra_credentials_encrypted: "ENC-EXTRA",
  scopes: [],
  account_metadata: {},
  disconnected_at: null,
  integration_sharing_scope: null,
  needs_reconnect_at: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

function makeClient(existingRow: typeof rowFixture | null) {
  const from = jest.fn().mockImplementation(() => {
    let wrote = false;
    const builder: Record<string, jest.Mock> = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockImplementation((payload: Record<string, unknown>) => {
        captured.insert = payload;
        wrote = true;
        return builder;
      }),
      update: jest.fn().mockImplementation((payload: Record<string, unknown>) => {
        captured.update = payload;
        wrote = true;
        return builder;
      }),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: existingRow, error: null }),
      single: jest.fn().mockImplementation(() =>
        Promise.resolve({ data: wrote ? rowFixture : existingRow, error: null }),
      ),
      then: undefined as unknown as jest.Mock,
    };
    // Allow `await` on the builder tail for update-without-select paths
    // (disconnect uses .select("id") then awaits — covered by select above).
    (builder as Record<string, unknown>).then = (
      resolve: (v: { data: unknown[]; error: null }) => void,
    ) => resolve({ data: [{ id: rowFixture.id }], error: null });
    return builder;
  });
  return { from };
}

const mockClient: { current: ReturnType<typeof makeClient> | null } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClient.current),
}));

import {
  disconnectByIdServiceRole,
  updateTokens,
  upsertActive,
} from "@/repositories/integrations";

const TOKENS_WITH_EXTRA = {
  accessTokenEncrypted: "ENC-KEY",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [] as string[],
  extraCredentialsEncrypted: "ENC-EXTRA",
};

beforeEach(() => {
  delete captured.insert;
  delete captured.update;
});

describe("upsertActive — extra_credentials_encrypted", () => {
  it("INSERT writes the encrypted blob for a multi-credential provider", async () => {
    mockClient.current = makeClient(null);
    const record = await upsertActive({
      accountId: "acct-1",
      connectedByUserId: "user-1",
      provider: "fleetio",
      providerAccountId: "7211",
      displayName: "Acme Trucking",
      tokens: TOKENS_WITH_EXTRA,
      accountMetadata: {},
    });
    expect(captured.insert?.extra_credentials_encrypted).toBe("ENC-EXTRA");
    expect(record.extraCredentialsEncrypted).toBe("ENC-EXTRA");
  });

  it("INSERT writes NULL (not undefined) when tokens carry no extra credentials", async () => {
    mockClient.current = makeClient(null);
    const { extraCredentialsEncrypted: _omit, ...tokensWithout } = TOKENS_WITH_EXTRA;
    await upsertActive({
      accountId: "acct-1",
      connectedByUserId: "user-1",
      provider: "slack",
      providerAccountId: "T1",
      displayName: null,
      tokens: tokensWithout,
      accountMetadata: {},
    });
    expect(captured.insert).toHaveProperty("extra_credentials_encrypted", null);
  });

  it("re-connect UPDATE replaces the blob (no stale credential survives)", async () => {
    mockClient.current = makeClient(rowFixture);
    await upsertActive({
      accountId: "acct-1",
      connectedByUserId: "user-2",
      provider: "fleetio",
      providerAccountId: "7211",
      displayName: "Acme Trucking",
      tokens: { ...TOKENS_WITH_EXTRA, extraCredentialsEncrypted: "ENC-EXTRA-2" },
      accountMetadata: {},
    });
    expect(captured.update?.extra_credentials_encrypted).toBe("ENC-EXTRA-2");
  });
});

describe("updateTokens — refresh path must not clobber the column", () => {
  it("omits extra_credentials_encrypted when the tokens don't carry it", async () => {
    mockClient.current = makeClient(rowFixture);
    const { extraCredentialsEncrypted: _omit, ...tokensWithout } = TOKENS_WITH_EXTRA;
    await updateTokens({ id: "int-1", tokens: tokensWithout });
    expect(captured.update).not.toHaveProperty("extra_credentials_encrypted");
  });

  it("writes it when explicitly present", async () => {
    mockClient.current = makeClient(rowFixture);
    await updateTokens({ id: "int-1", tokens: TOKENS_WITH_EXTRA });
    expect(captured.update?.extra_credentials_encrypted).toBe("ENC-EXTRA");
  });
});

describe("disconnectByIdServiceRole — clears the blob", () => {
  it("nulls extra_credentials_encrypted alongside the refresh token", async () => {
    mockClient.current = makeClient(rowFixture);
    await disconnectByIdServiceRole({ integrationId: "int-1" });
    expect(captured.update).toHaveProperty("extra_credentials_encrypted", null);
    expect(captured.update).toHaveProperty("refresh_token_encrypted", null);
  });
});
