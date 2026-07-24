import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * TEST-ONLY authenticated Supabase client for DB integration suites.
 *
 * WHY THIS EXISTS: the Supabase project enforces CAPTCHA (Bot & Abuse
 * Protection) on password sign-in. DB integration suites that call
 * `signInWithPassword` therefore fail with "captcha protection: request
 * disallowed (no captcha_token found)" — the test runner has no widget and
 * cannot mint a Turnstile token. CAPTCHA protects the live site and is
 * deliberately NOT weakened for tests.
 *
 * HOW: the service role mints a real email-link token (`generateLink`) and the
 * anon client redeems it with `verifyOtp`, yielding an ordinary authenticated
 * session. No app code changes, no CAPTCHA bypass, no backdoor, and no
 * credentials in source control — RLS and every authorization rule still apply
 * to the resulting session exactly as they do in production. Link verification
 * is not CAPTCHA-gated, so this is unaffected by the project's setting.
 *
 * `recovery` is used because it is a normal, supported email-OTP type; the
 * session it establishes is not special in any way.
 *
 * Any DB integration suite currently blocked by CAPTCHA can adopt this in place
 * of its local `signInWithPassword` helper.
 */
/**
 * Per-process session cache, keyed by email.
 *
 * WHY: every link mint + redeem costs TWO Supabase auth requests, and the auth
 * endpoints are rate limited per project. Suites typically call this once per
 * `it()`, so a full DB-security run (26 suites) produced hundreds of requests
 * and collapsed with `verifyOtp failed: Request rate limit reached` — which
 * looked exactly like a security failure but was pure throttling.
 *
 * Caching is SAFE for these tests: the returned client holds an ordinary user
 * JWT whose `sub` never changes, and every authorization decision under test
 * (RLS membership joins, account scoping, grants) is evaluated by Postgres AT
 * QUERY TIME against current table state. A membership granted or revoked after
 * sign-in is therefore still observed correctly by a cached session — which is
 * exactly what suites like account-memberships-rls rely on.
 *
 * We cache the TOKEN PAIR, not the client, and hand out a fresh client seeded
 * via `setSession` on every call. Caching the client itself is unsafe: several
 * suites call `client.auth.signOut()` at the end of a test, which would sign out
 * the shared instance and silently downgrade every later caller to `anon` — the
 * assertions then fail with "permission denied … TO anon", looking like a policy
 * bug. `setSession` is a local operation, so reuse costs no auth request.
 *
 * Pass `fresh: true` for the rare test that genuinely needs a newly minted
 * session (e.g. asserting on token issuance itself).
 */
const sessionCache = new Map<string, { accessToken: string; refreshToken: string }>();

/** Drop cached sessions — call if a suite deletes and recreates the same email. */
export function resetSignedInClientCache(): void {
  sessionCache.clear();
}

function newAnonClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signedInClient(input: {
  url: string;
  anonKey: string;
  admin: SupabaseClient;
  email: string;
  /** Bypass the per-process cache and mint a brand-new session. */
  fresh?: boolean;
}): Promise<SupabaseClient> {
  const cacheKey = `${input.url}|${input.email}`;
  if (!input.fresh) {
    const cached = sessionCache.get(cacheKey);
    if (cached) {
      const reused = newAnonClient(input.url, input.anonKey);
      const { error: setErr } = await reused.auth.setSession({
        access_token: cached.accessToken,
        refresh_token: cached.refreshToken,
      });
      if (!setErr) return reused;
      // Token no longer usable — fall through and mint a new one.
      sessionCache.delete(cacheKey);
    }
  }

  const { data, error } = await input.admin.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    throw new Error(`generateLink failed: ${error?.message ?? "no hashed_token"}`);
  }
  const client = newAnonClient(input.url, input.anonKey);
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (verifyError) {
    // Make throttling unmistakable. Supabase rate-limits the /verify endpoint
    // per project (default ~30/hour), and each distinct test user costs one
    // verification. A whole-folder DB-security run needs more than that, so the
    // run dies with what LOOKS like a wave of security failures but is purely
    // throttling. Jest gives each test FILE its own module registry, so the
    // cache above cannot amortize across suites — the floor is one verification
    // per distinct user per suite.
    //
    // Run DB-security suites in small batches (or one file at a time) rather
    // than the whole folder at once. Do NOT "fix" this by raising the project's
    // auth rate limit: that is live authentication configuration.
    if (/rate limit/i.test(verifyError.message)) {
      throw new Error(
        `verifyOtp failed: ${verifyError.message} — this is Supabase AUTH RATE LIMITING, ` +
          "not a security-policy failure. Re-run this suite alone or in a small batch; " +
          "the limit is per project per hour and one verification is spent per distinct test user.",
      );
    }
    throw new Error(`verifyOtp failed: ${verifyError.message}`);
  }
  const accessToken = verified?.session?.access_token;
  const refreshToken = verified?.session?.refresh_token;
  if (!input.fresh && accessToken && refreshToken) {
    sessionCache.set(cacheKey, { accessToken, refreshToken });
  }
  return client;
}
