/**
 * @jest-environment node
 *
 * V2-READY-46 — guardrail: NO literal high-confidence provider-secret-shaped
 * string may live in a tracked file. Companion to V2-READY-45 (which guards the
 * Slack `xox?-` shape).
 *
 * Scope is deliberately limited to the prefixes that secret scanners (GitHub
 * push protection, etc.) flag with HIGH confidence and that have a strict,
 * unambiguous shape — so the guard stays low-noise and never fights legitimate
 * regex source:
 *   - GitHub tokens:      gh(p|o|u|s|r)_…  and  github_pat_…
 *   - Stripe secret keys: sk_live_…  /  sk_test_…
 *   - Google API keys:    AIza…
 *
 * Intentionally EXCLUDED (lower-confidence / known-public / wordy fixtures left
 * per the V2-READY-46 audit — guarding them would flag ~100 harmless
 * placeholders): Google OAuth `ya29.` / `1//` access+refresh tokens, OpenAI
 * `sk-` keys, Supabase/JWT `eyJ…` tokens (incl. the public jwt.io demo), the
 * canonical AWS `AKIA…EXAMPLE` doc key, Stripe `whsec_`, and ChainReact's own
 * `crk_live_` API-key format.
 *
 * Each pattern requires an ALNUM char IMMEDIATELY after the prefix, so it does
 * NOT flag the legitimate things that must stay:
 *   - DETECTOR REGEX SOURCE such as `ghp_[A-Za-z0-9]{16,}` / `[rs]k_(?:live|test)_…`
 *     / `AIza[A-Za-z0-9_-]{20,}` — the char after the prefix is `[`, not alnum.
 *   - RUNTIME ASSEMBLY such as `["sk", "live", "…"].join("_")` — the source
 *     fragments carry no `prefix + body` substring; only the runtime VALUE is
 *     token-shaped, and that never appears in source.
 *   - BARE PREFIX NEEDLES such as `"ghp_"` / `"sk_live_"` — nothing alphanumeric
 *     follows, so they never match.
 */
import { execFileSync } from "node:child_process";
import {
  fakeGitHubPat,
  fakeGitHubOAuthToken,
  fakeStripeLiveKey,
  fakeStripeTestKey,
  fakeGoogleApiKey,
} from "@/tests/helpers/syntheticSecrets";

/**
 * High-confidence provider-secret shapes. Each is valid both as a JS RegExp and
 * as a `git grep -E` ERE. Combined into one alternation for the repo scan.
 */
const PATTERNS: ReadonlyArray<{ label: string; ere: string }> = [
  { label: "GitHub token (ghp_/gho_/ghu_/ghs_/ghr_)", ere: String.raw`gh[pousr]_[A-Za-z0-9]{16,}` },
  { label: "GitHub fine-grained PAT (github_pat_)", ere: String.raw`github_pat_[A-Za-z0-9_]{20,}` },
  { label: "Stripe secret key (sk_live_/sk_test_)", ere: String.raw`sk_(live|test)_[A-Za-z0-9]{16,}` },
  { label: "Google API key (AIza)", ere: String.raw`AIza[A-Za-z0-9_-]{20,}` },
];

const COMBINED = `(${PATTERNS.map((p) => p.ere).join("|")})`;

/** This guard file discusses the patterns in prose; exclude it from its own scan. */
const SELF = "tests/structure/no-literal-provider-secret-fixtures.test.ts";

const GUIDANCE = [
  "",
  "A literal high-confidence provider-secret-shaped string must never live in a",
  "tracked file — secret scanners (GitHub push protection, etc.) flag it. Instead:",
  "  • detection / redaction / no-cleartext tests → import the runtime-assembled",
  "    fakeGitHubPat / fakeGitHubOAuthToken / fakeStripeLiveKey / fakeStripeTestKey /",
  "    fakeGoogleApiKey (and friends) from tests/helpers/syntheticSecrets.ts, or",
  '    inline a split-join like ["sk", "live", "…"].join("_");',
  "  • opaque passthrough credential mocks → a clearly non-token-shaped placeholder;",
  "  • docs → a deliberately broken example like ghp_REDACTED_EXAMPLE /",
  "    sk_live_REDACTED_EXAMPLE (the underscore/word breaks the detector shape).",
].join("\n");

/** `git grep` over tracked text files. Returns `path:line:match` rows; [] when none. */
function findLiteralSecrets(): string[] {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-nIE", COMBINED, "--", ".", `:(exclude)${SELF}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return out.split(/\r?\n/).filter(Boolean);
  } catch (err) {
    // git grep exits 1 when there are NO matches — that is the success case.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe("guardrail — no literal high-confidence provider-secret strings (V2-READY-46)", () => {
  it("every tracked text file is free of literal GitHub / Stripe-secret / Google-API-key strings", () => {
    const offenders = findLiteralSecrets();
    if (offenders.length > 0) {
      throw new Error(
        `Found ${offenders.length} literal provider-secret-shaped string(s) in tracked files:\n` +
          offenders.join("\n") +
          "\n" +
          GUIDANCE,
      );
    }
    expect(offenders).toHaveLength(0);
  });

  // Classification tests — document + verify the allowlist behavior so the
  // guard's own definition can't silently drift. Each input is built so this
  // source file contains no literal token shape.
  describe("classification", () => {
    const re = new RegExp(COMBINED);

    it("FLAGS the token-shaped values the syntheticSecrets helpers produce (so detection keeps teeth)", () => {
      expect(re.test(fakeGitHubPat())).toBe(true);
      expect(re.test(fakeGitHubOAuthToken("x"))).toBe(true);
      expect(re.test(fakeStripeLiveKey("y"))).toBe(true);
      expect(re.test(fakeStripeTestKey("z"))).toBe(true);
      expect(re.test(fakeGoogleApiKey("w"))).toBe(true);
      // And an inline assembly used directly in some detector tests.
      expect(re.test(["sk", "live", "abcd1234ABCD5678efgh"].join("_"))).toBe(true);
    });

    it("ALLOWS detector regex source (prefix followed by a char class)", () => {
      expect(re.test(String.raw`ghp_[A-Za-z0-9]{16,}`)).toBe(false);
      expect(re.test(String.raw`gh[pousr]_[A-Za-z0-9]{8,}`)).toBe(false);
      expect(re.test(String.raw`[rs]k_(?:live|test)_[A-Za-z0-9]{16,}`)).toBe(false);
      expect(re.test(String.raw`AIza[A-Za-z0-9_-]{20,}`)).toBe(false);
    });

    it("ALLOWS runtime-assembly source fragments", () => {
      expect(re.test('["sk", "live", "abc"].join("_")')).toBe(false);
      expect(re.test('["ghp", "AbCd1234EfGh"].join("_")')).toBe(false);
    });

    it("ALLOWS bare prefix needles and broken doc placeholders", () => {
      expect(re.test('"ghp_"')).toBe(false);
      expect(re.test('"sk_live_"')).toBe(false);
      expect(re.test("ghp_REDACTED_EXAMPLE")).toBe(false);
      expect(re.test("sk_live_REDACTED_EXAMPLE")).toBe(false);
    });

    it("does NOT extend to the intentionally-excluded lower-confidence shapes", () => {
      // These are left as-is by the V2-READY-46 audit; the guard must not flag them.
      expect(re.test("ya29.mock-e2e-access")).toBe(false);
      expect(re.test("1//ga-refresh")).toBe(false);
      expect(re.test("AKIAIOSFODNN7EXAMPLE")).toBe(false);
      expect(re.test("crk_live_RAWSECRETVALUE0000000000")).toBe(false);
    });
  });
});
