/** @jest-environment node */
/**
 * Tests for core/security/secretKeys (AI-CONFIG-ASSIST CS-2A).
 *
 * Single source of truth for secret-shaped KEY classification, shared by the
 * server redactor (services/ai/tools/redact) and the builder chat-fill guard
 * (features/workflow-builder/ai/chatFillEligibility). Pins the required
 * secret/non-secret sets and parity with the server redactor's `isSecretKey`.
 */
import { isSecretLikeKey } from "@/core/security/secretKeys";
import { isSecretKey } from "@/services/ai/tools/redact";

describe("isSecretLikeKey — flags secret-shaped keys", () => {
  it.each([
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "secret",
    "password",
    "apiKey",
    "API_KEY",
    "bearer",
    "bearerToken",
    "auth",
    "authToken",
    "credential",
    "credentials",
    "clientSecret",
    // redact no-leak cases that must remain flagged:
    "Authorization",
    "privateKey",
    "accessTokenEncrypted",
  ])("flags %s", (key) => {
    expect(isSecretLikeKey(key)).toBe(true);
  });
});

describe("isSecretLikeKey — does NOT flag innocuous keys", () => {
  it.each([
    "message",
    "customMessage",
    "subject",
    "body",
    "title",
    "description",
    // critical: the capability key must not be mistaken for a secret.
    "oauth",
    // redact's pinned innocuous set:
    "channelId",
    "idempotencyKey",
    "name",
    "displayName",
    "publicId",
    "id",
    "spreadsheetId",
    "to",
  ])("does not flag %s", (key) => {
    expect(isSecretLikeKey(key)).toBe(false);
  });
});

describe("parity with the server redactor", () => {
  it("services/ai/tools/redact.isSecretKey delegates to the shared classifier (same verdict for every key)", () => {
    const keys = [
      "token",
      "accessToken",
      "refreshToken",
      "clientSecret",
      "apiSecret",
      "webhookSecret",
      "botToken",
      "accessTokenEncrypted",
      "password",
      "Authorization",
      "apiKey",
      "privateKey",
      "credentials",
      "bearer",
      "auth",
      // non-secret
      "oauth",
      "channelId",
      "idempotencyKey",
      "message",
      "subject",
      "to",
      "id",
    ];
    for (const key of keys) {
      expect(isSecretKey(key)).toBe(isSecretLikeKey(key));
    }
  });
});

describe("purity", () => {
  it("is deterministic — repeated calls agree", () => {
    expect(isSecretLikeKey("accessToken")).toBe(isSecretLikeKey("accessToken"));
    expect(isSecretLikeKey("message")).toBe(isSecretLikeKey("message"));
  });
});
