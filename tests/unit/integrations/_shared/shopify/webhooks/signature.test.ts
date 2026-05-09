/**
 * @jest-environment node
 *
 * Tests for `verifyShopifySignature` — the HMAC-SHA256-base64-over-raw-body
 * verification helper that drives the Shopify webhook receive route.
 *
 * Pinned wire-format facts:
 *   - Algorithm: HMAC-SHA256 over raw body bytes.
 *   - Encoding: base64 of the 32-byte digest (44 base64 chars).
 *   - Key: single global app secret (`SHOPIFY_CLIENT_SECRET`).
 *   - No timestamp, no replay tolerance.
 *   - Constant-time compare via `crypto.timingSafeEqual` with a
 *     length-mismatch guard that runs FIRST (timingSafeEqual throws on
 *     different-length buffers).
 */
import { createHmac } from "node:crypto";
import { verifyShopifySignature } from "@/integrations/_shared/shopify/webhooks/signature";

const SECRET = "test_app_secret_xxx";

function signBody(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifyShopifySignature — happy path", () => {
  it("accepts a correct base64 HMAC over the raw body", () => {
    const body = '{"id":12345,"email":"buyer@example.com"}';
    const sig = signBody(body);
    expect(verifyShopifySignature(body, sig, SECRET)).toEqual({ valid: true });
  });

  it("accepts identical body+signature pairs even with body containing whitespace + newlines (raw bytes preserved)", () => {
    const body = '{\n  "order_id": 99,\n  "tags": "vip, repeat"\n}';
    const sig = signBody(body);
    expect(verifyShopifySignature(body, sig, SECRET)).toEqual({ valid: true });
  });

  it("accepts an empty body when the signature was computed over empty bytes", () => {
    const body = "";
    const sig = signBody(body);
    expect(verifyShopifySignature(body, sig, SECRET)).toEqual({ valid: true });
  });
});

describe("verifyShopifySignature — failure modes", () => {
  it("returns missing_header when signatureHeader is null", () => {
    expect(verifyShopifySignature("body", null, SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("returns missing_header when signatureHeader is empty string", () => {
    expect(verifyShopifySignature("body", "", SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("returns mismatch when secret is empty (mis-configured deployment)", () => {
    const body = '{"id":1}';
    const sig = signBody(body, "any-other-secret");
    expect(verifyShopifySignature(body, sig, "")).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("returns mismatch when the signature was computed with a DIFFERENT secret", () => {
    const body = '{"id":1}';
    const sig = signBody(body, "wrong-secret");
    expect(verifyShopifySignature(body, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("returns mismatch when the body has been tampered with after signing", () => {
    const original = '{"id":1,"email":"alice@example.com"}';
    const sig = signBody(original);
    const tampered = '{"id":1,"email":"attacker@example.com"}';
    expect(verifyShopifySignature(tampered, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("returns malformed when the header decodes to a wrong-length buffer (length-mismatch guard before timingSafeEqual)", () => {
    // Base64 "not-32-bytes" decodes to a buffer of size that doesn't
    // match SHA-256's 32 bytes. The guard catches it before
    // timingSafeEqual would throw.
    const body = "x";
    expect(verifyShopifySignature(body, "Zm9v", SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("returns malformed when the header is not valid base64 (decodes to garbage of wrong length)", () => {
    // "!!!" isn't valid base64 — Buffer.from silently produces a
    // partial / empty buffer, length-guard catches it.
    const body = '{"id":1}';
    expect(verifyShopifySignature(body, "!!!", SECRET).valid).toBe(false);
  });
});

describe("verifyShopifySignature — RAW-body re-serialization guard", () => {
  it("rejects when the body has been re-serialized with different whitespace (signature was over original bytes)", () => {
    // Caller passes the raw body Shopify signed; if the receive route
    // accidentally JSON-parsed and re-stringified, whitespace shifts
    // and the digest no longer matches.
    const original = '{"id":1, "name":"Acme"}';
    const sig = signBody(original);
    const reserialized = JSON.stringify(JSON.parse(original));
    expect(reserialized).not.toBe(original);
    expect(verifyShopifySignature(reserialized, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });
});

describe("verifyShopifySignature — constant-time / length-mismatch contract", () => {
  it("does NOT throw when given a 1-byte signature header (would crash timingSafeEqual without the length guard)", () => {
    expect(() =>
      verifyShopifySignature("x", "AA==", SECRET),
    ).not.toThrow();
  });

  it("does NOT throw when given a 100-byte signature header", () => {
    const big = "A".repeat(200);
    expect(() => verifyShopifySignature("x", big, SECRET)).not.toThrow();
  });
});
