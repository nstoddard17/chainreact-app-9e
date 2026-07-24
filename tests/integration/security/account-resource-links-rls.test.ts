/**
 * @jest-environment node
 *
 * 5.TRUCK-BRIDGE-1 CS-1 — gated DB proof of the account_resource_links
 * foundation. These are the assertions that CANNOT be made against SQL text:
 *
 *   - the anon/authenticated REVOKE actually took (a member's direct Data API
 *     SELECT is denied 42501, so the membership policy is defense-in-depth
 *     behind a closed grant — not the only barrier),
 *   - anon sees nothing,
 *   - ON DELETE CASCADE: deleting the account removes its links,
 *   - ON DELETE SET NULL: deleting a user nulls provenance but KEEPS the link,
 *   - the CHECK constraints reject unknown resource_kind / match_basis, blank
 *     ids, and a self-link,
 *   - both partial unique indexes: a source vehicle cannot hold two active
 *     targets, two same-provider sources cannot claim one active target, and
 *     archiving frees the pair for a replacement,
 *   - the future multi-telematics case (Motive X + Samsara X → one Fleetio
 *     vehicle) is permitted,
 *   - two accounts may use IDENTICAL provider resource ids.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + links.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY, against a database
 * where migration 20260729000000 has been applied.
 *
 * ── MIGRATION PREFLIGHT (do not remove) ─────────────────────────────────────
 * The env gate above is NOT sufficient on its own. `ALLOW_DB_INTEGRATION_TESTS`
 * is a standing developer setting, so this suite will happily run against a
 * database where THIS migration has not been applied. When that happened during
 * CS-1 the result was actively misleading: every table-dependent test failed for
 * the wrong reason, the anon test PASSED VACUOUSLY (anon "sees nothing" is
 * trivially true when the table does not exist), and throwaway auth users had
 * already been created in the target project.
 *
 * So `beforeAll` probes for the table BEFORE creating any fixture, and fails
 * fast with one precise message if it is absent. Zero fixtures are created in
 * that state. A vacuous green is worse than a red.
 *
 * NOTE (CS-1): migration 20260729000000 is intentionally NOT applied yet, so
 * this suite currently fails that preflight by design. It ships now so the proof
 * exists the moment the migration is applied — it is not evidence of anything
 * until it actually runs.
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
  listLinks,
  findActiveLink,
  createConfirmedLink,
  archiveLink,
} from "@/repositories/resourceLinks/accountResourceLinks";

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
    "SKIP account_resource_links RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration 20260729000000 applied).",
  );
}

const CONFIRMED_AT = "2026-07-24T12:00:00Z";

describeDb("account_resource_links — RLS, constraints, uniqueness (live DB)", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  type Session = { userId: string; email: string; password: string; personalAccountId: string };

  async function createTestUser(label: string): Promise<Session> {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, `arl-rls-${label}`);
    const { data: acc, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !acc) throw new Error(`personal account: ${error?.message ?? "none"}`);
    return { userId, email, password, personalAccountId: acc.id };
  }

  let A: Session;
  let B: Session;

  /**
   * Real authenticated session via the SHARED helper (`tests/helpers/
   * dbSessionClient.ts`). This project enforces captcha on password sign-in, so
   * `signInWithPassword` fails in tests; the helper mints an email-link token
   * with the service role and redeems it, yielding an ordinary authenticated
   * session with RLS and every authorization rule still applying. Not a bypass.
   */
  const signInAsUser = (email: string): Promise<SupabaseClient> =>
    signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });

  /**
   * Delete an account the way production's purge path does: clear its ON DELETE
   * RESTRICT children first, then the account row. `accounts` restricts
   * workflow_runs / workflows / workflow_folders / integrations /
   * account_billing (see tests/helpers/dbFixtureCleanup.ts) — a bare
   * `DELETE FROM accounts` silently fails, which is what made the cascade
   * assertion below pass vacuously on its first run.
   */
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

  const link = (accountId: string, over: Record<string, unknown> = {}) => ({
    accountId,
    resourceKind: "vehicle" as const,
    sourceProvider: "motive",
    sourceExternalId: "motive-veh-88231",
    targetProvider: "fleetio",
    targetExternalId: "42",
    sourceLabel: "Unit 104",
    targetLabel: "Truck 104",
    matchBasis: "manual" as const,
    confirmedAt: CONFIRMED_AT,
    ...over,
  });

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false } });

    // MIGRATION PREFLIGHT — must run BEFORE any fixture is created (see header).
    // If the table is absent, creating throwaway users would leave residue in the
    // target project for a suite that cannot possibly prove anything.
    const probe = await admin.from("account_resource_links").select("id").limit(1);
    if (probe.error) {
      throw new Error(
        "account_resource_links is not present in the target database — migration " +
          "20260729000000 has not been applied there. Refusing to create fixtures. " +
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
    // Keep each test independent — the partial unique indexes are global per account.
    await admin
      .from("account_resource_links")
      .delete()
      .in("account_id", [A.personalAccountId, B.personalAccountId]);
  });

  // ── Data API exposure ─────────────────────────────────────────────────────

  it("a member's DIRECT authenticated SELECT is denied (42501) — the REVOKE took", async () => {
    await createConfirmedLink(link(A.personalAccountId, { createdByUserId: A.userId }));

    const asUser = await signInAsUser(A.email);
    const probe = await asUser.from("account_resource_links").select("*");

    // 42501 (not "0 rows") is the load-bearing distinction: an empty result would
    // mean the GRANT survived and only RLS was filtering. `permission denied`
    // proves the anon/authenticated REVOKE actually took, which matters because
    // this project's ALTER DEFAULT PRIVILEGES grants ALL on new public tables.
    expect(probe.error?.code).toBe("42501");
    expect(probe.data ?? []).toHaveLength(0);
  });

  it("anon is denied at the grant layer too (42501, not merely empty)", async () => {
    await createConfirmedLink(link(A.personalAccountId));
    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false } });
    const probe = await anon.from("account_resource_links").select("*");
    expect(probe.error?.code).toBe("42501");
    expect(probe.data ?? []).toHaveLength(0);
  });

  // ── Cascade / provenance lifecycle ────────────────────────────────────────

  it("deleting a USER nulls provenance but KEEPS the account's link", async () => {
    const doomed = await createTestUser("doomed");
    const created = await createConfirmedLink(
      link(A.personalAccountId, {
        createdByUserId: doomed.userId,
        confirmedByUserId: doomed.userId,
      }),
    );

    // `accounts.owner_user_id` is ON DELETE RESTRICT, so the user cannot be
    // deleted while they still own their auto-created personal account. Remove
    // that first (the link under test belongs to account A, not to theirs), then
    // assert the deletion actually happened — an unchecked failure here is what
    // made this test report a false negative on its first run.
    await deleteAccountCascade(doomed.personalAccountId);
    const { error: delErr } = await admin.auth.admin.deleteUser(doomed.userId);
    expect(delErr).toBeNull();

    const { data } = await admin
      .from("account_resource_links")
      .select("id, created_by_user_id, confirmed_by_user_id")
      .eq("id", created.id)
      .maybeSingle<{ id: string; created_by_user_id: string | null; confirmed_by_user_id: string | null }>();

    expect(data).not.toBeNull();
    expect(data!.created_by_user_id).toBeNull();
    expect(data!.confirmed_by_user_id).toBeNull();
  });

  it("deleting the ACCOUNT cascades its links away", async () => {
    const doomed = await createTestUser("cascade");
    await createConfirmedLink(link(doomed.personalAccountId));
    expect(await listLinks(doomed.personalAccountId, "vehicle")).toHaveLength(1);

    // Must clear the RESTRICT children first, and the delete must be CHECKED —
    // a silently-failed account delete would leave the link in place and this
    // assertion would then be proving nothing about CASCADE at all.
    await deleteAccountCascade(doomed.personalAccountId);

    const { data } = await admin
      .from("account_resource_links")
      .select("id")
      .eq("account_id", doomed.personalAccountId);
    expect(data ?? []).toHaveLength(0);
  });

  // ── CHECK constraints ─────────────────────────────────────────────────────

  it("rejects an unknown resource_kind", async () => {
    const { error } = await admin.from("account_resource_links").insert({
      account_id: A.personalAccountId,
      resource_kind: "trailer",
      source_provider: "motive",
      source_external_id: "m-1",
      target_provider: "fleetio",
      target_external_id: "1",
      match_basis: "manual",
      confirmed_at: CONFIRMED_AT,
    });
    expect(error?.message).toMatch(/resource_kind/i);
  });

  it("rejects an unknown match_basis", async () => {
    const { error } = await admin.from("account_resource_links").insert({
      account_id: A.personalAccountId,
      resource_kind: "vehicle",
      source_provider: "motive",
      source_external_id: "m-1",
      target_provider: "fleetio",
      target_external_id: "1",
      match_basis: "suggested_colour",
      confirmed_at: CONFIRMED_AT,
    });
    expect(error?.message).toMatch(/match_basis/i);
  });

  it("rejects blank provider / external ids at the DB layer", async () => {
    for (const bad of [
      { source_provider: "   " },
      { source_external_id: "" },
      { target_provider: " " },
      { target_external_id: "  " },
    ]) {
      const { error } = await admin.from("account_resource_links").insert({
        account_id: A.personalAccountId,
        resource_kind: "vehicle",
        source_provider: "motive",
        source_external_id: "m-1",
        target_provider: "fleetio",
        target_external_id: "1",
        match_basis: "manual",
        confirmed_at: CONFIRMED_AT,
        ...bad,
      });
      expect(error).not.toBeNull();
    }
  });

  it("rejects a self-link at the DB layer", async () => {
    const { error } = await admin.from("account_resource_links").insert({
      account_id: A.personalAccountId,
      resource_kind: "vehicle",
      source_provider: "fleetio",
      source_external_id: "42",
      target_provider: "fleetio",
      target_external_id: "42",
      match_basis: "manual",
      confirmed_at: CONFIRMED_AT,
    });
    expect(error?.message).toMatch(/distinct_sides/i);
  });

  // ── Active-link uniqueness ────────────────────────────────────────────────

  it("a source vehicle cannot hold TWO active Fleetio targets", async () => {
    await createConfirmedLink(link(A.personalAccountId, { targetExternalId: "42" }));
    await expect(
      createConfirmedLink(link(A.personalAccountId, { targetExternalId: "43" })),
    ).rejects.toThrow(/createConfirmedLink failed/);
  });

  it("two MOTIVE vehicles cannot claim the same active Fleetio vehicle", async () => {
    await createConfirmedLink(link(A.personalAccountId, { sourceExternalId: "m-1" }));
    await expect(
      createConfirmedLink(link(A.personalAccountId, { sourceExternalId: "m-2" })),
    ).rejects.toThrow(/createConfirmedLink failed/);
  });

  it("archiving the SOURCE link frees it for a replacement active link", async () => {
    const first = await createConfirmedLink(link(A.personalAccountId, { targetExternalId: "42" }));
    await archiveLink(A.personalAccountId, first.id, "2026-07-25T00:00:00Z");

    const replacement = await createConfirmedLink(
      link(A.personalAccountId, { targetExternalId: "77", targetLabel: "Truck 77" }),
    );
    const active = await findActiveLink(
      A.personalAccountId,
      "vehicle",
      "motive",
      "motive-veh-88231",
      "fleetio",
    );
    expect(active?.id).toBe(replacement.id);
    expect(active?.targetExternalId).toBe("77");
    // History is preserved.
    expect(await listLinks(A.personalAccountId, "vehicle")).toHaveLength(2);
  });

  it("archiving the TARGET link frees that Fleetio vehicle for a different source vehicle", async () => {
    const first = await createConfirmedLink(link(A.personalAccountId, { sourceExternalId: "m-1" }));
    await archiveLink(A.personalAccountId, first.id, "2026-07-25T00:00:00Z");

    await expect(
      createConfirmedLink(link(A.personalAccountId, { sourceExternalId: "m-2" })),
    ).resolves.toBeDefined();
  });

  it("two ACCOUNTS may use identical provider resource ids", async () => {
    await createConfirmedLink(link(A.personalAccountId));
    await expect(createConfirmedLink(link(B.personalAccountId))).resolves.toBeDefined();

    const forA = await findActiveLink(A.personalAccountId, "vehicle", "motive", "motive-veh-88231", "fleetio");
    const forB = await findActiveLink(B.personalAccountId, "vehicle", "motive", "motive-veh-88231", "fleetio");
    expect(forA!.id).not.toBe(forB!.id);
    expect(forA!.accountId).toBe(A.personalAccountId);
    expect(forB!.accountId).toBe(B.personalAccountId);
  });

  it("a DIFFERENT source provider may target the same Fleetio vehicle (future Samsara case)", async () => {
    await createConfirmedLink(link(A.personalAccountId, { sourceProvider: "motive" }));
    // Same Fleetio vehicle 42, different telematics system — the same physical
    // truck tracked by two providers. Must be permitted.
    await expect(
      createConfirmedLink(
        link(A.personalAccountId, { sourceProvider: "samsara", sourceExternalId: "sam-9" }),
      ),
    ).resolves.toBeDefined();
  });

  // ── Cross-account isolation through the repository ────────────────────────

  it("account B never resolves account A's link, and cannot archive it", async () => {
    const a = await createConfirmedLink(link(A.personalAccountId));

    expect(
      await findActiveLink(B.personalAccountId, "vehicle", "motive", "motive-veh-88231", "fleetio"),
    ).toBeNull();
    expect(await listLinks(B.personalAccountId, "vehicle")).toHaveLength(0);
    expect(await archiveLink(B.personalAccountId, a.id, "2026-07-25T00:00:00Z")).toBeNull();

    // A's link is untouched.
    const stillActive = await findActiveLink(
      A.personalAccountId,
      "vehicle",
      "motive",
      "motive-veh-88231",
      "fleetio",
    );
    expect(stillActive?.id).toBe(a.id);
    expect(stillActive?.archivedAt).toBeNull();
  });
});
