/**
 * @jest-environment node
 *
 * DB-free security guard for the machine-credential store tables
 * (`account_machine_credentials`, `machine_credential_audit`), which are
 * SERVICE-ROLE-ONLY from birth (unlike the granted-then-revoked tables in
 * `no-authenticated-integration-grants.test.ts`).
 *
 * These tables hold AES-256-GCM ciphertext of the client secret + private key +
 * certificate + a minted-token cache (credential table), and lifecycle/mint audit
 * rows (audit table). A member OR anon must NEVER touch them via the Data API.
 * This statically proves, across the whole migration corpus:
 *   - RLS is enabled + at least one policy exists (also checked by lint:migrations);
 *   - `service_role` IS granted (the approved repository boundary works);
 *   - `authenticated` is granted NOTHING (net) — so a member/anon SELECT returns
 *     42501 and no encrypted secret can transit PostgREST/supabase-js;
 *   - `anon` is granted NOTHING.
 *
 * The live-DB proof (a real 42501 + cross-account isolation) lives in the opt-in
 * `tests/integration/security/machine-credentials-rls.test.ts`; this guard runs
 * everywhere with no database.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const SECRET_TABLES = ["account_machine_credentials", "machine_credential_audit"] as const;
const PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
type Priv = (typeof PRIVS)[number];

function allSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
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
