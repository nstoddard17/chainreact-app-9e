/**
 * @jest-environment node
 *
 * Pure crypto/policy helpers for purpose-bound sensitive-action challenges
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * These are the primitives the whole deletion step-up rests on, so they are
 * tested directly: fail-closed key handling, uniform six-digit generation, a
 * verifier that is useless outside its exact (purpose, user, challenge), the
 * binding digests, masking, and the pure lifecycle evaluators.
 */

import {
  CHALLENGE_MAX_ATTEMPTS,
  deriveChallengeVerifier,
  deriveEmailBinding,
  deriveSessionBinding,
  evaluateChallengeForConsumption,
  evaluateChallengeForVerification,
  generateChallengeCode,
  getChallengeHmacKey,
  isChallengeKeyConfigured,
  isWellFormedChallengeCode,
  maskEmail,
  normalizeChallengeCodeInput,
  timingSafeEqualHex,
  type ChallengeStateView,
} from "@/core/security/sensitiveActionChallenge";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

const ORIGINAL = process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
// Set at module scope too: the fixtures below derive digests at import time, and
// the helpers fail closed without a key (which is the point).
process.env.SENSITIVE_ACTION_CHALLENGE_KEY = KEY;

beforeEach(() => {
  process.env.SENSITIVE_ACTION_CHALLENGE_KEY = KEY;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
  else process.env.SENSITIVE_ACTION_CHALLENGE_KEY = ORIGINAL;
});

describe("key handling — fail closed", () => {
  it("throws when the pepper is missing rather than falling back to an unkeyed digest", () => {
    delete process.env.SENSITIVE_ACTION_CHALLENGE_KEY;
    expect(() => getChallengeHmacKey()).toThrow(/SENSITIVE_ACTION_CHALLENGE_KEY/);
    expect(isChallengeKeyConfigured()).toBe(false);
  });

  it("throws on a too-short key", () => {
    process.env.SENSITIVE_ACTION_CHALLENGE_KEY = Buffer.alloc(8).toString("base64");
    expect(() => getChallengeHmacKey()).toThrow(/at least 16 bytes/);
    expect(isChallengeKeyConfigured()).toBe(false);
  });

  it("reports configured for a valid key", () => {
    expect(isChallengeKeyConfigured()).toBe(true);
  });

  it("never puts the key value into the thrown message", () => {
    process.env.SENSITIVE_ACTION_CHALLENGE_KEY = Buffer.alloc(8, 3).toString("base64");
    try {
      getChallengeHmacKey();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain(
        Buffer.alloc(8, 3).toString("base64"),
      );
    }
  });
});

describe("generateChallengeCode", () => {
  it("always produces exactly six digits, including leading zeros", () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateChallengeCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(isWellFormedChallengeCode(code)).toBe(true);
    }
  });

  it("is not obviously biased — spreads across the full 0..999999 range", () => {
    const values = Array.from({ length: 800 }, () => Number(generateChallengeCode()));
    expect(Math.min(...values)).toBeLessThan(200_000);
    expect(Math.max(...values)).toBeGreaterThan(800_000);
    // And is not a constant / tiny cycle.
    expect(new Set(values).size).toBeGreaterThan(700);
  });
});

describe("normalizeChallengeCodeInput", () => {
  it("accepts the spaced and dashed forms a paste produces", () => {
    expect(normalizeChallengeCodeInput("123 456")).toBe("123456");
    expect(normalizeChallengeCodeInput("123-456")).toBe("123456");
    expect(normalizeChallengeCodeInput("  123456  ")).toBe("123456");
  });

  it("rejects non-numeric input structurally", () => {
    expect(isWellFormedChallengeCode("12345")).toBe(false);
    expect(isWellFormedChallengeCode("1234567")).toBe(false);
    expect(isWellFormedChallengeCode("12345a")).toBe(false);
  });
});

describe("deriveChallengeVerifier", () => {
  const base = {
    purpose: "delete_account" as const,
    userId: "user-1",
    challengeId: "chal-1",
    code: "123456",
  };

  it("is deterministic for identical inputs", () => {
    expect(deriveChallengeVerifier(base)).toBe(deriveChallengeVerifier(base));
  });

  it("never contains the plaintext code", () => {
    expect(deriveChallengeVerifier(base)).not.toContain("123456");
  });

  it("differs for a different user — the digest is not a cross-user oracle", () => {
    expect(deriveChallengeVerifier({ ...base, userId: "user-2" })).not.toBe(
      deriveChallengeVerifier(base),
    );
  });

  it("differs for a different challenge id — two users can hold the same digits safely", () => {
    expect(deriveChallengeVerifier({ ...base, challengeId: "chal-2" })).not.toBe(
      deriveChallengeVerifier(base),
    );
  });

  it("differs for a different code", () => {
    expect(deriveChallengeVerifier({ ...base, code: "123457" })).not.toBe(
      deriveChallengeVerifier(base),
    );
  });

  it("differs under a rotated pepper — a stolen row is useless without the server key", () => {
    const before = deriveChallengeVerifier(base);
    process.env.SENSITIVE_ACTION_CHALLENGE_KEY = OTHER_KEY;
    expect(deriveChallengeVerifier(base)).not.toBe(before);
  });

  it("is NOT a bare sha256 of the code (which would be brute-forceable)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require("node:crypto");
    const bare = createHash("sha256").update("123456").digest("hex");
    expect(deriveChallengeVerifier(base)).not.toBe(bare);
  });
});

describe("binding digests", () => {
  it("session binding is stable, opaque, and never the raw id", () => {
    const d = deriveSessionBinding("sess-abc");
    expect(d).toBe(deriveSessionBinding("sess-abc"));
    expect(d).not.toContain("sess-abc");
    expect(d).not.toBe(deriveSessionBinding("sess-xyz"));
  });

  it("email binding normalizes case/whitespace but distinguishes real addresses", () => {
    expect(deriveEmailBinding("  User@Example.COM ")).toBe(
      deriveEmailBinding("user@example.com"),
    );
    expect(deriveEmailBinding("user@example.com")).not.toBe(
      deriveEmailBinding("other@example.com"),
    );
    expect(deriveEmailBinding("user@example.com")).not.toContain("user@example.com");
  });

  it("session and email digests of the same string differ (domain-separated)", () => {
    expect(deriveSessionBinding("abc")).not.toBe(deriveEmailBinding("abc"));
  });
});

describe("timingSafeEqualHex", () => {
  it("matches identical digests and rejects different / malformed ones", () => {
    const a = deriveSessionBinding("s1");
    expect(timingSafeEqualHex(a, a)).toBe(true);
    expect(timingSafeEqualHex(a, deriveSessionBinding("s2"))).toBe(false);
    expect(timingSafeEqualHex(a, "")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(false);
    expect(timingSafeEqualHex(a, a.slice(0, 10))).toBe(false);
  });
});

describe("maskEmail", () => {
  it("shows the first character and the domain only", () => {
    expect(maskEmail("chainreactapp@gmail.com")).toMatch(/^c•+@gmail\.com$/);
    expect(maskEmail("chainreactapp@gmail.com")).not.toContain("hainreactapp");
  });

  it("caps the bullet run so a long local part doesn't leak its length", () => {
    const short = maskEmail("abcdefghij@x.com");
    const long = maskEmail("abcdefghijklmnopqrstuvwxyz@x.com");
    expect(short).toBe(long);
  });

  it("masks a one-character local part entirely", () => {
    expect(maskEmail("a@x.com")).toBe("•••@x.com");
  });

  it("degrades safely on a malformed address", () => {
    expect(maskEmail("not-an-email")).toBe("•••");
    expect(maskEmail("@x.com")).toBe("•••");
    expect(maskEmail("a@")).toBe("•••");
  });
});

// ── Pure lifecycle evaluation ────────────────────────────────────────────────

const NOW = new Date("2026-07-24T12:00:00.000Z");
const BINDINGS = {
  purpose: "delete_account" as const,
  userId: "user-1",
  sessionBinding: deriveSessionBinding("sess-abc"),
  emailBinding: deriveEmailBinding("user@example.com"),
};

function row(overrides: Partial<ChallengeStateView> = {}): ChallengeStateView {
  return {
    purpose: "delete_account",
    userId: "user-1",
    sessionBinding: BINDINGS.sessionBinding,
    emailBinding: BINDINGS.emailBinding,
    expiresAt: "2026-07-24T12:05:00.000Z",
    attemptCount: 0,
    maxAttempts: CHALLENGE_MAX_ATTEMPTS,
    verifiedAt: null,
    verificationExpiresAt: null,
    consumedAt: null,
    invalidatedAt: null,
    ...overrides,
  };
}

describe("evaluateChallengeForVerification", () => {
  it("accepts a fresh, correctly bound challenge", () => {
    expect(evaluateChallengeForVerification(row(), BINDINGS, NOW)).toBeNull();
  });

  it("rejects a missing row", () => {
    expect(evaluateChallengeForVerification(null, BINDINGS, NOW)).toBe("not_found");
  });

  it("rejects an expired challenge", () => {
    expect(
      evaluateChallengeForVerification(
        row({ expiresAt: "2026-07-24T11:59:59.000Z" }),
        BINDINGS,
        NOW,
      ),
    ).toBe("expired");
  });

  it("rejects a challenge at the attempt cap", () => {
    expect(
      evaluateChallengeForVerification(row({ attemptCount: 5 }), BINDINGS, NOW),
    ).toBe("locked");
  });

  it("rejects an invalidated (superseded by a resend) challenge", () => {
    expect(
      evaluateChallengeForVerification(row({ invalidatedAt: "x" }), BINDINGS, NOW),
    ).toBe("invalidated");
  });

  it("rejects an already-consumed challenge", () => {
    expect(
      evaluateChallengeForVerification(row({ consumedAt: "x" }), BINDINGS, NOW),
    ).toBe("consumed");
  });

  it("rejects a user mismatch", () => {
    expect(
      evaluateChallengeForVerification(row({ userId: "someone-else" }), BINDINGS, NOW),
    ).toBe("user_mismatch");
  });

  it("rejects a session mismatch — a code from another session can't be used here", () => {
    expect(
      evaluateChallengeForVerification(
        row({ sessionBinding: deriveSessionBinding("other-session") }),
        BINDINGS,
        NOW,
      ),
    ).toBe("session_mismatch");
  });

  it("rejects a purpose mismatch — the code authorizes delete_account and nothing else", () => {
    expect(
      evaluateChallengeForVerification(row({ purpose: "some_other_purpose" }), BINDINGS, NOW),
    ).toBe("purpose_mismatch");
  });

  it("rejects when the account's primary email changed after the code was sent", () => {
    expect(
      evaluateChallengeForVerification(
        row({ emailBinding: deriveEmailBinding("moved@example.com") }),
        BINDINGS,
        NOW,
      ),
    ).toBe("email_changed");
  });
});

describe("evaluateChallengeForConsumption", () => {
  const verified = row({
    verifiedAt: "2026-07-24T11:58:00.000Z",
    verificationExpiresAt: "2026-07-24T12:03:00.000Z",
  });

  it("accepts a verified challenge inside its short window", () => {
    expect(evaluateChallengeForConsumption(verified, BINDINGS, NOW)).toBeNull();
  });

  it("refuses an unverified challenge — verification alone never deletes, and neither does its absence", () => {
    expect(evaluateChallengeForConsumption(row(), BINDINGS, NOW)).toBe("not_verified");
  });

  it("refuses once the post-verification window elapsed", () => {
    expect(
      evaluateChallengeForConsumption(
        row({
          verifiedAt: "2026-07-24T11:50:00.000Z",
          verificationExpiresAt: "2026-07-24T11:55:00.000Z",
        }),
        BINDINGS,
        NOW,
      ),
    ).toBe("verification_expired");
  });

  it("refuses a replay of an already-consumed authorization", () => {
    expect(
      evaluateChallengeForConsumption({ ...verified, consumedAt: "x" }, BINDINGS, NOW),
    ).toBe("consumed");
  });

  it("still enforces every binding at consumption time", () => {
    expect(
      evaluateChallengeForConsumption(
        { ...verified, sessionBinding: deriveSessionBinding("elsewhere") },
        BINDINGS,
        NOW,
      ),
    ).toBe("session_mismatch");
    expect(
      evaluateChallengeForConsumption({ ...verified, userId: "other" }, BINDINGS, NOW),
    ).toBe("user_mismatch");
    expect(
      evaluateChallengeForConsumption(
        { ...verified, emailBinding: deriveEmailBinding("moved@example.com") },
        BINDINGS,
        NOW,
      ),
    ).toBe("email_changed");
  });

  it("ignores the attempt cap once verification succeeded (guessing is over)", () => {
    expect(
      evaluateChallengeForConsumption({ ...verified, attemptCount: 5 }, BINDINGS, NOW),
    ).toBeNull();
  });
});
