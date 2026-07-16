/**
 * @jest-environment node
 *
 * Tests for the ExportTo kick-off wrapper
 * (`integrations/microsoft-powerbi/api/reports/exportToFileStart.ts`)
 * with `global.fetch` mocked — the body synthesis (configuration sent
 * ONLY when its V2 input is set) is behavior-switching wire logic.
 */

import { exportToFileStart } from "@/integrations/microsoft-powerbi/api/reports/exportToFileStart";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

function jsonResponse(body: unknown, status = 202): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchSpy: jest.SpiedFunction<typeof fetch>;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("exportToFileStart — URL + body synthesis", () => {
  it("POSTs ExportTo with format only (no configuration) by default", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "exp-1" }));

    const result = await exportToFileStart({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "PDF",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/myorg/groups/ws-1/reports/rep-1/ExportTo");
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ format: "PDF" });
    expect(result).toEqual({ exportId: "exp-1" });
  });

  it("sends powerBIReportConfiguration.pages ONLY when pageName is set", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "exp-2" }));

    await exportToFileStart({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "PNG",
      pageName: "ReportSection42",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({
      format: "PNG",
      powerBIReportConfiguration: {
        pages: [{ pageName: "ReportSection42" }],
      },
    });
  });

  it("sends paginatedReportConfiguration.parameterValues ONLY when non-empty", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "exp-3" }));

    await exportToFileStart({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "XLSX",
      parameterValues: [{ name: "Region", value: "West" }],
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({
      format: "XLSX",
      paginatedReportConfiguration: {
        parameterValues: [{ name: "Region", value: "West" }],
      },
    });
  });

  it("omits paginatedReportConfiguration for an empty parameterValues array", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: "exp-4" }));

    await exportToFileStart({
      accessToken: "tok",
      groupId: "ws-1",
      reportId: "rep-1",
      format: "CSV",
      parameterValues: [],
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ format: "CSV" });
  });
});

describe("exportToFileStart — status + response mapping", () => {
  it("throws when the 202 body carries no export id", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));

    await expect(
      exportToFileStart({
        accessToken: "tok",
        groupId: "ws-1",
        reportId: "rep-1",
        format: "PDF",
      }),
    ).rejects.toThrow(/returned no export id/);
  });

  it("maps HTTP 401 to Unauthorized401Error (refreshAndRetry contract)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 401 }));

    await expect(
      exportToFileStart({
        accessToken: "tok",
        groupId: "ws-1",
        reportId: "rep-1",
        format: "PDF",
      }),
    ).rejects.toThrow(Unauthorized401Error);
  });

  it("surfaces a sanitized provider error on non-2xx (never the raw body)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "InvalidRequest", message: "Shared capacity is not supported" },
        }),
        { status: 400 },
      ),
    );

    await expect(
      exportToFileStart({
        accessToken: "tok",
        groupId: "ws-1",
        reportId: "rep-1",
        format: "PDF",
      }),
    ).rejects.toThrow(/Shared capacity is not supported/);
  });
});
