/**
 * @jest-environment node
 *
 * Tests for services/ai/tools/redact.ts (Slice 4.AI-2).
 *
 * The agent must never receive token material. These tests pin the
 * secret-key policy and the deep, non-mutating redaction pass.
 */
import { isSecretKey, redactSecrets, REDACTED } from "@/services/ai/tools/redact";

describe("isSecretKey", () => {
  it.each([
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "clientSecret",
    "client_secret",
    "apiSecret",
    "api_secret",
    "webhookSecret",
    "webhook_secret",
    "botToken",
    "bot_token",
    "accessTokenEncrypted",
    "refresh_token_encrypted",
    "password",
    "Authorization",
    "apiKey",
    "api_key",
    "privateKey",
    "credentials",
  ])("flags secret-bearing key %s", (key) => {
    expect(isSecretKey(key)).toBe(true);
  });

  it.each([
    "channelId",
    "idempotencyKey",
    "name",
    "displayName",
    "message",
    "publicId",
    "id",
    "spreadsheetId",
    "to",
    "subject",
  ])("does not flag innocuous key %s", (key) => {
    expect(isSecretKey(key)).toBe(false);
  });
});

describe("redactSecrets", () => {
  it("redacts secret-keyed values at the top level", () => {
    const out = redactSecrets({ channel: "general", apiKey: "SUPERSECRET" });
    expect(out).toEqual({ channel: "general", apiKey: REDACTED });
  });

  it("redacts secret-keyed values deeply (nested objects + arrays)", () => {
    const out = redactSecrets({
      headers: { Authorization: "Bearer abc", "Content-Type": "application/json" },
      items: [{ accessToken: "x", label: "ok" }],
    });
    expect(out).toEqual({
      headers: { Authorization: REDACTED, "Content-Type": "application/json" },
      items: [{ accessToken: REDACTED, label: "ok" }],
    });
  });

  it("preserves non-secret values, including 0 and false", () => {
    const out = redactSecrets({ count: 0, enabled: false, name: "x" });
    expect(out).toEqual({ count: 0, enabled: false, name: "x" });
  });

  it("does not mutate the input", () => {
    const input = { apiKey: "SECRET", nested: { token: "T" } };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactSecrets(input);
    expect(input).toEqual(snapshot);
  });

  it("returns primitives and arrays unchanged in shape", () => {
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(["a", "b"])).toEqual(["a", "b"]);
  });
});
