/**
 * @jest-environment node
 *
 * Tests for the Calendly webhook signature helper — Slice 5.CALENDLY-1.
 *
 * Wire format: `Calendly-Webhook-Signature: t=<unix>,v1=<hex>` where v1
 * is HMAC-SHA256 (hex) over `<t>.<raw body>`, keyed with the
 * subscription's V2-minted signing key. Tolerance is deliberately
 * generous (24h + skew — see the helper's doc comment).
 */
import { createHmac } from "node:crypto";
import {
  CALENDLY_REPLAY_TOLERANCE_SECONDS,
  verifyCalendlySignature,
} from "@/integrations/_shared/calendly/webhooks/signature";

const SECRET = "test-signing-key";
const BODY = '{"event":"invitee.created","payload":{}}';
const NOW = 1_800_000_000; // fixed clock for determinism

function sign(body: string, secret: string, timestamp: number): string {
  const hex = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${hex}`;
}

describe("verifyCalendlySignature", () => {
  it("accepts a valid t=,v1= signature over <t>.<raw body>", () => {
    const header = sign(BODY, SECRET, NOW - 30);
    expect(verifyCalendlySignature(BODY, header, SECRET, NOW)).toEqual({
      valid: true,
    });
  });

  it("accepts v1 and t in any order with extra parts ignored", () => {
    const base = sign(BODY, SECRET, NOW - 30);
    const [t, v1] = base.split(",");
    expect(
      verifyCalendlySignature(BODY, `${v1},${t},v0=legacy`, SECRET, NOW),
    ).toEqual({ valid: true });
  });

  it("rejects a forged signature (wrong key)", () => {
    const header = sign(BODY, "other-key", NOW);
    expect(verifyCalendlySignature(BODY, header, SECRET, NOW)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects a signature computed over a different body", () => {
    const header = sign('{"tampered":true}', SECRET, NOW);
    expect(verifyCalendlySignature(BODY, header, SECRET, NOW)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects a valid-format signature whose timestamp was altered (timestamp is signed)", () => {
    const header = sign(BODY, SECRET, NOW - 30).replace(
      `t=${NOW - 30}`,
      `t=${NOW - 10}`,
    );
    expect(verifyCalendlySignature(BODY, header, SECRET, NOW)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects a missing header", () => {
    expect(verifyCalendlySignature(BODY, null, SECRET, NOW)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("rejects an empty secret", () => {
    const header = sign(BODY, SECRET, NOW);
    expect(verifyCalendlySignature(BODY, header, "", NOW)).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it.each([
    ["no parts", "garbage"],
    ["missing v1", `t=${NOW}`],
    ["missing t", "v1=abcd"],
    ["non-numeric t", `t=abc,v1=${"a".repeat(64)}`],
    ["short hex", `t=${NOW},v1=abcd`],
    ["non-hex v1", `t=${NOW},v1=${"z".repeat(64)}`],
  ])("rejects a malformed header (%s)", (_label, header) => {
    expect(verifyCalendlySignature(BODY, header, SECRET, NOW)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("accepts timestamps anywhere inside the generous tolerance window", () => {
    const withinPast = sign(BODY, SECRET, NOW - (CALENDLY_REPLAY_TOLERANCE_SECONDS - 60));
    expect(verifyCalendlySignature(BODY, withinPast, SECRET, NOW)).toEqual({
      valid: true,
    });
  });

  it("rejects timestamps outside the tolerance window as stale (valid HMAC, ancient replay)", () => {
    const stale = sign(BODY, SECRET, NOW - (CALENDLY_REPLAY_TOLERANCE_SECONDS + 60));
    expect(verifyCalendlySignature(BODY, stale, SECRET, NOW)).toEqual({
      valid: false,
      reason: "stale_timestamp",
    });
  });
});
