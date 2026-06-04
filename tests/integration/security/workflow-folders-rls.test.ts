/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-FOLDERS-2 / WF-1 — gated DB proof of the folder foundation:
 *   - account-membership RLS on workflow_folders (member sees own; non-member +
 *     anon do not),
 *   - the same-account triggers reject a cross-account parent_folder_id and a
 *     cross-account workflows.folder_id (these fire even for the service-role
 *     client, since FK validation bypasses RLS),
 *   - a same-account folder link is accepted, and folder_id stays nullable for
 *     existing/new workflows.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + folders + workflows.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP workflow_folders RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow_folders foundation RLS + same-account guards — WF-1", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
    folderId: string;
  }> = [];

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `wf-folder-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { userId: data.user.id, email, password };
  }

  async function personalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`personalAccountId: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  async function seedFolder(accountId: string, userId: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from("workflow_folders")
      .insert({ account_id: accountId, created_by_user_id: userId, name })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedFolder: ${error?.message ?? "no row"}`);
    return data.id;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    sessions.push({ ...a, accountId: aAccount, folderId: await seedFolder(aAccount, a.userId, "A Folder") });
    sessions.push({ ...b, accountId: bAccount, folderId: await seedFolder(bAccount, b.userId, "B Folder") });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      // Order matters: workflows reference folders (folder_id RESTRICT) and
      // folders reference accounts (account_id RESTRICT). Clear deepest first.
      await admin.from("workflows").delete().eq("created_by_user_id", id);
      await admin.from("workflow_folders").delete().eq("created_by_user_id", id);
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      for (const a of (accts ?? []) as Array<{ id: string }>) {
        await admin.from("account_billing").delete().eq("account_id", a.id);
      }
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("RLS: member A sees their folder; non-member B does not; anon does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("workflow_folders")
      .select("id")
      .eq("id", a.folderId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB.from("workflow_folders").select("id").eq("id", a.folderId);
    expect(bOnA).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonOnA } = await anon.from("workflow_folders").select("id").eq("id", a.folderId);
    expect(anonOnA).toHaveLength(0);
  });

  it("same-account trigger: cross-account parent_folder_id is rejected", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    // A child folder in account B pointing its parent at account A's folder.
    const { error } = await admin.from("workflow_folders").insert({
      account_id: b.accountId,
      created_by_user_id: b.userId,
      name: "cross-parent",
      parent_folder_id: a.folderId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/workflow_folders_same_account_violation/);
  });

  it("same-account trigger: cross-account workflows.folder_id is rejected", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    // A workflow in account B pointing folder_id at account A's folder.
    const { error } = await admin.from("workflows").insert({
      account_id: b.accountId,
      created_by_user_id: b.userId,
      name: "cross-folder workflow",
      folder_id: a.folderId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/workflows_same_account_violation/);
  });

  it("same-account folder link is accepted (workflow + folder in the same account)", async () => {
    const a = sessions[0]!;
    const { data, error } = await admin
      .from("workflows")
      .insert({
        account_id: a.accountId,
        created_by_user_id: a.userId,
        name: "same-account folder workflow",
        folder_id: a.folderId,
      })
      .select("id, folder_id")
      .single<{ id: string; folder_id: string }>();
    expect(error).toBeNull();
    expect(data!.folder_id).toBe(a.folderId);
  });

  it("folder_id is nullable — a workflow with no folder inserts fine and reads NULL", async () => {
    const a = sessions[0]!;
    const { data, error } = await admin
      .from("workflows")
      .insert({
        account_id: a.accountId,
        created_by_user_id: a.userId,
        name: "uncategorized workflow",
      })
      .select("id, folder_id, purge_after, delete_operation_id")
      .single<{ id: string; folder_id: string | null; purge_after: string | null; delete_operation_id: string | null }>();
    expect(error).toBeNull();
    expect(data!.folder_id).toBeNull();
    expect(data!.purge_after).toBeNull();
    expect(data!.delete_operation_id).toBeNull();
  });

  it("service-role bypasses RLS and sees both accounts' folders", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data, error } = await admin
      .from("workflow_folders")
      .select("id")
      .in("id", [a.folderId, b.folderId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
});
