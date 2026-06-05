/**
 * @jest-environment node
 *
 * Tests for features/account/securitySummary (Slice 4.ACCOUNT-SETTINGS-6 / SEC-1).
 * Pure derivation — no I/O. Covers email/verification and the future-proof
 * sign-in-method / hasPassword derivation.
 */
import { getSecurityAccessSummary } from "@/features/account/securitySummary";

describe("getSecurityAccessSummary", () => {
  it("maps a verified password user to Email & password + verified", () => {
    const s = getSecurityAccessSummary({
      email: "u@x.io",
      emailConfirmedAt: "2026-01-01T00:00:00Z",
      providers: ["email"],
    });
    expect(s).toEqual({
      email: "u@x.io",
      emailVerified: true,
      hasPassword: true,
      signInMethod: "Email & password",
    });
  });

  it("treats a missing email_confirmed_at as unverified", () => {
    const s = getSecurityAccessSummary({
      email: "u@x.io",
      emailConfirmedAt: null,
      providers: ["email"],
    });
    expect(s.emailVerified).toBe(false);
  });

  it("defaults to Email & password + hasPassword when no provider data is present", () => {
    const s = getSecurityAccessSummary({ email: "u@x.io", emailConfirmedAt: undefined });
    expect(s.signInMethod).toBe("Email & password");
    expect(s.hasPassword).toBe(true);
  });

  it("future-proof: an OAuth-only user reads as the provider, no password", () => {
    const s = getSecurityAccessSummary({
      email: "u@x.io",
      emailConfirmedAt: "t",
      providers: ["google"],
    });
    expect(s.hasPassword).toBe(false);
    expect(s.signInMethod).toBe("Google");
  });

  it("future-proof: email + oauth reads as a combined label with a password", () => {
    const s = getSecurityAccessSummary({
      email: "u@x.io",
      emailConfirmedAt: "t",
      providers: ["email", "github"],
    });
    expect(s.hasPassword).toBe(true);
    expect(s.signInMethod).toBe("Email & password, GitHub");
  });

  it("falls back to empty string for a null email", () => {
    const s = getSecurityAccessSummary({ email: null, emailConfirmedAt: null });
    expect(s.email).toBe("");
  });
});
