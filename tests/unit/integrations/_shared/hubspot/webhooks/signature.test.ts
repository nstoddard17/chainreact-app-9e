/**
 * @jest-environment node
 *
 * Tests for `verifyHubSpotSignature` — the HubSpot V3 canonical
 * `${method}${requestUri}${rawBody}${timestamp}` HMAC verification.
 *
 * Spec source: HubSpot V3 webhook docs
 * (https://developers.hubspot.com/docs/api/webhooks/validating-requests).
 */
import { createHmac } from "node:crypto";
import {
  verifyHubSpotSignature,
  HUBSPOT_SIGNATURE_DEFAULT_TOLERANCE_MS,
} from "@/integrations/_shared/hubspot/webhooks/signature";

const SECRET = "hubspot_test_client_secret_xxxxxxxxxxxxxxxxx";
const METHOD = "POST";
const URI = "https://example.com/api/webhooks/hubspot";
const RAW_BODY = '[{"eventId":1,"subscriptionType":"contact.creation","portalId":42,"objectId":7,"occurredAt":1700000000000}]';

function signCanonical(opts: {
  secret: string;
  method: string;
  uri: string;
  body: string;
  timestampMs: number;
}): string {
  const canonical = `${opts.method}${opts.uri}${opts.body}${opts.timestampMs}`;
  return createHmac("sha256", opts.secret)
    .update(canonical, "utf8")
    .digest("base64");
}

describe("verifyHubSpotSignature", () => {
  const NOW_MS = 1_700_000_000_000;

  it("accepts a valid signature", () => {
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(true);
  });

  it("returns mismatch when the secret is wrong", () => {
    const sig = signCanonical({
      secret: "wrong-secret",
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("mismatch");
  });

  it("returns missing_header on null signature header", () => {
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: null,
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("missing_header");
  });

  it("returns missing_header on empty signature header", () => {
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: "",
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("missing_header");
  });

  it("returns missing_timestamp on null timestamp header", () => {
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: null,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("missing_timestamp");
  });

  it("returns malformed_timestamp on non-numeric timestamp", () => {
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: "not-a-number",
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("malformed_timestamp");
  });

  it("returns malformed_timestamp on whitespace-padded timestamp", () => {
    // Strict equality: `String(parseInt(" 1700000000000 "))` === "1700000000000",
    // not " 1700000000000 ". This catches accidentally-trimmed values.
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: ` ${NOW_MS} `,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("malformed_timestamp");
  });

  it("returns expired when timestamp is older than tolerance window", () => {
    const oldMs = NOW_MS - HUBSPOT_SIGNATURE_DEFAULT_TOLERANCE_MS - 1;
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: oldMs,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(oldMs),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("expired");
  });

  it("returns expired when timestamp is in the FUTURE outside tolerance (clock skew)", () => {
    const futureMs = NOW_MS + HUBSPOT_SIGNATURE_DEFAULT_TOLERANCE_MS + 1;
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: futureMs,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(futureMs),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("expired");
  });

  it("accepts at exactly the tolerance boundary", () => {
    const boundaryMs = NOW_MS - HUBSPOT_SIGNATURE_DEFAULT_TOLERANCE_MS;
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: boundaryMs,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(boundaryMs),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(true);
  });

  it("respects custom tolerance window", () => {
    const slightlyOld = NOW_MS - 5_000;
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: slightlyOld,
    });
    // 1s window — 5s old should fail.
    const tight = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(slightlyOld),
      secret: SECRET,
      nowMs: NOW_MS,
      toleranceMs: 1_000,
    });
    expect(tight.valid).toBe(false);
    // 60s window — 5s old should pass.
    const loose = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(slightlyOld),
      secret: SECRET,
      nowMs: NOW_MS,
      toleranceMs: 60_000,
    });
    expect(loose.valid).toBe(true);
  });

  it("returns mismatch when the raw body is mutated (whitespace re-serialization)", () => {
    // HubSpot signs the EXACT bytes; re-serializing the JSON breaks
    // the digest. Receive route MUST capture rawBody BEFORE JSON.parse.
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const mutated = RAW_BODY.replace(":", ": ");
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: mutated,
      signatureHeader: sig,
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("mismatch");
  });

  it("returns mismatch when the request URI is mutated", () => {
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: `${URI}/extra`,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("mismatch");
  });

  it("returns mismatch when the method is mutated", () => {
    const sig = signCanonical({
      secret: SECRET,
      method: "POST",
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: "PUT",
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("mismatch");
  });

  it("returns malformed on length-mismatched base64 candidate without throwing", () => {
    // Buffer.from('abc','base64') decodes to fewer bytes than the
    // 32-byte SHA-256 digest. The length check must guard
    // timingSafeEqual which throws on length mismatch.
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: "abc",
      timestampHeader: String(NOW_MS),
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("malformed");
  });

  it("returns mismatch on empty secret (defensive)", () => {
    const sig = signCanonical({
      secret: SECRET,
      method: METHOD,
      uri: URI,
      body: RAW_BODY,
      timestampMs: NOW_MS,
    });
    const result = verifyHubSpotSignature({
      method: METHOD,
      requestUri: URI,
      rawBody: RAW_BODY,
      signatureHeader: sig,
      timestampHeader: String(NOW_MS),
      secret: "",
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("mismatch");
  });
});
