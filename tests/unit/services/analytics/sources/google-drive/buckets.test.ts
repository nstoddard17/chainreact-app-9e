/** @jest-environment node */
/**
 * Pure bucketing + folder-id validation helpers for the Google Drive analytics source
 * (Slice ANALYTICS-SOURCES-GDRIVE-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parseFolderId,
  planBuckets,
} from "@/services/analytics/sources/google-drive/buckets";
import { fileExtension, fileTypeLabel } from "@/services/analytics/sources/google-drive/api";

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

describe("parseFolderId", () => {
  it("treats empty / absent / 'root' as the drive root", () => {
    expect(parseFolderId("")).toBe("");
    expect(parseFolderId(undefined)).toBe("");
    expect(parseFolderId(null)).toBe("");
    expect(parseFolderId("root")).toBe("");
  });
  it("accepts an opaque Drive file id", () => {
    expect(parseFolderId("1A2b3C-4d_5E")).toBe("1A2b3C-4d_5E");
    expect(parseFolderId("ABC-123_xyz")).toBe("ABC-123_xyz");
  });
  it("rejects unsafe / non-string values", () => {
    expect(() => parseFolderId("bad id with spaces")).toThrow();
    expect(() => parseFolderId("../etc")).toThrow();
    expect(() => parseFolderId("' or 1=1")).toThrow();
    expect(() => parseFolderId(42)).toThrow();
  });
});

describe("fileExtension", () => {
  it("returns the lowercase extension without the dot", () => {
    expect(fileExtension("Report.PDF")).toBe("pdf");
    expect(fileExtension("sheet.XLSX")).toBe("xlsx");
  });
  it("returns '' for no extension, dotfiles, or trailing dot", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension(".gitignore")).toBe("");
    expect(fileExtension("name.")).toBe("");
    expect(fileExtension(undefined)).toBe("");
  });
});

describe("fileTypeLabel", () => {
  it("maps Google-native MIME types to a category label, ignoring the name", () => {
    expect(fileTypeLabel("application/vnd.google-apps.document", "Q1.2026 Plan")).toBe("gdoc");
    expect(fileTypeLabel("application/vnd.google-apps.spreadsheet", "Budget")).toBe("gsheet");
    expect(fileTypeLabel("application/vnd.google-apps.presentation", "Deck")).toBe("gslides");
    expect(fileTypeLabel("application/vnd.google-apps.form", "Survey")).toBe("gform");
  });
  it("falls back to the name extension for ordinary files", () => {
    expect(fileTypeLabel("application/pdf", "report.pdf")).toBe("pdf");
    expect(fileTypeLabel("image/png", "diagram.PNG")).toBe("png");
    expect(fileTypeLabel("application/octet-stream", "archive")).toBe("");
  });
});
