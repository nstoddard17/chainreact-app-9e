import {
  constants,
  createCipheriv,
  createHmac,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from "node:crypto";

/**
 * Gateway datasource credential encryption — pure helper, `node:crypto` only.
 *
 * Power BI on-premises gateway credentials MUST be encrypted client-side
 * against the gateway's RSA public key (`Get Gateway` → `publicKey
 * {exponent, modulus}`) before they are sent to
 * `POST/PATCH /gateways/{id}/datasources...` with
 * `encryptionAlgorithm: "RSA-OAEP"`. Plaintext credentials never leave
 * the app.
 *
 * The scheme is a faithful port of Microsoft's reference encryptors
 * (PowerBI-CSharp `sdk/PowerBI.Api/Extensions/`, linked from
 * https://learn.microsoft.com/en-us/power-bi/developer/embedded/configure-credentials):
 *
 *   - Serialization (`AsymmetricKeyEncryptor.EncodeCredentials`):
 *     UTF-8 bytes of `{"credentialData":[{"name":...,"value":...},...]}`.
 *   - Key-size dispatch: base64-decoded modulus of EXACTLY 128 bytes
 *     (1024-bit) → segmented plain RSA-OAEP; anything else → hybrid.
 *   - 1024-bit (`Asymmetric1024KeyEncryptionHelper`): plaintext split
 *     into 85-byte segments, each RSA-OAEP(SHA-1)-encrypted to a
 *     128-byte block (`RSACryptoServiceProvider.Encrypt(data, true)` ==
 *     OAEP-SHA1), blocks concatenated, whole buffer base64.
 *   - Higher keys (`AsymmetricHigherKeyEncryptionHelper` +
 *     `AuthenticatedEncryption`): random keyEnc(32) + keyMac(64);
 *     ciphertext = base64([0,0] || HMAC-SHA256(keyMac,
 *     [0,0]||iv||ct) || iv(16) || AES-256-CBC/PKCS7 ct); key blob
 *     [0x00, 0x01, keyEnc, keyMac] RSA-OAEP(SHA-256)-encrypted and
 *     base64'd; result = base64(encryptedKeys) + base64(authenticated
 *     ciphertext) (two base64 strings concatenated). The [0,0] prefix is
 *     the algorithm-choice pair (Aes256CbcPkcs7=0, HMACSHA256=0); the
 *     [0x00, 0x01] key-blob prefix is the KeyLengths enum pair
 *     (KeyLength32=0, KeyLength64=1).
 *
 * SECURITY: inputs are NEVER logged and never appear in thrown errors.
 */

export interface GatewayCredentialEntry {
  name: string;
  value: string;
}

export interface EncryptGatewayCredentialsInput {
  /** Gateway `publicKey.exponent` — base64 (e.g. "AQAB") or base64url. */
  publicKeyExponent: string;
  /** Gateway `publicKey.modulus` — base64 or base64url. */
  publicKeyModulus: string;
  /** Pre-encryption credential fields, e.g. username/password or key. */
  credentialData: GatewayCredentialEntry[];
}

/** 1024-bit path: max OAEP-SHA1 payload per 128-byte RSA block is 86; MS uses 85. */
const SEGMENT_LENGTH = 85;
const MODULUS_1024_BYTES = 128;
const AES_KEY_SIZE_BYTES = 32;
const HMAC_KEY_SIZE_BYTES = 64;
/** KeyLengths enum bytes: KeyLength32 = 0, KeyLength64 = 1. */
const KEY_LENGTHS_PREFIX = Buffer.from([0, 1]);
/** Algorithm choices: Aes256CbcPkcs7 = 0, HMACSHA256 = 0. */
const ALGORITHM_CHOICES = Buffer.from([0, 0]);

/** Normalize base64/base64url (either accepted) to base64url, no padding. */
function toBase64Url(value: string): string {
  return value.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeKeyPart(value: string, label: string): Buffer {
  const normalized = toBase64Url(value);
  if (normalized.length === 0 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    // Deliberately does NOT echo the input value.
    throw new Error(
      `Gateway public key ${label} is not valid base64/base64url.`,
    );
  }
  const bytes = Buffer.from(normalized, "base64url");
  if (bytes.length === 0) {
    throw new Error(`Gateway public key ${label} decoded to zero bytes.`);
  }
  return bytes;
}

function buildRsaPublicKey(modulus: string, exponent: string): KeyObject {
  try {
    return createPublicKey({
      key: {
        kty: "RSA",
        n: toBase64Url(modulus),
        e: toBase64Url(exponent),
      },
      format: "jwk",
    });
  } catch {
    // Never surface the raw key material or the underlying OpenSSL error.
    throw new Error(
      "Invalid gateway public key — could not construct an RSA key from the gateway's exponent/modulus.",
    );
  }
}

/** 1024-bit gateways: segmented straight RSA-OAEP(SHA-1). */
function encrypt1024(plainText: Buffer, key: KeyObject): string {
  const blocks: Buffer[] = [];
  for (let offset = 0; offset < plainText.length; offset += SEGMENT_LENGTH) {
    const segment = plainText.subarray(
      offset,
      Math.min(offset + SEGMENT_LENGTH, plainText.length),
    );
    blocks.push(
      publicEncrypt(
        {
          key,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha1",
        },
        segment,
      ),
    );
  }
  return Buffer.concat(blocks).toString("base64");
}

/**
 * `AuthenticatedEncryption.Encrypt` port: AES-256-CBC/PKCS7 with a random
 * 16-byte IV, HMAC-SHA256 tag over algorithmChoices||iv||ciphertext,
 * output base64(algorithmChoices||tag||iv||ciphertext).
 */
function authenticatedEncrypt(
  keyEnc: Buffer,
  keyMac: Buffer,
  message: Buffer,
): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", keyEnc, iv);
  const cipherText = Buffer.concat([cipher.update(message), cipher.final()]);
  const tag = createHmac("sha256", keyMac)
    .update(Buffer.concat([ALGORITHM_CHOICES, iv, cipherText]))
    .digest();
  return Buffer.concat([ALGORITHM_CHOICES, tag, iv, cipherText]).toString(
    "base64",
  );
}

/** >1024-bit gateways: hybrid AES+HMAC with RSA-OAEP(SHA-256)-wrapped keys. */
function encryptHigher(plainText: Buffer, key: KeyObject): string {
  const keyEnc = randomBytes(AES_KEY_SIZE_BYTES);
  const keyMac = randomBytes(HMAC_KEY_SIZE_BYTES);

  const cipherText = authenticatedEncrypt(keyEnc, keyMac, plainText);

  const keys = Buffer.concat([KEY_LENGTHS_PREFIX, keyEnc, keyMac]);
  const encryptedKeys = publicEncrypt(
    {
      key,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    keys,
  ).toString("base64");

  return encryptedKeys + cipherText;
}

/**
 * Encrypt gateway datasource credentials against the gateway public key.
 * Returns the string for `credentialDetails.credentials` (with
 * `encryptionAlgorithm: "RSA-OAEP"`).
 */
export function encryptGatewayCredentials(
  input: EncryptGatewayCredentialsInput,
): string {
  if (input.credentialData.length === 0) {
    throw new Error("credentialData must contain at least one entry.");
  }
  for (const entry of input.credentialData) {
    if (typeof entry.name !== "string" || entry.name.length === 0) {
      throw new Error("Every credentialData entry needs a non-empty name.");
    }
    if (typeof entry.value !== "string") {
      throw new Error("Every credentialData entry needs a string value.");
    }
  }

  // Exact wire serialization Microsoft documents (fixed key set — no spread).
  const serialized = JSON.stringify({
    credentialData: input.credentialData.map((entry) => ({
      name: entry.name,
      value: entry.value,
    })),
  });
  const plainText = Buffer.from(serialized, "utf8");

  const modulusBytes = decodeKeyPart(input.publicKeyModulus, "modulus");
  decodeKeyPart(input.publicKeyExponent, "exponent");
  const key = buildRsaPublicKey(input.publicKeyModulus, input.publicKeyExponent);

  // Microsoft dispatches on modulus length EXACTLY 128 bytes (1024-bit).
  return modulusBytes.length === MODULUS_1024_BYTES
    ? encrypt1024(plainText, key)
    : encryptHigher(plainText, key);
}
