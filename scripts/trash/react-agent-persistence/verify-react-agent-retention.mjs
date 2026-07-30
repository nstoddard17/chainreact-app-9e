#!/usr/bin/env node
/**
 * REACT-AGENT-CONVERSATION-RETENTION-1 — live-database proof of the deletion
 * lifecycle for persisted React Agent conversations.
 *
 * Throwaway verification script (scripts/trash — not part of the app). It:
 *   1. dumps the REAL foreign-key + NOT NULL design for builder_agent_threads /
 *      builder_agent_messages (the migrations are intent; the DB is truth),
 *   2. takes an orphan census across the whole table,
 *   3. drives the full lifecycle inside ONE transaction that is ROLLED BACK:
 *        soft-delete retains → restore retains → hard-delete cascades →
 *        workflow A's deletion leaves workflow B untouched →
 *        account-purge-shaped delete (delete workflows BY ACCOUNT) cascades.
 *
 * Every write happens inside the transaction and nothing is committed.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadEnvFile } from "../../lib/db-target.mjs";

const env = loadEnvFile(readFileSync, ".env.local");
const client = new pg.Client({
  connectionString: env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
});

let failures = 0;
const OK = (m) => console.log(`  OK   ${m}`);
const FAIL = (m) => {
  failures++;
  console.error(`  FAIL ${m}`);
};
const check = (label, cond) => (cond ? OK(label) : FAIL(label));

await client.connect();

try {
  console.log("\n=== 1. Real foreign-key design ===");
  const fks = await client.query(`
    SELECT c.conname,
           c.conrelid::regclass::text  AS child,
           c.confrelid::regclass::text AS parent,
           c.confdeltype,
           c.convalidated,
           (SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
              FROM unnest(c.conkey) k
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS cols,
           (SELECT bool_and(a.attnotnull)
              FROM unnest(c.conkey) k
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS not_null
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.conrelid IN ('public.builder_agent_threads'::regclass,
                          'public.builder_agent_messages'::regclass)
     ORDER BY child, cols`);
  const DELRULE = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };
  for (const r of fks.rows) {
    console.log(
      `  ${r.child}.${r.cols} → ${r.parent}  ON DELETE ${DELRULE[r.confdeltype]}` +
        `  ${r.not_null ? "NOT NULL" : "NULLABLE"}${r.convalidated ? "" : "  [NOT VALID]"}`,
    );
  }
  // `confrelid::regclass::text` drops the schema when it is on the search path,
  // so compare on the bare relation name.
  const bare = (s) => s.replace(/^[^.]+\./, "");
  const need = [
    ["builder_agent_threads", "workflow_id", "workflows"],
    ["builder_agent_threads", "user_id", "users"],
    ["builder_agent_messages", "thread_id", "builder_agent_threads"],
    ["builder_agent_messages", "workflow_id", "workflows"],
    ["builder_agent_messages", "user_id", "users"],
  ];
  for (const [child, col, parent] of need) {
    const row = fks.rows.find((r) => bare(r.child) === child && r.cols === col);
    check(
      `${child}.${col} → ${parent} is CASCADE + NOT NULL + VALIDATED`,
      !!row &&
        bare(row.parent) === parent &&
        row.confdeltype === "c" &&
        row.not_null === true &&
        row.convalidated === true,
    );
  }

  console.log("\n=== 2. Orphan census (whole table) ===");
  const orphans = await client.query(`
    SELECT
      (SELECT count(*) FROM public.builder_agent_threads t
         LEFT JOIN public.workflows w ON w.id = t.workflow_id
        WHERE w.id IS NULL)::int AS threads_without_workflow,
      (SELECT count(*) FROM public.builder_agent_messages m
         LEFT JOIN public.builder_agent_threads t ON t.id = m.thread_id
        WHERE t.id IS NULL)::int AS messages_without_thread,
      (SELECT count(*) FROM public.builder_agent_messages m
         LEFT JOIN public.workflows w ON w.id = m.workflow_id
        WHERE w.id IS NULL)::int AS messages_without_workflow,
      (SELECT count(*) FROM public.builder_agent_threads t
         JOIN public.workflows w ON w.id = t.workflow_id
         LEFT JOIN public.account_memberships am
           ON am.account_id = w.account_id AND am.user_id = t.user_id
        WHERE am.user_id IS NULL)::int AS threads_whose_user_left_the_account,
      (SELECT count(*) FROM public.builder_agent_threads)::int AS total_threads,
      (SELECT count(*) FROM public.builder_agent_messages)::int AS total_messages`);
  const o = orphans.rows[0];
  console.log(`  totals: ${o.total_threads} thread(s), ${o.total_messages} message(s)`);
  check("no thread references a missing workflow", o.threads_without_workflow === 0);
  check("no message references a missing thread", o.messages_without_thread === 0);
  check("no message references a missing workflow", o.messages_without_workflow === 0);
  console.log(
    `  NOTE threads whose user is no longer an account member: ${o.threads_whose_user_left_the_account}` +
      " (not FK orphans — unreachable under RLS, reported for awareness)",
  );

  console.log("\n=== 3. Lifecycle, in a rolled-back transaction ===");
  const seed = await client.query(`
    SELECT w.account_id, am.user_id
      FROM public.workflows w
      JOIN public.account_memberships am ON am.account_id = w.account_id
     WHERE w.deleted_at IS NULL
     LIMIT 1`);
  if (seed.rowCount === 0) {
    console.log("  SKIP no account+member pair available to seed against.");
  } else {
    const { account_id: accountId, user_id: userId } = seed.rows[0];
    await client.query("BEGIN");

    async function makeWorkflow(name) {
      const r = await client.query(
        `INSERT INTO public.workflows (account_id, created_by_user_id, name, draft_definition)
         VALUES ($1,$2,$3,'{"nodes":[],"edges":[]}'::jsonb) RETURNING id`,
        [accountId, userId, name],
      );
      return r.rows[0].id;
    }
    async function makeThread(workflowId, turns) {
      const t = await client.query(
        `INSERT INTO public.builder_agent_threads (user_id, workflow_id)
         VALUES ($1,$2) RETURNING id`,
        [userId, workflowId],
      );
      const threadId = t.rows[0].id;
      for (let i = 0; i < turns; i++) {
        await client.query(
          `INSERT INTO public.builder_agent_messages
             (thread_id, user_id, workflow_id, role, kind, content, client_message_id)
           VALUES ($1,$2,$3,'user','prompt',$4,$5)`,
          [threadId, userId, workflowId, `turn ${i}`, `retention-${threadId}-${i}`],
        );
      }
      return threadId;
    }
    async function counts(workflowId) {
      const r = await client.query(
        `SELECT (SELECT count(*) FROM public.builder_agent_threads WHERE workflow_id=$1)::int AS threads,
                (SELECT count(*) FROM public.builder_agent_messages WHERE workflow_id=$1)::int AS messages`,
        [workflowId],
      );
      return r.rows[0];
    }

    const wfA = await makeWorkflow("RETENTION-VERIFY-A");
    const wfB = await makeWorkflow("RETENTION-VERIFY-B");
    await makeThread(wfA, 3);
    await makeThread(wfB, 2);
    check(
      "seeded: A has 1 thread / 3 messages, B has 1 thread / 2 messages",
      JSON.stringify(await counts(wfA)) === '{"threads":1,"messages":3}' &&
        JSON.stringify(await counts(wfB)) === '{"threads":1,"messages":2}',
    );

    // (1) SOFT delete — exactly what the trash service writes.
    await client.query(
      `UPDATE public.workflows
          SET state='deleted', deleted_at=now(), purge_after=now() + interval '7 days'
        WHERE id=$1`,
      [wfA],
    );
    const afterSoft = await counts(wfA);
    check(
      "soft-delete RETAINS the conversation (workflow row still exists)",
      afterSoft.threads === 1 && afterSoft.messages === 3,
    );

    // (2) RESTORE — the same rows are still there to come back to.
    await client.query(
      `UPDATE public.workflows
          SET state='draft', deleted_at=NULL, purge_after=NULL
        WHERE id=$1`,
      [wfA],
    );
    const afterRestore = await counts(wfA);
    check(
      "restore makes the SAME conversation available again",
      afterRestore.threads === 1 && afterRestore.messages === 3,
    );

    // (3)+(5) HARD delete A — cascade removes A only.
    await client.query(`DELETE FROM public.workflows WHERE id=$1`, [wfA]);
    const hardA = await counts(wfA);
    const untouchedB = await counts(wfB);
    check(
      "hard-delete cascades away A's thread AND every message",
      hardA.threads === 0 && hardA.messages === 0,
    );
    check(
      "deleting workflow A left workflow B's conversation untouched",
      untouchedB.threads === 1 && untouchedB.messages === 2,
    );

    // (4) ACCOUNT PURGE shape — accountPurge.deleteWorkflowsByAccount deletes
    // workflows BY ACCOUNT; the same cascade clears every conversation.
    const wfC = await makeWorkflow("RETENTION-VERIFY-C");
    await makeThread(wfC, 2);
    const before = await client.query(
      `SELECT count(*)::int AS n FROM public.builder_agent_threads t
         JOIN public.workflows w ON w.id = t.workflow_id
        WHERE w.account_id = $1`,
      [accountId],
    );
    await client.query(`DELETE FROM public.workflows WHERE account_id = $1`, [accountId]);
    const after = await client.query(
      `SELECT count(*)::int AS n FROM public.builder_agent_threads t
         JOIN public.workflows w ON w.id = t.workflow_id
        WHERE w.account_id = $1`,
      [accountId],
    );
    check(
      `account-purge delete-workflows-by-account cleared every conversation (${before.rows[0].n} → ${after.rows[0].n})`,
      before.rows[0].n > 0 && after.rows[0].n === 0,
    );

    // (7) The cascade is the DATABASE's, not a route's: every delete above was a
    // bare SQL DELETE with no application code in the path.
    OK("every deletion above was a bare SQL DELETE — no route/browser cleanup involved");

    await client.query("ROLLBACK");
    OK("transaction rolled back — nothing persisted");
  }
} catch (err) {
  failures++;
  console.error("\nERROR:", err.message);
  await client.query("ROLLBACK").catch(() => {});
} finally {
  await client.end();
}

console.log(failures ? `\nRESULT: ${failures} FAILURE(S)\n` : "\nRESULT: all checks passed\n");
process.exit(failures ? 1 : 0);
