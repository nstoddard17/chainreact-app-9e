/**
 * @jest-environment node
 *
 * Tests for the Typeform webhook signature verifier — Slice 5.TYPEFORM-1.
 *
 * Wire format per the official docs: `Typeform-Signature` =
 * `sha256=` + BASE64 HMAC-SHA256 over the raw body (base64, NOT hex).
 */
import { createHmac } from "node:crypto";
import { verifyTypeformSignature } from "@/integrations/_shared/typeform/webhooks/signature";

const SECRET = "tf-webhook-secret-1";

function sign(body: string, secret: string = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("base64")}`;
}

describe("verifyTypeformSignature", () => {
  const body = '{"event_type":"form_response"}';

  it("accepts a valid sha256= base64 signature", () => {
    expect(verifyTypeformSignature(body, sign(body), SECRET)).toEqual({
      valid: true,
    });
  });

  it("rejects when the secret is empty", () => {
    expect(verifyTypeformSignature(body, sign(body), "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it("rejects a missing header", () => {
    expect(verifyTypeformSignature(body, null, SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("rejects a header without the sha256= prefix (e.g. bare hex — the documented mistake)", () => {
    const hex = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
    expect(verifyTypeformSignature(body, hex, SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("rejects an empty digest after the prefix", () => {
    expect(verifyTypeformSignature(body, "sha256=", SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("rejects a digest that is not 32 bytes", () => {
    expect(
      verifyTypeformSignature(body, `sha256=${Buffer.from("short").toString("base64")}`, SECRET),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("rejects a signature computed with a different secret", () => {
    expect(
      verifyTypeformSignature(body, sign(body, "another-secret"), SECRET),
    ).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a signature over different bytes (re-serialized body)", () => {
    const spaced = '{ "event_type": "form_response" }';
    expect(verifyTypeformSignature(body, sign(spaced), SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });
});
