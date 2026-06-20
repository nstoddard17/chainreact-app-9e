/**
 * @jest-environment node
 *
 * OneDrive analytics adapter (Slice ANALYTICS-SOURCES-ONEDRIVE-1): per-viewer personal
 * credential resolution (refreshable → refreshAndRetry), metadata-only file metrics
 * (file/folder counts + files-modified over time + files-by-type — only folder/file
 * facet, lastModifiedDateTime, and extension read; never name/path/webUrl/owner),
 * optional folder validation, and typed, leak-free error normalization. No network/DB —
 * the credential repo, refreshAndRetry, and the bounded Graph scanner are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockScan = jest.fn();
jest.mock("@/services/analytics/sources/microsoft-onedrive/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/microsoft-onedrive/api");
  return { ...actual, scanDrive: (...args: unknown[]) => mockScan(...args) };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { microsoftOneDriveAnalyticsSource } from "@/services/analytics/sources/microsoft-onedrive";
import { OneDriveRateLimitError } from "@/services/analytics/sources/microsoft-onedrive/api";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const ms = (iso: string) => Date.parse(iso);

const FACTS = [
  { isFile: true, modifiedMs: ms("2026-06-01T09:00:00Z"), ext: "docx" },
  { isFile: true, modifiedMs: ms("2026-06-02T09:00:00Z"), ext: "docx" },
  { isFile: true, modifiedMs: ms("2026-06-01T11:00:00Z"), ext: "xlsx" },
  { isFile: false, modifiedMs: null, ext: "" }, // folder
  { isFile: true, modifiedMs: ms("2026-05-15T09:00:00Z"), ext: "" }, // out of range, no ext
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "od-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScan.mockResolvedValue({ facts: FACTS, truncated: false });
});

describe("metric registration", () => {
  it("exposes the approved metadata-only metric set; every metric takes an optional folder filter", () => {
    expect(microsoftOneDriveAnalyticsSource.providerKey).toBe("microsoft-onedrive");
    expect(microsoftOneDriveAnalyticsSource.connectedApp).toBe(true);
    expect(microsoftOneDriveAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "files_by_type",
      "files_count",
      "files_modified_over_time",
      "folders_count",
    ]);
    for (const m of microsoftOneDriveAnalyticsSource.metrics) expect(m.supportedFilters).toEqual(["onedrive_folder"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      microsoftOneDriveAnalyticsSource.query({ metricKey: "download_file", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a malformed folder id before any I/O", async () => {
    await expect(
      microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE, filters: { onedrive_folder: "bad id with spaces" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("accepts an absent folder (defaults to drive root)", async () => {
    await microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX);
    expect(mockScan.mock.calls[0]![1]).toBe(""); // root sentinel
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "microsoft-onedrive", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "microsoft-onedrive",
      providerAccountId: "od-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no OneDrive connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("files_count counts file entries (folders excluded)", async () => {
    const r = await microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ files_count: 4 });
  });

  it("folders_count counts folder entries", async () => {
    const r = await microsoftOneDriveAnalyticsSource.query({ metricKey: "folders_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ folders_count: 1 });
  });

  it("files_modified_over_time buckets files by lastModifiedDateTime (out-of-range excluded)", async () => {
    const r = await microsoftOneDriveAnalyticsSource.query({ metricKey: "files_modified_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([2, 1, 0, 0]); // 06-01 ×2, 06-02 ×1 (05-15 out)
    expect(r.totals?.count).toBe(3);
  });

  it("files_by_type groups files by extension, most-common first, with a no-type bucket", async () => {
    const r = await microsoftOneDriveAnalyticsSource.query({ metricKey: "files_by_type", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toEqual([
      { date: "docx", count: 2 },
      { date: "xlsx", count: 1 },
      { date: "(no type)", count: 1 },
    ]);
  });

  it("surfaces a truncation warning when the scan hit the call budget", async () => {
    mockScan.mockResolvedValue({ facts: FACTS, truncated: true });
    const r = await microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces a file name / path / webUrl / owner — only counts, dates, and type labels", async () => {
    const r = await microsoftOneDriveAnalyticsSource.query({ metricKey: "files_modified_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/path|content|\bname\b|weburl|createdby|lastmodifiedby|driveitem|@odata/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "microsoft-onedrive",
        providerAccountId: "od-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a folder NotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockScan.mockRejectedValueOnce(new NotFoundError("drive folder", "not found"));
    await expect(
      microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a 429 → RATE_LIMITED", async () => {
    mockScan.mockRejectedValueOnce(new OneDriveRateLimitError("rate-limited"));
    await expect(
      microsoftOneDriveAnalyticsSource.query({ metricKey: "files_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScan.mockRejectedValueOnce(new Error("secret-internal token=abc123 /Private/path boom"));
    const err = await microsoftOneDriveAnalyticsSource
      .query({ metricKey: "files_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123|Private/);
  });
});
