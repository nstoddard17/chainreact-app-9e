import { createPublicKey, verify } from "node:crypto";

/**
 * Discord Interactions Endpoint URL — Ed25519 signature verification.
 *
 * Slice 3.DISCORD-6.
 *
 * Per Discord's "Receiving and Responding" docs
 * (https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization):
 *
 *   - Algorithm: **Ed25519** (RFC 8032 / draft-irtf-cfrg-eddsa).
 *   - Signed payload: `${timestamp}${rawBody}` — the literal
 *     concatenation of the `X-Signature-Timestamp` header bytes followed
 *     by the raw request body bytes. **No separator, no encoding.**
 *   - Header `X-Signature-Ed25519`: lowercase hex of the 64-byte Ed25519
 *     signature (128 hex chars exactly).
 *   - Header `X-Signature-Timestamp`: integer Unix epoch seconds as an
 *     ASCII decimal string.
 *   - Public key: per-application, 32-byte raw Ed25519 public key,
 *     surfaced as lowercase hex (64 hex chars) in the Discord Developer
 *     Portal under "General Information → Public Key". V2 reads this
 *     from `DISCORD_INTERACTIONS_PUBLIC_KEY` env at receive time.
 *
 * Replay tolerance: Discord's interactions architecture is request-
 * response (Discord won't retry a successful 2xx; failed verification
 * causes Discord to disable the endpoint after repeated mismatches).
 * No HMAC-style timestamp replay window is enforced — the timestamp is
 * part of the signed payload to prevent replaying a *different* request
 * with an old signature, but a stale-and-still-valid timestamp is not
 * itself a verification failure. This mirrors GitHub's "no replay
 * tolerance" stance and matches Discord's reference implementation
 * (discord-interactions-js).
 *
 * Distinguishing failure reasons (route maps `missing_secret` to 503;
 * everything else to 401):
 *   - `missing_secret` — `DISCORD_INTERACTIONS_PUBLIC_KEY` env empty /
 *     unset. Server misconfig — V2 fails closed at 503.
 *   - `missing_header` — one or both of `X-Signature-Ed25519` /
 *     `X-Signature-Timestamp` absent. Route 401.
 *   - `malformed` — header / public-key shape wrong (length, non-hex,
 *     uppercase, etc.). Route 401.
 *   - `mismatch` — Ed25519 verification returned false. Route 401.
 *
 * **Raw public key handling.** Node's `crypto.verify("ed25519", ...)`
 * requires a `KeyObject` built from a SubjectPublicKeyInfo (SPKI) DER —
 * NOT the raw 32 bytes. We construct the SPKI envelope manually:
 *
 *     SEQUENCE {                                  // outer SPKI SEQUENCE
 *       SEQUENCE { OID 1.3.101.112 }              // Ed25519 AlgorithmIdentifier
 *       BIT STRING (<raw 32 bytes>)               // public key
 *     }
 *
 * The DER bytes are fixed-width (`30 2a 30 05 06 03 2b 65 70 03 21 00 <32 raw bytes>`).
 * This avoids a runtime dependency on `tweetnacl` or `@noble/ed25519` —
 * the entire helper stays inside Node's stdlib.
 *
 * Mirrors `_shared/github/webhooks/signature.ts` shape: raw body + raw
 * signature header + raw timestamp header + raw public key hex in, typed
 * result out. Cross-provider contract stays consistent.
 */

export type DiscordSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyDiscordSignatureResult =
  | { valid: true }
  | { valid: false; reason: DiscordSignatureFailReason };

const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_PUBLIC_KEY_HEX_LENGTH = ED25519_PUBLIC_KEY_BYTES * 2;
const ED25519_SIGNATURE_BYTES = 64;
const ED25519_SIGNATURE_HEX_LENGTH = ED25519_SIGNATURE_BYTES * 2;

/**
 * Fixed SPKI prefix for an Ed25519 public key.
 *
 * `30 2a` — outer SEQUENCE, length 0x2a (42 bytes).
 * `30 05 06 03 2b 65 70` — AlgorithmIdentifier SEQUENCE, OID 1.3.101.112.
 * `03 21 00` — BIT STRING tag, length 0x21 (33 bytes: 1 leading-zero pad
 *   byte + 32 raw key bytes), 0x00 unused-bits indicator.
 *
 * The trailing 32 bytes are the raw public key — appended at runtime.
 */
const ED25519_SPKI_PREFIX = Buffer.from([
  0x30,
  0x2a,
  0x30,
  0x05,
  0x06,
  0x03,
  0x2b,
  0x65,
  0x70,
  0x03,
  0x21,
  0x00,
]);

const LOWERCASE_HEX_RE = /^[0-9a-f]+$/;

function isLowercaseHex(s: string, expectedLength: number): boolean {
  if (s.length !== expectedLength) return false;
  return LOWERCASE_HEX_RE.test(s);
}

/**
 * Build a Node `KeyObject` for the given raw 32-byte Ed25519 public key
 * provided as lowercase hex. Returns null when the input shape is wrong
 * — caller maps that to `malformed`.
 */
function buildPublicKey(publicKeyHex: string) {
  if (!isLowercaseHex(publicKeyHex, ED25519_PUBLIC_KEY_HEX_LENGTH)) return null;
  let rawKey: Buffer;
  try {
    rawKey = Buffer.from(publicKeyHex, "hex");
  } catch {
    return null;
  }
  if (rawKey.length !== ED25519_PUBLIC_KEY_BYTES) return null;
  const spki = Buffer.concat([ED25519_SPKI_PREFIX, rawKey]);
  try {
    return createPublicKey({ key: spki, format: "der", type: "spki" });
  } catch {
    return null;
  }
}

/**
 * Verify a Discord interactions request signature.
 *
 * @param rawBody Exact bytes Discord signed — receive route MUST capture
 *   this BEFORE any JSON parsing. Whitespace / key order is signed
 *   verbatim.
 * @param signatureHeader The `X-Signature-Ed25519` header value, or
 *   `null` when absent. Lowercase hex, 128 chars exactly.
 * @param timestampHeader The `X-Signature-Timestamp` header value, or
 *   `null` when absent. ASCII decimal seconds-since-epoch.
 * @param publicKeyHex The application's interactions public key
 *   (`DISCORD_INTERACTIONS_PUBLIC_KEY` env). 64-char lowercase hex.
 *   Empty / missing returns `missing_secret` — the route maps this to
 *   503 (server misconfig).
 */
export function verifyDiscordSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  publicKeyHex: string,
): VerifyDiscordSignatureResult {
  if (!publicKeyHex) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader || !timestampHeader) {
    return { valid: false, reason: "missing_header" };
  }

  if (!isLowercaseHex(signatureHeader, ED25519_SIGNATURE_HEX_LENGTH)) {
    return { valid: false, reason: "malformed" };
  }

  // Timestamp must be a non-empty ASCII decimal integer. Discord sends
  // seconds-since-epoch as a bare integer; reject anything else early.
  if (timestampHeader.length === 0 || !/^[0-9]+$/.test(timestampHeader)) {
    return { valid: false, reason: "malformed" };
  }

  const keyObject = buildPublicKey(publicKeyHex);
  if (keyObject === null) {
    // Public key shape is wrong — treat as malformed rather than
    // missing_secret. Operator supplied SOMETHING, just not a valid
    // 64-char lowercase-hex Ed25519 public key.
    return { valid: false, reason: "malformed" };
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signatureHeader, "hex");
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (signatureBytes.length !== ED25519_SIGNATURE_BYTES) {
    return { valid: false, reason: "malformed" };
  }

  // Ed25519 signed payload is `${timestamp}${rawBody}` — UTF-8 bytes,
  // no separator. Buffer.concat avoids any intermediate string allocation.
  const signedPayload = Buffer.concat([
    Buffer.from(timestampHeader, "utf8"),
    Buffer.from(rawBody, "utf8"),
  ]);

  let ok: boolean;
  try {
    // Node's verify() returns true/false for Ed25519 (no try/catch
    // needed for the signature itself — only for KeyObject construction
    // upstream).
    ok = verify(null, signedPayload, keyObject, signatureBytes);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  return ok ? { valid: true } : { valid: false, reason: "mismatch" };
}
