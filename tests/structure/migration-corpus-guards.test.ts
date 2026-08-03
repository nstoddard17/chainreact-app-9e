/** @jest-environment node */
/**
 * STRUCTURE-TEST-CONSOLIDATION-1 — the migration-corpus guard family in ONE
 * suite process. Each describe below is a formerly standalone suite,
 * preserved verbatim (rules, parsers, ledgers, messages); consolidation
 * exists so the supabase/migrations corpus is read by one process instead
 * of three. The name-pinned official-template-node-registration suite
 * deliberately stays standalone (migrations + a skill cite it by filename).
 */
import { listRepoFiles, readRepoFile } from "./helpers/repoIndex";

describe("machine-credentials-grants", () => {
  const SECRET_TABLES = ["account_machine_credentials", "machine_credential_audit"] as const;
  const PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
  type Priv = (typeof PRIVS)[number];

  function allSql(): string {
    // Shared index: one walk + memoized reads per process, shared with the
    // grant-replay section below (STRUCTURE-TEST-CONSOLIDATION-1).
    return listRepoFiles({ roots: ["supabase/migrations"], filename: /\.sql$/ })
      .map((f) => readRepoFile(f))
      .join("\n");
  }

  /** Net privileges `role` holds on `public.<table>` across the corpus. */
  function netPrivsFor(sql: string, table: string, role: string): Set<Priv> {
    const onTable = new RegExp(`\\bON\\s+public\\.${table}\\b`, "i");
    const roleRe = new RegExp(`\\b${role}\\b`, "i");
    const net = new Set<Priv>();
    for (const m of sql.matchAll(/^[ \t]*(GRANT|REVOKE)\b[\s\S]*?;/gim)) {
      const stmt = m[0];
      if (!onTable.test(stmt) || !roleRe.test(stmt)) continue;
      const op = (m[1] ?? "").toUpperCase();
      const privText = stmt.slice(0, stmt.search(/\bON\b/i));
      const named = /\bALL\b/i.test(privText)
        ? [...PRIVS]
        : PRIVS.filter((p) => new RegExp(`\\b${p}\\b`, "i").test(privText));
      for (const p of named) {
        if (op === "GRANT") net.add(p);
        else net.delete(p);
      }
    }
    return net;
  }

  describe("machine-credential store — service-role-only Data API posture", () => {
    const sql = allSql();

    it.each(SECRET_TABLES)("public.%s enables RLS with at least one policy", (table) => {
      expect(new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(sql)).toBe(true);
      expect(new RegExp(`CREATE\\s+POLICY\\s+\\S+\\s+ON\\s+public\\.${table}`, "i").test(sql)).toBe(true);
    });

    it.each(SECRET_TABLES)("public.%s grants service_role (the approved boundary)", (table) => {
      expect(netPrivsFor(sql, table, "service_role").size).toBeGreaterThan(0);
    });

    it.each(SECRET_TABLES)("public.%s grants `authenticated` NOTHING (members/anon blocked at Data API)", (table) => {
      expect([...netPrivsFor(sql, table, "authenticated")]).toEqual([]);
    });

    it.each(SECRET_TABLES)("public.%s grants `anon` NOTHING", (table) => {
      expect([...netPrivsFor(sql, table, "anon")]).toEqual([]);
    });
  });
});

describe("no-authenticated-integration-grants", () => {
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
    // Shared index (memoized reads — the corpus is parsed from the same
    // strings allSql() above already loaded).
    const files = listRepoFiles({ roots: ["supabase/migrations"], filename: /\.sql$/ });
    const net = new Set<Priv>();
    const lastGrantBy = new Map<Priv, string>();
    const statements: GrantStmt[] = [];
    for (const file of files) {
      const sql = readRepoFile(file);
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
});

describe("react-agent-audit-events-migration", () => {
  /**
   * Static migration-shape guard for react_agent_audit_events
   * (REACT-AGENT-CS-5B-AUDIT-STORAGE).
   *
   * Proves the security/no-leak shape of the audit-ledger migration WITHOUT a live DB
   * (the runtime RLS/CHECK behavior — member-only read, invalid outcome/mode rejection,
   * set-null on delete — is proven by gated DB tests after db:push). This scans the
   * committed SQL so the governance guarantees can't silently regress.
   */

  const SQL = readRepoFile("supabase/migrations/20260705000000_react_agent_audit_events.sql");

  describe("react_agent_audit_events migration — security shape", () => {
    it("creates the table and enables RLS", () => {
      expect(SQL).toMatch(/CREATE TABLE public\.react_agent_audit_events/);
      expect(SQL).toMatch(/ALTER TABLE public\.react_agent_audit_events ENABLE ROW LEVEL SECURITY/);
    });

    it("reads are gated to account members via account_memberships", () => {
      expect(SQL).toMatch(/CREATE POLICY react_agent_audit_select_account_member/);
      expect(SQL).toMatch(/FROM public\.account_memberships am/);
      expect(SQL).toMatch(/am\.user_id = auth\.uid\(\)/);
    });

    it("is service-role-write-only: authenticated gets SELECT only, no write policy", () => {
      expect(SQL).toMatch(/GRANT SELECT ON public\.react_agent_audit_events TO authenticated/);
      expect(SQL).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.react_agent_audit_events TO service_role/);
      // No INSERT/UPDATE/DELETE GRANT to authenticated.
      expect(SQL).not.toMatch(/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*TO authenticated/);
      // No user-facing write POLICY (only the SELECT policy exists).
      expect(SQL).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/);
    });

    it("anonymize-retain deletion convention: account/actor/workflow/cost FKs are ON DELETE SET NULL", () => {
      expect(SQL).toMatch(/account_id uuid REFERENCES public\.accounts\(id\) ON DELETE SET NULL/);
      expect(SQL).toMatch(/actor_user_id uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
      expect(SQL).toMatch(/workflow_id uuid REFERENCES public\.workflows\(id\) ON DELETE SET NULL/);
      expect(SQL).toMatch(/ai_cost_event_id uuid REFERENCES public\.ai_cost_events\(id\) ON DELETE SET NULL/);
      // No CASCADE delete of the governance trail.
      expect(SQL).not.toMatch(/ON DELETE CASCADE/);
    });

    it("constrains outcome + mode to closed sets and metadata to an object", () => {
      expect(SQL).toMatch(/outcome IN \(\s*'success',\s*'denied',\s*'failed'\s*\)/);
      expect(SQL).toMatch(/mode IN \(\s*'read_only',\s*'proposes_change',\s*'requires_approval'\s*\)/);
      expect(SQL).toMatch(/jsonb_typeof\(metadata\) = 'object'/);
    });

    it("has no raw-payload columns (only ids / enums / opaque refs / sanitized metadata)", () => {
      for (const banned of [
        /\bprompt\b/i,
        /\bcompletion\b/i,
        /\banswer\b/i,
        /\bquestion\b/i,
        /\bconfig\b/i,
        /\bsecret\b/i,
        /\btoken\b/i,
        /\bpayload\b/i,
      ]) {
        // Allow the banned word only inside the leading comment block's redaction rule;
        // assert it never appears as a column definition (`<word> text/jsonb ...`).
        const columnLike = new RegExp(`\\n\\s+\\w*${banned.source.replace(/\\b/g, "")}\\w*\\s+(text|jsonb|uuid)`, "i");
        expect(SQL).not.toMatch(columnLike);
      }
    });
  });
});
