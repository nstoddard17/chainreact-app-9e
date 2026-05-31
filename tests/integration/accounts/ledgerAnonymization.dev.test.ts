/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-10d — ledger anonymization + retention, live DB.
 * DESTRUCTIVE: creates + purges throwaway auth users + their ledger rows.
 * OPT-IN, triple-guarded.
 *
 * Proves:
 *   - purgeAccount ANONYMIZES the three ledgers (account_id / user_id /
 *     workflow refs nulled, metadata stripped, anonymized_at + ledger_purge_after
 *     set) and the rows SURVIVE account+auth.users deletion (no cascade).
 *   - anonymized rows are no longer account-addressable (account_id is NULL).
 *   - deleteExpiredAnonymizedLedgers hard-deletes only retention-elapsed rows
 *     (not-yet-expired rows are left intact).
 *
 * Each test uses a UNIQUE model_name marker so the two tests (and prior runs)
 * never read each other's anonymized rows.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/accounts/ledgerAnonymization.dev.test.ts
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
    "SKIP 4.ACCOUNT-MODEL-10d ledger anonymization — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE).",
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

describeDb("4.ACCOUNT-MODEL-10d — ledger anonymization (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  async function createUser(): Promise<{ userId: string; accountId: string }> {
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `acct-ledger-10d-${slug}@chainreact-10d.invalid`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    const { data: acct, error: aerr } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", data.user.id)
      .single<{ id: string }>();
    if (aerr || !acct) throw new Error(`personalAccountId: ${aerr?.message ?? "no row"}`);
    return { userId: data.user.id, accountId: acct.id };
  }

  /** Seed one row in each ledger. `marker` → ai_cost_events.model_name so each
   *  test reads only its own anonymized rows. */
  async function seedLedgers(accountId: string, userId: string, marker: string): Promise<void> {
    const { error: tue } = await admin.from("task_usage_events").insert({
      account_id: accountId,
      node_id: "node-secret", provider: "slack", node_type: "send", node_kind: "action",
      event_type: "node_task_charged", billable: true, tasks_charged: 1,
      // cost_policy_version is a KEPT field (survives anonymization) → use it as
      // the durable per-test marker for task_usage_events.
      cost_policy_version: marker, test_mode: false,
      metadata: { secret: "should-be-stripped" },
    });
    if (tue) throw new Error(`seed task_usage_events: ${tue.message}`);

    const { error: ace } = await admin.from("ai_cost_events").insert({
      account_id: accountId, user_id: userId,
      feature: "workflow_creation", event_type: "ai_model_call_completed",
      model_name: marker, model_provider: "openai",
      input_tokens: 10, output_tokens: 5, total_tokens: 15,
      tool_name: "maybe-user-text", validation_error_code: "maybe-raw",
      safety_block_reason: "maybe-raw-reason",
      metadata: { prompt: "should-be-stripped" },
    });
    if (ace) throw new Error(`seed ai_cost_events: ${ace.message}`);

    const { error: bsc } = await admin.from("billing_shadow_comparisons").insert({
      account_id: accountId,
      workflow_id: "00000000-0000-0000-0000-000000000001",
      workflow_run_id: "00000000-0000-0000-0000-000000000002",
      flat_charged_tasks: 1, estimated_tasks_per_run: 1, actual_billable_tasks: 1,
      proposed_reserved_tasks: 1, proposed_reconciled_tasks: 1, proposed_refunded_tasks: 0,
      delta_vs_flat: 0, would_have_reserved: true, policy_version: "v1",
    });
    if (bsc) throw new Error(`seed billing_shadow_comparisons: ${bsc.message}`);
  }

  /** Count anonymized ai_cost_events rows carrying a given marker. */
  async function anonymizedCount(marker: string): Promise<number> {
    const { count, error } = await admin
      .from("ai_cost_events")
      .select("id", { count: "exact", head: true })
      .is("account_id", null)
      .not("anonymized_at", "is", null)
      .eq("model_name", marker);
    if (error) throw new Error(`anonymizedCount: ${error.message}`);
    return count ?? 0;
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    // Clean any survivors of a failed run (accounts/users), plus this run's
    // anonymized ledger rows (matched by their unique markers).
    for (const id of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      const ids = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (ids.length) {
        await admin.from("task_usage_events").delete().in("account_id", ids);
        await admin.from("ai_cost_events").delete().in("account_id", ids);
        await admin.from("billing_shadow_comparisons").delete().in("account_id", ids);
        await admin.from("account_billing").delete().in("account_id", ids);
      }
      await admin.from("account_deletions").delete().eq("owner_user_id", id);
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    // Anonymized rows have NULL account_id — reap this run's by marker.
    for (const marker of ["anon-survive", "anon-retention"]) {
      await admin.from("ai_cost_events").delete().is("account_id", null).eq("model_name", marker);
      await admin.from("task_usage_events").delete().is("account_id", null).eq("cost_policy_version", marker);
    }
  });

  it("anonymizes ledgers before account deletion; rows survive and are not account-addressable", async () => {
    const marker = "anon-survive";
    const { userId, accountId } = await createUser();
    await seedLedgers(accountId, userId, marker);

    const { requestAccountDeletion } = await import("@/services/accounts/accountDeletion");
    const { purgeAccount } = await import("@/services/accounts/accountPurge");

    await requestAccountDeletion({ accountId, requestedByUserId: userId });
    // Purge with `now` past the 30-day grace so the purge runs.
    const purgedAt = new Date(Date.now() + 31 * DAY_MS);
    const result = await purgeAccount({ accountId, now: purgedAt });
    expect(result.status).toBe("purged");
    if (result.status === "purged") {
      expect(result.counts.ledgerRowsAnonymized).toBe(3);
    }

    // task_usage_events survivor (no user_id column on this table): identifiers
    // nulled, metadata stripped, aggregates kept. Found via the durable
    // cost_policy_version marker (a KEPT field).
    const tue = await admin
      .from("task_usage_events")
      .select("account_id, workflow_id, workflow_run_id, node_id, provider, metadata, anonymized_at, ledger_purge_after, tasks_charged")
      .is("account_id", null)
      .not("anonymized_at", "is", null)
      .eq("cost_policy_version", marker)
      .limit(1)
      .single<Record<string, unknown>>();
    expect(tue.error).toBeNull();
    expect(tue.data?.account_id).toBeNull();
    expect(tue.data?.workflow_id).toBeNull();
    expect(tue.data?.workflow_run_id).toBeNull();
    expect(tue.data?.node_id).toBeNull();
    expect(tue.data?.provider).toBeNull(); // identifier nulled
    expect(tue.data?.metadata).toEqual({}); // metadata stripped
    expect(tue.data?.tasks_charged).toBe(1); // aggregate retained
    expect(tue.data?.anonymized_at).not.toBeNull();
    expect(tue.data?.ledger_purge_after).not.toBeNull();

    // ai_cost_events survivor (model_name is a bounded provider value → kept,
    // and serves as the durable marker): all identifiers + untyped-text fields
    // nulled, metadata stripped, aggregates kept.
    const ace = await admin
      .from("ai_cost_events")
      .select("account_id, user_id, tool_name, validation_error_code, safety_block_reason, metadata, model_name, total_tokens, anonymized_at, ledger_purge_after")
      .is("account_id", null)
      .not("anonymized_at", "is", null)
      .eq("model_name", marker)
      .limit(1)
      .single<Record<string, unknown>>();
    expect(ace.error).toBeNull();
    expect(ace.data?.account_id).toBeNull();
    expect(ace.data?.user_id).toBeNull(); // actor nulled
    expect(ace.data?.tool_name).toBeNull(); // untyped text → nulled
    expect(ace.data?.validation_error_code).toBeNull();
    expect(ace.data?.safety_block_reason).toBeNull();
    expect(ace.data?.metadata).toEqual({});
    expect(ace.data?.model_name).toBe(marker); // bounded value retained
    expect(ace.data?.total_tokens).toBe(15); // aggregate retained
    expect(ace.data?.anonymized_at).not.toBeNull();
    expect(ace.data?.ledger_purge_after).not.toBeNull();

    // Not account-addressable: no ledger row still carries this account_id.
    const stillScoped = await admin
      .from("task_usage_events").select("id", { count: "exact", head: true })
      .eq("account_id", accountId);
    expect(stillScoped.count ?? 0).toBe(0);
  });

  it("retention cron hard-deletes only retention-elapsed anonymized rows", async () => {
    const marker = "anon-retention";
    const { userId, accountId } = await createUser();
    await seedLedgers(accountId, userId, marker);

    const { requestAccountDeletion } = await import("@/services/accounts/accountDeletion");
    const { purgeAccount } = await import("@/services/accounts/accountPurge");
    const { deleteExpiredAnonymizedLedgers } = await import("@/repositories/ledgerAnonymization");

    await requestAccountDeletion({ accountId, requestedByUserId: userId });
    // Purge past the 30-day grace → ledger_purge_after = purgedAt + 90d.
    const purgedAt = new Date(Date.now() + 31 * DAY_MS);
    const result = await purgeAccount({ accountId, now: purgedAt });
    expect(result.status).toBe("purged");

    // BEFORE retention elapses: a sweep at the purge moment (purgedAt + 0) does
    // NOT reach ledger_purge_after (purgedAt + 90d) → our rows survive.
    await deleteExpiredAnonymizedLedgers(purgedAt.toISOString());
    expect(await anonymizedCount(marker)).toBe(1);

    // AFTER retention: a sweep past purgedAt + 90d removes them.
    const afterRetention = new Date(purgedAt.getTime() + 100 * DAY_MS).toISOString();
    await deleteExpiredAnonymizedLedgers(afterRetention);
    expect(await anonymizedCount(marker)).toBe(0);
  });
});
