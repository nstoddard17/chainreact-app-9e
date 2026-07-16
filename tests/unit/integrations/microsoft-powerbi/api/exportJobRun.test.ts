/**
 * @jest-environment node
 *
 * Tests for the Power BI export poll-to-completion orchestrator
 * (`integrations/microsoft-powerbi/api/reports/exportJobRun.ts`).
 * The three endpoint wrappers are mocked; `sleep` / `now` are injected
 * so the tests run instantly.
 */

const mockStart = jest.fn();
const mockStatus = jest.fn();
const mockDownload = jest.fn();

jest.mock(
  "@/integrations/microsoft-powerbi/api/reports/exportToFileStart",
  () => ({
    exportToFileStart: (...args: unknown[]) => mockStart(...args),
  }),
);
jest.mock(
  "@/integrations/microsoft-powerbi/api/reports/exportStatusGet",
  () => ({
    exportStatusGet: (...args: unknown[]) => mockStatus(...args),
  }),
);
jest.mock(
  "@/integrations/microsoft-powerbi/api/reports/exportFileDownload",
  () => ({
    exportFileDownload: (...args: unknown[]) => mockDownload(...args),
  }),
);

import {
  exportJobRun,
  EXPORT_POLL_BUDGET_MS,
} from "@/integrations/microsoft-powerbi/api/reports/exportJobRun";

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function statusResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "Running",
    percentComplete: 50,
    resourceFileExtension: null,
    reportName: null,
    retryAfterSeconds: null,
    errorDetail: null,
    ...overrides,
  };
}

/** Fake clock: `now()` advances by the slept amount, so the budget is
 *  driven purely by the sleeps the orchestrator requests. */
function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

beforeEach(() => {
  mockStart.mockReset();
  mockStatus.mockReset();
  mockDownload.mockReset();
  mockStart.mockResolvedValue({ exportId: "exp-1" });
  mockDownload.mockResolvedValue({
    bytes: BYTES,
    contentType: "application/pdf",
  });
});

describe("exportJobRun — success path", () => {
  it("starts, polls to Succeeded, downloads, and returns the fixed result set", async () => {
    const clock = fakeClock();
    mockStatus
      .mockResolvedValueOnce(statusResult({ status: "Running" }))
      .mockResolvedValueOnce(
        statusResult({
          status: "Succeeded",
          resourceFileExtension: ".pdf",
          reportName: "Q4 Sales",
        }),
      );

    const result = await exportJobRun({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "PDF",
      pageName: "ReportSection1",
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(mockStart).toHaveBeenCalledWith({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "PDF",
      pageName: "ReportSection1",
    });
    expect(mockDownload).toHaveBeenCalledWith({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      exportId: "exp-1",
    });
    expect(result).toEqual({
      exportId: "exp-1",
      bytes: BYTES,
      contentType: "application/pdf",
      resourceFileExtension: ".pdf",
      reportName: "Q4 Sales",
    });
    // One Running poll → one default 2s wait before the terminal poll.
    expect(clock.sleeps).toEqual([2000]);
  });

  it("succeeds without any sleep when the first poll is already Succeeded", async () => {
    const clock = fakeClock();
    mockStatus.mockResolvedValueOnce(statusResult({ status: "Succeeded" }));

    const result = await exportJobRun({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "PPTX",
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(result.exportId).toBe("exp-1");
    expect(clock.sleeps).toEqual([]);
  });
});

describe("exportJobRun — Retry-After honored", () => {
  it("sleeps for retryAfterSeconds*1000 when the header is present, else 2s", async () => {
    const clock = fakeClock();
    mockStatus
      .mockResolvedValueOnce(
        statusResult({ status: "Running", retryAfterSeconds: 5 }),
      )
      .mockResolvedValueOnce(statusResult({ status: "Running" }))
      .mockResolvedValueOnce(statusResult({ status: "Succeeded" }));

    await exportJobRun({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "PDF",
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(clock.sleeps).toEqual([5000, 2000]);
  });
});

describe("exportJobRun — failure paths", () => {
  it("throws the sanitized provider error on status Failed", async () => {
    const clock = fakeClock();
    mockStatus.mockResolvedValueOnce(
      statusResult({ status: "Failed", errorDetail: "ExportDataCapacityError" }),
    );

    await expect(
      exportJobRun({
        accessToken: "tok",
        groupId: "ws-1",
        reportId: "rep-1",
        format: "PDF",
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).rejects.toThrow(/export exp-1 failed: ExportDataCapacityError/);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("throws a generic detail when Failed carries no error detail", async () => {
    const clock = fakeClock();
    mockStatus.mockResolvedValueOnce(statusResult({ status: "Failed" }));

    await expect(
      exportJobRun({
        accessToken: "tok",
        groupId: "ws-1",
        reportId: "rep-1",
        format: "PDF",
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).rejects.toThrow(/the provider reported no error detail/);
  });

  it("throws the actionable budget error instead of exceeding 40s of polling", async () => {
    const clock = fakeClock();
    // Never-terminal job: always Running with a 10s Retry-After. The
    // fake clock advances by each sleep, so the 5th wait (40s elapsed +
    // 10s) must trip the budget check BEFORE sleeping.
    mockStatus.mockResolvedValue(
      statusResult({ status: "Running", retryAfterSeconds: 10 }),
    );

    await expect(
      exportJobRun({
        accessToken: "tok",
        groupId: "ws-1",
        reportId: "rep-1",
        format: "PDF",
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).rejects.toThrow(
      "Power BI export exp-1 is still running after 40s — export fewer pages or a smaller report, then retry.",
    );

    // 3 sleeps of 10s (30s elapsed); the 4th wait would hit 40s → throw.
    expect(clock.sleeps).toEqual([10000, 10000, 10000]);
    const totalSlept = clock.sleeps.reduce((a, b) => a + b, 0);
    expect(totalSlept).toBeLessThan(EXPORT_POLL_BUDGET_MS);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});
