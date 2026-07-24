/**
 * @jest-environment node
 *
 * FLEETIO-1 / migration 20260727000000 — gated DB proof of the
 * `integrations.extra_credentials_encrypted` column.
 *
 * `integrations-rls.test.ts` proves the TABLE's access posture. This suite
 * proves the column that migration 20260727000000 actually added, which is the
 * storage for a `credential_paste` provider's non-primary secrets (Fleetio's
 * Account-Token). Specifically:
 *
 *   - the column exists and accepts a value through the real repository
 *     (`upsertActive`), not just through raw SQL,
 *   - what lands at rest is CIPHERTEXT — neither secret appears in the stored
 *     row in cleartext,
 *   - the real `decryptFleetioCredentials` decoder round-trips BOTH credentials
 *     back out of a real row,
 *   - the ciphertext is unreachable from the Data API by anon AND by an
 *     authenticated member (42501) — so an encrypted secret can never transit
 *     PostgREST,
 *   - a re-connect REPLACES the blob (no stale credential survives),
 *   - a single-credential provider stores NULL (existing providers untouched),
 *   - account isolation: account B's execution lookup never returns A's row.
 *
 * NO real credentials are used — fixtures are obvious fakes assembled at
 * runtime, and only their ABSENCE from the stored ciphertext is asserted.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + integrations.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY +
 * TOKEN_ENCRYPTION_KEY, against a database where 20260727000000 is applied.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptToken } from "@/core/encryption/tokens";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import { upsertActive, getActiveForExecution } from "@/repositories/integrations";
import {
  decryptFleetioCredentials,
  FleetioCredentialShapeError,
} from "@/integrations/fleetio/credentials";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnvLocal();

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_ENC_KEY = !!process.env.TOKEN_ENCRYPTION_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY && HAS_ENC_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP integrations extra-credentials — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY + TOKEN_ENCRYPTION_KEY (migration 20260727000000 applied).",
  );
}

// Obvious fakes, assembled at runtime so no credential-shaped literal sits in
// source. Only their ABSENCE from stored ciphertext is ever asserted.
const FAKE_API_KEY = ["FLEETIO", "FAKE", "apikey", "DoNotStorePlaintext"].join("-");
const FAKE_ACCOUNT_TOKEN = ["FLEETIO", "FAKE", "accounttoken", "DoNotStorePlaintext"].join("-");
const ROTATED_ACCOUNT_TOKEN = ["FLEETIO", "FAKE", "rotated", "DoNotStorePlaintext"].join("-");

describeDb("integrations.extra_credentials_encrypted — storage + no-leak (live DB)", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  type Session = { userId: string; email: string; personalAccountId: string };
  let A: Session;
  let B: Session;

  async function createTestUser(label: string): Promise<Session> {
    const { userId, email } = await createTrackedUser(admin, fixtures, `extracred-${label}`);
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`personal account: ${error?.message ?? "none"}`);
    return { userId, email, personalAccountId: data.id };
  }

  /** Connect Fleetio the way the credential-paste dispatcher does. */
  async function connectFleetio(session: Session, accountToken: string) {
    return upsertActive({
      accountId: session.personalAccountId,
      connectedByUserId: session.userId,
      provider: "fleetio",
      providerAccountId: "7211",
      displayName: "Fleetio test",
      tokens: {
        accessTokenEncrypted: encryptToken(FAKE_API_KEY),
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken })),
        scopes: [],
      },
      accountMetadata: {},
    });
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false } });

    // MIGRATION PREFLIGHT — refuse to create fixtures if the column is absent.
    const probe = await admin.from("integrations").select("extra_credentials_encrypted").limit(1);
    if (probe.error) {
      throw new Error(
        "integrations.extra_credentials_encrypted is not present — migration 20260727000000 " +
          `has not been applied to the target database. Refusing to create fixtures. (${probe.error.code ?? "?"} ${probe.error.message})`,
      );
    }

    A = await createTestUser("a");
    B = await createTestUser("b");
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  afterEach(async () => {
    await admin
      .from("integrations")
      .delete()
      .in("account_id", [A.personalAccountId, B.personalAccountId]);
  });

  it("stores the Account-Token as CIPHERTEXT — neither secret is at rest in cleartext", async () => {
    const row = await connectFleetio(A, FAKE_ACCOUNT_TOKEN);

    const { data, error } = await admin
      .from("integrations")
      .select("access_token_encrypted, extra_credentials_encrypted")
      .eq("id", row.id)
      .single<{ access_token_encrypted: string; extra_credentials_encrypted: string | null }>();
    expect(error).toBeNull();
    expect(data!.extra_credentials_encrypted).not.toBeNull();

    const atRest = `${data!.access_token_encrypted}|${data!.extra_credentials_encrypted}`;
    expect(atRest).not.toContain(FAKE_API_KEY);
    expect(atRest).not.toContain(FAKE_ACCOUNT_TOKEN);
    // Not even the JSON key/plaintext structure survives in the clear.
    expect(atRest).not.toContain("accountToken");
  });

  it("the real decoder round-trips BOTH credentials out of a real row", async () => {
    await connectFleetio(A, FAKE_ACCOUNT_TOKEN);

    const record = await getActiveForExecution(A.personalAccountId, "fleetio", null);
    expect(record).not.toBeNull();

    const creds = decryptFleetioCredentials(record!);
    expect(creds.apiKey).toBe(FAKE_API_KEY);
    expect(creds.accountToken).toBe(FAKE_ACCOUNT_TOKEN);
  });

  it("a re-connect REPLACES the blob — no stale Account-Token survives", async () => {
    await connectFleetio(A, FAKE_ACCOUNT_TOKEN);
    await connectFleetio(A, ROTATED_ACCOUNT_TOKEN);

    const record = await getActiveForExecution(A.personalAccountId, "fleetio", null);
    expect(decryptFleetioCredentials(record!).accountToken).toBe(ROTATED_ACCOUNT_TOKEN);

    // And the superseded value is not lingering anywhere on the active row.
    const { data } = await admin
      .from("integrations")
      .select("extra_credentials_encrypted")
      .eq("id", record!.id)
      .single<{ extra_credentials_encrypted: string }>();
    expect(data!.extra_credentials_encrypted).not.toContain(FAKE_ACCOUNT_TOKEN);
  });

  it("a single-credential provider stores NULL — existing providers are untouched", async () => {
    await upsertActive({
      accountId: A.personalAccountId,
      connectedByUserId: A.userId,
      provider: "slack",
      providerAccountId: "T-TEST",
      displayName: "Slack test",
      tokens: {
        accessTokenEncrypted: encryptToken(FAKE_API_KEY),
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: ["chat:write"],
      },
      accountMetadata: {},
    });

    const record = await getActiveForExecution(A.personalAccountId, "slack", null);
    expect(record!.extraCredentialsEncrypted).toBeNull();
    // The Fleetio decoder refuses such a row rather than half-decoding it.
    expect(() => decryptFleetioCredentials(record!)).toThrow(FleetioCredentialShapeError);
  });

  it("the ciphertext is unreachable from the Data API — anon AND authenticated member denied", async () => {
    await connectFleetio(A, FAKE_ACCOUNT_TOKEN);

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const anonProbe = await anon.from("integrations").select("extra_credentials_encrypted");
    if (anonProbe.error) expect(anonProbe.error.code).toBe("42501");
    expect(anonProbe.data ?? []).toHaveLength(0);

    // The OWNING member — the strongest case: even they cannot read the column
    // directly; every legitimate read goes through the service-role repository.
    const asA = await signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email: A.email });
    const memberProbe = await asA.from("integrations").select("extra_credentials_encrypted");
    expect(memberProbe.error?.code).toBe("42501");
    expect(memberProbe.data ?? []).toHaveLength(0);
  });

  it("account isolation — account B's execution lookup never returns A's Fleetio row", async () => {
    await connectFleetio(A, FAKE_ACCOUNT_TOKEN);

    expect(await getActiveForExecution(B.personalAccountId, "fleetio", null)).toBeNull();
    expect(await getActiveForExecution(A.personalAccountId, "fleetio", null)).not.toBeNull();
  });
});
