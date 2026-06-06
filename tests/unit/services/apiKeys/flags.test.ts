/**
 * @jest-environment node
 *
 * Tests for services/apiKeys/flags.ts (FK-1) — default-OFF public-API-keys flag.
 */

import {
  PUBLIC_API_KEYS_FLAG,
  isPublicApiKeysEnabled,
} from "@/services/apiKeys/flags";

describe("isPublicApiKeysEnabled", () => {
  const prev = process.env[PUBLIC_API_KEYS_FLAG];
  afterEach(() => {
    if (prev === undefined) delete process.env[PUBLIC_API_KEYS_FLAG];
    else process.env[PUBLIC_API_KEYS_FLAG] = prev;
  });

  it("defaults OFF when the env var is unset", () => {
    delete process.env[PUBLIC_API_KEYS_FLAG];
    expect(isPublicApiKeysEnabled()).toBe(false);
  });

  it("is ON only for the exact string 'true'", () => {
    process.env[PUBLIC_API_KEYS_FLAG] = "true";
    expect(isPublicApiKeysEnabled()).toBe(true);
    process.env[PUBLIC_API_KEYS_FLAG] = "1";
    expect(isPublicApiKeysEnabled()).toBe(false);
    process.env[PUBLIC_API_KEYS_FLAG] = "TRUE";
    expect(isPublicApiKeysEnabled()).toBe(false);
  });
});
