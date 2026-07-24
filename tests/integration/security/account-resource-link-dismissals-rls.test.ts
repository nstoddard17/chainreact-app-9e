/**
 * @jest-environment node
 *
 * 5.TRUCK-BRIDGE-1 CS-5 — gated DB proof of the dismissal table. These are the
 * assertions that CANNOT be made against SQL text:
 *
 *   - the anon/authenticated REVOKE actually took (a member's DIRECT Data API
 *     SELECT is denied 42501 — an empty result would mean the grant survived and
 *     only RLS was filtering),
 *   - anon sees nothing,
 *   - ON DELETE CASCADE: deleting the account removes its dismissals,
 *   - ON DELETE SET NULL: deleting the user nulls provenance and KEEPS the row,
 *   - every CHECK rejects its bad input (unknown kind/tier, blank ids, blank or
 *     over-long fingerprint, self-referential pair),
 *   - the PARTIAL unique index: one live dismissal per pair, and archiving frees
 *     the pair for a new one,
 *   - two accounts may hold IDENTICAL pairs without colliding,
 *   - account B can neither read nor archive account A's dismissal.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + dismissals.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY, against a database
 * where migration 20260731000000 has been applied.
 *
 * ── MIGRATION PREFLIGHT (do not remove) ─────────────────────────────────────
 * `ALLOW_DB_INTEGRATION_TESTS` is a standing developer setting, so this suite
 * would otherwise happily run against a database lacking the table — where every
 * table test fails for the wrong reason and the anon test passes VACUOUSLY
 * ("anon sees nothing" is trivially true when the table does not exist), after
 * throwaway users have already been created. `beforeAll` probes for the table
 * BEFORE creating any fixture. A vacuous green is worse than a red.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import {
  listActiveDismissals,
  createDismissal,
  archiveDismissalForPair,
} from "@/repositories/resourceLinks/accountResourceLinkDismissals";

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
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP account_resource_link_dismissals RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration 20260731000000 applied).",
  );
}

const DISMISSED_AT = "2026-07-24T12:00:00Z";

describeDb("account_resource_link_dismissals — RLS, constraints, uniqueness (live DB)", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  type Session = { userId: string; email: string; personalAccountId: string };

  async function createTestUser(label: string): Promise<Session> {
    const { userId, email } = await createTrackedUser(admin, fixtures, `arld-rls-${label}`);
    const { data: acc, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !acc) throw new Error(`personal account: ${error?.message ?? "none"}`);
    return { userId, email, personalAccountId: acc.id };
  }

  let A: Session;
  let B: Session;

  const signInAsUser = (email: string): Promise<SupabaseClient> =>
    signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });

  async function deleteAccountCascade(accountId: string): Promise<void> {
    for (const table of [
      "workflow_runs",
      "workflows",
      "workflow_folders",
      "integrations",
      "account_billing",
    ]) {
      await admin.from(table).delete().eq("account_id", accountId);
    }
    const { error } = await admin.from("accounts").delete().eq("id", accountId);
    if (error) throw new Error(`deleteAccountCascade(${accountId}): ${error.message}`);
  }

  const dismissal = (accountId: string, over: Record<string, unknown> = {}) => ({
    accountId,
    resourceKind: "vehicle" as const,
    sourceProvider: "motive",
    sourceExternalId: "motive-veh-88231",
    targetProvider: "fleetio",
    targetExternalId: "42",
    matchTier: "name" as const,
    evidenceFingerprint: 'name|Unit 104 appears in "Truck 104"',
    dismissedAt: DISMISSED_AT,
    ...over,
  });

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false } });

    // MIGRATION PREFLIGHT — before any fixture is created (see header).
    const probe = await admin.from("account_resource_link_dismissals").select("id").limit(1);
    if (probe.error) {
      throw new Error(
        "account_resource_link_dismissals is not present in the target database — migration " +
          "20260731000000 has not been applied there. Refusing to create fixtures. " +
          `(probe: ${probe.error.code ?? "?"} ${probe.error.message})`,
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
      .from("account_resource_link_dismissals")
      .delete()
      .in("account_id", [A.personalAccountId, B.personalAccountId]);
  });

  // ── Data API exposure ─────────────────────────────────────────────────────

  it("a member's DIRECT authenticated SELECT is denied (42501) — the REVOKE took", async () => {
    await createDismissal(dismissal(A.personalAccountId, { dismissedByUserId: A.userId }));

    const asUser = await signInAsUser(A.email);
    const probe = await asUser.from("account_resource_link_dismissals").select("*");

    // 42501 (not "0 rows") is load-bearing: an empty result would mean the
    // default-privileges grant survived and only RLS was filtering.
    expect(probe.error?.code).toBe("42501");
    expect(probe.data).toBeNull();
  });

  it("anon sees nothing", async () => {
    await createDismissal(dismissal(A.personalAccountId));
    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const probe = await anon.from("account_resource_link_dismissals").select("*");
    expect(probe.data ?? []).toHaveLength(0);
  });

  // ── Lifecycle FKs ─────────────────────────────────────────────────────────

  it("deleting the ACCOUNT cascades its dismissals away", async () => {
    const throwaway = await createTestUser("cascade");
    await createDismissal(dismissal(throwaway.personalAccountId));
    expect(await listActiveDismissals(throwaway.personalAccountId, "vehicle")).toHaveLength(1);

    await deleteAccountCascade(throwaway.personalAccountId);

    const { data } = await admin
      .from("account_resource_link_dismissals")
      .select("id")
      .eq("account_id", throwaway.personalAccountId);
    expect(data ?? []).toHaveLength(0);
  });

  it("deleting the USER nulls provenance but KEEPS the dismissal", async () => {
    const throwaway = await createTestUser("provenance");
    // The dismissal belongs to ACCOUNT A, authored by the throwaway user.
    await createDismissal(
      dismissal(A.personalAccountId, { dismissedByUserId: throwaway.userId }),
    );

    // The user still owns their auto-created personal account, which
    // accounts.owner_user_id ON DELETE RESTRICT would silently refuse — remove
    // it first, then assert the deletion actually succeeded.
    await deleteAccountCascade(throwaway.personalAccountId);
    const { error: delErr } = await admin.auth.admin.deleteUser(throwaway.userId);
    expect(delErr).toBeNull();

    const rows = await listActiveDismissals(A.personalAccountId, "vehicle");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dismissedByUserId).toBeNull();
  });

  // ── CHECK constraints ─────────────────────────────────────────────────────

  it("rejects an unknown resource kind and an unknown match tier", async () => {
    await expect(
      admin.from("account_resource_link_dismissals").insert({
        account_id: A.personalAccountId,
        resource_kind: "trailer",
        source_provider: "motive",
        source_external_id: "x",
        target_provider: "fleetio",
        target_external_id: "y",
        match_tier: "name",
        evidence_fingerprint: "name|x",
        dismissed_at: DISMISSED_AT,
      }),
    ).resolves.toMatchObject({ error: expect.objectContaining({ code: "23514" }) });

    await expect(
      admin.from("account_resource_link_dismissals").insert({
        account_id: A.personalAccountId,
        resource_kind: "vehicle",
        source_provider: "motive",
        source_external_id: "x",
        target_provider: "fleetio",
        target_external_id: "y",
        match_tier: "vibes",
        evidence_fingerprint: "vibes|x",
        dismissed_at: DISMISSED_AT,
      }),
    ).resolves.toMatchObject({ error: expect.objectContaining({ code: "23514" }) });
  });

  it("rejects a blank id, a blank fingerprint, and an over-long fingerprint", async () => {
    const base = {
      account_id: A.personalAccountId,
      resource_kind: "vehicle",
      source_provider: "motive",
      source_external_id: "motive-1",
      target_provider: "fleetio",
      target_external_id: "42",
      match_tier: "name",
      dismissed_at: DISMISSED_AT,
    };
    for (const bad of [
      { ...base, source_external_id: "   ", evidence_fingerprint: "name|x" },
      { ...base, evidence_fingerprint: "   " },
      { ...base, evidence_fingerprint: "n".repeat(513) },
    ]) {
      const { error } = await admin.from("account_resource_link_dismissals").insert(bad);
      expect(error?.code).toBe("23514");
    }
  });

  it("rejects a self-referential pair", async () => {
    const { error } = await admin.from("account_resource_link_dismissals").insert({
      account_id: A.personalAccountId,
      resource_kind: "vehicle",
      source_provider: "motive",
      source_external_id: "same",
      target_provider: "motive",
      target_external_id: "same",
      match_tier: "name",
      evidence_fingerprint: "name|x",
      dismissed_at: DISMISSED_AT,
    });
    expect(error?.code).toBe("23514");
  });

  // ── Partial uniqueness ────────────────────────────────────────────────────

  it("allows only ONE ACTIVE dismissal per pair", async () => {
    await createDismissal(dismissal(A.personalAccountId));
    await expect(
      createDismissal(dismissal(A.personalAccountId, { evidenceFingerprint: "vin|VIN 1FUJ… matches" })),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("ARCHIVING frees the pair for a new dismissal with different evidence", async () => {
    await createDismissal(dismissal(A.personalAccountId));
    const archived = await archiveDismissalForPair(
      A.personalAccountId,
      "vehicle",
      "motive",
      "motive-veh-88231",
      "fleetio",
      "42",
      "2026-07-25T09:00:00Z",
    );
    expect(archived).not.toBeNull();

    const replacement = await createDismissal(
      dismissal(A.personalAccountId, {
        matchTier: "vin",
        evidenceFingerprint: "vin|VIN 1FUJGLDR matches",
      }),
    );
    expect(replacement.matchTier).toBe("vin");

    const active = await listActiveDismissals(A.personalAccountId, "vehicle");
    expect(active).toHaveLength(1);
    expect(active[0]!.evidenceFingerprint).toBe("vin|VIN 1FUJGLDR matches");
  });

  it("archiving twice returns null the second time (no timestamp move)", async () => {
    await createDismissal(dismissal(A.personalAccountId));
    const first = await archiveDismissalForPair(
      A.personalAccountId, "vehicle", "motive", "motive-veh-88231", "fleetio", "42",
      "2026-07-25T09:00:00Z",
    );
    const second = await archiveDismissalForPair(
      A.personalAccountId, "vehicle", "motive", "motive-veh-88231", "fleetio", "42",
      "2026-08-01T00:00:00Z",
    );
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  // ── Cross-account isolation ───────────────────────────────────────────────

  it("two accounts may hold IDENTICAL pairs without colliding", async () => {
    await createDismissal(dismissal(A.personalAccountId));
    await expect(createDismissal(dismissal(B.personalAccountId))).resolves.toBeTruthy();

    expect(await listActiveDismissals(A.personalAccountId, "vehicle")).toHaveLength(1);
    expect(await listActiveDismissals(B.personalAccountId, "vehicle")).toHaveLength(1);
  });

  it("account B neither reads nor archives account A's dismissal", async () => {
    await createDismissal(dismissal(A.personalAccountId));

    expect(await listActiveDismissals(B.personalAccountId, "vehicle")).toHaveLength(0);
    expect(
      await archiveDismissalForPair(
        B.personalAccountId, "vehicle", "motive", "motive-veh-88231", "fleetio", "42",
        "2026-07-25T09:00:00Z",
      ),
    ).toBeNull();

    // A's row is untouched.
    const aRows = await listActiveDismissals(A.personalAccountId, "vehicle");
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!.archivedAt).toBeNull();
  });
});
