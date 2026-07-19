/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-FOLDERS-3 / WF-2 — gated DB proof of the partial UNIQUE
 * sibling-name index (WF-1 migration) that backstops the service's duplicate-name
 * guard:
 *   - two LIVE top-level folders with the same name collide (NULLS NOT DISTINCT
 *     buckets the NULL parent),
 *   - the same name under a different parent is allowed,
 *   - after a folder is soft-deleted (deleted_at set), the name can be re-created
 *     (the index is WHERE deleted_at IS NULL).
 *
 * DESTRUCTIVE / OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (migration applied).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";

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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP workflow_folders unique-name — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow_folders partial UNIQUE sibling-name index — WF-2", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let userId = "";
  let accountId = "";

  async function insert(name: string, parentFolderId: string | null) {
    return admin
      .from("workflow_folders")
      .insert({ account_id: accountId, created_by_user_id: userId, name, parent_folder_id: parentFolderId })
      .select("id")
      .single<{ id: string }>();
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = await createTrackedUser(admin, fixtures, "wf-folder-uniq");
    userId = user.userId;
    const { data: acct, error: aErr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (aErr || !acct) throw new Error(`account: ${aErr?.message ?? "no row"}`);
    accountId = acct.id;
  });

  afterAll(async () => {
    // This suite nests folders (a child under 'Parent'), and
    // workflow_folders.parent_folder_id is self-referential RESTRICT — the shared
    // bulk delete cannot drop a parent while its child row still points at it.
    // Break the parent links first, then hand off to the shared teardown.
    if (admin && userId) {
      await admin.from("workflow_folders").update({ parent_folder_id: null }).eq("created_by_user_id", userId);
    }
    await cleanupFixtures(admin, fixtures);
  });

  it("two live top-level folders with the same name collide (NULLS NOT DISTINCT)", async () => {
    const first = await insert("Marketing", null);
    expect(first.error).toBeNull();
    const dup = await insert("Marketing", null);
    expect(dup.error).not.toBeNull();
    expect(dup.error!.message.toLowerCase()).toMatch(/duplicate|unique/);
  });

  it("the same name under a different parent is allowed", async () => {
    const parent = await insert("Parent", null);
    expect(parent.error).toBeNull();
    // 'Marketing' already exists at top level; under 'Parent' it should be fine.
    const child = await insert("Marketing", parent.data!.id);
    expect(child.error).toBeNull();
  });

  it("after soft-delete, the name can be re-created (index is live-only)", async () => {
    const a = await insert("Sales", null);
    expect(a.error).toBeNull();
    // Soft-delete the row (trash columns are inert in this slice but settable).
    const del = await admin
      .from("workflow_folders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", a.data!.id);
    expect(del.error).toBeNull();
    // Re-create the same name at the same (top) level — the partial index excludes
    // the trashed row, so this succeeds.
    const reborn = await insert("Sales", null);
    expect(reborn.error).toBeNull();
  });
});
