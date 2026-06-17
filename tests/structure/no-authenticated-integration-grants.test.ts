/**
 * @jest-environment node
 *
 * Regression guard: every SERVICE-ROLE-ONLY table must keep `authenticated` at
 * ZERO direct Data API privileges (no SELECT / INSERT / UPDATE / DELETE), so a
 * regular member can never read or mutate those rows directly via PostgREST/
 * supabase-js — every access flows through a membership-gated service-role path.
 *
 * V2-READY-47E introduced this for `public.integrations` (47B revoked
 * INSERT/UPDATE/DELETE; 47D revoked SELECT). V2-READY-50 generalized it to the
 * SET below and added `public.trigger_resources` (50 revoked all four — trigger
 * rows are lifecycle infrastructure, never client-edited). V2-READY-52 added
 * `public.workflow_files` (52 revoked the unused SELECT — file rows are
 * engine-managed output metadata, never client-read). V2-READY-51 added
 * `public.workflow_runs` (51 revoked SELECT — run rows carry raw
 * trigger_event / steps / fatal_error payloads; every client read now flows
 * through a membership-gated service-role repository + a sanitized DTO).
 *
 * It REPLAYS every GRANT/REVOKE on each table for `authenticated` across the whole
 * migration corpus (chronological filename order) and asserts the NET effective
 * privilege set is empty. Net-replay — rather than flagging individual statements —
 * lets the historical broad GRANT (`20260619000000`, later fully revoked) pass while
 * a FUTURE re-GRANT not matched by a REVOKE fails loudly, naming the migration.
 *
 * Narrow by construction: only the listed tables × `authenticated`. It does not
 * touch other tables' grants, `service_role`, or RLS policies.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const WRITE_PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
type Priv = (typeof WRITE_PRIVS)[number];

/** Tables that must be service-role-only at the Data API (zero authenticated grant). */
const SERVICE_ROLE_ONLY_TABLES = [
  "integrations",
  "trigger_resources",
  "workflow_files",
  "workflow_runs",
] as const;

/** One GRANT/REVOKE on `public.<table>` for authenticated, with its privileges. */
interface GrantStmt {
  op: "GRANT" | "REVOKE";
  privs: ReadonlySet<Priv>;
  file: string;
}

/**
 * Extract every GRANT/REVOKE statement in `sql` that targets `public.<table>` AND
 * the `authenticated` role, with the SELECT/INSERT/UPDATE/DELETE privileges it
 * names (`ALL` expands to all four). Line-anchored on GRANT/REVOKE so the keyword
 * inside a `--` comment can't spawn a phantom match; each statement runs to its
 * terminating `;`.
 */
function parseAuthenticatedGrants(sql: string, table: string, file: string): GrantStmt[] {
  const onTable = new RegExp(`\\bON\\s+public\\.${table}\\b`, "i");
  const out: GrantStmt[] = [];
  for (const m of sql.matchAll(/^[ \t]*(GRANT|REVOKE)\b[\s\S]*?;/gim)) {
    const stmt = m[0];
    const keyword = (m[1] ?? "").toUpperCase();
    if (!onTable.test(stmt)) continue;
    if (!/\bauthenticated\b/i.test(stmt)) continue;

    // Privileges are named before `ON`. The GRANT/REVOKE keyword itself contains
    // none of SELECT/INSERT/UPDATE/DELETE/ALL, so including it is harmless.
    const onIdx = stmt.search(/\bON\b/i);
    const privText = stmt.slice(0, onIdx);
    const privs = new Set<Priv>();
    if (/\bALL\b/i.test(privText)) {
      for (const p of WRITE_PRIVS) privs.add(p);
    } else {
      for (const p of WRITE_PRIVS) {
        if (new RegExp(`\\b${p}\\b`, "i").test(privText)) privs.add(p);
      }
    }
    out.push({ op: keyword as "GRANT" | "REVOKE", privs, file });
  }
  return out;
}

/** Replay statements (in order) into the net privilege set authenticated holds. */
function replayNet(statements: readonly GrantStmt[]): Set<Priv> {
  const net = new Set<Priv>();
  for (const s of statements) {
    for (const p of s.privs) {
      if (s.op === "GRANT") net.add(p);
      else net.delete(p);
    }
  }
  return net;
}

/** Replay all migrations (chronological) → the net authenticated privileges on `table`. */
function netAuthenticatedPrivs(table: string): {
  net: Set<Priv>;
  lastGrantBy: Map<Priv, string>;
  statements: GrantStmt[];
} {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const net = new Set<Priv>();
  const lastGrantBy = new Map<Priv, string>();
  const statements: GrantStmt[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const s of parseAuthenticatedGrants(sql, table, file)) {
      statements.push(s);
      for (const p of s.privs) {
        if (s.op === "GRANT") {
          net.add(p);
          lastGrantBy.set(p, file);
        } else {
          net.delete(p);
        }
      }
    }
  }
  return { net, lastGrantBy, statements };
}

describe("guardrail — service-role-only tables hold ZERO authenticated grants (V2-READY-47E/50/51/52)", () => {
  it.each(SERVICE_ROLE_ONLY_TABLES)(
    "authenticated holds ZERO direct privileges on public.%s (net across all migrations)",
    (table) => {
      const { net, lastGrantBy, statements } = netAuthenticatedPrivs(table);
      if (net.size > 0) {
        const offenders = [...net]
          .map((p) => `  • ${p} (last granted by ${lastGrantBy.get(p) ?? "?"})`)
          .join("\n");
        throw new Error(
          `public.${table} grants ${net.size} privilege(s) to \`authenticated\`:\n` +
            offenders +
            "\n\n" +
            `public.${table} must stay SERVICE-ROLE-ONLY. The \`authenticated\` role must\n` +
            "have NO direct SELECT/INSERT/UPDATE/DELETE — a member could otherwise read/mutate\n" +
            "a co-member's row directly via PostgREST, bypassing the membership-gated service-\n" +
            "role path. If a new migration needs the grant, it almost certainly does NOT: route\n" +
            "the access through a service-role repository + safe DTO instead. See\n" +
            "docs/slices/phase-4/readiness/v2-ready-47e-integrations-access-closeout.md and\n" +
            "docs/slices/phase-4/readiness/v2-ready-50-trigger-resources-service-role-only.md.",
        );
      }
      // Sanity: the corpus DID touch these grants (so a silently-empty parse can't
      // make the guard vacuously pass).
      expect(statements.length).toBeGreaterThan(0);
      expect(net.size).toBe(0);
    },
  );

  // Classification — pin the parser so its definition can't silently drift.
  describe("parser classification", () => {
    it("nets a GRANT-all then full REVOKE to empty (the real arc shape)", () => {
      const sql = [
        "GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;",
        "REVOKE INSERT, UPDATE, DELETE ON public.integrations FROM authenticated;",
        "REVOKE SELECT ON public.integrations FROM authenticated;",
      ].join("\n");
      const net = replayNet(parseAuthenticatedGrants(sql, "integrations", "x.sql"));
      expect(net.size).toBe(0);
    });

    it("nets the single combined REVOKE to empty (the trigger_resources shape)", () => {
      const sql = [
        "GRANT SELECT, INSERT, UPDATE, DELETE ON public.trigger_resources TO authenticated;",
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON public.trigger_resources FROM authenticated;",
      ].join("\n");
      const net = replayNet(parseAuthenticatedGrants(sql, "trigger_resources", "x.sql"));
      expect(net.size).toBe(0);
    });

    it("FLAGS a future re-GRANT (net becomes non-empty)", () => {
      const sql =
        "REVOKE SELECT ON public.integrations FROM authenticated;\n" +
        "GRANT SELECT ON public.integrations TO authenticated;"; // the regression
      const net = replayNet(parseAuthenticatedGrants(sql, "integrations", "future.sql"));
      expect(net.has("SELECT")).toBe(true);
    });

    it("expands GRANT ALL to all four privileges", () => {
      const stmts = parseAuthenticatedGrants(
        "GRANT ALL ON public.integrations TO authenticated;",
        "integrations",
        "x.sql",
      );
      expect([...stmts[0]!.privs].sort()).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    });

    it("ignores grants on OTHER tables and OTHER roles, and partial-name collisions", () => {
      const sql = [
        "GRANT SELECT ON public.workflows TO authenticated;", // other table
        "GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO service_role;", // other role
        "-- GRANT SELECT ON public.integrations TO authenticated;", // commented out
        "GRANT SELECT ON public.trigger_resources_archive TO authenticated;", // \b prevents prefix match
      ].join("\n");
      expect(parseAuthenticatedGrants(sql, "integrations", "x.sql")).toHaveLength(0);
      expect(parseAuthenticatedGrants(sql, "trigger_resources", "x.sql")).toHaveLength(0);
    });
  });
});
