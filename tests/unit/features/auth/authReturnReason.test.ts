/** @jest-environment node */
/**
 * ANON-BUILDER-2 — contextual auth copy for the anonymous-builder gates.
 */
import { authReasonLine, isAuthReturnReason } from "@/features/auth/authReturnReason";

describe("authReturnReason", () => {
  it("maps each gate reason to sign-up copy", () => {
    expect(authReasonLine("save", "sign-up")).toBe("Create an account to save this workflow.");
    expect(authReasonLine("activate", "sign-up")).toBe("Create an account to activate this workflow.");
    expect(authReasonLine("run", "sign-up")).toBe("Create an account to run this workflow.");
    expect(authReasonLine("connect", "sign-up")).toBe("Create an account to connect apps.");
    expect(authReasonLine("ai", "sign-up")).toBe("Create an account to use React Agent.");
  });

  it("uses sign-in phrasing in sign-in mode", () => {
    expect(authReasonLine("save", "sign-in")).toBe("Sign in to save this workflow.");
    expect(authReasonLine("ai", "sign-in")).toBe("Sign in to use React Agent.");
  });

  it("returns null for unknown / absent reasons", () => {
    expect(authReasonLine(undefined, "sign-up")).toBeNull();
    expect(authReasonLine("bogus", "sign-up")).toBeNull();
  });

  it("isAuthReturnReason guards the union", () => {
    expect(isAuthReturnReason("connect")).toBe(true);
    expect(isAuthReturnReason("nope")).toBe(false);
    expect(isAuthReturnReason(42)).toBe(false);
  });
});
