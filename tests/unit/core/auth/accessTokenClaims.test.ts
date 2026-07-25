/**
 * @jest-environment node
 *
 * Pure access-token claim reader (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * The `session_id` claim is what binds a deletion challenge to the browser
 * session that requested it, so the reader must be exact and must NEVER throw:
 * a malformed token yields no claims, and callers then fail closed rather than
 * issuing an unbound challenge.
 */

import { readAccessTokenClaims } from "@/core/auth/accessTokenClaims";

function token(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

describe("readAccessTokenClaims", () => {
  it("reads session_id and aal from a well-formed token", () => {
    expect(readAccessTokenClaims(token({ session_id: "sess-1", aal: "aal2" }))).toEqual({
      sessionId: "sess-1",
      aal: "aal2",
    });
  });

  it("returns nulls for a token missing the claims", () => {
    expect(readAccessTokenClaims(token({ sub: "user-1" }))).toEqual({
      sessionId: null,
      aal: null,
    });
  });

  it("rejects a non-string / empty session_id rather than coercing it", () => {
    expect(readAccessTokenClaims(token({ session_id: 42 })).sessionId).toBeNull();
    expect(readAccessTokenClaims(token({ session_id: "" })).sessionId).toBeNull();
    expect(readAccessTokenClaims(token({ session_id: null })).sessionId).toBeNull();
  });

  it("normalizes an unknown aal to null", () => {
    expect(readAccessTokenClaims(token({ aal: "aal3" })).aal).toBeNull();
    expect(readAccessTokenClaims(token({ aal: 2 })).aal).toBeNull();
    expect(readAccessTokenClaims(token({ aal: "aal1" })).aal).toBe("aal1");
  });

  it("never throws on malformed input — it returns empty claims", () => {
    for (const bad of [undefined, null, "", "not-a-jwt", "a.b", "a.!!!.c", "a..c"]) {
      expect(() => readAccessTokenClaims(bad as string)).not.toThrow();
      expect(readAccessTokenClaims(bad as string)).toEqual({ sessionId: null, aal: null });
    }
  });

  it("handles base64url payloads containing - and _ (no padding)", () => {
    // A claim value chosen so its base64 encoding uses the URL-safe alphabet.
    const claims = { session_id: "a?b>c~d", aal: "aal2" };
    expect(readAccessTokenClaims(token(claims)).sessionId).toBe("a?b>c~d");
  });
});
