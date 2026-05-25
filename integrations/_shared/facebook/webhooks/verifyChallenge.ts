/**
 * Facebook webhook GET verification handshake — Slice 3.FACEBOOK-5.
 *
 * When the webhook callback URL is (re)registered in the Meta App Dashboard,
 * Facebook issues a GET with:
 *   - `hub.mode=subscribe`
 *   - `hub.verify_token=<the token configured in the dashboard>`
 *   - `hub.challenge=<random string>`
 *
 * The endpoint must echo `hub.challenge` as `text/plain` ONLY when
 * `hub.mode === "subscribe"` AND `hub.verify_token` matches our configured
 * `FACEBOOK_WEBHOOK_VERIFY_TOKEN`. This is the ownership-proof step — it is
 * NOT signature-gated (no body to sign yet).
 *
 * Fail-closed: a missing/empty expected token returns `ok: false` (we can't
 * prove ownership, so we never echo). The route maps `ok: false` to 403.
 * The supplied token is NEVER echoed back or logged — only the challenge is
 * returned, and only on a match.
 */

export type VerifyFacebookChallengeResult =
  | { ok: true; challenge: string }
  | { ok: false };

export function verifyFacebookChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedToken: string | undefined;
}): VerifyFacebookChallengeResult {
  const { mode, token, challenge, expectedToken } = input;

  // Fail-closed when not configured — cannot prove ownership.
  if (!expectedToken) return { ok: false };

  if (mode !== "subscribe") return { ok: false };
  if (typeof token !== "string" || token !== expectedToken) return { ok: false };
  if (typeof challenge !== "string" || challenge.length === 0) {
    return { ok: false };
  }

  return { ok: true, challenge };
}
