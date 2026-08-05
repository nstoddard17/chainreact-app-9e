/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — apply behavior (Phase 12): real
 * orchestration + REAL AES-256-GCM encryption over isolated in-memory source
 * and destination stores with DIFFERENT keys (the integration-style test).
 * Mocks exist only at the store and provider-probe boundaries.
 */
import { decryptTokenWithKey } from "@/core/encryption/tokens";
import {
  buildPlan,
  runApply,
} from "@/scripts/integrations-transplant/orchestrator";
import { TransplantRefusalError } from "@/scripts/integrations-transplant/types";
import {
  DEST_ACCOUNT_ID,
  DEST_KEY,
  DEST_USER_ID,
  FakeDestinationStore,
  FakeSourceReader,
  SOURCE_KEY,
  makeConfig,
  makeDeps,
  makeSourceRow,
  okProbe,
} from "./helpers";

async function planFingerprint(
  deps: Parameters<typeof runApply>[0],
  config: Parameters<typeof runApply>[1],
): Promise<string> {
  return (await buildPlan(deps, config)).fingerprint;
}

describe("apply — happy path (fresh insert)", () => {
  async function runHappyPath(configOver: Parameters<typeof makeConfig>[0] = {}) {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const made = makeDeps({
      source,
      probes: { gmail: okProbe(row.provider_account_id) },
    });
    const config = makeConfig(configOver);
    const fp = await planFingerprint(made.deps, config);
    const result = await runApply(made.deps, config, "op-apply", fp);
    return { ...made, row, result };
  }

  it("writes a destination row with NEW id, destination ownership + provenance, and never copies source ownership", async () => {
    const { dest, row, result } = await runHappyPath();
    expect(dest.rows).toHaveLength(1);
    const written = dest.rows[0]!;
    expect(written.id).not.toBe(row.id);
    expect(written.accountId).toBe(DEST_ACCOUNT_ID);
    expect(written.connectedByUserId).toBe(DEST_USER_ID);
    expect(written.connectedByUserId).not.toBe(row.connected_by_user_id);
    expect(result.report.items[0]!.destinationIntegrationId).toBe(written.id);
  });

  it("re-encrypts: destination ciphertext differs from source and decrypts ONLY with the dest key", async () => {
    const { dest, row } = await runHappyPath();
    const written = dest.rows[0]!;
    expect(written.accessTokenEncrypted).not.toBe(row.access_token_encrypted);
    expect(decryptTokenWithKey(written.accessTokenEncrypted, DEST_KEY)).toBe(
      "source-access-token-plain-value",
    );
    expect(() => decryptTokenWithKey(written.accessTokenEncrypted, SOURCE_KEY)).toThrow();
    expect(decryptTokenWithKey(written.refreshTokenEncrypted as string, DEST_KEY)).toBe(
      "source-refresh-token-plain-value",
    );
  });

  it("leaves the source row byte-for-byte unchanged and reports it", async () => {
    const { source, row, result } = await runHappyPath();
    const [after] = await source.getIntegrationsByIds([row.id]);
    expect(JSON.stringify(after)).toBe(JSON.stringify(row));
    expect(result.report.items[0]!.sourceUnchanged).toBe(true);
  });

  it("status is refresh_unverified for a client-bound provider without owner attestation", async () => {
    const { result } = await runHappyPath();
    expect(result.report.items[0]).toMatchObject({
      status: "refresh_unverified",
      reason: "oauth_client_compat_unattested",
    });
  });

  it("status is verified only with identity match AND attested shared OAuth client", async () => {
    const { result } = await runHappyPath({ sharedOAuthClientProviders: ["gmail"] });
    expect(result.report.items[0]).toMatchObject({ status: "verified", reason: "ok" });
  });

  it("an expired access token with a refresh token skips the probe and is NOT reported as durably verified", async () => {
    const row = makeSourceRow({
      access_token_expires_at: new Date(Date.now() - 3600_000).toISOString(),
    });
    const source = new FakeSourceReader(undefined, [row]);
    let probeCalls = 0;
    const { deps } = makeDeps({
      source,
      probes: {
        gmail: async () => {
          probeCalls += 1;
          return { ok: true, identity: row.provider_account_id, identitySupported: true };
        },
      },
    });
    // Attest shared client — even then, an unprobed credential must not be 'verified'.
    const config = makeConfig({ sharedOAuthClientProviders: ["gmail"] });
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);
    expect(probeCalls).toBe(0);
    expect(report.items[0]).toMatchObject({
      status: "refresh_unverified",
      reason: "access_token_expired_refresh_untested",
    });
  });
});

describe("apply — verification failures & rollback", () => {
  it("provider identity mismatch rejects the transplant with NO write", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps, dest } = makeDeps({
      source,
      probes: { gmail: okProbe("someone-else@gmail.com") },
    });
    const config = makeConfig();
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);
    expect(report.items[0]).toMatchObject({
      status: "verification_failed",
      reason: "provider_identity_mismatch",
    });
    expect(dest.rows).toHaveLength(0);
    expect(dest.mutationCalls).toEqual([]);
  });

  it("strict mode: an unauthorized probe fails the item before any write", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps, dest } = makeDeps({
      source,
      probes: {
        gmail: async () => ({
          ok: false,
          identity: null,
          identitySupported: true,
          failure: "unauthorized",
        }),
      },
    });
    const config = makeConfig();
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);
    expect(report.items[0]).toMatchObject({
      status: "verification_failed",
      reason: "probe_unauthorized",
    });
    expect(dest.rows).toHaveLength(0);
  });

  it("a failed destination-runtime decrypt removes a freshly inserted row", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps, dest } = makeDeps({
      source,
      probes: { gmail: okProbe(row.provider_account_id) },
      decryptDestRuntime: () => {
        throw new Error("simulated runtime key mismatch");
      },
    });
    const config = makeConfig();
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);
    expect(report.items[0]).toMatchObject({
      status: "verification_failed",
      reason: "runtime_decrypt_failed",
    });
    expect(dest.rows).toHaveLength(0);
    expect(dest.mutationCalls.some((c) => c.startsWith("hardDeleteById"))).toBe(true);
  });

  it("an approved replacement restores the previous destination row on failure", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const dest = new FakeDestinationStore();
    await dest.upsertActive({
      accountId: DEST_ACCOUNT_ID,
      connectedByUserId: DEST_USER_ID,
      provider: "gmail",
      providerAccountId: row.provider_account_id,
      displayName: "previous-connection",
      tokens: {
        accessTokenEncrypted: "previous-ciphertext-value",
        refreshTokenEncrypted: "previous-refresh-ciphertext",
        accessTokenExpiresAt: null,
        scopes: ["prior-scope"],
      },
      accountMetadata: { prior: true },
    });
    const priorId = dest.rows[0]!.id;
    dest.mutationCalls.length = 0;

    const { deps } = makeDeps({
      source,
      dest,
      probes: { gmail: okProbe(row.provider_account_id) },
      decryptDestRuntime: () => {
        throw new Error("simulated runtime key mismatch");
      },
    });
    const config = makeConfig({ conflictStrategy: "replace-after-verification" });
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);

    expect(report.items[0]).toMatchObject({ status: "verification_failed" });
    expect(dest.rows).toHaveLength(1);
    const restored = dest.rows[0]!;
    expect(restored.id).toBe(priorId); // workflow references stay valid
    expect(restored.accessTokenEncrypted).toBe("previous-ciphertext-value");
    expect(restored.displayName).toBe("previous-connection");
    expect(dest.mutationCalls.some((c) => c.startsWith("restoreRow"))).toBe(true);
  });

  it("a successful replacement updates in place (same id) and clears nothing else", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const dest = new FakeDestinationStore();
    await dest.upsertActive({
      accountId: DEST_ACCOUNT_ID,
      connectedByUserId: DEST_USER_ID,
      provider: "gmail",
      providerAccountId: row.provider_account_id,
      displayName: "previous-connection",
      tokens: {
        accessTokenEncrypted: "previous-ciphertext-value",
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: [],
      },
      accountMetadata: {},
    });
    const priorId = dest.rows[0]!.id;

    const { deps } = makeDeps({ source, dest, probes: { gmail: okProbe(row.provider_account_id) } });
    const config = makeConfig({ conflictStrategy: "replace-after-verification" });
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);

    expect(report.items[0]!.status).toBe("refresh_unverified");
    expect(dest.rows).toHaveLength(1);
    expect(dest.rows[0]!.id).toBe(priorId);
    expect(decryptTokenWithKey(dest.rows[0]!.accessTokenEncrypted, DEST_KEY)).toBe(
      "source-access-token-plain-value",
    );
  });
});

describe("apply — gates", () => {
  it("refuses on a dry-run fingerprint mismatch", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source, probes: { gmail: okProbe(row.provider_account_id) } });
    await expect(
      runApply(deps, makeConfig(), "op", "not-the-real-fingerprint"),
    ).rejects.toMatchObject({ code: "dry_run_fingerprint_mismatch" });
  });

  it("refuses to start while the plan contains unresolved conflicts (default fail strategy)", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const dest = new FakeDestinationStore();
    await dest.upsertActive({
      accountId: DEST_ACCOUNT_ID,
      connectedByUserId: DEST_USER_ID,
      provider: "gmail",
      providerAccountId: row.provider_account_id,
      displayName: null,
      tokens: {
        accessTokenEncrypted: "ct",
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: [],
      },
      accountMetadata: {},
    });
    dest.mutationCalls.length = 0;
    const { deps } = makeDeps({ source, dest, probes: { gmail: okProbe(row.provider_account_id) } });
    const config = makeConfig(); // conflictStrategy: fail
    const fp = await planFingerprint(deps, config);
    let caught: unknown;
    try {
      await runApply(deps, config, "op", fp);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TransplantRefusalError);
    expect((caught as TransplantRefusalError).code).toBe("unresolved_conflicts");
    expect(dest.mutationCalls).toEqual([]);
  });

  it("skip strategy performs no write for the conflicted item", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const dest = new FakeDestinationStore();
    await dest.upsertActive({
      accountId: DEST_ACCOUNT_ID,
      connectedByUserId: DEST_USER_ID,
      provider: "gmail",
      providerAccountId: row.provider_account_id,
      displayName: null,
      tokens: {
        accessTokenEncrypted: "ct-before",
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: [],
      },
      accountMetadata: {},
    });
    dest.mutationCalls.length = 0;
    const { deps } = makeDeps({ source, dest, probes: { gmail: okProbe(row.provider_account_id) } });
    const config = makeConfig({ conflictStrategy: "skip" });
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);
    expect(report.items[0]).toMatchObject({ status: "skipped", reason: "skipped_by_strategy" });
    expect(dest.mutationCalls).toEqual([]);
    expect(dest.rows[0]!.accessTokenEncrypted).toBe("ct-before");
  });

  it("fail-fast: after one failure the remaining items are skipped, not attempted", async () => {
    const rowBad = makeSourceRow({ provider_account_id: "first@gmail.com", display_name: "first@gmail.com" });
    const rowNext = makeSourceRow({ provider_account_id: "second@gmail.com", display_name: "second@gmail.com" });
    const source = new FakeSourceReader(undefined, [rowBad, rowNext]);
    const { deps, dest } = makeDeps({
      source,
      probes: { gmail: okProbe("mismatched@gmail.com") }, // fails both, first aborts
    });
    const config = makeConfig();
    const fp = await planFingerprint(deps, config);
    const { report } = await runApply(deps, config, "op", fp);
    expect(report.items[0]!.status).toBe("verification_failed");
    expect(report.items[1]).toMatchObject({
      status: "skipped",
      reason: "aborted_after_earlier_failure",
    });
    expect(dest.rows).toHaveLength(0);
  });
});
