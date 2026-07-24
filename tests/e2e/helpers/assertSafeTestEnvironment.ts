/**
 * 5.DUAL-BUILDER-1 CS-7C — destructive-test-setup safety guard.
 *
 * The e2e harness creates and DELETES real users, accounts, workflows, runs,
 * integrations and storage objects through the service-role key
 * (`tests/e2e/helpers/supabaseAdmin.ts`). Whatever project
 * `NEXT_PUBLIC_SUPABASE_URL` points at is the project those writes land on —
 * and in this repo `.env.local` points at the SINGLE live project the app runs
 * on (there is no separate dev/test project; the DB-target guard in
 * `scripts/lib/db-target.mjs` enforces one-project-only for migrations).
 *
 * Running the journey against that project would create/delete users in
 * PRODUCTION. This guard refuses destructive test setup unless at least one
 * trustworthy condition proves the target is a safe test/local database:
 *
 *   1. The Supabase host is loopback/local (a local Supabase CLI instance).
 *   2. The operator has explicitly opted in with
 *      `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP=true` (they assert a dedicated,
 *      non-production project).
 *   3. The project ref is in the `E2E_TEST_SUPABASE_REFS` allow-list.
 *
 * `NODE_ENV=test` is deliberately NOT trusted on its own — Playwright runs with
 * it set while still pointed at whatever `.env.local` configures.
 *
 * SECRET-SAFE: this module only ever surfaces the Supabase HOST and PROJECT REF
 * — never the anon key, service-role key, or any connection string.
 */

export interface TestEnvironmentSafety {
  readonly safe: boolean;
  /** Human-readable reason (host/ref only — never secrets). */
  readonly reason: string;
  /** Parsed project ref when the URL is a `<ref>.supabase.co` cloud host. */
  readonly projectRef: string | null;
}

/** Minimal env snapshot the guard reads. Keeps the core logic pure/testable. */
export interface TestEnvironmentInput {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  E2E_ALLOW_DESTRUCTIVE_TEST_SETUP?: string;
  E2E_TEST_SUPABASE_REFS?: string;
}

/** Extract a 20-char Supabase project ref from `https://<ref>.supabase.co`. */
export function parseSupabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/i);
  return m ? m[1]!.toLowerCase() : null;
}

function loopbackHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    // Docker-internal host that local Supabase / compose setups use.
    host === "host.docker.internal"
  );
}

/**
 * Pure evaluation of whether the given env describes a SAFE (non-production)
 * destructive-test target. No side effects, no secret exposure.
 */
export function evaluateTestEnvironmentSafety(
  env: TestEnvironmentInput,
): TestEnvironmentSafety {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    return {
      safe: false,
      reason:
        "NEXT_PUBLIC_SUPABASE_URL is not set — cannot prove the destructive-test target is a safe test/local database.",
      projectRef: null,
    };
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return {
      safe: false,
      reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL.",
      projectRef: null,
    };
  }

  const projectRef = parseSupabaseProjectRef(url);

  // 1. Loopback / local Supabase — inherently safe (no production data).
  if (loopbackHost(host)) {
    return { safe: true, reason: `local Supabase host (${host})`, projectRef };
  }

  // 2. Explicit operator opt-in for a dedicated cloud TEST project.
  if (env.E2E_ALLOW_DESTRUCTIVE_TEST_SETUP === "true") {
    return {
      safe: true,
      reason:
        "E2E_ALLOW_DESTRUCTIVE_TEST_SETUP=true (operator asserted a dedicated, non-production project)",
      projectRef,
    };
  }

  // 3. Known test-project allow-list.
  const allow = (env.E2E_TEST_SUPABASE_REFS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (projectRef && allow.includes(projectRef)) {
    return {
      safe: true,
      reason: `project ref "${projectRef}" is in the E2E_TEST_SUPABASE_REFS allow-list`,
      projectRef,
    };
  }

  // Otherwise: a non-local project with no safe-target proof. Refuse.
  return {
    safe: false,
    reason:
      `NEXT_PUBLIC_SUPABASE_URL points at a non-local Supabase project` +
      `${projectRef ? ` (ref "${projectRef}")` : ` (host ${host})`} with no safe-target proof. ` +
      `Refusing destructive e2e setup so it cannot run against production. ` +
      `To proceed, point the harness at a localhost Supabase, OR set ` +
      `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP=true for a dedicated test project, OR add the ` +
      `ref to E2E_TEST_SUPABASE_REFS.`,
    projectRef,
  };
}

/**
 * Throw unless the current environment proves a safe destructive-test target.
 * Called at the service-role admin-client seam so no e2e spec can create or
 * delete rows against an unproven (potentially production) project.
 */
export function assertSafeTestEnvironment(
  env: Record<string, string | undefined> = process.env,
): void {
  const result = evaluateTestEnvironmentSafety(env as TestEnvironmentInput);
  if (!result.safe) {
    throw new Error(`[e2e safety] ${result.reason}`);
  }
}
