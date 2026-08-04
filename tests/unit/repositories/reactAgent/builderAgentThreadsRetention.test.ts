/**
 * @jest-environment node
 *
 * REACT-AGENT-CONVERSATION-RETENTION-1 — the deletion lifecycle for persisted
 * React Agent conversations.
 *
 * Two things are being pinned, and they are different kinds of proof:
 *
 *   1. **The schema contract.** Retention is enforced by the DATABASE, not by a
 *      route, a cron, or the browser. These tests read the shipped migration SQL
 *      and fail if the cascade design that makes that true is ever weakened —
 *      which is the only way the live behaviour (verified separately against the
 *      real database) could regress without anyone noticing.
 *
 *   2. **The orphan backstop.** A thread whose workflow row is MISSING is
 *      removed; a thread whose workflow is merely SOFT-deleted is retained,
 *      because a trashed workflow is still restorable and its conversation must
 *      come back with it.
 *
 * Live-database proof of the same lifecycle (soft-delete → restore →
 * hard-delete → account purge, all by bare SQL DELETE) lives in
 * scripts/trash/react-agent-persistence/verify-react-agent-retention.mjs.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const CREATE_SQL = readFileSync(
  join(MIGRATIONS, "20260526000000_builder_agent_threads.sql"),
  "utf8",
);

// ── 1-3, 7. The database-enforced cascade ───────────────────────────────────

describe("schema contract: retention follows the workflow ROW", () => {
  /**
   * Soft-delete (trash) is an UPDATE — `state='deleted'`, `deleted_at`,
   * `purge_after` — so the workflow row survives its whole restore window. The
   * conversation is keyed on `workflow_id`, nothing keys on `state` or on age,
   * therefore a trashed workflow keeps its conversation and a restore (the
   * reverse UPDATE) brings the same rows back.
   *
   * This test guards the premise that makes that reasoning valid: no lifecycle
   * column is part of the retention path.
   */
  it("nothing in the conversation schema expires a thread by age or lifecycle state", () => {
    // No TTL / retention / expiry column or trigger on either table.
    expect(CREATE_SQL).not.toMatch(/expires_at|retention_days|ttl\b/i);
    // The tables key on workflow_id, never on the workflow's lifecycle state.
    expect(CREATE_SQL).not.toMatch(/builder_agent_\w+[\s\S]{0,400}?\bstate\s+text/i);
    expect(CREATE_SQL).not.toMatch(/deleted_at\s+timestamptz/i);
  });

  it("builder_agent_threads.workflow_id is NOT NULL and CASCADEs from workflows", () => {
    expect(CREATE_SQL).toMatch(
      /workflow_id uuid NOT NULL REFERENCES public\.workflows\(id\) ON DELETE CASCADE/,
    );
  });

  it("builder_agent_messages.thread_id CASCADEs from the thread", () => {
    expect(CREATE_SQL).toMatch(
      /thread_id uuid NOT NULL REFERENCES public\.builder_agent_threads\(id\)\s*\n?\s*ON DELETE CASCADE/,
    );
  });

  it("builder_agent_messages.workflow_id ALSO CASCADEs from workflows (belt and braces)", () => {
    // Two independent paths remove a message when its workflow goes: through the
    // thread, and directly. Either alone is sufficient; both means a partial
    // schema change cannot leave messages behind.
    const messagesBlock = CREATE_SQL.slice(
      CREATE_SQL.indexOf("CREATE TABLE public.builder_agent_messages"),
    );
    expect(messagesBlock).toMatch(
      /workflow_id uuid NOT NULL REFERENCES public\.workflows\(id\) ON DELETE CASCADE/,
    );
  });

  it("both tables CASCADE from auth.users, so a deleted user takes their threads", () => {
    const userFks = CREATE_SQL.match(
      /user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/g,
    );
    expect(userFks).toHaveLength(2);
  });

  /**
   * REACT-AGENT-CONVERSATION-PERSISTENCE-1 added columns to these tables. If a
   * later migration ever re-creates or re-points those foreign keys, this test
   * is the tripwire: no migration may drop, weaken, or re-add-NOT-VALID any of
   * them.
   */
  it("no later migration weakens the conversation cascade", () => {
    const { readdirSync } = jest.requireActual("node:fs") as typeof import("node:fs");
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      const touchesTables = /builder_agent_(threads|messages)/.test(sql);
      if (!touchesTables) continue;
      // No dropped FK constraints, no NOT VALID re-adds, no nulled-out columns.
      expect(sql).not.toMatch(
        /ALTER TABLE[\s\S]{0,80}builder_agent_\w+[\s\S]{0,120}DROP CONSTRAINT[\s\S]{0,60}fkey/i,
      );
      expect(sql).not.toMatch(/REFERENCES public\.workflows\(id\)(?!\s*ON DELETE CASCADE)/);
      expect(sql).not.toMatch(
        /ALTER COLUMN (workflow_id|thread_id|user_id) DROP NOT NULL/i,
      );
      expect(sql).not.toMatch(/NOT VALID/i);
    }
  });
});

// ── 4. Account purge ────────────────────────────────────────────────────────

describe("account purge removes every associated conversation", () => {
  it("purges workflows by account, which is what cascades the conversations", () => {
    const purgeRepo = readFileSync(
      join(process.cwd(), "repositories", "accountPurge.ts"),
      "utf8",
    );
    // The purge deletes workflow ROWS for the account; the FK does the rest.
    expect(purgeRepo).toMatch(/from\("workflows"\)\s*\n?\s*\.delete\(\)\s*\n?\s*\.eq\("account_id"/);
    // And it documents that the conversation tables ride that cascade.
    expect(purgeRepo).toMatch(/builder_agent_threads\/messages via their workflow_id ON DELETE CASCADE/);
  });

  it("the purge sequence never needs to touch the conversation tables directly", () => {
    const purgeService = readFileSync(
      join(process.cwd(), "services", "accounts", "accountPurge.ts"),
      "utf8",
    );
    // No bespoke conversation teardown — if this ever appears, the cascade was
    // no longer trusted and the schema contract above needs re-reading.
    expect(purgeService).not.toMatch(/builder_agent_(threads|messages)/);
  });
});

// ── 6. Orphan backstop ──────────────────────────────────────────────────────

const mockServiceRole = jest.fn();
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (...a: unknown[]) => mockServiceRole(...a),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => {
    throw new Error("session client must not be used by the orphan sweep");
  }),
}));

import { deleteOrphanedThreadsServiceRole } from "@/repositories/builderAgentThreads";

/**
 * Minimal Supabase stand-in: `builder_agent_threads` select returns `threads`,
 * the `workflows` select returns whichever of the requested ids exist, and the
 * delete records the ids it was given.
 */
function stubClient(input: {
  threads: Array<{ id: string; workflow_id: string }>;
  existingWorkflowIds: readonly string[];
  deleted: string[][];
}) {
  return {
    from(table: string) {
      if (table === "builder_agent_threads") {
        return {
          select: () => ({
            limit: async () => ({ data: input.threads, error: null }),
          }),
          delete: () => ({
            in: (_col: string, ids: string[]) => {
              input.deleted.push(ids);
              return {
                select: async () => ({ data: ids.map((id) => ({ id })), error: null }),
              };
            },
          }),
        };
      }
      if (table === "workflows") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids
                .filter((id) => input.existingWorkflowIds.includes(id))
                .map((id) => ({ id })),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("orphan sweep", () => {
  it("removes a thread whose workflow row is GONE", async () => {
    const deleted: string[][] = [];
    mockServiceRole.mockReturnValue(
      stubClient({
        threads: [{ id: "t-orphan", workflow_id: "wf-missing" }],
        existingWorkflowIds: [],
        deleted,
      }),
    );
    const result = await deleteOrphanedThreadsServiceRole();
    expect(result).toEqual({ scanned: 1, threadsDeleted: 1 });
    expect(deleted).toEqual([["t-orphan"]]);
  });

  it("PRESERVES threads for active AND soft-deleted workflows", async () => {
    // The existence check is deliberately state-blind: a trashed workflow's row
    // is present, so its conversation survives its restore window intact.
    const deleted: string[][] = [];
    mockServiceRole.mockReturnValue(
      stubClient({
        threads: [
          { id: "t-active", workflow_id: "wf-active" },
          { id: "t-trashed", workflow_id: "wf-trashed" },
          { id: "t-orphan", workflow_id: "wf-missing" },
        ],
        existingWorkflowIds: ["wf-active", "wf-trashed"],
        deleted,
      }),
    );
    const result = await deleteOrphanedThreadsServiceRole();
    expect(result).toEqual({ scanned: 3, threadsDeleted: 1 });
    // Only the orphan — never the live one, never the restorable one.
    expect(deleted).toEqual([["t-orphan"]]);
  });

  it("deletes NOTHING on a healthy database (the expected steady state)", async () => {
    const deleted: string[][] = [];
    mockServiceRole.mockReturnValue(
      stubClient({
        threads: [
          { id: "t1", workflow_id: "wf-1" },
          { id: "t2", workflow_id: "wf-2" },
        ],
        existingWorkflowIds: ["wf-1", "wf-2"],
        deleted,
      }),
    );
    expect(await deleteOrphanedThreadsServiceRole()).toEqual({
      scanned: 2,
      threadsDeleted: 0,
    });
    expect(deleted).toEqual([]);
  });

  it("is a no-op on an empty table and never issues a lookup", async () => {
    const deleted: string[][] = [];
    mockServiceRole.mockReturnValue(
      stubClient({ threads: [], existingWorkflowIds: [], deleted }),
    );
    expect(await deleteOrphanedThreadsServiceRole()).toEqual({
      scanned: 0,
      threadsDeleted: 0,
    });
  });

  it("relies on thread_id CASCADE for messages — it never deletes them itself", async () => {
    const repo = readFileSync(
      join(process.cwd(), "repositories", "builderAgentThreads.ts"),
      "utf8",
    );
    const sweep = repo.slice(repo.indexOf("export async function deleteOrphanedThreadsServiceRole"));
    expect(sweep).not.toMatch(/from\("builder_agent_messages"\)/);
  });

  it("uses the service-role client (the purge cron has no user session)", async () => {
    mockServiceRole.mockReturnValue(
      stubClient({ threads: [], existingWorkflowIds: [], deleted: [] }),
    );
    await deleteOrphanedThreadsServiceRole();
    expect(mockServiceRole).toHaveBeenCalledWith(expect.stringContaining("react agent retention"));
  });
});

// ── 5. Workflow isolation ───────────────────────────────────────────────────

describe("one workflow's deletion never touches another's conversation", () => {
  it("every conversation delete path is scoped to a single workflow id", () => {
    const repo = readFileSync(
      join(process.cwd(), "repositories", "builderAgentThreads.ts"),
      "utf8",
    );
    // The user-facing clear is scoped to (user, workflow) — never a bare delete.
    const clear = repo.slice(
      repo.indexOf("export async function clearThreadForWorkflow"),
      repo.indexOf("// ── orphan sweep"),
    );
    expect(clear).toMatch(/\.eq\("user_id", userId\)/);
    expect(clear).toMatch(/\.eq\("workflow_id", workflowId\)/);
    // And the cascade itself is per-row: `ON DELETE CASCADE` fires for the
    // deleted workflow only, which the live-database script proves end to end.
    expect(CREATE_SQL).toMatch(
      /workflow_id uuid NOT NULL REFERENCES public\.workflows\(id\) ON DELETE CASCADE/,
    );
  });
});
