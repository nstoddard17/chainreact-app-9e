/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — environment & identity preflight
 * refusal matrix (Phase 4). Every unsafe configuration must fail closed with
 * the right typed code BEFORE any client or credential exists.
 */
import {
  runEnvPreflight,
  runDataPreflight,
  decodeJwtRefClaim,
} from "@/scripts/integrations-transplant/preflight";
import { TransplantRefusalError } from "@/scripts/integrations-transplant/types";
import {
  DEV_REF,
  PROD_REF,
  DEST_ACCOUNT_ID,
  DEST_USER_ID,
  FakeDestinationStore,
  FakeSourceReader,
  makeConfig,
  makeEnv,
  makeGuardDeps,
} from "./helpers";

function expectRefusal(fn: () => unknown, code: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(TransplantRefusalError);
  expect((caught as TransplantRefusalError).code).toBe(code);
}

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

describe("runEnvPreflight — fail-closed matrix", () => {
  it("passes with a fully correct environment", () => {
    const result = runEnvPreflight(makeGuardDeps(), makeConfig(), makeEnv());
    expect(result.devRef).toBe(DEV_REF);
    expect(result.sourceRef).toBe(PROD_REF);
    expect(result.sourceEncryptionKey.equals(result.destEncryptionKey)).toBe(false);
  });

  it("refuses when source and destination project refs are equal", () => {
    // Point the source URL at the dev project and align the config so the
    // equality check (not the approved-production check) is what fires.
    const env = makeEnv({
      TRANSPLANT_SOURCE_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
    });
    expectRefusal(
      () => runEnvPreflight(makeGuardDeps(), makeConfig({ sourceProjectRef: DEV_REF }), env),
      "source_and_destination_refs_equal",
    );
  });

  it("refuses when the canonical guard denies the destination (production ref)", () => {
    const env = makeEnv({ SUPABASE_DEV_PROJECT_REF: PROD_REF });
    expectRefusal(
      () => runEnvPreflight(makeGuardDeps(), makeConfig({ destProjectRef: PROD_REF }), env),
      "destination_target_guard_failed",
    );
  });

  it("refuses a production destination EVEN IF the injected guard were permissive (belt-and-braces)", () => {
    const permissive = makeGuardDeps({
      resolveDbTarget: () => ({ ok: true, target: "development", ref: PROD_REF, reason: "ok" }),
    });
    expectRefusal(
      () =>
        runEnvPreflight(
          permissive,
          makeConfig({ destProjectRef: PROD_REF }),
          makeEnv({ SUPABASE_DEV_PROJECT_REF: PROD_REF }),
        ),
      "destination_resolves_to_production",
    );
  });

  it("refuses when the resolved dev ref disagrees with config.destProjectRef", () => {
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig({ destProjectRef: "otherdevrefotherdev1" }),
          makeEnv(),
        ),
      "destination_target_guard_failed",
    );
  });

  it("refuses when the source is not the explicitly approved production project", () => {
    const strangerRef = "strangerrefstranger1";
    const env = makeEnv({
      TRANSPLANT_SOURCE_SUPABASE_URL: `https://${strangerRef}.supabase.co`,
    });
    expectRefusal(
      () => runEnvPreflight(makeGuardDeps(), makeConfig({ sourceProjectRef: strangerRef }), env),
      "source_ref_not_approved_production",
    );
  });

  it("refuses when config.sourceProjectRef disagrees with the source URL", () => {
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig({ sourceProjectRef: "someotherrefsomeoth1" }),
          makeEnv(),
        ),
      "source_ref_not_approved_production",
    );
  });

  it("refuses without the source encryption key", () => {
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY: undefined }),
        ),
      "source_encryption_key_missing",
    );
  });

  it("refuses without the destination encryption key", () => {
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY: undefined }),
        ),
      "destination_encryption_key_missing",
    );
  });

  it("refuses a malformed (non-32-byte) encryption key without echoing it", () => {
    const bad = Buffer.from("short").toString("base64");
    let caught: TransplantRefusalError | null = null;
    try {
      runEnvPreflight(
        makeGuardDeps(),
        makeConfig(),
        makeEnv({ TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY: bad }),
      );
    } catch (err) {
      caught = err as TransplantRefusalError;
    }
    expect(caught?.code).toBe("source_encryption_key_missing");
    expect(caught?.message).not.toContain(bad);
  });

  it("refuses when source and destination encryption keys are identical", () => {
    const same = makeEnv().TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY;
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY: same }),
        ),
      "encryption_keys_identical",
    );
  });

  it("refuses missing source URL / missing service keys", () => {
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ TRANSPLANT_SOURCE_SUPABASE_URL: undefined }),
        ),
      "source_url_unparseable",
    );
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ TRANSPLANT_SOURCE_SERVICE_ROLE_KEY: undefined }),
        ),
      "source_key_probe_failed",
    );
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ SUPABASE_DEV_SERVICE_ROLE_KEY: undefined }),
        ),
      "destination_key_probe_failed",
    );
  });

  it("refuses a JWT-shaped service key whose ref claim names a different project", () => {
    const wrongRefJwt = [
      Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
      Buffer.from(JSON.stringify({ ref: "someotherrefsomeoth1", role: "service_role" })).toString(
        "base64url",
      ),
      "sig",
    ].join(".");
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ TRANSPLANT_SOURCE_SERVICE_ROLE_KEY: wrongRefJwt }),
        ),
      "source_key_probe_failed",
    );
    expectRefusal(
      () =>
        runEnvPreflight(
          makeGuardDeps(),
          makeConfig(),
          makeEnv({ SUPABASE_DEV_SERVICE_ROLE_KEY: wrongRefJwt }),
        ),
      "destination_key_probe_failed",
    );
  });
});

describe("decodeJwtRefClaim", () => {
  it("extracts ref from a JWT-shaped key and returns null otherwise", () => {
    const jwt = [
      Buffer.from("{}").toString("base64url"),
      Buffer.from(JSON.stringify({ ref: "abcabcabcabcabcabca1" })).toString("base64url"),
      "sig",
    ].join(".");
    expect(decodeJwtRefClaim(jwt)).toBe("abcabcabcabcabcabca1");
    expect(decodeJwtRefClaim("sb_secret_notajwt")).toBeNull();
  });
});

describe("runDataPreflight — ownership & membership", () => {
  it("passes for an existing active account with an owner destination user", async () => {
    await expect(
      runDataPreflight(
        { source: new FakeSourceReader(), dest: new FakeDestinationStore() },
        makeConfig(),
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses when the source account does not exist", async () => {
    const source = new FakeSourceReader([]);
    await expectRefusalAsync(
      () => runDataPreflight({ source, dest: new FakeDestinationStore() }, makeConfig()),
      "source_account_not_found",
    );
  });

  it("refuses when the destination account does not exist", async () => {
    const dest = new FakeDestinationStore();
    dest.accounts = [];
    await expectRefusalAsync(
      () => runDataPreflight({ source: new FakeSourceReader(), dest }, makeConfig()),
      "destination_account_not_found",
    );
  });

  it("refuses a deletion-frozen destination account", async () => {
    const dest = new FakeDestinationStore();
    dest.accounts = [{ id: DEST_ACCOUNT_ID, deletionStatus: "pending_deletion" }];
    await expectRefusalAsync(
      () => runDataPreflight({ source: new FakeSourceReader(), dest }, makeConfig()),
      "destination_account_not_active",
    );
  });

  it("refuses when the destination user is not a member", async () => {
    const dest = new FakeDestinationStore();
    dest.memberships.clear();
    await expectRefusalAsync(
      () => runDataPreflight({ source: new FakeSourceReader(), dest }, makeConfig()),
      "destination_user_not_member",
    );
  });

  it("refuses a plain member (owner/admin required)", async () => {
    const dest = new FakeDestinationStore();
    dest.memberships.set(`${DEST_ACCOUNT_ID}:${DEST_USER_ID}`, "member");
    await expectRefusalAsync(
      () => runDataPreflight({ source: new FakeSourceReader(), dest }, makeConfig()),
      "destination_user_role_insufficient",
    );
  });
});
