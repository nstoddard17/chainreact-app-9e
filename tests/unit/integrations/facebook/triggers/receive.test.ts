/**
 * @jest-environment node
 *
 * Tests for `integrations/facebook/triggers/_shared/receive.ts` —
 * Slice 3.FACEBOOK-5. Signature verify (fail-closed) + parse. No leaks.
 */
import { createHmac } from "node:crypto";
import {
  MissingSecretError,
  receiveFacebookWebhook,
} from "@/integrations/facebook/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

const SECRET = "fb-app-secret";

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://app.test/api/webhooks/facebook", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  process.env.FACEBOOK_CLIENT_SECRET = SECRET;
});

describe("receiveFacebookWebhook", () => {
  const body = JSON.stringify({ object: "page", entry: [{ id: "p1", changes: [] }] });

  it("valid signature → returns the parsed body", () => {
    const result = receiveFacebookWebhook({
      request: req({ "X-Hub-Signature-256": sign(body) }),
      rawBody: body,
    });
    expect(result.body).toMatchObject({ object: "page" });
  });

  it("missing secret → MissingSecretError (route maps to 503)", () => {
    delete process.env.FACEBOOK_CLIENT_SECRET;
    expect(() =>
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign(body) }),
        rawBody: body,
      }),
    ).toThrow(MissingSecretError);
  });

  it("missing signature header → InvalidSignatureError", () => {
    expect(() =>
      receiveFacebookWebhook({ request: req(), rawBody: body }),
    ).toThrow(InvalidSignatureError);
  });

  it("wrong signature → InvalidSignatureError", () => {
    expect(() =>
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign("other") }),
        rawBody: body,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("verified-but-non-JSON body → InvalidSignatureError (malformed)", () => {
    const raw = "not json";
    expect(() =>
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign(raw) }),
        rawBody: raw,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("never leaks the secret in the error message", () => {
    try {
      receiveFacebookWebhook({
        request: req({ "X-Hub-Signature-256": sign("other") }),
        rawBody: body,
      });
    } catch (err) {
      expect((err as Error).message).not.toContain(SECRET);
    }
  });
});
