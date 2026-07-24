/**
 * @jest-environment node
 *
 * Gated DB proof of the machine-credential store security posture against a LIVE
 * database. `account_machine_credentials` + `machine_credential_audit` are
 * SERVICE-ROLE-ONLY at the Data API (no `authenticated` GRANT — the columns hold
 * AES-256-GCM ciphertext of the client secret / private key / certificate). This
 * proves end to end:
 *   - a member's DIRECT authenticated SELECT on either table is denied (42501),
 *   - anon sees nothing,
 *   - the service-role repository path (save/get/rotate/disconnect) works,
 *   - cross-account reads are impossible (account B never sees account A's row),
 *   - rotation clears the cached token + stamps rotated_at,
 *   - stored secret columns are CIPHERTEXT (never the plaintext secret),
 *   - audit rows + the safe DTO carry NO secret material.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + machine credentials, then
 * deletes them (cascade). NO secret is printed — only behavior is asserted.
 *
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration
 * 20260722000000 applied). Without those it SKIPS cleanly — it never runs against
 * a database that has not opted in.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  saveMachineCredential,
  loadSecrets,
  toSafeDto,
  disconnectMachineCredential,
} from "@/services/machineCredentials/store";
import {
  getActiveMachineCredential,
  updateCachedToken,
  listMachineCredentialAudit,
} from "@/repositories/machineCredentials";
import {
  TEST_CLIENT_CERT_PEM,
  TEST_CLIENT_KEY_PEM,
} from "@/tests/fixtures/mtls/testCerts";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import { requireTables } from "@/tests/helpers/dbPreflight";

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
    "SKIP machine-credentials RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY + TOKEN_ENCRYPTION_KEY (migration 20260722000000 applied).",
  );
}

// Deterministic clock inside the fixture cert's validity window (2026→2126).
const NOW = new Date("2030-01-01T00:00:00Z");
const secrets = {
  clientId: "adp-cid",
  clientSecret: "adp-super-secret-value",
  certPem: TEST_CLIENT_CERT_PEM,
  keyPem: TEST_CLIENT_KEY_PEM,
};

describeDb("machine-credential store — RLS + isolation + rotation (live DB)", () => {
  let admin: SupabaseClient;
  // Shared teardown (tests/helpers/dbFixtureCleanup.ts) tracks every synthetic
  // user + account so afterAll tears them down in RESTRICT-safe order.
  const fixtures = createFixtureTracker();

  type Session = { userId: string; email: string; password: string; personalAccountId: string };

  async function createTestUser(label: string): Promise<Session> {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, `mc-rls-${label}`);
    const { data: acc, error: accErr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (accErr || !acc) throw new Error(`personal account: ${accErr?.message ?? "none"}`);
    return { userId, email, password, personalAccountId: acc.id };
  }

  let A: Session;
  let B: Session;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["account_machine_credentials", "machine_credential_audit"]);
    A = await createTestUser("a");
    B = await createTestUser("b");
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("service-role save stores CIPHERTEXT and returns a secret-free DTO", async () => {
    const dto = await saveMachineCredential({
      accountId: A.personalAccountId,
      actorUserId: A.userId,
      provider: "adp",
      secrets,
      label: "ADP test",
      metadata: { environment: "iat", apiBaseUrl: "https://iat-api.adp.com" },
      now: NOW,
    });
    expect(JSON.stringify(dto)).not.toContain("adp-super-secret-value");

    // The stored row's secret columns are ciphertext, not the plaintext.
    const { data: row } = await admin
      .from("account_machine_credentials")
      .select("client_secret_encrypted, key_pem_encrypted, cert_fingerprint256")
      .eq("account_id", A.personalAccountId)
      .eq("provider", "adp")
      .single<{ client_secret_encrypted: string; key_pem_encrypted: string; cert_fingerprint256: string }>();
    expect(row!.client_secret_encrypted).not.toContain("adp-super-secret-value");
    expect(row!.key_pem_encrypted).not.toContain("PRIVATE KEY");
    expect(row!.cert_fingerprint256).toMatch(/^[0-9A-F:]+$/);
  });

  it("a member's DIRECT authenticated SELECT is denied (42501) on both tables", async () => {
    const asUser = await signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email: A.email });

    const cred = await asUser.from("account_machine_credentials").select("*");
    expect(cred.error?.code).toBe("42501");
    expect(cred.data ?? []).toHaveLength(0);

    const audit = await asUser.from("machine_credential_audit").select("*");
    expect(audit.error?.code).toBe("42501");
  });

  it("anon sees nothing on both tables", async () => {
    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const cred = await anon.from("account_machine_credentials").select("*");
    expect(cred.data ?? []).toHaveLength(0);
    const audit = await anon.from("machine_credential_audit").select("*");
    expect(audit.data ?? []).toHaveLength(0);
  });

  it("cross-account isolation — account B never resolves account A's credential", async () => {
    // Service-role repo path is exact-account-scoped.
    expect(await getActiveMachineCredential(B.personalAccountId, "adp")).toBeNull();
    const a = await getActiveMachineCredential(A.personalAccountId, "adp");
    expect(a).not.toBeNull();

    // Even authenticated as B, the Data API denies the table entirely (42501).
    const asB = await signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email: B.email });
    const probe = await asB.from("account_machine_credentials").select("*");
    expect(probe.error?.code).toBe("42501");
  });

  it("rotation clears the cached token and stamps rotated_at; decrypt still round-trips", async () => {
    const a = (await getActiveMachineCredential(A.personalAccountId, "adp"))!;
    // Seed a cached token, then rotate.
    await updateCachedToken({
      id: a.id,
      cachedAccessTokenEncrypted: "enc-token",
      cachedTokenExpiresAt: NOW.toISOString(),
    });
    await saveMachineCredential({
      accountId: A.personalAccountId,
      actorUserId: A.userId,
      provider: "adp",
      secrets: { ...secrets, clientSecret: "rotated-secret" },
      metadata: { environment: "iat" },
      now: NOW,
    });
    const rotated = (await getActiveMachineCredential(A.personalAccountId, "adp"))!;
    expect(rotated.rotatedAt).not.toBeNull();
    expect(rotated.cachedAccessTokenEncrypted).toBeNull();

    // The new secret decrypts back to plaintext via the store (server-only path).
    const loaded = await loadSecrets(A.personalAccountId, "adp");
    expect(loaded?.secrets.clientSecret).toBe("rotated-secret");
  });

  it("audit rows carry NO secret material", async () => {
    const rows = await listMachineCredentialAudit(A.personalAccountId, { provider: "adp" });
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("rotated-secret");
    expect(JSON.stringify(rows)).not.toContain("adp-super-secret-value");
    // The events we expect from create + rotate.
    const events = rows.map((r) => r.event);
    expect(events).toEqual(expect.arrayContaining(["created", "rotated"]));
  });

  it("disconnect soft-removes the row and clears the cached token", async () => {
    const a = (await getActiveMachineCredential(A.personalAccountId, "adp"))!;
    const res = await disconnectMachineCredential({
      accountId: A.personalAccountId,
      id: a.id,
      provider: "adp",
      actorUserId: A.userId,
    });
    expect(res.disconnected).toBe(true);
    expect(await getActiveMachineCredential(A.personalAccountId, "adp")).toBeNull();
    // toSafeDto is exercised on the last live record (no secret in projection).
    expect(JSON.stringify(toSafeDto(a, NOW))).not.toContain("Encrypted");
  });
});
