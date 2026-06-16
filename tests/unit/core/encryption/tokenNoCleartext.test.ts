/**
 * Deterministic (no-DB) no-cleartext guard for core/encryption/tokens.ts.
 *
 * Slice 4.SECURITY-INTEGRATIONS-RLS companion. The DB-level proof that stored
 * integration token columns are opaque lives in
 * tests/integration/security/integrations-rls.test.ts (gated, opt-in). THIS
 * file is the always-on CI counterpart: it proves the encryption PRIMITIVE
 * that produces those columns never emits the recognizable plaintext token
 * patterns in its ciphertext — so a representative real-token shape cannot
 * survive `encryptToken` into the `*_encrypted` columns in cleartext.
 *
 * NO real tokens — every fixture is an obvious fake. We assert only the
 * ABSENCE of the pattern from the ciphertext, and a clean round-trip.
 */
import { randomBytes } from "node:crypto";
import { encryptToken, decryptToken } from "@/core/encryption/tokens";
import {
  fakeGitHubOAuthToken,
  fakeGitHubPat,
  fakeStripeLiveKey,
  fakeStripeTestKey,
  fakeStripeWebhookSecret,
  fakeGoogleAccessToken,
  fakeGoogleRefreshToken,
} from "@/tests/helpers/syntheticSecrets";

const TEST_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
});
afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

// Representative provider token SHAPES (all fake). Each pairs a full sample
// value with the recognizable prefix/substring a scanner would grep for.
//
// V2-READY-44/46: NO literal `prefix + body` token string lives in source. The
// Slack values inline a split-join; the rest come from the runtime-assembled
// fakeProviderToken helpers in tests/helpers/syntheticSecrets.ts. Both produce a
// value that still matches the provider's detector at runtime, so this guard's
// teeth (the encrypt-never-leaks-cleartext proof) are unchanged. The `needle`
// stays the bare prefix (no body) — a bare prefix is safe in source.
const SAMPLES: ReadonlyArray<{ label: string; plaintext: string; needle: string }> = [
  { label: "Slack bot (xoxb-)", plaintext: (["xoxb", "FAKE", "111", "222", "abcdefghijklmnop"].join("-")), needle: "xoxb-" },
  { label: "Slack user (xoxp-)", plaintext: (["xoxp", "FAKE", "333", "444", "qrstuvwxyz012345"].join("-")), needle: "xoxp-" },
  { label: "GitHub OAuth (gho_)", plaintext: fakeGitHubOAuthToken("nocleartext"), needle: "gho_" },
  { label: "GitHub PAT (ghp_)", plaintext: fakeGitHubPat("nocleartext"), needle: "ghp_" },
  { label: "Stripe live (sk_live_)", plaintext: fakeStripeLiveKey("nocleartext"), needle: "sk_live_" },
  { label: "Stripe test (sk_test_)", plaintext: fakeStripeTestKey("nocleartext"), needle: "sk_test_" },
  { label: "Stripe webhook (whsec_)", plaintext: fakeStripeWebhookSecret("nocleartext"), needle: "whsec_" },
  { label: "Google access (ya29.)", plaintext: fakeGoogleAccessToken("nocleartext"), needle: "ya29." },
  { label: "Google refresh (1//)", plaintext: fakeGoogleRefreshToken("nocleartext"), needle: "1//" },
];

// A needle is "base64-impossible" (so its absence is DETERMINISTIC, never a
// chance collision in random ciphertext) iff it contains a char outside the
// standard base64 alphabet — `-`, `.`, `_` all qualify. A needle made only of
// base64 chars (e.g. Google's `1//`) COULD appear by chance, so for those we
// rely on the full-plaintext check (which is long enough to be collision-free)
// rather than asserting the short marker.
const BASE64_ALPHABET = /^[A-Za-z0-9+/=]+$/;
const isBase64Impossible = (s: string): boolean => !BASE64_ALPHABET.test(s);

describe("encryptToken — no cleartext token pattern survives encryption", () => {
  for (const { label, plaintext, needle } of SAMPLES) {
    it(`ciphertext for ${label} never contains the full token (nor its '${needle}' marker)`, () => {
      const ciphertext = encryptToken(plaintext);
      // The load-bearing check: a regression that stored plaintext would
      // surface the full token here. The full sample contains non-base64
      // chars (or is long enough) so its absence is collision-free.
      expect(ciphertext).not.toContain(plaintext);
      if (isBase64Impossible(needle)) {
        // Deterministic: a `-`/`.`/`_`-bearing marker can never appear in
        // standard-base64 ciphertext at all.
        expect(ciphertext).not.toContain(needle);
      }
      // …and it still decrypts back, proving it's encryption (recoverable),
      // not redaction/truncation.
      expect(decryptToken(ciphertext)).toBe(plaintext);
    });
  }

  it("re-encrypting the same token yields different opaque ciphertext (random IV), both pattern-free", () => {
    const plaintext = (["xoxb", "FAKE", "same", "token", "twice"].join("-"));
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a).not.toBe(b);
    for (const c of [a, b]) {
      expect(c).not.toContain("xoxb-");
      expect(c).not.toContain(plaintext);
    }
  });
});
