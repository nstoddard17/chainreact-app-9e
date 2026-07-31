import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Last-resort sweep of synthetic `@chainreact.test` fixtures.
 *
 * Per-suite `afterAll` + `cleanupFixtures` is the primary mechanism and handles
 * the normal path, including a `beforeAll` that dies mid-setup. But an `afterAll`
 * cannot run at all if its worker is killed, times out, or crashes — and under a
 * full parallel run that does happen occasionally. One escaped fixture per run is
 * enough to refill the project over time, which is exactly how ~320 users
 * accumulated.
 *
 * So this runs ONCE after the whole jest run and removes anything left behind, in
 * the same RESTRICT-safe order as cleanupFixtures.
 *
 * SAFETY: scoped strictly to the `@chainreact.test` email domain. Real accounts
 * are never matched, and the sweep deletes nothing when no synthetic user exists.
 * It is deliberately quiet on success and loud when it actually had to clean —
 * a non-empty sweep means a suite's own teardown failed and should be fixed.
 */

const TEST_EMAIL_DOMAIN = "@chainreact.test";

const ACCOUNT_RESTRICT_TABLES = [
  "workflow_runs",
  "workflows",
  "workflow_folders",
  "integrations",
  "account_billing",
] as const;

/**
 * Load `.env.local` the same first-wins way the suites do.
 *
 * REQUIRED: globalTeardown runs in its own context, NOT in a test file, so the
 * per-file `loadEnvLocal()` calls have not happened here. Without this the sweep
 * silently no-ops — which is precisely how a leaked user survived a run that had
 * this backstop installed.
 */
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

export default async function globalTeardown(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Only meaningful when the DB-backed suites were actually allowed to run.
  if (process.env.ALLOW_DB_INTEGRATION_TESTS !== "true" || !url || !key) return;

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stragglers: string[] = [];
  // Prefixes name the owning suite (createTrackedUser embeds them), so the
  // warning can point at the suite to fix instead of just a count.
  const prefixes: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return;
    for (const user of data.users) {
      const email = (user.email ?? "").toLowerCase();
      if (!email.endsWith(TEST_EMAIL_DOMAIN)) continue;
      stragglers.push(user.id);
      prefixes.push(email.split("@")[0]!.replace(/-\d{10,}-[a-z0-9]+$/, ""));
    }
    if (data.users.length < 200) break;
  }
  // GOOGLE-REVIEW-TEMPLATE-1 — sweep OFFICIAL templates that violate the platform invariant.
  // Real official templates are seeded with created_by_user_id NULL and no runtime code path
  // creates source='official' at all, so an account-less official row WITH an author is always a
  // test fixture (workflow-templates-rls.test.ts seeds one). Its account_id is NULL, so it
  // cascades from nothing — and once its author is deleted it is unreachable by the
  // created_by_user_id sweep below, leaving a badged, zero-step card in the marketplace forever.
  // This runs BEFORE the straggler early-return so it also cleans up after an aborted run.
  await admin
    .from("workflow_templates")
    .delete()
    .eq("source", "official")
    .is("account_id", null)
    .not("created_by_user_id", "is", null);

  // …and the same row AFTER its author was deleted (created_by_user_id is ON DELETE SET NULL, so
  // the sweep above stops seeing it). No real official template has an empty node list — the
  // catalog guards enforce a five-node floor — so an account-less official with no nodes is
  // always a leaked fixture. This is the shape that reached the live marketplace as a badged,
  // zero-step "Official Starter" card.
  const { data: emptyOfficials } = await admin
    .from("workflow_templates")
    .select("id, definition")
    .eq("source", "official")
    .is("account_id", null);
  const emptyIds = (emptyOfficials ?? [])
    .filter((row) => {
      const def = (row as { definition?: { nodes?: unknown[] } }).definition;
      return !Array.isArray(def?.nodes) || def.nodes.length === 0;
    })
    .map((row) => (row as { id: string }).id);
  if (emptyIds.length > 0) {
    await admin.from("workflow_templates").delete().in("id", emptyIds);
  }

  if (stragglers.length === 0) return;

  const { data: owned } = await admin
    .from("accounts")
    .select("id")
    .in("owner_user_id", stragglers);
  const accountIds = (owned ?? []).map((row) => (row as { id: string }).id);

  // Author-owned templates can be platform-owned (account_id NULL), so they are
  // not reachable by the account-scoped deletes below.
  await admin.from("workflow_templates").delete().in("created_by_user_id", stragglers);

  if (accountIds.length > 0) {
    await admin
      .from("workflow_folders")
      .update({ parent_folder_id: null })
      .in("account_id", accountIds)
      .not("parent_folder_id", "is", null);
    for (const table of ACCOUNT_RESTRICT_TABLES) {
      await admin.from(table).delete().in("account_id", accountIds);
    }
    await admin.from("accounts").delete().in("id", accountIds);
  }
  await admin.from("account_memberships").delete().in("user_id", stragglers);
  for (const userId of stragglers) await admin.auth.admin.deleteUser(userId);

  console.warn(
    `[globalTeardown] swept ${stragglers.length} leaked ${TEST_EMAIL_DOMAIN} user(s) ` +
      `from: ${[...new Set(prefixes)].sort().join(", ")}. ` +
      `Those suites' afterAll did not complete — fix them rather than relying on this net.`,
  );
}
