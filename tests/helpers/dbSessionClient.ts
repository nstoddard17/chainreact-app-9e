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
export async function signedInClient(input: {
  url: string;
  anonKey: string;
  admin: SupabaseClient;
  email: string;
}): Promise<SupabaseClient> {
  const { data, error } = await input.admin.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    throw new Error(`generateLink failed: ${error?.message ?? "no hashed_token"}`);
  }
  const client = createClient(input.url, input.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await client.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (verifyError) {
    throw new Error(`verifyOtp failed: ${verifyError.message}`);
  }
  return client;
}
