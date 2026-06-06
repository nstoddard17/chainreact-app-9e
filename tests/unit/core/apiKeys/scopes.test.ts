/**
 * @jest-environment node
 *
 * Tests for core/apiKeys/scopes.ts (FK-1) — the launch-trigger-only scope model.
 */

import {
  API_KEY_SCOPE_TRIGGER,
  KNOWN_API_KEY_SCOPES,
  LAUNCH_ENABLED_API_KEY_SCOPES,
  isKnownApiKeyScope,
  isLaunchEnabledApiKeyScope,
  validateApiKeyScopes,
  hasApiKeyScope,
} from "@/core/apiKeys/scopes";

describe("scope sets", () => {
  it("knows trigger/read/manage/account scopes; only trigger is launch-enabled", () => {
    expect(KNOWN_API_KEY_SCOPES).toEqual([
      "workflows:trigger",
      "workflows:read",
      "workflows:manage",
      "account:read",
    ]);
    expect(LAUNCH_ENABLED_API_KEY_SCOPES).toEqual([API_KEY_SCOPE_TRIGGER]);
  });

  it("classifies known vs launch-enabled", () => {
    expect(isKnownApiKeyScope("workflows:read")).toBe(true);
    expect(isKnownApiKeyScope("workflows:delete")).toBe(false);
    expect(isLaunchEnabledApiKeyScope("workflows:trigger")).toBe(true);
    expect(isLaunchEnabledApiKeyScope("workflows:read")).toBe(false); // known but disabled
  });
});

describe("validateApiKeyScopes (create-time)", () => {
  it("accepts the launch trigger scope", () => {
    expect(validateApiKeyScopes(["workflows:trigger"])).toEqual({
      ok: true,
      scopes: ["workflows:trigger"],
    });
  });

  it("rejects an empty list", () => {
    expect(validateApiKeyScopes([])).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects an unknown scope", () => {
    expect(validateApiKeyScopes(["workflows:trigger", "workflows:delete"])).toEqual({
      ok: false,
      reason: "unknown_scope",
    });
  });

  it("rejects a known-but-not-yet-enabled scope", () => {
    expect(validateApiKeyScopes(["workflows:read"])).toEqual({
      ok: false,
      reason: "scope_not_enabled",
    });
  });
});

describe("hasApiKeyScope (verify-time)", () => {
  it("checks membership in a key's granted scopes", () => {
    expect(hasApiKeyScope(["workflows:trigger"], "workflows:trigger")).toBe(true);
    expect(hasApiKeyScope(["workflows:read"], "workflows:trigger")).toBe(false);
    expect(hasApiKeyScope([], "workflows:trigger")).toBe(false);
  });
});
