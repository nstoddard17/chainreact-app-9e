/** @jest-environment node */
/**
 * Explicit-key seam of core/encryption/tokens.ts
 * (DEV-CONNECTION-TRANSPLANT-UTILITY-1).
 *
 * Proves the seam supports two keys in ONE process without touching
 * process.env, that ciphertext under one key never decrypts under another,
 * and that the env-bound functions remain byte-compatible with the seam
 * (a WithKey ciphertext decrypts via decryptToken when the env key matches).
 */
import { randomBytes } from "node:crypto";
import {
  encryptToken,
  decryptToken,
  encryptTokenWithKey,
  decryptTokenWithKey,
  parseTokenEncryptionKey,
  DecryptionFailedError,
} from "@/core/encryption/tokens";

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("parseTokenEncryptionKey", () => {
  it("parses a base64 32-byte key", () => {
    const raw = randomBytes(32).toString("base64");
    expect(parseTokenEncryptionKey(raw).length).toBe(32);
  });

  it("rejects a short key, naming the label but never the material", () => {
    const raw = Buffer.from("short").toString("base64");
    let message = "";
    try {
      parseTokenEncryptionKey(raw, "SOME_KEY_LABEL");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/SOME_KEY_LABEL/);
    expect(message).toMatch(/32 bytes/);
    expect(message).not.toContain(raw);
  });
});

describe("encryptTokenWithKey / decryptTokenWithKey", () => {
  it("round-trips under an explicit key with env unset", () => {
    expect(process.env.TOKEN_ENCRYPTION_KEY).toBeUndefined();
    const ct = encryptTokenWithKey("secret-token-value", KEY_A);
    expect(decryptTokenWithKey(ct, KEY_A)).toBe("secret-token-value");
  });

  it("supports two keys in one process: A-ciphertext decrypts ONLY with A", () => {
    const ct = encryptTokenWithKey("cross-env-secret", KEY_A);
    expect(() => decryptTokenWithKey(ct, KEY_B)).toThrow(DecryptionFailedError);
    expect(decryptTokenWithKey(ct, KEY_A)).toBe("cross-env-secret");
  });

  it("re-encryption under a second key yields different ciphertext that only the second key opens", () => {
    const sourceCt = encryptTokenWithKey("transplanted-token", KEY_A);
    const plaintext = decryptTokenWithKey(sourceCt, KEY_A);
    const destCt = encryptTokenWithKey(plaintext, KEY_B);
    expect(destCt).not.toBe(sourceCt);
    expect(decryptTokenWithKey(destCt, KEY_B)).toBe("transplanted-token");
    expect(() => decryptTokenWithKey(destCt, KEY_A)).toThrow(DecryptionFailedError);
  });

  it("rejects a non-32-byte key Buffer without echoing anything", () => {
    expect(() => encryptTokenWithKey("x", randomBytes(16))).toThrow(/32-byte/);
    expect(() => decryptTokenWithKey("aaaa", randomBytes(16))).toThrow(/32-byte/);
  });

  it("rejects empty plaintext like the env-bound function", () => {
    expect(() => encryptTokenWithKey("", KEY_A)).toThrow(/non-empty/);
  });
});

describe("compatibility with the env-bound functions", () => {
  it("encryptTokenWithKey output decrypts via decryptToken when env key matches", () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_A.toString("base64");
    const ct = encryptTokenWithKey("env-compat-token", KEY_A);
    expect(decryptToken(ct)).toBe("env-compat-token");
  });

  it("encryptToken output decrypts via decryptTokenWithKey with the same key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY_A.toString("base64");
    const ct = encryptToken("env-compat-token-2");
    expect(decryptTokenWithKey(ct, KEY_A)).toBe("env-compat-token-2");
  });
});
