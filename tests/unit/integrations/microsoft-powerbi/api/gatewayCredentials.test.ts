/**
 * @jest-environment node
 *
 * Round-trip tests for `integrations/microsoft-powerbi/api/gatewayCredentials.ts`.
 *
 * The helper is a faithful port of Microsoft's reference encryptors
 * (PowerBI-CSharp `AsymmetricKeyEncryptor` / `Asymmetric1024KeyEncryptionHelper` /
 * `AsymmetricHigherKeyEncryptionHelper` + `AuthenticatedEncryption`), so the
 * tests DECRYPT with the matching private key and assert the plaintext equals
 * the documented `{"credentialData":[...]}` serialization — proving both the
 * byte layout and the serialization in one pass.
 */
import {
  constants,
  createDecipheriv,
  createHmac,
  generateKeyPairSync,
  privateDecrypt,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";
import { encryptGatewayCredentials } from "@/integrations/microsoft-powerbi/api/gatewayCredentials";

const PASSWORD = "p@ss-secret-123!";
const EXPECTED_SERIALIZATION = `{"credentialData":[{"name":"username","value":"john"},{"name":"password","value":"${PASSWORD}"}]}`;

/** Gateway responses carry STANDARD base64 (e.g. exponent "AQAB"). */
function gatewayKeyParts(publicKey: KeyObject): {
  modulus: string;
  exponent: string;
} {
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  return {
    modulus: Buffer.from(jwk.n, "base64url").toString("base64"),
    exponent: Buffer.from(jwk.e, "base64url").toString("base64"),
  };
}

/** Hybrid-path decryptor mirroring AsymmetricHigherKeyEncryptionHelper. */
function decryptHybrid(
  blob: string,
  privateKey: KeyObject,
  modulusBytes: number,
): string {
  // The RSA block is exactly modulus-sized → its base64 length is fixed.
  const encryptedKeysB64Length = 4 * Math.ceil(modulusBytes / 3);
  const encryptedKeys = Buffer.from(
    blob.slice(0, encryptedKeysB64Length),
    "base64",
  );
  expect(encryptedKeys.length).toBe(modulusBytes);

  const keys = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    encryptedKeys,
  );
  // KeyLengths enum prefix: KeyLength32 = 0, KeyLength64 = 1.
  expect(keys.length).toBe(2 + 32 + 64);
  expect(keys[0]).toBe(0);
  expect(keys[1]).toBe(1);
  const keyEnc = keys.subarray(2, 34);
  const keyMac = keys.subarray(34, 98);

  const payload = Buffer.from(blob.slice(encryptedKeysB64Length), "base64");
  // algorithmChoices(2: Aes256CbcPkcs7=0, HMACSHA256=0) || tag(32) || iv(16) || ct
  expect(payload[0]).toBe(0);
  expect(payload[1]).toBe(0);
  const tag = payload.subarray(2, 34);
  const iv = payload.subarray(34, 50);
  const cipherText = payload.subarray(50);

  const expectedTag = createHmac("sha256", keyMac)
    .update(Buffer.concat([payload.subarray(0, 2), iv, cipherText]))
    .digest();
  expect(timingSafeEqual(tag, expectedTag)).toBe(true);

  const decipher = createDecipheriv("aes-256-cbc", keyEnc, iv);
  return Buffer.concat([
    decipher.update(cipherText),
    decipher.final(),
  ]).toString("utf8");
}

describe("encryptGatewayCredentials — hybrid scheme (>1024-bit gateway keys)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const { modulus, exponent } = gatewayKeyParts(publicKey);

  it("round-trips to the exact documented JSON serialization", () => {
    const blob = encryptGatewayCredentials({
      publicKeyExponent: exponent,
      publicKeyModulus: modulus,
      credentialData: [
        { name: "username", value: "john" },
        { name: "password", value: PASSWORD },
      ],
    });

    expect(decryptHybrid(blob, privateKey, 256)).toBe(EXPECTED_SERIALIZATION);
  });

  it("accepts base64url-formatted key parts (Get Gateway variants)", () => {
    const jwk = publicKey.export({ format: "jwk" }) as {
      n: string;
      e: string;
    };
    const blob = encryptGatewayCredentials({
      publicKeyExponent: jwk.e, // base64url
      publicKeyModulus: jwk.n, // base64url
      credentialData: [{ name: "key", value: "api-key-value" }],
    });

    expect(decryptHybrid(blob, privateKey, 256)).toBe(
      '{"credentialData":[{"name":"key","value":"api-key-value"}]}',
    );
  });

  it("uses fresh random keys per call (no deterministic ciphertext)", () => {
    const input = {
      publicKeyExponent: exponent,
      publicKeyModulus: modulus,
      credentialData: [{ name: "key", value: "k" }],
    };
    expect(encryptGatewayCredentials(input)).not.toBe(
      encryptGatewayCredentials(input),
    );
  });
});

describe("encryptGatewayCredentials — 1024-bit segmented RSA-OAEP(SHA-1)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
  });
  const { modulus, exponent } = gatewayKeyParts(publicKey);

  it("splits into 85-byte segments / 128-byte blocks and round-trips", () => {
    // Long value → multi-segment plaintext (serialization > 85 bytes).
    const blob = encryptGatewayCredentials({
      publicKeyExponent: exponent,
      publicKeyModulus: modulus,
      credentialData: [
        { name: "username", value: "john" },
        { name: "password", value: PASSWORD },
      ],
    });

    const bytes = Buffer.from(blob, "base64");
    expect(bytes.length % 128).toBe(0);
    expect(bytes.length / 128).toBe(
      Math.ceil(Buffer.byteLength(EXPECTED_SERIALIZATION, "utf8") / 85),
    );

    const segments: Buffer[] = [];
    for (let offset = 0; offset < bytes.length; offset += 128) {
      segments.push(
        privateDecrypt(
          {
            key: privateKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha1",
          },
          bytes.subarray(offset, offset + 128),
        ),
      );
    }
    expect(Buffer.concat(segments).toString("utf8")).toBe(
      EXPECTED_SERIALIZATION,
    );
  });
});

describe("encryptGatewayCredentials — input validation (no credential echo)", () => {
  it("rejects a malformed public key without echoing credentials", () => {
    let thrown: Error | null = null;
    try {
      encryptGatewayCredentials({
        publicKeyExponent: "AQAB",
        publicKeyModulus: "!!not-base64!!",
        credentialData: [{ name: "password", value: PASSWORD }],
      });
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).not.toContain(PASSWORD);
    expect(thrown!.message).toMatch(/modulus/);
  });

  it("rejects an empty credentialData array", () => {
    expect(() =>
      encryptGatewayCredentials({
        publicKeyExponent: "AQAB",
        publicKeyModulus: "AQAB",
        credentialData: [],
      }),
    ).toThrow(/at least one entry/);
  });

  it("rejects entries with empty names", () => {
    expect(() =>
      encryptGatewayCredentials({
        publicKeyExponent: "AQAB",
        publicKeyModulus: "AQAB",
        credentialData: [{ name: "", value: "v" }],
      }),
    ).toThrow(/non-empty name/);
  });
});
