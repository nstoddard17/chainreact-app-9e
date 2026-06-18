/**
 * @jest-environment node
 *
 * V2-READY-53 regression guard: sensitive `security_invoker` views over
 * service-role-only base tables must be read ONLY through a service-role
 * repository — never the authenticated SSR-cookie client.
 *
 * Why this exists:
 *   A `security_invoker=true` view executes with the INVOKER's privileges, so
 *   reading it as `authenticated` requires SELECT on the underlying base table.
 *   V2-READY-51 revoked `authenticated` SELECT on `workflow_runs`; the
 *   authenticated read of the `workflow_run_stats` view (a security_invoker view
 *   over `workflow_runs`) then began failing `42501 permission denied for table
 *   workflow_runs`, which 500'd the authenticated `/workflows` shell + GET
 *   /api/workflows (prod incident, digest 721086474). The hotfix `e1ad28d82`
 *   moved the read to a service-role repository.
 *
 * Audit basis (V2-READY-53): a full prod view introspection found
 *   `workflow_run_stats` is the ONLY public view AND the only security_invoker
 *   view over a locked base table (`workflow_runs`). The DB-level proof lives in
 *   the gated `tests/integration/security/workflow-run-stats-account.test.ts`
 *   (authenticated SELECT on the view → 42501; service-role read works). This
 *   static guard is the CI-runnable counterpart: it pins the CODE-side invariant
 *   so a future change can't silently re-introduce an authenticated read.
 *
 * If a future migration adds another view over a service-role-only table, add it
 * to SENSITIVE_VIEWS below (and gate its app read through service-role).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Views whose base table(s) are service-role-only (no authenticated SELECT). */
const SENSITIVE_VIEWS = ["workflow_run_stats"] as const;

/** Roots that can contain a Supabase read. */
const SCAN_ROOTS = ["repositories", "app", "services"] as const;
const ROOT = resolve(process.cwd());

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next") continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

const ALL_FILES = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));

/** Files that contain a `.from("<view>")` read for the given view. */
function readersOf(view: string): string[] {
  const re = new RegExp(`\\.from\\(\\s*["'\`]${view}["'\`]\\s*\\)`);
  return ALL_FILES.filter((f) => re.test(readFileSync(f, "utf8")));
}

const USES_SERVICE_ROLE = /getServiceRoleClient\s*\(/;
const IMPORTS_AUTH_CLIENT = /from\s+["']@\/utils\/supabase\/server["']/;

describe("V2-READY-53 — sensitive security_invoker views are read via service-role only", () => {
  it.each(SENSITIVE_VIEWS)(
    "every reader of the %s view uses getServiceRoleClient and NOT the authenticated client",
    (view) => {
      const readers = readersOf(view);

      // Non-vacuous: the known reader must be found (catches a renamed view /
      // broken scan that would make the guard silently pass).
      expect(readers.length).toBeGreaterThan(0);

      // A security_invoker view over a service-role-only table 42501s when read
      // as authenticated — route the read through a service-role repository +
      // an explicit account/workflow membership gate (see workflowRunStats.ts).
      const offenders: string[] = [];
      for (const file of readers) {
        const src = readFileSync(file, "utf8");
        const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
        if (!USES_SERVICE_ROLE.test(src)) {
          offenders.push(`${rel} — reads "${view}" but does NOT use getServiceRoleClient`);
        }
        if (IMPORTS_AUTH_CLIENT.test(src)) {
          offenders.push(
            `${rel} — reads "${view}" AND imports the authenticated @/utils/supabase/server client`,
          );
        }
      }
      expect(offenders).toEqual([]);
    },
  );

  it("the SENSITIVE_VIEWS list is non-empty (guard isn't vacuous)", () => {
    expect(SENSITIVE_VIEWS.length).toBeGreaterThan(0);
  });
});
