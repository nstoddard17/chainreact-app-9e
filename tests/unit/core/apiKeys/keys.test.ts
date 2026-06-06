/**
 * @jest-environment node
 *
 * Tests for core/apiKeys/keys.ts (FK-1) — pure crypto/format helpers. Proves the
 * key format is stable, the hash is deterministic + one-way (raw != hash), the raw
 * key is never derivable from what gets stored, bearer parsing is strict, and the
 * constant-time hex compare behaves.
 */

import {
  generateApiKey,
  hashApiKey,
  deriveApiKeyPrefix,
  isValidApiKeyFormat,
  parseBearerApiKey,
  timingSafeEqualHex,
  API_KEY_PREFIX_LENGTH,
} from "@/core/apiKeys/keys";

describe("generateApiKey", () => {
  it("produces a crk_<env>_… raw key with a derived prefix + sha256 hash", () => {
    const live = generateApiKey("live");
    expect(live.raw).toMatch(/^crk_live_[A-Za-z0-9_-]{40,}$/);
    expect(isValidApiKeyFormat(live.raw)).toBe(true);
    expect(live.prefix).toBe(live.raw.slice(0, API_KEY_PREFIX_LENGTH));
    expect(live.prefix.startsWith("crk_live_")).toBe(true);
    expect(live.keyHash).toBe(hashApiKey(live.raw));
    expect(live.keyHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex

    const test = generateApiKey("test");
    expect(test.raw.startsWith("crk_test_")).toBe(true);
  });

  it("is unique across calls (high entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateApiKey("live").raw);
    expect(seen.size).toBe(50);
  });

  it("the stored material (prefix + hash) is NOT the raw key — raw is unrecoverable", () => {
    const k = generateApiKey("live");
    expect(k.keyHash).not.toBe(k.raw);
    expect(k.prefix).not.toBe(k.raw);
    expect(k.prefix.length).toBeLessThan(k.raw.length);
    // The hash reveals nothing reversible; only an exact re-hash of the raw matches.
    expect(hashApiKey(k.raw)).toBe(k.keyHash);
    expect(hashApiKey(k.raw + "x")).not.toBe(k.keyHash);
  });
});

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("crk_live_abc")).toBe(hashApiKey("crk_live_abc"));
  });
  it("differs for different inputs", () => {
    expect(hashApiKey("crk_live_a")).not.toBe(hashApiKey("crk_live_b"));
  });
});

describe("isValidApiKeyFormat / deriveApiKeyPrefix", () => {
  it("accepts well-formed live/test keys, rejects junk", () => {
    expect(isValidApiKeyFormat(`crk_live_${"a".repeat(48)}`)).toBe(true);
    expect(isValidApiKeyFormat(`crk_test_${"A1_-".repeat(12)}`)).toBe(true);
    expect(isValidApiKeyFormat("crk_prod_" + "a".repeat(48))).toBe(false); // bad env
    expect(isValidApiKeyFormat("crk_live_short")).toBe(false); // too short
    expect(isValidApiKeyFormat("sk_live_" + "a".repeat(48))).toBe(false); // wrong scheme
    expect(isValidApiKeyFormat("")).toBe(false);
  });
  it("prefix is a stable-length leading slice", () => {
    const raw = `crk_live_${"a".repeat(48)}`;
    expect(deriveApiKeyPrefix(raw)).toBe(raw.slice(0, API_KEY_PREFIX_LENGTH));
    expect(deriveApiKeyPrefix(raw)).toHaveLength(API_KEY_PREFIX_LENGTH);
  });
});

describe("parseBearerApiKey", () => {
  it("extracts a valid crk key from an Authorization header", () => {
    const raw = `crk_live_${"a".repeat(48)}`;
    expect(parseBearerApiKey(`Bearer ${raw}`)).toBe(raw);
  });
  it("returns null for missing / malformed / non-crk headers", () => {
    expect(parseBearerApiKey(null)).toBeNull();
    expect(parseBearerApiKey(undefined)).toBeNull();
    expect(parseBearerApiKey("")).toBeNull();
    expect(parseBearerApiKey(`Bearer sk_live_${"a".repeat(48)}`)).toBeNull();
    expect(parseBearerApiKey(`crk_live_${"a".repeat(48)}`)).toBeNull(); // no Bearer
    expect(parseBearerApiKey("Bearer crk_live_short")).toBeNull();
  });
});

describe("timingSafeEqualHex", () => {
  it("true for identical hex digests, false otherwise", () => {
    const a = hashApiKey("crk_live_x");
    expect(timingSafeEqualHex(a, a)).toBe(true);
    expect(timingSafeEqualHex(a, hashApiKey("crk_live_y"))).toBe(false);
  });
  it("false (never throws) for unequal-length or empty inputs", () => {
    expect(timingSafeEqualHex("abcd", "ab")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(false);
  });
});
