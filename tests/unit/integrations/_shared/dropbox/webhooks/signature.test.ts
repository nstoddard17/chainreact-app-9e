/**
 * @jest-environment node
 *
 * Tests for `_shared/dropbox/webhooks/signature.ts` — Dropbox webhook HMAC
 * verification (Slice 3.DROPBOX-5).
 */
import { createHmac } from "node:crypto";
import { verifyDropboxSignature } from "@/integrations/_shared/dropbox/webhooks/signature";

const SECRET = "dropbox-test-app-secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyDropboxSignature", () => {
  it("accepts a valid bare lowercase-hex HMAC-SHA256 signature", () => {
    const body = '{"list_folder":{"accounts":["dbid:1"]}}';
    expect(verifyDropboxSignature(body, sign(body), SECRET)).toEqual({
      valid: true,
    });
  });

  it("rejects a mismatched signature", () => {
    const body = '{"list_folder":{"accounts":["dbid:1"]}}';
    const wrong = sign("a different body");
    expect(verifyDropboxSignature(body, wrong, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects a missing signature header (null)", () => {
    expect(verifyDropboxSignature("{}", null, SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("fails closed when the secret is empty (missing_secret → route 503)", () => {
    const body = "{}";
    expect(verifyDropboxSignature(body, sign(body), "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it("rejects a non-64-char / non-hex digest as malformed", () => {
    expect(verifyDropboxSignature("{}", "not-hex", SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
    // Right length, wrong alphabet (uppercase — Dropbox uses lowercase hex).
    expect(verifyDropboxSignature("{}", "A".repeat(64), SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
    // Right alphabet, wrong length.
    expect(verifyDropboxSignature("{}", "a".repeat(63), SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("verifies over the RAW body — whitespace changes invalidate", () => {
    const body = '{ "list_folder": { "accounts": ["dbid:1"] } }';
    const sig = sign(body);
    expect(verifyDropboxSignature(body, sig, SECRET).valid).toBe(true);
    const reserialized = JSON.stringify(JSON.parse(body));
    expect(reserialized).not.toBe(body);
    expect(verifyDropboxSignature(reserialized, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects when verified against the wrong secret", () => {
    const body = '{"list_folder":{"accounts":["dbid:1"]}}';
    const sig = sign(body, "some-other-secret");
    expect(verifyDropboxSignature(body, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });
});
