import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

/**
 * Application-layer token encryption per docs/rules/database-security.md.
 *
 * Format: base64(iv ‖ authTag ‖ ciphertext)
 *   - iv:        12 bytes (random per encryption — AES-GCM standard)
 *   - authTag:   16 bytes (GCM authentication tag)
 *   - ciphertext: variable (AES-256 of utf8(plaintext))
 *
 * Encrypts before write, decrypts on read. Decryption failure is fatal — never
 * silently retried. RLS is the second line of defense; this is the first.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class KeyMissingError extends Error {
  constructor() {
    super("TOKEN_ENCRYPTION_KEY env var is not set.");
    this.name = "KeyMissingError";
  }
}

export class DecryptionFailedError extends Error {
  constructor() {
    super("Token decryption failed (wrong key, malformed input, or tampered ciphertext).");
    this.name = "DecryptionFailedError";
  }
}

/**
 * Parse a base64-encoded 32-byte key into a Buffer. `label` names the key's
 * origin in the error message (an env-var name — NEVER key material).
 */
export function parseTokenEncryptionKey(
  raw: string,
  label = "TOKEN_ENCRYPTION_KEY",
): Buffer {
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `${label} must decode to ${KEY_LENGTH} bytes (got ${buf.length}). Use \`openssl rand -base64 32\`.`,
    );
  }
  return buf;
}

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new KeyMissingError();
  return parseTokenEncryptionKey(raw);
}

/**
 * Pure explicit-key seam (DEV-CONNECTION-TRANSPLANT-UTILITY-1). Same cipher,
 * same packed format as `encryptToken` — the env-bound functions below delegate
 * here. Exists so a single process can hold ciphertext under TWO keys (e.g. an
 * owner-operated cross-environment re-encryption) without mutating
 * `process.env` between calls. The key argument is a caller-parsed 32-byte
 * Buffer (`parseTokenEncryptionKey`).
 */
export function encryptTokenWithKey(plaintext: string, key: Buffer): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptToken: plaintext must be a non-empty string.");
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw new Error(`encryptTokenWithKey: key must be a ${KEY_LENGTH}-byte Buffer.`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv) as CipherGCM;
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Explicit-key counterpart of `decryptToken` — see `encryptTokenWithKey`. */
export function decryptTokenWithKey(packed: string, key: Buffer): string {
  if (typeof packed !== "string" || packed.length === 0) {
    throw new DecryptionFailedError();
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw new Error(`decryptTokenWithKey: key must be a ${KEY_LENGTH}-byte Buffer.`);
  }
  const buf = Buffer.from(packed, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new DecryptionFailedError();
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv) as DecipherGCM;
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptionFailedError();
  }
}

export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptToken: plaintext must be a non-empty string.");
  }
  return encryptTokenWithKey(plaintext, getKey());
}

export function decryptToken(packed: string): string {
  // Shape checks run BEFORE the key lookup (preserves the original ordering:
  // malformed input is a DecryptionFailedError even when the key is unset).
  if (typeof packed !== "string" || packed.length === 0) {
    throw new DecryptionFailedError();
  }
  if (Buffer.from(packed, "base64").length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new DecryptionFailedError();
  }
  return decryptTokenWithKey(packed, getKey());
}
