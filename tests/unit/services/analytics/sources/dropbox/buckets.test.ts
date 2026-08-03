/** @jest-environment node */
/**
 * Pure bucketing + folder-path validation helpers for the Dropbox analytics source
 * (Slice ANALYTICS-SOURCES-DROPBOX-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parseFolderPath,
  planBuckets,
} from "@/services/analytics/sources/dropbox/buckets";
import { fileExtension } from "@/services/analytics/sources/dropbox/api";

describe("planBuckets / bucketIndexForMs", () => {
  it("day-buckets a short range and maps a ms into its bucket", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z");
    expect(b.length).toBe(4);
    expect(bucketIndexForMs(b, Date.parse("2026-06-02T08:00:00Z"))).toBe(1);
    expect(bucketIndexForMs(b, Date.parse("2026-05-01T00:00:00Z"))).toBe(-1);
    expect(bucketIndexForMs(b, null)).toBe(-1);
  });

  it("never exceeds MAX_BUCKETS for a long range", () => {
    const b = planBuckets("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(b.length).toBeLessThanOrEqual(MAX_BUCKETS);
    expect(b.length).toBeGreaterThan(0);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });
});

describe("parseFolderPath", () => {
  it("treats empty / absent as the Dropbox root", () => {
    expect(parseFolderPath("")).toBe("");
    expect(parseFolderPath(undefined)).toBe("");
    expect(parseFolderPath(null)).toBe("");
  });
  it("accepts a path / id / ns reference", () => {
    expect(parseFolderPath("/Photos/2026")).toBe("/Photos/2026");
    expect(parseFolderPath("id:a1b2c3")).toBe("id:a1b2c3");
    expect(parseFolderPath("ns:123/sub")).toBe("ns:123/sub");
  });
  it("rejects non-path / unsafe values", () => {
    expect(() => parseFolderPath("notapath")).toThrow();
    expect(() => parseFolderPath("/has\nnewline")).toThrow();
    expect(() => parseFolderPath(42)).toThrow();
  });
});

describe("fileExtension", () => {
  it("returns the lowercase extension without the dot", () => {
    expect(fileExtension("Report.PDF")).toBe("pdf");
    expect(fileExtension("photo.JPG")).toBe("jpg");
  });
  it("returns '' for no extension, dotfiles, or trailing dot", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension(".gitignore")).toBe("");
    expect(fileExtension("name.")).toBe("");
    expect(fileExtension(undefined)).toBe("");
  });
});
