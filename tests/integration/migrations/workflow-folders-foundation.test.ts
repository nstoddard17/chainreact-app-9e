/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-FOLDERS-2 / WF-1 — static guard over the workflow folders +
 * trash foundation migration. Always runs (no DB) — it parses the migration SQL
 * and asserts the schema/RLS/GRANT/trigger surface the plan
 * (docs/slices/phase-4/workflow-folders-trash-plan.md) requires, AND asserts the
 * later-slice behaviors (CRUD / restore / purge / UI / lifecycle change) are
 * deliberately ABSENT in this slice.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "20260603000000_workflow_folders_and_trash.sql";
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations", MIGRATION),
  "utf8",
);

// Whitespace-insensitive contains helper for multi-token SQL fragments.
function has(fragment: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  return norm(sql).includes(norm(fragment));
}

// Executable DDL only — `--` line comments stripped. The scope-fence checks run
// against this so prose like "batch-restore lookups" doesn't trip them.
const code = sql.replace(/--[^\n]*/g, "");

describe("WF-1 migration — workflow_folders table", () => {
  it("creates public.workflow_folders", () => {
    expect(has("CREATE TABLE public.workflow_folders")).toBe(true);
  });

  it.each([
    "id uuid PRIMARY KEY",
    "account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT",
    "parent_folder_id uuid REFERENCES public.workflow_folders(id) ON DELETE RESTRICT",
    "name text NOT NULL",
    "position integer NOT NULL DEFAULT 0",
    "created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "created_at timestamptz NOT NULL DEFAULT now()",
    "updated_at timestamptz NOT NULL DEFAULT now()",
    "deleted_at timestamptz",
    "deleted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "purge_after timestamptz",
    "deleted_from_parent_folder_id uuid",
    "delete_operation_id uuid",
  ])("declares column/constraint: %s", (frag) => {
    expect(has(frag)).toBe(true);
  });
});

describe("WF-1 migration — workflows folder/trash columns", () => {
  it("alters public.workflows", () => {
    expect(has("ALTER TABLE public.workflows")).toBe(true);
  });

  it.each([
    "ADD COLUMN folder_id uuid REFERENCES public.workflow_folders(id) ON DELETE RESTRICT",
    "ADD COLUMN deleted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL",
    "ADD COLUMN purge_after timestamptz",
    "ADD COLUMN deleted_from_folder_id uuid",
    "ADD COLUMN delete_operation_id uuid",
  ])("adds column: %s", (frag) => {
    expect(has(frag)).toBe(true);
  });
});

describe("WF-1 migration — indexes", () => {
  it.each([
    "workflow_folders_account_parent_position_idx",
    "workflow_folders_purge_after_idx",
    "workflow_folders_delete_operation_id_idx",
    "workflow_folders_unique_sibling_name_live",
    "workflows_account_folder_idx",
    "workflows_purge_after_idx",
    "workflows_delete_operation_id_idx",
  ])("creates index: %s", (name) => {
    expect(sql).toContain(name);
  });

  it("sibling-name uniqueness index is UNIQUE, lower(name)-cased, NULLS NOT DISTINCT, live-only", () => {
    expect(has("CREATE UNIQUE INDEX workflow_folders_unique_sibling_name_live")).toBe(true);
    expect(has("(account_id, parent_folder_id, lower(name))")).toBe(true);
    expect(has("NULLS NOT DISTINCT")).toBe(true);
    // both purge/list partial predicates must be present somewhere
    expect(sql).toMatch(/WHERE\s+deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/WHERE\s+deleted_at\s+IS\s+NOT\s+NULL/i);
  });
});

describe("WF-1 migration — RLS + GRANTs", () => {
  it("enables RLS on workflow_folders", () => {
    expect(has("ALTER TABLE public.workflow_folders ENABLE ROW LEVEL SECURITY")).toBe(true);
  });

  it.each([
    "workflow_folders_select_account_member",
    "workflow_folders_insert_account_member",
    "workflow_folders_update_account_member",
    "workflow_folders_delete_account_member",
  ])("declares account-membership policy: %s", (policy) => {
    expect(sql).toContain(policy);
  });

  it("policies scope by account_memberships of auth.uid()", () => {
    expect(has("FROM public.account_memberships am")).toBe(true);
    expect(has("am.user_id = auth.uid()")).toBe(true);
    expect(has("am.account_id = workflow_folders.account_id")).toBe(true);
  });

  it("grants Data API access to authenticated and service_role", () => {
    expect(has("GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_folders TO authenticated")).toBe(true);
    expect(has("GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_folders TO service_role")).toBe(true);
  });
});

describe("WF-1 migration — same-account safety triggers", () => {
  it("declares both enforcement functions as SECURITY DEFINER", () => {
    expect(has("FUNCTION public.workflow_folders_enforce_same_account_parent()")).toBe(true);
    expect(has("FUNCTION public.workflows_enforce_same_account_folder()")).toBe(true);
    // SECURITY DEFINER is mandatory — FK checks bypass RLS, so an RLS-subject
    // lookup would not see a cross-account folder and would wrongly allow it.
    expect((sql.match(/SECURITY DEFINER/gi) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("wires both triggers BEFORE INSERT OR UPDATE", () => {
    expect(has("CREATE TRIGGER workflow_folders_enforce_same_account_parent")).toBe(true);
    expect(has("CREATE TRIGGER workflows_enforce_same_account_folder")).toBe(true);
    expect((sql.match(/BEFORE INSERT OR UPDATE/gi) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("raises stable, testable violation prefixes", () => {
    expect(sql).toContain("workflow_folders_same_account_violation");
    expect(sql).toContain("workflows_same_account_violation");
  });
});

describe("WF-1 migration — scope fences (later-slice behavior is ABSENT)", () => {
  it("does NOT alter the workflow_state enum or add a restore value (WF-3 owns that)", () => {
    expect(/ADD\s+VALUE/i.test(code)).toBe(false);
    expect(/ALTER\s+TYPE\s+public\.workflow_state/i.test(code)).toBe(false);
  });

  it("does NOT mutate existing rows (no backfill / movement / lifecycle change)", () => {
    expect(/UPDATE\s+public\.workflows/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM/i.test(code)).toBe(false);
  });

  it("does NOT create a purge cron / restore RPC in this slice", () => {
    expect(/purge[_-]trashed/i.test(code)).toBe(false);
    // no executable function/object actually named for restore behavior
    expect(/restore/i.test(code)).toBe(false);
    expect(/purgeDue/i.test(code)).toBe(false);
  });
});
