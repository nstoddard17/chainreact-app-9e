/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-FOLDERS-5 / WF-4 — gated DB proof of the invariants the purge
 * service relies on, validated directly against the DB:
 *   - the purge selector (deleted_at IS NOT NULL AND purge_after <= now) catches
 *     an expired trashed workflow but NOT one still in its restore window,
 *   - deleting a folder while a (trashed) workflow still references it via
 *     folder_id fails (ON DELETE RESTRICT) — proving workflows must be purged
 *     FIRST; after the workflow is gone the folder deletes cleanly,
 *   - a billing ledger row (task_usage_events) SURVIVES the workflow hard-delete
 *     with workflow_id nulled (ON DELETE SET NULL) — no anonymization needed.
 *
 * DESTRUCTIVE / OPT-IN — ALLOW_DB_INTEGRATION_TESTS=true with
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
    "SKIP workflow trash purge — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow trash purge invariants — WF-4", () => {
  let admin: SupabaseClient;
  let userId = "";
  let accountId = "";

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `wf-purge-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    userId = data.user.id;
    const { data: acct } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", userId).single<{ id: string }>();
    accountId = acct!.id;
  });

  afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from("task_usage_events").delete().eq("account_id", accountId);
    await admin.from("workflows").update({ folder_id: null }).eq("account_id", accountId);
    await admin.from("workflows").delete().eq("account_id", accountId);
    await admin.from("workflow_folders").update({ parent_folder_id: null }).eq("account_id", accountId);
    await admin.from("workflow_folders").delete().eq("account_id", accountId);
    await admin.from("account_billing").delete().eq("account_id", accountId);
    await admin.from("account_memberships").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("owner_user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  it("purge selector catches expired trash but not in-window trash; RESTRICT forces workflows-first; ledgers survive", async () => {
    const now = Date.now();
    const past = new Date(now - 86400_000).toISOString();
    const future = new Date(now + 7 * 86400_000).toISOString();
    const nowIso = new Date(now).toISOString();

    // Folder F (will be trashed past-window) + workflow W inside it (trashed past).
    const { data: f } = await admin
      .from("workflow_folders")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "purge-folder", deleted_at: past, purge_after: past })
      .select("id").single<{ id: string }>();
    const { data: w } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "purge-wf", folder_id: f!.id, state: "deleted", deleted_at: past, purge_after: past })
      .select("id").single<{ id: string }>();
    // In-window trashed workflow (must NOT be selected for purge).
    const { data: w2 } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "in-window-wf", state: "deleted", deleted_at: nowIso, purge_after: future })
      .select("id").single<{ id: string }>();
    // Billing ledger row referencing W.
    const ledger = await admin.from("task_usage_events").insert({
      account_id: accountId, workflow_id: w!.id, event_type: "node_task_charged", cost_policy_version: "test",
    }).select("id").single<{ id: string }>();
    expect(ledger.error).toBeNull();

    // 1. Selector: W (expired) is purgeable; W2 (in-window) is not.
    const { data: purgeable } = await admin
      .from("workflows").select("id").eq("account_id", accountId)
      .not("deleted_at", "is", null).lte("purge_after", nowIso);
    const ids = (purgeable ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(w!.id);
    expect(ids).not.toContain(w2!.id);

    // 2. RESTRICT: deleting the folder while W still references it fails.
    const folderFirst = await admin.from("workflow_folders").delete().eq("id", f!.id);
    expect(folderFirst.error).not.toBeNull();
    expect(folderFirst.error!.message.toLowerCase()).toMatch(/foreign key|violates|constraint/);

    // Workflows-first: delete W, then the folder deletes cleanly.
    const delW = await admin.from("workflows").delete().eq("id", w!.id);
    expect(delW.error).toBeNull();
    const delF = await admin.from("workflow_folders").delete().eq("id", f!.id);
    expect(delF.error).toBeNull();

    // 3. Ledger survives with workflow_id nulled (ON DELETE SET NULL).
    const { data: led } = await admin
      .from("task_usage_events").select("id, workflow_id, account_id").eq("id", ledger.data!.id).single<{ id: string; workflow_id: string | null; account_id: string }>();
    expect(led!.workflow_id).toBeNull();
    expect(led!.account_id).toBe(accountId);
  });
});
