/**
 * @jest-environment node
 *
 * Tests for the Airtable webhook signature verifier. Mirrors V1's
 * defensive multi-encoding compare (hex + base64; with-prefix +
 * bare-value); rejects all the spoof / tamper paths.
 */
import { createHmac, randomBytes } from "node:crypto";
import { verifyAirtableSignature } from "@/integrations/_shared/airtable/webhooks/signature";

function makeKey(): { keyBytes: Buffer; macSecretBase64: string } {
  const keyBytes = randomBytes(32);
  return { keyBytes, macSecretBase64: keyBytes.toString("base64") };
}

function signHex(rawBody: string, keyBytes: Buffer): string {
  return createHmac("sha256", keyBytes).update(rawBody, "utf8").digest("hex");
}

function signBase64(rawBody: string, keyBytes: Buffer): string {
  return createHmac("sha256", keyBytes).update(rawBody, "utf8").digest("base64");
}

describe("verifyAirtableSignature — happy path", () => {
  it("accepts canonical hmac-sha256=<hex> header from a known secret", () => {
    const { keyBytes, macSecretBase64 } = makeKey();
    const body = JSON.stringify({ base: { id: "appA" }, webhook: { id: "achA" } });
    const sig = `hmac-sha256=${signHex(body, keyBytes)}`;
    expect(verifyAirtableSignature(body, sig, macSecretBase64)).toBe(true);
  });

  it("accepts bare hex value (no `hmac-sha256=` prefix)", () => {
    const { keyBytes, macSecretBase64 } = makeKey();
    const body = "raw body";
    const sig = signHex(body, keyBytes);
    expect(verifyAirtableSignature(body, sig, macSecretBase64)).toBe(true);
  });

  it("accepts base64-encoded signature (V1 fallback)", () => {
    const { keyBytes, macSecretBase64 } = makeKey();
    const body = "raw body";
    const sig = signBase64(body, keyBytes);
    expect(verifyAirtableSignature(body, sig, macSecretBase64)).toBe(true);
  });

  it("ignores leading/trailing whitespace in the header", () => {
    const { keyBytes, macSecretBase64 } = makeKey();
    const body = "x";
    const sig = `  hmac-sha256=${signHex(body, keyBytes)}  `;
    expect(verifyAirtableSignature(body, sig, macSecretBase64)).toBe(true);
  });

  it("accepts a multi-value comma-separated header where one matches", () => {
    const { keyBytes, macSecretBase64 } = makeKey();
    const body = "x";
    const sig = `hmac-sha256=invalidhex, hmac-sha256=${signHex(body, keyBytes)}`;
    expect(verifyAirtableSignature(body, sig, macSecretBase64)).toBe(true);
  });
});

describe("verifyAirtableSignature — rejection paths", () => {
  it("rejects when header is null", () => {
    const { macSecretBase64 } = makeKey();
    expect(verifyAirtableSignature("body", null, macSecretBase64)).toBe(false);
  });

  it("rejects when macSecretBase64 is empty", () => {
    expect(verifyAirtableSignature("body", "hmac-sha256=abcd", "")).toBe(false);
  });

  it("rejects a tampered hex digest (one byte flipped)", () => {
    const { keyBytes, macSecretBase64 } = makeKey();
    const body = "raw";
    const valid = signHex(body, keyBytes);
    const tampered = (valid[0] === "0" ? "1" : "0") + valid.slice(1);
    expect(
      verifyAirtableSignature(body, `hmac-sha256=${tampered}`, macSecretBase64),
    ).toBe(false);
  });

  it("rejects a different-length signature (wrong-encoding spoof)", () => {
    const { macSecretBase64 } = makeKey();
    expect(
      verifyAirtableSignature("body", "hmac-sha256=tooshort", macSecretBase64),
    ).toBe(false);
  });

  it("rejects when the body has been re-serialized (whitespace changed)", () => {
    // Verifies the route MUST hash the raw bytes — not a reparsed JSON
    // string. Computes the MAC over the original body, but submits a
    // re-serialized body for verification.
    const { keyBytes, macSecretBase64 } = makeKey();
    const original = '{"base":{"id":"appA"},"webhook":{"id":"achA"}}';
    const reSerialized = JSON.stringify(JSON.parse(original)); // identical here, but…
    const sig = `hmac-sha256=${signHex(original, keyBytes)}`;
    expect(verifyAirtableSignature(reSerialized, sig, macSecretBase64)).toBe(true);
    // Now intentionally introduce whitespace.
    const padded = `${original}\n`;
    expect(verifyAirtableSignature(padded, sig, macSecretBase64)).toBe(false);
  });

  it("rejects when the secret is wrong (different key signed it)", () => {
    const otherKey = randomBytes(32);
    const { macSecretBase64 } = makeKey();
    const body = "x";
    const sig = `hmac-sha256=${signHex(body, otherKey)}`;
    expect(verifyAirtableSignature(body, sig, macSecretBase64)).toBe(false);
  });

  it("rejects header without parseable candidates", () => {
    const { macSecretBase64 } = makeKey();
    expect(verifyAirtableSignature("body", "  ", macSecretBase64)).toBe(false);
    expect(verifyAirtableSignature("body", ",,", macSecretBase64)).toBe(false);
  });
});

describe("verifyAirtableSignature — constant-time guarantee (smoke test)", () => {
  it("does not throw on length-mismatch comparisons", () => {
    // crypto.timingSafeEqual throws on length mismatch; the verifier
    // pre-checks length to avoid that branch. Smoke test that no
    // length-mismatch input throws.
    const { macSecretBase64 } = makeKey();
    expect(() =>
      verifyAirtableSignature(
        "body",
        "hmac-sha256=aa",
        macSecretBase64,
      ),
    ).not.toThrow();
    expect(() =>
      verifyAirtableSignature(
        "body",
        "hmac-sha256=" + "f".repeat(128),
        macSecretBase64,
      ),
    ).not.toThrow();
  });
});
