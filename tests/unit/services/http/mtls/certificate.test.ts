/** @jest-environment node */
import { generateKeyPairSync } from "node:crypto";
import {
  parseClientCertificate,
  assertKeyMatchesCertificate,
  assertCertificateCurrentlyValid,
  certificateExpiringWithin,
} from "@/services/http/mtls/certificate";
import {
  CertificateExpiredError,
  CertificateNotYetValidError,
  MtlsCertificateError,
} from "@/services/http/mtls/errors";
import {
  TEST_CLIENT_CERT_PEM,
  TEST_CLIENT_KEY_PEM,
  TEST_MALFORMED_CERT_PEM,
  TEST_CERT_NOT_AFTER_ISO,
  TEST_CERT_NOT_BEFORE_ISO,
} from "@/tests/fixtures/mtls/testCerts";

describe("mtls/certificate — parseClientCertificate", () => {
  it("extracts non-sensitive metadata", () => {
    const info = parseClientCertificate(TEST_CLIENT_CERT_PEM);
    expect(info.subject).toContain("CN=chainreact-mtls-test");
    expect(info.validFrom).toBe(TEST_CERT_NOT_BEFORE_ISO);
    expect(info.validTo).toBe(TEST_CERT_NOT_AFTER_ISO);
    expect(info.fingerprint256).toMatch(/^[0-9A-F:]+$/);
    expect(info.serialNumber).toMatch(/^[0-9A-F]+$/i);
  });

  it("throws a redacted parse error on malformed input (never echoes the PEM)", () => {
    try {
      parseClientCertificate(TEST_MALFORMED_CERT_PEM);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MtlsCertificateError);
      expect((e as MtlsCertificateError).code).toBe("certificate_parse_failed");
      expect((e as Error).message).not.toContain("not-a-real-certificate");
    }
  });
});

describe("mtls/certificate — assertKeyMatchesCertificate", () => {
  it("accepts the matching cert/key pair", () => {
    expect(() =>
      assertKeyMatchesCertificate(TEST_CLIENT_CERT_PEM, TEST_CLIENT_KEY_PEM),
    ).not.toThrow();
  });

  it("rejects a valid but non-matching key", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const otherKeyPem = other.privateKey.export({ type: "sec1", format: "pem" }) as string;
    try {
      assertKeyMatchesCertificate(TEST_CLIENT_CERT_PEM, otherKeyPem);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as MtlsCertificateError).code).toBe("key_certificate_mismatch");
      expect((e as Error).message).not.toContain("BEGIN");
    }
  });

  it("rejects an unparseable key", () => {
    try {
      assertKeyMatchesCertificate(TEST_CLIENT_CERT_PEM, "not a key");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as MtlsCertificateError).code).toBe("private_key_parse_failed");
    }
  });
});

describe("mtls/certificate — assertCertificateCurrentlyValid", () => {
  const inside = new Date("2030-01-01T00:00:00Z");
  const beforeWindow = new Date("2020-01-01T00:00:00Z");
  const afterWindow = new Date("2200-01-01T00:00:00Z");

  it("passes inside the validity window", () => {
    const info = assertCertificateCurrentlyValid(TEST_CLIENT_CERT_PEM, inside);
    expect(info.validTo).toBe(TEST_CERT_NOT_AFTER_ISO);
  });

  it("throws CertificateNotYetValidError before notBefore", () => {
    try {
      assertCertificateCurrentlyValid(TEST_CLIENT_CERT_PEM, beforeWindow);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CertificateNotYetValidError);
      expect((e as CertificateNotYetValidError).notBefore).toBe(TEST_CERT_NOT_BEFORE_ISO);
    }
  });

  it("throws CertificateExpiredError after notAfter", () => {
    try {
      assertCertificateCurrentlyValid(TEST_CLIENT_CERT_PEM, afterWindow);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CertificateExpiredError);
      expect((e as CertificateExpiredError).notAfter).toBe(TEST_CERT_NOT_AFTER_ISO);
      expect((e as Error).message).not.toContain("BEGIN");
    }
  });
});

describe("mtls/certificate — certificateExpiringWithin", () => {
  it("flags a cert that expires within the window", () => {
    // 1ms before notAfter, with a 1-day lookahead → expiring.
    const nearEnd = new Date(new Date(TEST_CERT_NOT_AFTER_ISO).getTime() - 1);
    const r = certificateExpiringWithin(TEST_CLIENT_CERT_PEM, 24 * 60 * 60 * 1000, nearEnd);
    expect(r.expiring).toBe(true);
    expect(r.validTo).toBe(TEST_CERT_NOT_AFTER_ISO);
  });

  it("does not flag a cert far from expiry", () => {
    const r = certificateExpiringWithin(
      TEST_CLIENT_CERT_PEM,
      24 * 60 * 60 * 1000,
      new Date("2030-01-01T00:00:00Z"),
    );
    expect(r.expiring).toBe(false);
  });
});
