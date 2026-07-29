#!/usr/bin/env node
/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — real database + RLS validation for
 * builder_agent_threads / builder_agent_messages after the forward migration.
 *
 * Throwaway verification script (scripts/trash — not part of the app). It:
 *   1. confirms the new columns / constraints / index landed,
 *   2. prints the live RLS policy bodies for both tables,
 *   3. proves account isolation by running the SELECT predicate as a NON-member
 *      (row invisible) and as the owning member (row visible), using
 *      `set_config('request.jwt.claims', ...)` so `auth.uid()` resolves,
 *   4. proves write idempotency via the partial unique index,
 *   5. cleans up every row it created.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadEnvFile } from "../../lib/db-target.mjs";

const env = loadEnvFile(readFileSync, ".env.local");
const client = new pg.Client({
  connectionString: env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
});

const OK = (m) => console.log(`  OK   ${m}`);
const FAIL = (m) => {
  console.error(`  FAIL ${m}`);
  process.exitCode = 1;
};

function check(label, condition) {
  condition ? OK(label) : FAIL(label);
}

await client.connect();

try {
  console.log("\n=== 1. Schema ===");
  const cols = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='builder_agent_messages'
      ORDER BY column_name`,
  );
  const names = cols.rows.map((r) => r.column_name);
  for (const c of [
    "client_message_id",
    "request_id",
    "agent_change_id",
    "base_graph_version",
    "proposal",
  ]) {
    check(`column builder_agent_messages.${c}`, names.includes(c));
  }

  const kindChk = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname='builder_agent_messages_kind_chk'`,
  );
  check("kind CHECK accepts 'review'", /'review'/.test(kindChk.rows[0]?.def ?? ""));

  const statusChk = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname='agent_change_history_status_known'`,
  );
  check(
    "agent_change_history status CHECK accepts 'applied_saved'",
    /applied_saved/.test(statusChk.rows[0]?.def ?? ""),
  );
  check(
    "agent_change_history status CHECK still accepts 'kept_as_preview'",
    /kept_as_preview/.test(statusChk.rows[0]?.def ?? ""),
  );

  const idx = await client.query(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname='builder_agent_messages_client_id_uniq'`,
  );
  check("partial unique index on (thread_id, client_message_id)", idx.rowCount === 1);

  console.log("\n=== 2. RLS policies ===");
  const pol = await client.query(
    `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
      WHERE schemaname='public'
        AND tablename IN ('builder_agent_threads','builder_agent_messages')
      ORDER BY tablename, policyname`,
  );
  for (const p of pol.rows) {
    const body = `${p.qual ?? ""} ${p.with_check ?? ""}`;
    const scoped =
      /auth\.uid\(\) = user_id/.test(body) && /account_memberships/.test(body);
    check(`${p.tablename}.${p.policyname} (${p.cmd}) is user+account scoped`, scoped);
  }
  check(
    "builder_agent_messages has NO update policy (messages immutable)",
    !pol.rows.some((p) => p.tablename === "builder_agent_messages" && p.cmd === "UPDATE"),
  );

  const rls = await client.query(
    `SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('builder_agent_threads','builder_agent_messages')`,
  );
  for (const r of rls.rows) check(`${r.relname} RLS enabled`, r.relrowsecurity === true);

  console.log("\n=== 3. Live account isolation ===");
  // Find a real (account, member, workflow) triple to test against; read-only.
  const target = await client.query(
    `SELECT w.id AS workflow_id, w.account_id, am.user_id
       FROM public.workflows w
       JOIN public.account_memberships am ON am.account_id = w.account_id
      WHERE w.deleted_at IS NULL
      LIMIT 1`,
  );
  if (target.rowCount === 0) {
    console.log("  SKIP no workflow+membership pair exists to test against.");
  } else {
    const { workflow_id: wf, account_id: acct, user_id: owner } = target.rows[0];
    const outsider = await client.query(
      `SELECT u.id FROM auth.users u
        WHERE NOT EXISTS (
          SELECT 1 FROM public.account_memberships am
           WHERE am.user_id = u.id AND am.account_id = $1)
        LIMIT 1`,
      [acct],
    );

    await client.query("BEGIN");
    const thread = await client.query(
      `INSERT INTO public.builder_agent_threads (user_id, workflow_id)
       VALUES ($1,$2)
       ON CONFLICT (user_id, workflow_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [owner, wf],
    );
    const threadId = thread.rows[0].id;
    await client.query(
      `INSERT INTO public.builder_agent_messages
         (thread_id, user_id, workflow_id, role, kind, content, client_message_id)
       VALUES ($1,$2,$3,'assistant','review','RLS probe','rls-probe-1')`,
      [threadId, owner, wf],
    );

    // Idempotency: the partial unique index must reject the duplicate.
    let duplicateRejected = false;
    try {
      await client.query("SAVEPOINT dup");
      await client.query(
        `INSERT INTO public.builder_agent_messages
           (thread_id, user_id, workflow_id, role, kind, content, client_message_id)
         VALUES ($1,$2,$3,'assistant','review','RLS probe again','rls-probe-1')`,
        [threadId, owner, wf],
      );
      await client.query("RELEASE SAVEPOINT dup");
    } catch (e) {
      duplicateRejected = e.code === "23505";
      await client.query("ROLLBACK TO SAVEPOINT dup");
    }
    check("duplicate (thread_id, client_message_id) rejected by the DB", duplicateRejected);

    // Now evaluate the SELECT policy as each identity.
    async function visibleAs(userId) {
      await client.query("SET LOCAL ROLE authenticated");
      await client.query(
        `SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true)`,
        [userId],
      );
      const r = await client.query(
        `SELECT count(*)::int AS n FROM public.builder_agent_messages WHERE workflow_id = $1`,
        [wf],
      );
      await client.query("RESET ROLE");
      return r.rows[0].n;
    }

    const asOwner = await visibleAs(owner);
    check(`owning member sees their thread (${asOwner} row(s))`, asOwner >= 1);

    if (outsider.rowCount > 0) {
      const asOutsider = await visibleAs(outsider.rows[0].id);
      check("non-member of the account sees ZERO rows", asOutsider === 0);
    } else {
      console.log("  SKIP no non-member user exists in auth.users to test with.");
    }

    // Never keep probe data.
    await client.query("ROLLBACK");
    OK("probe rows rolled back (nothing persisted)");
  }
} finally {
  await client.end();
}

console.log(
  process.exitCode ? "\nRESULT: FAILURES ABOVE\n" : "\nRESULT: all checks passed\n",
);
