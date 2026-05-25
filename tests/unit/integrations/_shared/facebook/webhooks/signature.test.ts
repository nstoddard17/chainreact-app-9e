/**
 * @jest-environment node
 *
 * Tests for `integrations/_shared/facebook/webhooks/signature.ts` —
 * Slice 3.FACEBOOK-5.
 */
import { createHmac } from "node:crypto";
import { verifyFacebookSignature } from "@/integrations/_shared/facebook/webhooks/signature";

const SECRET = "fb-app-secret";

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyFacebookSignature", () => {
  const body = JSON.stringify({ object: "page", entry: [] });

  it("valid sha256= signature over the raw body → valid", () => {
    expect(verifyFacebookSignature(body, sign(body), SECRET)).toEqual({ valid: true });
  });

  it("missing secret → missing_secret (route maps to 503)", () => {
    expect(verifyFacebookSignature(body, sign(body), "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it("missing header → missing_header", () => {
    expect(verifyFacebookSignature(body, null, SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("header without the sha256= prefix → malformed", () => {
    const bareHex = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyFacebookSignature(body, bareHex, SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("non-hex / wrong-length digest → malformed", () => {
    expect(verifyFacebookSignature(body, "sha256=zzz", SECRET).valid).toBe(false);
    expect(verifyFacebookSignature(body, "sha256=" + "a".repeat(63), SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("wrong signature → mismatch", () => {
    expect(verifyFacebookSignature(body, sign("different body"), SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("verifies over the RAW body — a re-serialized body fails", () => {
    const spaced = '{ "object": "page", "entry": [] }';
    const sig = sign(spaced);
    const reserialized = JSON.stringify(JSON.parse(spaced));
    expect(verifyFacebookSignature(reserialized, sig, SECRET).valid).toBe(false);
  });

  it("never echoes the secret or digest in the result", () => {
    const result = verifyFacebookSignature(body, sign("x"), SECRET);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
