/**
 * @jest-environment node
 *
 * Tests for `_shared/monday/webhooks/signature.ts` — Monday webhook HMAC
 * verification (Slice 3.MONDAY-7).
 */
import { createHmac } from "node:crypto";
import { verifyMondaySignature } from "@/integrations/_shared/monday/webhooks/signature";

const SECRET = "monday-test-signing-secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyMondaySignature", () => {
  it("accepts a valid bare-hex HMAC-SHA256 signature", () => {
    const body = '{"event":{"type":"create_item"}}';
    expect(verifyMondaySignature(body, sign(body), SECRET)).toEqual({
      valid: true,
    });
  });

  it("accepts a valid signature carrying an optional sha256= prefix", () => {
    const body = '{"event":{"type":"create_item"}}';
    expect(
      verifyMondaySignature(body, `sha256=${sign(body)}`, SECRET),
    ).toEqual({ valid: true });
  });

  it("rejects a mismatched signature", () => {
    const body = '{"event":{"type":"create_item"}}';
    const wrong = sign("a different body");
    expect(verifyMondaySignature(body, wrong, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects a missing signature header (null)", () => {
    expect(verifyMondaySignature("{}", null, SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("fails closed when the secret is empty (missing_secret → route 503)", () => {
    const body = "{}";
    expect(verifyMondaySignature(body, sign(body), "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it("rejects a non-64-char / non-hex digest as malformed", () => {
    expect(verifyMondaySignature("{}", "not-hex", SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
    // Right length, wrong alphabet.
    expect(verifyMondaySignature("{}", "Z".repeat(64), SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("verifies over the RAW body — whitespace changes invalidate", () => {
    // Original carries whitespace; re-serializing strips it → different
    // bytes → the digest no longer matches.
    const body = '{ "event": { "type": "create_item", "boardId": 1 } }';
    const sig = sign(body);
    expect(verifyMondaySignature(body, sig, SECRET).valid).toBe(true);
    const reserialized = JSON.stringify(JSON.parse(body));
    expect(reserialized).not.toBe(body);
    expect(verifyMondaySignature(reserialized, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects when verified against the wrong secret", () => {
    const body = '{"event":{"type":"create_item"}}';
    const sig = sign(body, "some-other-secret");
    expect(verifyMondaySignature(body, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });
});
