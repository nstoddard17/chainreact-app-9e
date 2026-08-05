/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — dry-run behavior (Phase 11):
 * complete planning + typed refusals, ZERO writes, ZERO decryption, redacted
 * output only.
 */
import { runDryRun, buildPlan } from "@/scripts/integrations-transplant/orchestrator";
import { TransplantRefusalError } from "@/scripts/integrations-transplant/types";
import {
  FakeSourceReader,
  FakeDestinationStore,
  makeConfig,
  makeDeps,
  makeSourceRow,
  DEST_ACCOUNT_ID,
  DEST_USER_ID,
  okProbe,
} from "./helpers";

async function expectRefusalAsync(fn: () => Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(TransplantRefusalError);
  expect((caught as TransplantRefusalError).code).toBe(code);
}

describe("dry-run", () => {
  it("plans an insert for a clean gmail row and performs no writes and no decryption", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps, dest, cryptoCounters } = makeDeps({
      source,
      probes: { gmail: okProbe(row.provider_account_id) },
    });

    const { report, serialized } = await runDryRun(deps, makeConfig(), "op-test");
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({
      provider: "gmail",
      intendedAction: "insert",
      status: "planned",
      conflict: "none",
    });
    expect(dest.mutationCalls).toEqual([]);
    expect(source.calls.every((c) => !c.match(/insert|update|delete/))).toBe(true);
    expect(cryptoCounters.decryptSourceCalls).toBe(0);
    expect(cryptoCounters.encryptDestCalls).toBe(0);

    // Redaction: neither the raw label/email nor any ciphertext appears.
    expect(serialized).not.toContain(row.provider_account_id);
    expect(serialized).not.toContain(row.access_token_encrypted);
    expect(serialized).not.toContain(row.refresh_token_encrypted as string);
  });

  it("hard-refuses a source row owned by a different account (ids selection)", async () => {
    const foreign = makeSourceRow({ account_id: "99999999-9999-4999-8999-999999999999" });
    const source = new FakeSourceReader(undefined, [foreign]);
    const { deps } = makeDeps({ source });
    await expectRefusalAsync(
      () =>
        buildPlan(deps, makeConfig({ sourceIntegrationIds: [foreign.id] })),
      "source_integration_not_owned_by_source_account",
    );
  });

  it("hard-refuses a disconnected selected row and a missing selected row", async () => {
    const dead = makeSourceRow({ disconnected_at: "2026-01-03T00:00:00.000Z" });
    const source = new FakeSourceReader(undefined, [dead]);
    const { deps } = makeDeps({ source });
    await expectRefusalAsync(
      () => buildPlan(deps, makeConfig({ sourceIntegrationIds: [dead.id] })),
      "source_integration_not_active",
    );
    await expectRefusalAsync(
      () =>
        buildPlan(
          deps,
          makeConfig({ sourceIntegrationIds: ["55555555-5555-4555-8555-555555555555"] }),
        ),
      "source_integration_not_found",
    );
  });

  it("hard-refuses a selected row whose provider is not allowlisted", async () => {
    const slackRow = makeSourceRow({ provider: "slack", provider_account_id: "T0123456789" });
    const source = new FakeSourceReader(undefined, [slackRow]);
    const { deps } = makeDeps({ source });
    await expectRefusalAsync(
      () =>
        buildPlan(
          deps,
          makeConfig({ providerAllowlist: ["gmail"], sourceIntegrationIds: [slackRow.id] }),
        ),
      "provider_not_allowlisted",
    );
  });

  it("hard-refuses an unregistered provider", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({
      source,
      providerInfo: () => ({ registered: false, enabled: false, requiredScopes: [] }),
    });
    await expectRefusalAsync(() => buildPlan(deps, makeConfig()), "provider_not_registered");
  });

  it("marks Category D (adp) unsupported", async () => {
    const row = makeSourceRow({ provider: "adp", provider_account_id: "org-oid-1" });
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source });
    const plan = await buildPlan(deps, makeConfig({ providerAllowlist: ["adp"] }));
    expect(plan.items[0]).toMatchObject({
      intendedAction: "refuse",
      status: "unsupported",
      reason: "provider_not_transplantable",
    });
  });

  it("refuses an unacknowledged rotating-refresh provider, allows it once acknowledged", async () => {
    const row = makeSourceRow({
      provider: "calendly",
      provider_account_id: "marcus@cal.test",
      scopes: [],
    });
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({
      source,
      probes: { calendly: okProbe(row.provider_account_id) },
    });
    const refused = await buildPlan(deps, makeConfig({ providerAllowlist: ["calendly"] }));
    expect(refused.items[0]).toMatchObject({
      intendedAction: "refuse",
      status: "refused",
      reason: "rotating_refresh_shared_with_production",
    });

    const acknowledged = await buildPlan(
      deps,
      makeConfig({
        providerAllowlist: ["calendly"],
        acknowledgeRotationRiskProviders: ["calendly"],
      }),
    );
    expect(acknowledged.items[0]).toMatchObject({ intendedAction: "insert", status: "planned" });
  });

  it("flags missing required scopes as reconnect_required (no write planned)", async () => {
    const row = makeSourceRow({ scopes: ["https://www.googleapis.com/auth/gmail.readonly"] });
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source, probes: { gmail: okProbe(row.provider_account_id) } });
    const plan = await buildPlan(deps, makeConfig());
    expect(plan.items[0]).toMatchObject({
      intendedAction: "refuse",
      status: "reconnect_required",
      reason: "missing_required_scopes",
    });
  });

  it("flags an expired token with no refresh token as reconnect_required", async () => {
    const row = makeSourceRow({
      access_token_expires_at: new Date(Date.now() - 3600_000).toISOString(),
      refresh_token_encrypted: null,
    });
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source, probes: { gmail: okProbe(row.provider_account_id) } });
    const plan = await buildPlan(deps, makeConfig());
    expect(plan.items[0]).toMatchObject({
      status: "reconnect_required",
      reason: "access_token_expired_no_refresh",
    });
  });

  it("strict mode refuses a provider with no probe; lenient plans it", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source }); // no probes injected
    const strict = await buildPlan(deps, makeConfig());
    expect(strict.items[0]).toMatchObject({
      status: "verification_unsupported",
      reason: "no_probe_for_provider",
    });
    const lenient = await buildPlan(deps, makeConfig({ verificationMode: "lenient" }));
    expect(lenient.items[0]).toMatchObject({ intendedAction: "insert", status: "planned" });
  });

  it("default 'fail' strategy reports a same-tuple destination conflict", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const dest = new FakeDestinationStore();
    await dest.upsertActive({
      accountId: DEST_ACCOUNT_ID,
      connectedByUserId: DEST_USER_ID,
      provider: "gmail",
      providerAccountId: row.provider_account_id,
      displayName: "existing",
      tokens: {
        accessTokenEncrypted: "ct-existing",
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: [],
      },
      accountMetadata: {},
    });
    dest.mutationCalls.length = 0;

    const { deps } = makeDeps({ source, dest, probes: { gmail: okProbe(row.provider_account_id) } });
    const failPlan = await buildPlan(deps, makeConfig());
    expect(failPlan.items[0]).toMatchObject({ status: "conflict", conflict: "same_connection_exists" });

    const skipPlan = await buildPlan(deps, makeConfig({ conflictStrategy: "skip" }));
    expect(skipPlan.items[0]).toMatchObject({ intendedAction: "skip", status: "skipped" });

    const replacePlan = await buildPlan(
      deps,
      makeConfig({ conflictStrategy: "replace-after-verification" }),
    );
    expect(replacePlan.items[0]).toMatchObject({ intendedAction: "update-existing", status: "planned" });
    expect(dest.mutationCalls).toEqual([]); // planning never wrote
  });

  it("fails closed on multi-account-risk ambiguity (eden occupied by another row)", async () => {
    const row = makeSourceRow({
      provider: "eden",
      provider_account_id: "eden",
      refresh_token_encrypted: null,
      scopes: [],
      access_token_expires_at: null,
    });
    const source = new FakeSourceReader(undefined, [row]);
    const dest = new FakeDestinationStore();
    await dest.upsertActive({
      accountId: DEST_ACCOUNT_ID,
      connectedByUserId: DEST_USER_ID,
      provider: "eden",
      providerAccountId: "eden-other",
      displayName: null,
      tokens: {
        accessTokenEncrypted: "ct",
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: [],
      },
      accountMetadata: {},
    });
    const { deps } = makeDeps({ source, dest });
    const plan = await buildPlan(
      deps,
      makeConfig({ providerAllowlist: ["eden"], verificationMode: "lenient" }),
    );
    expect(plan.items[0]).toMatchObject({
      status: "conflict",
      conflict: "single_account_provider_occupied",
    });
  });

  it("refuses when the selection matches nothing", async () => {
    const { deps } = makeDeps({ source: new FakeSourceReader(undefined, []) });
    await expectRefusalAsync(() => buildPlan(deps, makeConfig()), "no_integrations_selected");
  });

  it("fingerprint is deterministic and changes when the plan changes", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source, probes: { gmail: okProbe(row.provider_account_id) } });
    const a = await buildPlan(deps, makeConfig());
    const b = await buildPlan(deps, makeConfig());
    expect(a.fingerprint).toBe(b.fingerprint);
    const c = await buildPlan(deps, makeConfig({ conflictStrategy: "skip" }));
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });
});
