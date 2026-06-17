/**
 * @jest-environment node
 *
 * V2-READY-47E — regression guard: `public.integrations` must stay SERVICE-ROLE-
 * ONLY at the Data API. The `authenticated` role must have ZERO direct table
 * privileges (no SELECT / INSERT / UPDATE / DELETE) on `public.integrations`, so a
 * regular member can never read or mutate a co-member's credential row directly
 * via PostgREST/supabase-js — every access flows through a membership-gated
 * service-role path + safe DTO.
 *
 * V2-READY-47B revoked INSERT/UPDATE/DELETE; 47D revoked SELECT. This guard keeps
 * those revokes from being silently undone: it REPLAYS every GRANT/REVOKE on
 * `public.integrations` for `authenticated` across the whole migration corpus (in
 * chronological filename order) and asserts the NET effective privilege set is
 * empty. Replaying the net — rather than flagging individual statements — is what
 * lets the historical `20260619000000` GRANT (later fully revoked) pass while a
 * FUTURE re-GRANT that isn't matched by a REVOKE fails loudly.
 *
 * Narrow by construction: only `public.integrations` × `authenticated`. It does
 * not touch any other table's grants, `service_role`, or RLS policies.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const WRITE_PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
type Priv = (typeof WRITE_PRIVS)[number];

/** One GRANT/REVOKE on public.integrations for authenticated, with its privileges. */
interface GrantStmt {
  op: "GRANT" | "REVOKE";
  privs: ReadonlySet<Priv>;
  file: string;
}

/**
 * Extract every GRANT/REVOKE statement in `sql` that targets `public.integrations`
 * AND the `authenticated` role, with the SELECT/INSERT/UPDATE/DELETE privileges it
 * names (`ALL` expands to all four). Line-anchored on GRANT/REVOKE so the keyword
 * inside a `--` comment can't spawn a phantom match; each statement runs to its
 * terminating `;`.
 */
function parseAuthenticatedIntegrationsGrants(sql: string, file: string): GrantStmt[] {
  const out: GrantStmt[] = [];
  for (const m of sql.matchAll(/^[ \t]*(GRANT|REVOKE)\b[\s\S]*?;/gim)) {
    const stmt = m[0];
    const keyword = (m[1] ?? "").toUpperCase();
    if (!/\bON\s+public\.integrations\b/i.test(stmt)) continue;
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

/** Replay all statements (chronological) → the net privileges authenticated holds. */
function netAuthenticatedIntegrationsPrivs(): {
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
    for (const s of parseAuthenticatedIntegrationsGrants(sql, file)) {
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

describe("guardrail — public.integrations is service-role-only for authenticated (V2-READY-47E)", () => {
  it("authenticated holds ZERO direct privileges on public.integrations (net across all migrations)", () => {
    const { net, lastGrantBy, statements } = netAuthenticatedIntegrationsPrivs();
    if (net.size > 0) {
      const offenders = [...net]
        .map((p) => `  • ${p} (last granted by ${lastGrantBy.get(p) ?? "?"})`)
        .join("\n");
      throw new Error(
        `public.integrations grants ${net.size} privilege(s) to \`authenticated\`:\n` +
          offenders +
          "\n\n" +
          "`public.integrations` must stay SERVICE-ROLE-ONLY (V2-READY-47B/47D). The\n" +
          "`authenticated` role must have NO direct SELECT/INSERT/UPDATE/DELETE — a member\n" +
          "could otherwise read/mutate a co-member's credential row directly via PostgREST.\n" +
          "If a new migration needs the grant, it almost certainly does NOT: route the access\n" +
          "through a membership-gated service-role repository + safe DTO instead. See\n" +
          "docs/slices/phase-4/readiness/v2-ready-47e-integrations-access-closeout.md.",
      );
    }
    // Sanity: the corpus DID touch these grants (so a silently-empty parse can't
    // make the guard vacuously pass).
    expect(statements.length).toBeGreaterThan(0);
    expect(net.size).toBe(0);
  });

  // Classification — pin the parser so its definition can't silently drift.
  describe("parser classification", () => {
    it("nets a GRANT-all then full REVOKE to empty (the real arc shape)", () => {
      const sql = [
        "GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;",
        "REVOKE INSERT, UPDATE, DELETE ON public.integrations FROM authenticated;",
        "REVOKE SELECT ON public.integrations FROM authenticated;",
      ].join("\n");
      const net = replayNet(parseAuthenticatedIntegrationsGrants(sql, "x.sql"));
      expect(net.size).toBe(0);
    });

    it("FLAGS a future re-GRANT (net becomes non-empty)", () => {
      const sql =
        "REVOKE SELECT ON public.integrations FROM authenticated;\n" +
        "GRANT SELECT ON public.integrations TO authenticated;"; // the regression
      const net = replayNet(parseAuthenticatedIntegrationsGrants(sql, "future.sql"));
      expect(net.has("SELECT")).toBe(true);
    });

    it("expands GRANT ALL to all four privileges", () => {
      const stmts = parseAuthenticatedIntegrationsGrants(
        "GRANT ALL ON public.integrations TO authenticated;",
        "x.sql",
      );
      expect([...stmts[0]!.privs].sort()).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    });

    it("ignores grants on OTHER tables and OTHER roles", () => {
      const sql = [
        "GRANT SELECT ON public.workflows TO authenticated;", // other table
        "GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO service_role;", // other role
        "-- GRANT SELECT ON public.integrations TO authenticated;", // commented out
      ].join("\n");
      expect(parseAuthenticatedIntegrationsGrants(sql, "x.sql")).toHaveLength(0);
    });
  });
});
