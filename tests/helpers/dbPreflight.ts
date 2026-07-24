import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TEST-ONLY schema preflight for DB integration suites.
 *
 * WHY THIS EXISTS: `ALLOW_DB_INTEGRATION_TESTS` is a standing developer setting,
 * so a gated suite happily runs against a database where its migration has NOT
 * been applied. When that happened during TRUCK-BRIDGE-1 CS-1 the result was
 * actively misleading:
 *
 *   - every table-dependent test failed for the wrong reason (missing table,
 *     not a broken policy),
 *   - a "no rows visible to anon" test PASSED VACUOUSLY, because anon trivially
 *     sees nothing in a table that does not exist, and
 *   - throwaway auth users had already been created in the target project
 *     before any of that was discovered.
 *
 * Call this at the TOP of `beforeAll`, BEFORE creating any fixture. It fails
 * fast with one precise message naming the missing table, and creates nothing.
 *
 * A vacuous green is worse than a red: a security suite that cannot fail is not
 * protecting anything, and it reads as coverage in CI.
 */
export async function requireTables(
  admin: SupabaseClient,
  tables: readonly string[],
  migrationHint?: string,
): Promise<void> {
  const missing: string[] = [];
  for (const table of tables) {
    const { error } = await admin.from(table).select("*", { head: true, count: "exact" }).limit(1);
    // PGRST205 = table absent from the schema cache; 42P01 = undefined_table.
    // A permission error (42501) means the table EXISTS and is locked down,
    // which is a pass for preflight purposes — that is what the suite asserts.
    if (error && (error.code === "PGRST205" || error.code === "42P01")) {
      missing.push(`${table} (${error.code})`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `DB preflight failed — missing table(s): ${missing.join(", ")}. ` +
        (migrationHint ? `Apply migration ${migrationHint} to the target database. ` : "") +
        "Refusing to create fixtures for a suite that cannot prove anything.",
    );
  }
}
