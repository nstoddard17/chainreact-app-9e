/**
 * @jest-environment node
 *
 * V2-READY-45 — guardrail: NO literal Slack-token-shaped string may live in a
 * tracked file.
 *
 * V2-READY-44 removed 103 such fixtures across 47 files. This guard keeps them
 * out: it scans every TRACKED text file (via `git grep`, which is tracked-only,
 * skips binaries with -I, and naturally excludes gitignored build/cache dirs —
 * .git, .next, node_modules, coverage, dist/build) for a literal Slack token
 * shape and fails with actionable guidance if one reappears.
 *
 * The pattern is `xox(b|a|p|r|s)-<>=3 token-body chars>` — the same definition the
 * V2-READY-44 cleanup used. It is deliberately narrow so it does NOT flag the
 * legitimate things that must stay:
 *   - DETECTOR REGEX SOURCE such as `xox[baprs]-[A-Za-z0-9-]{10,}` — the char
 *     after `xox` is `[`, which is not one of b/a/p/r/s, so it never matches.
 *   - RUNTIME ASSEMBLY such as `["xoxb", "...", "..."].join("-")` — the source
 *     fragment `"xoxb"` has no trailing dash, so it never matches (only the
 *     assembled runtime VALUE is token-shaped, and that is never in source).
 *   - BARE PREFIX NEEDLES such as `"xoxb-"` / `xoxb_REDACTED_EXAMPLE` — nothing
 *     alphanumeric follows the dash, so they never match.
 */
import { execFileSync } from "node:child_process";
import {
  fakeSlackBotToken,
  fakeSlackUserToken,
  fakeSlackAppToken,
  SLACK_TOKEN_PLACEHOLDER,
} from "@/tests/helpers/syntheticSecrets";

/** Literal Slack-token shape. Same pattern works as a JS RegExp and a git -E ERE. */
const PATTERN = String.raw`xox[baprs]-[A-Za-z0-9]{3,}`;

/** This guard file discusses the pattern in prose; exclude it from its own scan. */
const SELF = "tests/structure/no-literal-slack-token-fixtures.test.ts";

const GUIDANCE = [
  "",
  "A literal Slack-token-shaped string must never live in a tracked file —",
  "secret scanners (GitHub push protection, etc.) flag it. Instead:",
  "  • redaction / detection tests → import fakeSlackBotToken / fakeSlackUserToken /",
  "    fakeSlackAppToken from tests/helpers/syntheticSecrets.ts (assembled at runtime,",
  '    still matches the detector), or inline ["xoxb", "...", "..."].join("-");',
  "  • opaque passthrough credential mocks → SLACK_TOKEN_PLACEHOLDER (non-token-shaped)",
  "    from tests/helpers/syntheticSecrets.ts;",
  "  • docs → a deliberately non-token-shaped placeholder like xoxb_REDACTED_EXAMPLE.",
].join("\n");

/** `git grep` over tracked text files. Returns `path:line:match` rows; [] when none. */
function findLiteralTokens(): string[] {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-nIE", PATTERN, "--", ".", `:(exclude)${SELF}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return out.split(/\r?\n/).filter(Boolean);
  } catch (err) {
    // git grep exits 1 when there are NO matches — that is the success case.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe("guardrail — no literal Slack-token-shaped strings (V2-READY-45)", () => {
  it("every tracked text file is free of literal xox?-<token> strings", () => {
    const offenders = findLiteralTokens();
    if (offenders.length > 0) {
      throw new Error(
        `Found ${offenders.length} literal Slack-token-shaped string(s) in tracked files:\n` +
          offenders.join("\n") +
          "\n" +
          GUIDANCE,
      );
    }
    expect(offenders).toHaveLength(0);
  });

  // Classification tests — document + verify the allowlist behavior so the guard's
  // own definition can't silently drift. Each input is built so this source file
  // contains no literal token shape.
  describe("classification", () => {
    const re = new RegExp(PATTERN);

    it("FLAGS the token-shaped values the syntheticSecrets helpers produce (so detection keeps teeth)", () => {
      expect(re.test(fakeSlackBotToken())).toBe(true);
      expect(re.test(fakeSlackUserToken("x"))).toBe(true);
      expect(re.test(fakeSlackAppToken("y"))).toBe(true);
      // And an inline assembly used directly in detector tests.
      expect(re.test(["xoxb", "123456789012", "abcdEFGHijkl"].join("-"))).toBe(true);
    });

    it("ALLOWS detector regex source (xox followed by a char class)", () => {
      expect(re.test(String.raw`xox[baprs]-[A-Za-z0-9-]{10,}`)).toBe(false);
    });

    it("ALLOWS runtime-assembly source fragments", () => {
      expect(re.test('["xoxb", "abc", "def"].join("-")')).toBe(false);
    });

    it("ALLOWS bare prefix needles and non-token-shaped placeholders", () => {
      expect(re.test('"xoxb-"')).toBe(false);
      expect(re.test("xoxb_REDACTED_EXAMPLE")).toBe(false);
      expect(re.test(SLACK_TOKEN_PLACEHOLDER)).toBe(false);
    });
  });
});
