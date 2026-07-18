/**
 * @jest-environment node
 *
 * Tests for repositories/machineCredentials.ts. Mocks the service-role client to
 * verify: snake_case payloads, create-vs-rotate branching (rotation clears the
 * cached token + stamps rotated_at), exact account scoping on reads, cached-token
 * write guards, soft-disconnect clearing, and audit inserts. No DB.
 */

interface Result {
  data: unknown;
  error: { message: string } | null;
}
interface State {
  insertPayload?: unknown;
  updatePayload?: unknown;
  filters: Array<[string, ...unknown[]]>;
  // A queue of results for successive terminal awaits (maybeSingle/single/then).
  results: Result[];
  resultIdx: number;
}

function nextResult(state: State): Result {
  const r = state.results[Math.min(state.resultIdx, state.results.length - 1)];
  state.resultIdx++;
  return r as Result;
}

function makeClient(state: State) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    insert: (p: unknown) => ((state.insertPayload = p), b),
    update: (p: unknown) => ((state.updatePayload = p), b),
    select: () => b,
    eq: (col: string, v: unknown) => (state.filters.push(["eq", col, v]), b),
    is: (col: string, v: unknown) => (state.filters.push(["is", col, v]), b),
    order: () => b,
    limit: () => b,
    single: async () => nextResult(state),
    maybeSingle: async () => nextResult(state),
    then: (resolve: (v: Result) => void) => resolve(nextResult(state)),
  });
  return { from: () => b };
}

const mockClient: { current: ReturnType<typeof makeClient> | null } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClient.current),
}));

import {
  upsertActiveMachineCredential,
  getActiveMachineCredential,
  updateCachedToken,
  disconnectMachineCredential,
  recordMachineCredentialAudit,
} from "@/repositories/machineCredentials";

const ROW = {
  id: "cred-1",
  account_id: "acct-1",
  connected_by_user_id: "user-1",
  provider: "adp",
  label: "ADP prod",
  client_id_encrypted: "e-cid",
  client_secret_encrypted: "e-secret",
  cert_pem_encrypted: "e-cert",
  key_pem_encrypted: "e-key",
  cached_access_token_encrypted: null,
  cached_token_expires_at: null,
  cert_fingerprint256: "AB:CD",
  cert_subject: "CN=x",
  cert_not_after: "2126-06-24T00:00:00Z",
  metadata: { environment: "prod" },
  disconnected_at: null,
  rotated_at: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

function setup(results: Result[]): State {
  const state: State = { filters: [], results, resultIdx: 0 };
  mockClient.current = makeClient(state);
  return state;
}

const baseInput = {
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "adp",
  label: "ADP prod",
  clientIdEncrypted: "e-cid",
  clientSecretEncrypted: "e-secret",
  certPemEncrypted: "e-cert",
  keyPemEncrypted: "e-key",
  certFingerprint256: "AB:CD",
  certSubject: "CN=x",
  certNotAfter: "2126-06-24T00:00:00Z",
  metadata: { environment: "prod" },
};

describe("upsertActiveMachineCredential", () => {
  it("inserts a new active row when none exists", async () => {
    const state = setup([
      { data: null, error: null }, // existing lookup → none
      { data: ROW, error: null }, // insert returning
    ]);
    const rec = await upsertActiveMachineCredential(baseInput);
    expect(rec.id).toBe("cred-1");
    expect((state.insertPayload as Record<string, unknown>).client_secret_encrypted).toBe(
      "e-secret",
    );
    // Insert path leaves cached token untouched (null in schema default).
    expect(state.insertPayload).not.toHaveProperty("cached_access_token_encrypted");
  });

  it("rotates the existing active row: clears cached token + stamps rotated_at", async () => {
    const state = setup([
      { data: ROW, error: null }, // existing lookup → found
      { data: ROW, error: null }, // update returning
    ]);
    await upsertActiveMachineCredential(baseInput, "2026-08-01T00:00:00Z");
    const upd = state.updatePayload as Record<string, unknown>;
    expect(upd.cached_access_token_encrypted).toBeNull();
    expect(upd.cached_token_expires_at).toBeNull();
    expect(upd.rotated_at).toBe("2026-08-01T00:00:00Z");
  });
});

describe("getActiveMachineCredential", () => {
  it("filters on account_id + provider + active and maps the row", async () => {
    const state = setup([{ data: ROW, error: null }]);
    const rec = await getActiveMachineCredential("acct-1", "adp");
    expect(rec?.provider).toBe("adp");
    expect(state.filters).toEqual(
      expect.arrayContaining([
        ["eq", "account_id", "acct-1"],
        ["eq", "provider", "adp"],
        ["is", "disconnected_at", null],
      ]),
    );
  });

  it("returns null when absent", async () => {
    setup([{ data: null, error: null }]);
    expect(await getActiveMachineCredential("acct-1", "adp")).toBeNull();
  });
});

describe("updateCachedToken", () => {
  it("guards on active row and reports whether it updated", async () => {
    const state = setup([{ data: [{ id: "cred-1" }], error: null }]);
    const r = await updateCachedToken({
      id: "cred-1",
      cachedAccessTokenEncrypted: "e-tok",
      cachedTokenExpiresAt: "2030-01-01T00:00:00Z",
    });
    expect(r.updated).toBe(true);
    expect(state.filters).toEqual(
      expect.arrayContaining([["is", "disconnected_at", null]]),
    );
  });
});

describe("disconnectMachineCredential", () => {
  it("is account-scoped and clears the cached token", async () => {
    const state = setup([{ data: [{ id: "cred-1" }], error: null }]);
    const r = await disconnectMachineCredential({ accountId: "acct-1", id: "cred-1" });
    expect(r.disconnected).toBe(true);
    const upd = state.updatePayload as Record<string, unknown>;
    expect(upd.cached_access_token_encrypted).toBeNull();
    expect(state.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", "cred-1"],
        ["eq", "account_id", "acct-1"],
      ]),
    );
  });
});

describe("recordMachineCredentialAudit", () => {
  it("inserts a bounded event with non-secret detail", async () => {
    const state = setup([{ data: null, error: null }]);
    await recordMachineCredentialAudit({
      accountId: "acct-1",
      credentialId: "cred-1",
      provider: "adp",
      actorUserId: "user-1",
      event: "mint_succeeded",
      detail: { environment: "prod" },
    });
    const ins = state.insertPayload as Record<string, unknown>;
    expect(ins.event).toBe("mint_succeeded");
    expect(ins.detail).toEqual({ environment: "prod" });
  });
});
