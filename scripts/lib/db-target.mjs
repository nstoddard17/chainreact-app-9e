/**
 * Shared DB-target safety logic.
 *
 * Invariant: any Postgres connection string used for migrations MUST target the
 * SAME Supabase project that the app talks to at runtime — i.e. the project ref
 * embedded in NEXT_PUBLIC_SUPABASE_URL. A mismatch means `db push` (and any
 * direct-SQL script) would silently mutate the WRONG database.
 *
 * History: V2's .env.local shipped with POSTGRES_URL_* pointing at the V1
 * project (xzwsdwllmrnrgbltibxt) and PRODUCTION_POSTGRES_URL_* at an
 * unidentified third project (gyrntsmtyshgukwrngpb), while the app runs on
 * qcepijemjlkssfkvzlio. This guard exists so that can never bite again.
 *
 * These helpers only ever surface PROJECT REFS — never the full connection
 * string or password.
 */

/** Known non-V2 refs, surfaced with context when one is detected as a target. */
export const KNOWN_FOREIGN_REFS = {
  xzwsdwllmrnrgbltibxt: "V1 legacy project (chainreact-app-9e)",
  gyrntsmtyshgukwrngpb: "unidentified third project (NOT confirmed as V2)",
};

/** Extract the 20-char Supabase project ref from a Postgres connection string. */
export function parseRefFromPgUrl(url) {
  if (!url) return null;
  // Session/transaction pooler username: postgres.<ref>
  const pooler = url.match(/postgres\.([a-z0-9]{20})/);
  if (pooler) return pooler[1];
  // Direct host: db.<ref>.supabase.co
  const direct = url.match(/db\.([a-z0-9]{20})\.supabase\.co/);
  if (direct) return direct[1];
  return null;
}

/** Extract the project ref from NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co). */
export function parseRefFromSupabaseUrl(url) {
  if (!url) return null;
  const m = url.match(/https:\/\/([a-z0-9]{20})\.supabase\.co/);
  return m ? m[1] : null;
}

/**
 * Validate that POSTGRES_URL_NON_POOLING (the var `db push` uses) targets the
 * same project as NEXT_PUBLIC_SUPABASE_URL.
 * @returns {{ok:boolean, expectedRef:string|null, targetRef:string|null, reason:string}}
 */
export function validateMigrationTarget(env) {
  const expectedRef = parseRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const targetRef = parseRefFromPgUrl(env.POSTGRES_URL_NON_POOLING);

  if (!expectedRef) {
    return {
      ok: false,
      expectedRef,
      targetRef,
      reason:
        "NEXT_PUBLIC_SUPABASE_URL is missing or unparseable — cannot determine the intended V2 project.",
    };
  }
  if (!targetRef) {
    return {
      ok: false,
      expectedRef,
      targetRef,
      reason: "POSTGRES_URL_NON_POOLING is missing or unparseable.",
    };
  }
  if (targetRef !== expectedRef) {
    const foreign = KNOWN_FOREIGN_REFS[targetRef];
    return {
      ok: false,
      expectedRef,
      targetRef,
      reason: `POSTGRES_URL_NON_POOLING targets "${targetRef}"${
        foreign ? ` = ${foreign}` : ""
      }, but the app project (NEXT_PUBLIC_SUPABASE_URL) is "${expectedRef}". Refusing to proceed — fix .env.local so both point to the same project.`,
    };
  }
  return {
    ok: true,
    expectedRef,
    targetRef,
    reason: `Migration target "${targetRef}" matches the app project.`,
  };
}

/** Minimal .env-file parser (no dotenv dependency). Local use only. */
export function loadEnvFile(readFileSync, path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}
