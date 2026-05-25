import { createHmac } from "node:crypto";
import { verifyTrelloSignature } from "@/integrations/_shared/trello/webhooks/signature";

/**
 * Tests for Trello HMAC-SHA1-base64 signature verification.
 *
 * Trello's wire shape:
 *   - Header `X-Trello-Webhook: <base64>` — base64 of HMAC-SHA1.
 *   - Algorithm: HMAC-SHA1 over `${rawBody}${callbackURL}` keyed
 *     with `TRELLO_CLIENT_SECRET`.
 *   - No timestamp / replay window.
 */

const SECRET = "trello-client-secret-test";
const CALLBACK_URL = "https://app.example.test/api/webhooks/trello?workflowId=wf-1&nodeId=node-1";

function makeBody(action: Record<string, unknown>): string {
  return JSON.stringify({ action });
}

function sign(rawBody: string, callbackURL: string, secret: string): string {
  return createHmac("sha1", secret)
    .update(rawBody, "utf8")
    .update(callbackURL, "utf8")
    .digest("base64");
}

describe("verifyTrelloSignature — happy path", () => {
  it("accepts a correctly-signed body", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    const sig = sign(body, CALLBACK_URL, SECRET);
    expect(verifyTrelloSignature(body, CALLBACK_URL, sig, SECRET)).toEqual({
      valid: true,
    });
  });

  it("rejects a mismatched body (different bytes → different digest)", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    const sig = sign(body, CALLBACK_URL, SECRET);
    const tamperedBody = body.replace("act-1", "act-2");
    expect(
      verifyTrelloSignature(tamperedBody, CALLBACK_URL, sig, SECRET),
    ).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects when the callback URL differs from what was signed", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    const sig = sign(body, CALLBACK_URL, SECRET);
    const wrongUrl = CALLBACK_URL + "/extra";
    expect(verifyTrelloSignature(body, wrongUrl, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("rejects when the secret differs", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    const sig = sign(body, CALLBACK_URL, SECRET);
    expect(
      verifyTrelloSignature(body, CALLBACK_URL, sig, "other-secret"),
    ).toEqual({ valid: false, reason: "mismatch" });
  });
});

describe("verifyTrelloSignature — failure modes", () => {
  it("returns missing_secret when secret is empty", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    const sig = sign(body, CALLBACK_URL, SECRET);
    expect(verifyTrelloSignature(body, CALLBACK_URL, sig, "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it("returns missing_header when header is null", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    expect(verifyTrelloSignature(body, CALLBACK_URL, null, SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("returns missing_header when header is empty string", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    expect(verifyTrelloSignature(body, CALLBACK_URL, "", SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("returns malformed for non-base64 garbage", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    expect(
      verifyTrelloSignature(body, CALLBACK_URL, "!!!not-base64@@@", SECRET),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns malformed for a base64 value whose length is wrong (not 20 bytes)", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    // 12 bytes of zeros base64-encodes to 16 chars.
    const tooShort = Buffer.alloc(12).toString("base64");
    expect(
      verifyTrelloSignature(body, CALLBACK_URL, tooShort, SECRET),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns malformed for an absurdly long header value", () => {
    const body = makeBody({ id: "act-1", type: "createCard" });
    const longHeader = "a".repeat(100);
    expect(
      verifyTrelloSignature(body, CALLBACK_URL, longHeader, SECRET),
    ).toEqual({ valid: false, reason: "malformed" });
  });
});

describe("verifyTrelloSignature — empty inputs", () => {
  it("signs an empty body + non-empty callback URL correctly", () => {
    const sig = sign("", CALLBACK_URL, SECRET);
    expect(verifyTrelloSignature("", CALLBACK_URL, sig, SECRET)).toEqual({
      valid: true,
    });
  });

  it("rejects when only the callback URL was signed but body now has content", () => {
    const sig = sign("", CALLBACK_URL, SECRET);
    expect(
      verifyTrelloSignature("{}", CALLBACK_URL, sig, SECRET),
    ).toEqual({ valid: false, reason: "mismatch" });
  });
});
