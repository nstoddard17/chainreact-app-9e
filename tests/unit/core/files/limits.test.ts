/** @jest-environment node */
import {
  FILE_REF_SIZE_GUIDANCE,
  getFileRefSizeGuidance,
} from "@/core/files/limits";

const MB = 1024 * 1024;

describe("FILE_REF_SIZE_GUIDANCE", () => {
  it("exposes a 25 MB default cap", () => {
    expect(FILE_REF_SIZE_GUIDANCE.default).toBe(25 * MB);
  });

  it("matches documented per-provider caps", () => {
    expect(FILE_REF_SIZE_GUIDANCE.slack).toBe(25 * MB);
    expect(FILE_REF_SIZE_GUIDANCE["google-drive"]).toBe(25 * MB);
    expect(FILE_REF_SIZE_GUIDANCE.gmail).toBe(25 * MB);
    expect(FILE_REF_SIZE_GUIDANCE["microsoft-onedrive"]).toBe(4 * MB);
    expect(FILE_REF_SIZE_GUIDANCE.outlook).toBe(3 * MB);
  });

  it("emits positive byte counts for every entry", () => {
    for (const value of Object.values(FILE_REF_SIZE_GUIDANCE)) {
      expect(value).toBeGreaterThan(0);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("getFileRefSizeGuidance", () => {
  it("returns the slack cap for `slack`", () => {
    expect(getFileRefSizeGuidance("slack")).toBe(25 * MB);
  });

  it("returns the onedrive cap for `microsoft-onedrive`", () => {
    expect(getFileRefSizeGuidance("microsoft-onedrive")).toBe(4 * MB);
  });

  it("returns the outlook cap for `outlook`", () => {
    expect(getFileRefSizeGuidance("outlook")).toBe(3 * MB);
  });

  it("falls back to the default cap for unknown provider ids", () => {
    expect(getFileRefSizeGuidance("unknown-future-provider")).toBe(25 * MB);
    expect(getFileRefSizeGuidance("")).toBe(25 * MB);
  });
});
