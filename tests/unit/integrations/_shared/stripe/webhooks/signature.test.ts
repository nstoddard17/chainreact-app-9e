/**
 * @jest-environment node
 *
 * Tests for `verifyStripeSignature` — the canonical
 * `Stripe-Signature: t=<unix>,v1=<hex>` HMAC verification.
 */
import { createHmac } from "node:crypto";
import {
  verifyStripeSignature,
  STRIPE_SIGNATURE_DEFAULT_TOLERANCE_SECONDS,
} from "@/integrations/_shared/stripe/webhooks/signature";

const SECRET = "whsec_test_signing_secret";
const RAW_BODY = '{"id":"evt_1","type":"payment_intent.succeeded"}';
const SECOND_SECRET = "whsec_rotation_secondary";

function signWith(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
}

function buildHeader(parts: string[]): string {
  return parts.join(",");
}

describe("verifyStripeSignature", () => {
  const NOW = 1_700_000_000; // epoch seconds, fixed for determinism

  it("accepts a single valid v1 signature", () => {
    const sig = signWith(SECRET, NOW, RAW_BODY);
    const header = buildHeader([`t=${NOW}`, `v1=${sig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it("accepts when ANY v1 candidate matches (secret rotation window)", () => {
    // During rotation, Stripe signs with both the old and new secret
    // and includes both v1 entries. V2 must accept on the first
    // matching candidate.
    const oldSig = signWith(SECRET, NOW, RAW_BODY);
    const newSig = signWith(SECOND_SECRET, NOW, RAW_BODY);
    const header = buildHeader([`t=${NOW}`, `v1=${oldSig}`, `v1=${newSig}`]);

    // Verify against the OLD secret (matches first candidate).
    expect(
      verifyStripeSignature(RAW_BODY, header, SECRET, { nowSeconds: NOW }).valid,
    ).toBe(true);

    // Verify against the NEW secret (matches second candidate).
    expect(
      verifyStripeSignature(RAW_BODY, header, SECOND_SECRET, {
        nowSeconds: NOW,
      }).valid,
    ).toBe(true);
  });

  it("returns mismatch when no v1 candidate matches the secret", () => {
    const wrongSig = signWith("whsec_wrong", NOW, RAW_BODY);
    const header = buildHeader([`t=${NOW}`, `v1=${wrongSig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("mismatch");
  });

  it("returns missing_header on null header", () => {
    const result = verifyStripeSignature(RAW_BODY, null, SECRET);
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("missing_header");
  });

  it("returns missing_header on empty-string header", () => {
    const result = verifyStripeSignature(RAW_BODY, "", SECRET);
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("missing_header");
  });

  it("returns malformed_header when no t= present", () => {
    const sig = signWith(SECRET, NOW, RAW_BODY);
    const result = verifyStripeSignature(RAW_BODY, `v1=${sig}`, SECRET);
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("malformed_header");
  });

  it("returns malformed_timestamp when t= is non-numeric", () => {
    const sig = signWith(SECRET, NOW, RAW_BODY);
    const header = buildHeader([`t=not-a-number`, `v1=${sig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET);
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("malformed_timestamp");
  });

  it("returns no_v1_signatures when t= is present but no v1=", () => {
    const result = verifyStripeSignature(RAW_BODY, `t=${NOW}`, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("no_v1_signatures");
  });

  it("returns expired when timestamp is older than tolerance window", () => {
    const oldT = NOW - STRIPE_SIGNATURE_DEFAULT_TOLERANCE_SECONDS - 1;
    const sig = signWith(SECRET, oldT, RAW_BODY);
    const header = buildHeader([`t=${oldT}`, `v1=${sig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("expired");
  });

  it("returns expired when timestamp is in the FUTURE outside tolerance (clock-skew guard)", () => {
    const futureT = NOW + STRIPE_SIGNATURE_DEFAULT_TOLERANCE_SECONDS + 1;
    const sig = signWith(SECRET, futureT, RAW_BODY);
    const header = buildHeader([`t=${futureT}`, `v1=${sig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("expired");
  });

  it("accepts at the exact tolerance boundary", () => {
    const boundaryT = NOW - STRIPE_SIGNATURE_DEFAULT_TOLERANCE_SECONDS;
    const sig = signWith(SECRET, boundaryT, RAW_BODY);
    const header = buildHeader([`t=${boundaryT}`, `v1=${sig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it("respects custom tolerance window", () => {
    const slightlyOld = NOW - 10;
    const sig = signWith(SECRET, slightlyOld, RAW_BODY);
    const header = buildHeader([`t=${slightlyOld}`, `v1=${sig}`]);
    // 5s tolerance — 10s old should fail.
    const tightResult = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
      toleranceSeconds: 5,
    });
    expect(tightResult.valid).toBe(false);
    // 60s tolerance — 10s old should pass.
    const looseResult = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
      toleranceSeconds: 60,
    });
    expect(looseResult.valid).toBe(true);
  });

  it("ignores forward-compatible unknown signature schemes (v2=, future)", () => {
    const sig = signWith(SECRET, NOW, RAW_BODY);
    const header = buildHeader([`t=${NOW}`, `v2=ignored-future-scheme`, `v1=${sig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it("treats whitespace around comma-separated parts as tolerable", () => {
    const sig = signWith(SECRET, NOW, RAW_BODY);
    const header = `t=${NOW} , v1=${sig}`;
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it("returns mismatch on length-mismatched (truncated hex) candidate without throwing", () => {
    // Buffer.from("abc", "hex") silently returns a 1-byte buffer.
    // The length check must guard timingSafeEqual which throws on
    // length mismatch.
    const header = buildHeader([`t=${NOW}`, `v1=abc`]);
    const result = verifyStripeSignature(RAW_BODY, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("mismatch");
  });

  it("rejects when raw body has been mutated (whitespace re-serialization)", () => {
    // Stripe signs the EXACT bytes; re-serializing the JSON
    // (whitespace differs) breaks the digest. Load-bearing — the
    // receive route must capture rawBody BEFORE JSON.parse.
    const sig = signWith(SECRET, NOW, RAW_BODY);
    const header = buildHeader([`t=${NOW}`, `v1=${sig}`]);
    const mutated =
      '{"id":"evt_1", "type":"payment_intent.succeeded"}'; // extra space
    const result = verifyStripeSignature(mutated, header, SECRET, {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("mismatch");
  });

  it("returns mismatch on empty secret (defensive)", () => {
    const sig = signWith(SECRET, NOW, RAW_BODY);
    const header = buildHeader([`t=${NOW}`, `v1=${sig}`]);
    const result = verifyStripeSignature(RAW_BODY, header, "", {
      nowSeconds: NOW,
    });
    expect(result.valid).toBe(false);
    if (result.valid === false) expect(result.reason).toBe("mismatch");
  });
});
