/** @jest-environment node */
/**
 * ANON-BUILDER-2 — same-origin returnTo sanitizer (open-redirect guard).
 */
import { safeReturnPath } from "@/lib/safeReturnPath";

describe("safeReturnPath", () => {
  it("allows a same-origin path", () => {
    expect(safeReturnPath("/start/continue")).toBe("/start/continue");
  });

  it("rejects absolute + protocol-relative URLs", () => {
    expect(safeReturnPath("https://evil.example/x")).toBe("/workflows");
    expect(safeReturnPath("//evil.example")).toBe("/workflows");
  });

  it("rejects non-string / empty and uses the fallback", () => {
    expect(safeReturnPath(null)).toBe("/workflows");
    expect(safeReturnPath(undefined)).toBe("/workflows");
    expect(safeReturnPath("")).toBe("/workflows");
    expect(safeReturnPath("relative/no-slash")).toBe("/workflows");
  });

  it("honors a custom fallback", () => {
    expect(safeReturnPath(null, "/")).toBe("/");
  });
});
