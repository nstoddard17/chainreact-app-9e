/**
 * @jest-environment node
 *
 * Tests for the machine-credential STORE service — the encrypt/decrypt + cert-
 * validation + no-leak boundary. The repository is mocked so we assert what the
 * store ENCRYPTS on the way in and DECRYPTS on the way out, that validation
 * rejects bad material before any write, and that the safe DTO never carries a
 * secret. Real AES-256-GCM is exercised (TOKEN_ENCRYPTION_KEY is set).
 */

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

import { decryptToken } from "@/core/encryption/tokens";
import {
  CertificateExpiredError,
  MtlsCertificateError,
} from "@/services/http/mtls/errors";
import {
  TEST_CLIENT_CERT_PEM,
  TEST_CLIENT_KEY_PEM,
} from "@/tests/fixtures/mtls/testCerts";

// ── Repository mock ──────────────────────────────────────────────────────────
const repo = {
  upsertActiveMachineCredential: jest.fn(),
  getActiveMachineCredential: jest.fn(),
  disconnectMachineCredential: jest.fn(),
  updateCachedToken: jest.fn(),
  recordMachineCredentialAudit: jest.fn(),
};
jest.mock("@/repositories/machineCredentials", () => ({
  upsertActiveMachineCredential: (...a: unknown[]) => repo.upsertActiveMachineCredential(...a),
  getActiveMachineCredential: (...a: unknown[]) => repo.getActiveMachineCredential(...a),
  disconnectMachineCredential: (...a: unknown[]) => repo.disconnectMachineCredential(...a),
  updateCachedToken: (...a: unknown[]) => repo.updateCachedToken(...a),
  recordMachineCredentialAudit: (...a: unknown[]) => repo.recordMachineCredentialAudit(...a),
}));

import {
  saveMachineCredential,
  loadSecrets,
  toSafeDto,
  readCachedToken,
  persistCachedToken,
} from "@/services/machineCredentials/store";
import type { MachineCredentialRecord } from "@/repositories/machineCredentials";

const insideWindow = new Date("2030-01-01T00:00:00Z");
const afterWindow = new Date("2200-01-01T00:00:00Z");

const secrets = {
  clientId: "adp-client-id",
  clientSecret: "adp-client-secret",
  certPem: TEST_CLIENT_CERT_PEM,
  keyPem: TEST_CLIENT_KEY_PEM,
};

function fakeRecord(over: Partial<MachineCredentialRecord> = {}): MachineCredentialRecord {
  return {
    id: "cred-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "adp",
    label: "ADP prod",
    clientIdEncrypted: "enc",
    clientSecretEncrypted: "enc",
    certPemEncrypted: "enc",
    keyPemEncrypted: "enc",
    cachedAccessTokenEncrypted: null,
    cachedTokenExpiresAt: null,
    certFingerprint256: "AB:CD",
    certSubject: "CN=chainreact-mtls-test",
    certNotAfter: "2126-06-24T01:55:49.000Z",
    metadata: { environment: "prod" },
    disconnectedAt: null,
    rotatedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.recordMachineCredentialAudit.mockResolvedValue(undefined);
});

describe("saveMachineCredential", () => {
  it("validates, encrypts every secret, and persists (create → audit 'created')", async () => {
    repo.getActiveMachineCredential.mockResolvedValue(null);
    repo.upsertActiveMachineCredential.mockResolvedValue(fakeRecord());

    const dto = await saveMachineCredential({
      accountId: "acct-1",
      actorUserId: "user-1",
      provider: "adp",
      secrets,
      label: "ADP prod",
      metadata: { environment: "prod", apiBaseUrl: "https://api.adp.com" },
      now: insideWindow,
    });

    const payload = repo.upsertActiveMachineCredential.mock.calls[0][0];
    // Every secret column is ciphertext that round-trips back to plaintext.
    expect(decryptToken(payload.clientIdEncrypted)).toBe("adp-client-id");
    expect(decryptToken(payload.clientSecretEncrypted)).toBe("adp-client-secret");
    expect(decryptToken(payload.certPemEncrypted)).toBe(TEST_CLIENT_CERT_PEM);
    expect(decryptToken(payload.keyPemEncrypted)).toBe(TEST_CLIENT_KEY_PEM);
    // No plaintext secret is stored raw.
    expect(payload.clientIdEncrypted).not.toBe("adp-client-id");
    // Non-secret cert metadata is derived, not user-supplied.
    expect(payload.certFingerprint256).toMatch(/^[0-9A-F:]+$/);
    expect(payload.metadata).toEqual({ environment: "prod", apiBaseUrl: "https://api.adp.com" });

    // Audit is 'created' and carries no secret.
    const audit = repo.recordMachineCredentialAudit.mock.calls.at(-1)![0];
    expect(audit.event).toBe("created");
    expect(JSON.stringify(audit.detail)).not.toContain("adp-client-secret");

    // DTO omits every secret.
    expect(JSON.stringify(dto)).not.toContain("adp-client-secret");
    expect((dto as unknown as Record<string, unknown>).clientSecretEncrypted).toBeUndefined();
  });

  it("audits 'rotated' when an active credential already exists", async () => {
    repo.getActiveMachineCredential.mockResolvedValue(fakeRecord());
    repo.upsertActiveMachineCredential.mockResolvedValue(fakeRecord());
    await saveMachineCredential({
      accountId: "acct-1",
      actorUserId: "user-2",
      provider: "adp",
      secrets,
      now: insideWindow,
    });
    const audit = repo.recordMachineCredentialAudit.mock.calls.at(-1)![0];
    expect(audit.event).toBe("rotated");
  });

  it("rejects an expired certificate before any write, auditing validation_failed", async () => {
    await expect(
      saveMachineCredential({
        accountId: "acct-1",
        actorUserId: "user-1",
        provider: "adp",
        secrets,
        now: afterWindow,
      }),
    ).rejects.toBeInstanceOf(CertificateExpiredError);
    expect(repo.upsertActiveMachineCredential).not.toHaveBeenCalled();
    expect(repo.recordMachineCredentialAudit.mock.calls.at(-1)![0].event).toBe(
      "validation_failed",
    );
  });

  it("rejects a mismatched key before any write", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const otherKeyPem = other.privateKey.export({ type: "sec1", format: "pem" }) as string;
    await expect(
      saveMachineCredential({
        accountId: "acct-1",
        actorUserId: "user-1",
        provider: "adp",
        secrets: { ...secrets, keyPem: otherKeyPem },
        now: insideWindow,
      }),
    ).rejects.toBeInstanceOf(MtlsCertificateError);
    expect(repo.upsertActiveMachineCredential).not.toHaveBeenCalled();
  });
});

describe("loadSecrets", () => {
  it("decrypts stored secrets back to plaintext", async () => {
    // Encrypt real values so decrypt round-trips.
    const { encryptToken } = await import("@/core/encryption/tokens");
    repo.getActiveMachineCredential.mockResolvedValue(
      fakeRecord({
        clientIdEncrypted: encryptToken("cid"),
        clientSecretEncrypted: encryptToken("csecret"),
        certPemEncrypted: encryptToken(TEST_CLIENT_CERT_PEM),
        keyPemEncrypted: encryptToken(TEST_CLIENT_KEY_PEM),
      }),
    );
    const loaded = await loadSecrets("acct-1", "adp");
    expect(loaded?.secrets.clientId).toBe("cid");
    expect(loaded?.secrets.clientSecret).toBe("csecret");
    expect(loaded?.secrets.certPem).toBe(TEST_CLIENT_CERT_PEM);
  });

  it("returns null when no active credential exists", async () => {
    repo.getActiveMachineCredential.mockResolvedValue(null);
    expect(await loadSecrets("acct-1", "adp")).toBeNull();
  });
});

describe("cached token", () => {
  it("readCachedToken returns null when absent or expired, decrypts when fresh", async () => {
    const { encryptToken } = await import("@/core/encryption/tokens");
    const now = new Date("2030-01-01T00:00:00Z");

    expect(readCachedToken(fakeRecord(), now)).toBeNull(); // absent

    const expired = fakeRecord({
      cachedAccessTokenEncrypted: encryptToken("tok"),
      cachedTokenExpiresAt: "2029-01-01T00:00:00Z",
    });
    expect(readCachedToken(expired, now)).toBeNull(); // expired

    const fresh = fakeRecord({
      cachedAccessTokenEncrypted: encryptToken("live-token"),
      cachedTokenExpiresAt: "2030-01-01T01:00:00Z",
    });
    expect(readCachedToken(fresh, now)?.accessToken).toBe("live-token");
  });

  it("persistCachedToken encrypts the token before writing", async () => {
    repo.updateCachedToken.mockResolvedValue({ updated: true });
    await persistCachedToken({
      record: fakeRecord(),
      accessToken: "minted-token",
      expiresAt: "2030-01-01T01:00:00Z",
    });
    const payload = repo.updateCachedToken.mock.calls[0][0];
    expect(payload.cachedAccessTokenEncrypted).not.toBe("minted-token");
    expect(decryptToken(payload.cachedAccessTokenEncrypted)).toBe("minted-token");
  });
});

describe("toSafeDto", () => {
  it("derives cert status and omits every secret/encrypted column", () => {
    const dto = toSafeDto(fakeRecord(), new Date("2030-01-01T00:00:00Z"));
    expect(dto.certExpired).toBe(false);
    expect(dto.certFingerprint256).toBe("AB:CD");
    const json = JSON.stringify(dto);
    expect(json).not.toContain("Encrypted");
    expect(json).not.toContain("cachedAccessToken");
  });
});
