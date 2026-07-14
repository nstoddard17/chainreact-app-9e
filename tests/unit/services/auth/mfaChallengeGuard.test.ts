/**
 * @jest-environment node
 *
 * Tests for services/auth/mfaChallengeGuard (SEC-3) — the pure decision the auth
 * middleware uses to divert an aal1 session (with a verified factor) to the MFA
 * challenge. Proves the zero-lockout property for non-MFA users and that the
 * auth/challenge surfaces stay reachable.
 */

import {
  decideMfaChallenge,
  MFA_CHALLENGE_PATH,
} from "@/services/auth/mfaChallengeGuard";

describe("decideMfaChallenge", () => {
  it("allows any request when the user has NO verified factor (zero lockout)", () => {
    expect(
      decideMfaChallenge({ hasVerifiedFactor: false, currentAal: "aal1", pathname: "/workflows" }),
    ).toEqual({ action: "allow" });
  });

  it("allows when the session is already aal2", () => {
    expect(
      decideMfaChallenge({ hasVerifiedFactor: true, currentAal: "aal2", pathname: "/workflows" }),
    ).toEqual({ action: "allow" });
  });

  it("challenges a protected route when a verified factor exists but session is aal1", () => {
    expect(
      decideMfaChallenge({ hasVerifiedFactor: true, currentAal: "aal1", pathname: "/workflows" }),
    ).toEqual({ action: "challenge", redirectTo: MFA_CHALLENGE_PATH });
  });

  it("challenges even when the aal claim is unreadable (null) — fail toward the challenge", () => {
    expect(
      decideMfaChallenge({ hasVerifiedFactor: true, currentAal: null, pathname: "/runs" }),
    ).toEqual({ action: "challenge", redirectTo: MFA_CHALLENGE_PATH });
  });

  it.each([
    "/auth/mfa",
    "/auth/sign-in",
    "/auth/sign-out",
    "/api/auth/mfa/verify",
    "/_next/static/chunk.js",
    "/favicon.ico",
  ])("keeps %s reachable at aal1 so the user isn't trapped", (pathname) => {
    expect(
      decideMfaChallenge({ hasVerifiedFactor: true, currentAal: "aal1", pathname }),
    ).toEqual({ action: "allow" });
  });

  it("still challenges account/API surfaces at aal1 (they are protected)", () => {
    expect(
      decideMfaChallenge({ hasVerifiedFactor: true, currentAal: "aal1", pathname: "/account" }),
    ).toEqual({ action: "challenge", redirectTo: MFA_CHALLENGE_PATH });
    expect(
      decideMfaChallenge({ hasVerifiedFactor: true, currentAal: "aal1", pathname: "/api/account/mfa" }),
    ).toEqual({ action: "challenge", redirectTo: MFA_CHALLENGE_PATH });
  });
});
