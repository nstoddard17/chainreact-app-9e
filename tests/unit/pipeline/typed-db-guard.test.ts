/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1A — fail-closed proofs for the typed table-access guard.
 *
 * `tsc` cannot catch a regression here. Going back to the untyped client
 * (`getServiceRoleClient(...).from("accounts")`) compiles perfectly, because
 * that client's row generic is `any` — which is precisely how these
 * repositories ended up untyped in the first place. So the guard asserts the
 * SHAPE of the access, and every corruption class is proved against the real
 * CLI with crafted sources rather than by reading the repository.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const GUARD = resolve(ROOT, "scripts/ci/typed-db-guard.mjs");
const MANIFEST = resolve(ROOT, "scripts/ci/typed-db-manifest.json");

/** A migrated repository, written the way the batch established. */
const GOOD_SOURCE = `
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import type { TableRow } from "@/types/tables";

export async function load(accountId: string) {
  const supabase = getServiceRoleClient("reason");
  const db = asTypedDb(supabase);
  const { data } = await db.from("accounts").select("*").eq("id", accountId);
  return (data ?? []) as unknown as TableRow<"accounts">[];
}
`.replace(" as unknown as TableRow<\"accounts\">[]", "");

describe("typed-db guard — the real repository manifest", () => {
  it("PASSES for the committed manifest and reports what it covered", () => {
    const r = spawnSync(process.execPath, [GUARD, "check"], { encoding: "utf8", cwd: ROOT });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("TYPED-DB PASS");
    expect(r.stdout).toMatch(/migrated repositories: \d+/);
  });

  it("lists only files that exist, with no duplicates", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const files: string[] = manifest.migratedFiles;
    expect(files.length).toBeGreaterThan(0);
    expect(new Set(files).size).toBe(files.length);
    for (const f of files) {
      expect(() => readFileSync(resolve(ROOT, f), "utf8")).not.toThrow();
    }
  });

  it("covers the account + billing families this batch migrated", () => {
    const files: string[] = JSON.parse(readFileSync(MANIFEST, "utf8")).migratedFiles;
    for (const expected of [
      "repositories/accountBilling.ts",
      "repositories/accountDeletions.ts",
      "repositories/accounts.ts",
      "repositories/accountMemberships.ts",
    ]) {
      expect(files).toContain(expected);
    }
  });
});

describe("typed-db guard — fail-closed corruption proofs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "typed-db-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Write a crafted repository + manifest, then run the guard against them.
   *
   * The probe lives in this suite's OWN temp directory, never under
   * `repositories/`. It used to be written to `repositories/__guard_probe.ts`
   * and deleted in a `finally`, which raced every other suite that walks the
   * source tree — a dozen files in `tests/structure/` glob `repositories/**`,
   * list the probe, and then crash with ENOENT when this suite removes it
   * mid-read. The guard resolves manifest entries with `resolve(ROOT, rel)`,
   * so an absolute path outside the repo works exactly the same and the probe
   * is invisible to anything that scans the project.
   */
  function check(source: string, { file = "" } = {}) {
    const abs = file ? resolve(ROOT, file) : join(dir, "__guard_probe.ts");
    const entry = file || abs;
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ migratedFiles: [entry] }));
    writeFileSync(abs, source);
    try {
      return spawnSync(process.execPath, [GUARD, "check", "--manifest", manifestPath], {
        encoding: "utf8",
        cwd: ROOT,
      });
    } finally {
      rmSync(abs, { force: true });
    }
  }

  it("PASSES a correctly migrated repository", () => {
    const r = check(GOOD_SOURCE);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("TYPED-DB PASS");
  });

  it("fails when .from() runs on the UNTYPED client binding", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
export async function load() {
  const supabase = getServiceRoleClient("reason");
  const db = asTypedDb(supabase);
  void db;
  return supabase.from("accounts").select("*");
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(".from() on the UNTYPED client");
  });

  it("fails when .from() runs directly on getServiceRoleClient()", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
export async function load() {
  const db = asTypedDb(getServiceRoleClient("reason"));
  void db;
  return getServiceRoleClient("reason").from("accounts").select("*");
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("directly on getServiceRoleClient()");
  });

  it("fails a file listed as migrated that never obtains a typed client", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
export async function load() {
  const supabase = getServiceRoleClient("reason");
  return supabase.from("accounts").select("*");
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("never obtains a typed client");
  });

  it("fails on `as any`", () => {
    const r = check(`${GOOD_SOURCE}
export function bad(x: unknown) {
  return (x as any).id;
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("`as any` is not allowed");
  });

  it("fails on an `as unknown as` double cast of a database result", () => {
    const r = check(`${GOOD_SOURCE}
export function bad(x: unknown) {
  return x as unknown as { id: string; account_id: string; created_at: string };
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("double cast is not allowed");
  });

  it("fails on SupabaseClient<any>", () => {
    const r = check(`${GOOD_SOURCE}
import type { SupabaseClient } from "@supabase/supabase-js";
export type Bad = SupabaseClient<any>;
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("SupabaseClient<any>");
  });

  it("fails on a handwritten interface duplicating a generated table Row", () => {
    const r = check(`${GOOD_SOURCE}
interface AccountsRow {
  id: string;
  name: string;
  owner_user_id: string;
  deletion_status: string;
}
export type X = AccountsRow;
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("duplicates the generated");
  });

  it("does NOT flag a domain type whose fields merely share names with columns", () => {
    // `OwnedAccountSummary { id, name, type }` is a domain projection, not a row
    // duplicate — a guard that failed here would push authors back to casts.
    const r = check(`${GOOD_SOURCE}
export interface OwnedAccountSummary {
  id: string;
  name: string;
  type: string;
}
`);
    expect(r.status).toBe(0);
  });

  it("fails closed when a manifest entry does not exist", () => {
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ migratedFiles: ["repositories/__gone.ts"] }));
    const r = spawnSync(process.execPath, [GUARD, "check", "--manifest", manifestPath], {
      encoding: "utf8",
      cwd: ROOT,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("stale entry");
  });

  it("fails closed on a duplicate manifest entry", () => {
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({ migratedFiles: ["repositories/accounts.ts", "repositories/accounts.ts"] }),
    );
    const r = spawnSync(process.execPath, [GUARD, "check", "--manifest", manifestPath], {
      encoding: "utf8",
      cwd: ROOT,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("duplicate manifest entry");
  });

  it("fails closed on an empty manifest rather than passing vacuously", () => {
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ migratedFiles: [] }));
    const r = spawnSync(process.execPath, [GUARD, "check", "--manifest", manifestPath], {
      encoding: "utf8",
      cwd: ROOT,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing to pass a vacuous check");
  });

  it("fails closed when the manifest file is missing entirely", () => {
    const r = spawnSync(
      process.execPath,
      [GUARD, "check", "--manifest", join(dir, "nope.json")],
      { encoding: "utf8", cwd: ROOT },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("absence is never success");
  });

  it("rejects an unknown subcommand", () => {
    const r = spawnSync(process.execPath, [GUARD, "nope"], { encoding: "utf8", cwd: ROOT });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("unknown command");
  });

  // ── SUPABASE-TABLE-TYPING-1B: decision-driving JSON ─────────────────────
  // The generated type for these columns is `Json`, which carries no field
  // information — so a cast into a trusted domain type asserts a shape nothing
  // verified, on the value the engine replays.

  it.each([
    ["trigger_event", "row.trigger_event as TriggerEvent"],
    ["steps", "row.steps as WorkflowRunStep[]"],
    ["fatal_error", "row.fatal_error as WorkflowRunFatalError"],
    ["error_classification", "row.error_classification as ErrorClassification"],
  ])("fails when %s is cast directly into a trusted domain type", (_col, expr) => {
    const r = check(`${GOOD_SOURCE}
export function bad(row: { trigger_event: unknown; steps: unknown; fatal_error: unknown; error_classification: unknown }) {
  return ${expr};
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("decision-driving JSON column");
  });

  it("still allows keeping a JSON column AS Json (opaque storage)", () => {
    const r = check(`${GOOD_SOURCE}
export function fine(row: { trigger_event: unknown }) {
  return row.trigger_event as Json;
}
`);
    expect(r.status).toBe(0);
  });

  it("fails a manual .single<>() / .maybeSingle<>() generic on a TABLE query", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
export async function load(id: string) {
  const db = asTypedDb(getServiceRoleClient("reason"));
  const { data } = await db.from("accounts").select("id").eq("id", id).maybeSingle<{ id: string }>();
  return data;
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("overrides the generated inference on a table query");
  });

  it("does NOT flag a .single<RpcRow<...>>() generic on an RPC call", () => {
    // PostgREST function results are not inferred from the Database type, so
    // that generic is required — flagging it would push authors back to casts.
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import type { RpcRow } from "@/types/rpc";
export async function load(id: string) {
  const supabase = getServiceRoleClient("reason");
  const db = asTypedDb(supabase);
  void db;
  const { data } = await supabase
    .rpc("schedule_account_deletion", { p_account_id: id })
    .single<RpcRow<"schedule_account_deletion">>();
  return data;
}
`);
    expect(r.status).toBe(0);
  });

  // ── SUPABASE-TABLE-TYPING-1C: analytics JSON + write payloads ────────────

  it.each([
    ["widgets", "row.widgets as AnalyticsWidget[]"],
    ["result", "row.result as NormalizedAnalyticsResult"],
  ])("fails when the analytics JSON column %s is cast into a trusted type", (_col, expr) => {
    const r = check(`${GOOD_SOURCE}
export function bad(row: { widgets: unknown; result: unknown }) {
  return ${expr};
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("decision-driving JSON column");
  });

  it("still allows an analytics JSON column to stay opaque", () => {
    const r = check(`${GOOD_SOURCE}
export function fine(row: { widgets: unknown; result: unknown }) {
  return { widgets: row.widgets as unknown, result: row.result as Json };
}
`);
    expect(r.status).toBe(0);
  });

  it("fails on `as Json` inside an insert payload (write side)", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
export async function save(widgets: unknown) {
  const db = asTypedDb(getServiceRoleClient("reason"));
  await db.from("analytics_dashboards").insert({ account_id: "a", name: "n", widgets: widgets as Json });
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("asserts JSON-encodability");
  });

  it("fails on `as Json` inside a named `satisfies TableInsert<>` payload", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import type { TableInsert } from "@/types/tables";
export async function save(result: unknown) {
  const db = asTypedDb(getServiceRoleClient("reason"));
  const row = { cache_key: "k", result: result as Json } satisfies TableInsert<"analytics_source_snapshots">;
  await db.from("analytics_source_snapshots").upsert(row);
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("asserts JSON-encodability");
  });

  it("fails on an insert payload typed Record<string, unknown>", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
export async function save(name: string) {
  const db = asTypedDb(getServiceRoleClient("reason"));
  const row: Record<string, unknown> = { name };
  await db.from("analytics_dashboards").insert(row);
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("defeats the generated Insert/Update contract");
  });

  it("fails on an update payload built by a Record<string, unknown> factory", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
function toRow(name: string): Record<string, unknown> {
  return { name };
}
export async function save(id: string, name: string) {
  const db = asTypedDb(getServiceRoleClient("reason"));
  await db.from("analytics_dashboards").update(toRow(name)).eq("id", id);
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("defeats the generated Insert/Update contract");
  });

  it("does NOT flag Record<string, unknown> used as an ordinary DOMAIN type", () => {
    // workflowRuns.ts legitimately models a run's `output` that way — the rule
    // is about WRITE PAYLOADS, not about the type appearing in the file.
    const r = check(`${GOOD_SOURCE}
export interface RunView {
  output?: Readonly<Record<string, unknown>>;
}
export function describe2(o: Record<string, unknown>) {
  return Object.keys(o).length;
}
`);
    expect(r.status).toBe(0);
  });

  it("covers the analytics family in the committed manifest", () => {
    const files: string[] = JSON.parse(readFileSync(MANIFEST, "utf8")).migratedFiles;
    for (const expected of [
      "repositories/analyticsDashboards.ts",
      "repositories/analyticsSourceSnapshots.ts",
      "repositories/billingShadowComparisons.ts",
    ]) {
      expect(files).toContain(expected);
    }
    // Pure-RPC, no table access — listing it would fail the check by design.
    expect(files).not.toContain("repositories/analytics/queries.ts");
  });

  // ── SUPABASE-TABLE-TYPING-1D: the workflow graph ─────────────────────────

  it.each([
    ["draft_definition", "row.draft_definition as WorkflowDefinition"],
    ["checkpoint definition", "row.definition as WorkflowDefinition"],
    ["template definition", "row.definition as TemplateDefinition"],
  ])("fails when %s is cast into a trusted graph type", (_col, expr) => {
    const r = check(`${GOOD_SOURCE}
export function bad(row: { draft_definition: unknown; definition: unknown }) {
  return ${expr};
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("decision-driving JSON column");
  });

  it("fails on the `?? empty-graph` cast that hid a corrupt snapshot", () => {
    // The exact expression 1D removed from workflowCheckpoints/workflowTemplates.
    const r = check(`${GOOD_SOURCE}
export function bad(row: { definition: unknown }) {
  return (row.definition ?? { nodes: [], edges: [] }) as WorkflowDefinition;
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("decision-driving JSON column");
  });

  it("still allows a workflow definition column to stay opaque", () => {
    const r = check(`${GOOD_SOURCE}
export function fine(row: { draft_definition: unknown }) {
  return row.draft_definition as Json;
}
`);
    expect(r.status).toBe(0);
  });

  it("fails on `as Json` in a workflow insert payload", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
export async function save(definition: unknown) {
  const db = asTypedDb(getServiceRoleClient("reason"));
  await db.from("workflows").insert({ account_id: "a", name: "n", draft_definition: definition as Json });
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("asserts JSON-encodability");
  });

  it("fails on a workflow lifecycle update payload typed Record<string, unknown>", () => {
    const r = check(`
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
export async function transition(id: string, to: string) {
  const db = asTypedDb(getServiceRoleClient("reason"));
  const update: Record<string, unknown> = { state: to };
  await db.from("workflows").update(update).eq("id", id);
}
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("defeats the generated Insert/Update contract");
  });

  it("fails on a handwritten workflows row duplicate", () => {
    const r = check(`${GOOD_SOURCE}
interface WorkflowsRow {
  id: string;
  account_id: string;
  created_by_user_id: string;
  name: string;
  state: string;
}
export type Keep = WorkflowsRow;
`);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("duplicates the generated `workflows` Row");
  });

  it("covers the workflow definition + lifecycle family in the committed manifest", () => {
    const files: string[] = JSON.parse(readFileSync(MANIFEST, "utf8")).migratedFiles;
    for (const expected of [
      "repositories/workflows.ts",
      "repositories/workflowsTrash.ts",
      "repositories/workflowFolders.ts",
      "repositories/workflowCheckpoints.ts",
      "repositories/workflowTemplates.ts",
    ]) {
      expect(files).toContain(expected);
    }
  });

  it("covers the workflow-run family in the committed manifest", () => {
    const files: string[] = JSON.parse(readFileSync(MANIFEST, "utf8")).migratedFiles;
    for (const expected of [
      "repositories/workflowRuns.ts",
      "repositories/workflowRunsLifecycle.ts",
      "repositories/workflowRunsQueue.ts",
      "repositories/workflowRunsDiagnostics.ts",
    ]) {
      expect(files).toContain(expected);
    }
  });
});
