/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-FOLDERS-4 / WF-3 — gated DB proof of the trash window +
 * RLS scoping at the real DB:
 *   - the Trash filter (deleted_at IS NOT NULL AND purge_after > now()) shows a
 *     within-window trashed folder but NOT one past purge_after, and never a live one,
 *   - a non-member cannot see another account's trashed folder (RLS),
 *   - restore (clearing the trash columns) returns the row to the live set.
 *
 * DESTRUCTIVE / OPT-IN — ALLOW_DB_INTEGRATION_TESTS=true with
 * NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP workflow_folders trash — set ALLOW_DB_INTEGRATION_TESTS=true with URL + ANON + SERVICE keys.",
  );
}

describeDb("workflow_folders trash window + RLS — WF-3", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  const sessions: Array<{ userId: string; email: string; password: string; accountId: string }> = [];

  async function createUser(label: string) {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, `wf-trash-${label}`);
    const { data: acct } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", userId).single<{ id: string }>();
    sessions.push({ userId, email, password, accountId: acct!.id });
    return sessions[sessions.length - 1]!;
  }

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signIn: ${error.message}`);
    return c;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    await createUser("a");
    await createUser("b");
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("trash filter shows within-window items, hides past-purge_after + live items", async () => {
    const a = sessions[0]!;
    const now = Date.now();
    const future = new Date(now + 7 * 86400_000).toISOString();
    const past = new Date(now - 86400_000).toISOString();
    const nowIso = new Date(now).toISOString();

    const ins = await admin.from("workflow_folders").insert([
      { account_id: a.accountId, created_by_user_id: a.userId, name: "live-folder" },
      { account_id: a.accountId, created_by_user_id: a.userId, name: "trash-future", deleted_at: nowIso, purge_after: future, delete_operation_id: crypto.randomUUID() },
      { account_id: a.accountId, created_by_user_id: a.userId, name: "trash-past", deleted_at: nowIso, purge_after: past, delete_operation_id: crypto.randomUUID() },
    ]).select("id, name");
    expect(ins.error).toBeNull();

    const { data } = await admin
      .from("workflow_folders")
      .select("name")
      .eq("account_id", a.accountId)
      .not("deleted_at", "is", null)
      .gt("purge_after", new Date().toISOString());
    const names = (data ?? []).map((r: { name: string }) => r.name);
    expect(names).toContain("trash-future");
    expect(names).not.toContain("trash-past"); // past purge_after — purge-eligible, not shown in Trash
    expect(names).not.toContain("live-folder"); // not deleted
  });

  it("a non-member cannot see another account's trashed folder (RLS)", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaB = await sessionClient(b.email, b.password);
    const { data } = await supaB
      .from("workflow_folders")
      .select("id")
      .eq("account_id", a.accountId)
      .not("deleted_at", "is", null)
      .gt("purge_after", new Date().toISOString());
    expect(data ?? []).toHaveLength(0);
  });

  it("clearing the trash columns (restore) returns the folder to the live set", async () => {
    const a = sessions[0]!;
    const { data: f } = await admin
      .from("workflow_folders")
      .insert({ account_id: a.accountId, created_by_user_id: a.userId, name: "to-restore", deleted_at: new Date().toISOString(), purge_after: new Date(Date.now() + 7 * 86400_000).toISOString() })
      .select("id").single<{ id: string }>();

    await admin.from("workflow_folders").update({
      deleted_at: null, purge_after: null, deleted_by_user_id: null, deleted_from_parent_folder_id: null, delete_operation_id: null,
    }).eq("id", f!.id);

    const { data: live } = await admin
      .from("workflow_folders").select("id").eq("id", f!.id).is("deleted_at", null);
    expect(live).toHaveLength(1);
  });
});
