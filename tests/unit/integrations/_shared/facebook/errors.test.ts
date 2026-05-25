/**
 * @jest-environment node
 *
 * Tests for `_shared/facebook/errors.ts` — Slice 3.FACEBOOK-2. Error
 * surfacing is sanitized (machine-readable tag only, never the free-text
 * Graph message or raw body).
 */
import {
  FacebookPermissionError,
  parseFacebookErrorCode,
  surfaceFacebookError,
  FACEBOOK_AUTH_CODES,
  FACEBOOK_PERMISSION_CODES,
  FACEBOOK_RATE_CODES,
} from "@/integrations/_shared/facebook/errors";

describe("surfaceFacebookError", () => {
  it("extracts type/code/subcode — NOT the free-text message", () => {
    const body = JSON.stringify({
      error: {
        message: "(#200) The user hasn't granted pages_manage_posts for SECRET",
        type: "OAuthException",
        code: 200,
        error_subcode: 1349,
        fbtrace_id: "Abc",
      },
    });
    const tag = surfaceFacebookError(body, 403);
    expect(tag).toBe("OAuthException/code=200/subcode=1349");
    expect(tag).not.toContain("SECRET");
    expect(tag).not.toContain("hasn't granted");
  });

  it("falls back to HTTP <status> on a non-Graph body", () => {
    expect(surfaceFacebookError("<html>oops</html>", 500)).toBe("HTTP 500");
    expect(surfaceFacebookError("", 502)).toBe("HTTP 502");
  });
});

describe("parseFacebookErrorCode", () => {
  it("reads the numeric error.code, or null", () => {
    expect(parseFacebookErrorCode(JSON.stringify({ error: { code: 190 } }))).toBe(190);
    expect(parseFacebookErrorCode("not json")).toBeNull();
    expect(parseFacebookErrorCode(JSON.stringify({ error: {} }))).toBeNull();
  });
});

describe("error-code classification sets", () => {
  it("190 is auth; 200/10/3 are permission; 4/17/32/613 are rate", () => {
    expect(FACEBOOK_AUTH_CODES.has(190)).toBe(true);
    for (const c of [10, 200, 3, 299]) expect(FACEBOOK_PERMISSION_CODES.has(c)).toBe(true);
    for (const c of [4, 17, 32, 613]) expect(FACEBOOK_RATE_CODES.has(c)).toBe(true);
  });
});

describe("FacebookPermissionError", () => {
  it("carries a static App-Review hint and the tag (no secret/message leak)", () => {
    const err = new FacebookPermissionError("OAuthException/code=200");
    expect(err.tag).toBe("OAuthException/code=200");
    expect(err.message).toMatch(/App Review|Advanced Access/);
    expect(err.message).not.toContain("token");
  });
});
