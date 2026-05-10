/**
 * @jest-environment node
 */
import { workbooksList } from "@/integrations/microsoft-excel/api/workbooksList";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 500);
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("workbooksList wrapper", () => {
  it("filters by .xlsx mime type and surfaces nextLink", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        value: [
          {
            id: "wb-1",
            name: "Q1.xlsx",
            webUrl: "https://1drv.ms/q1",
            size: 12345,
            lastModifiedDateTime: "2026-05-08T10:00:00Z",
          },
        ],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/...&$skiptoken=x",
      },
    });

    const result = await workbooksList({ accessToken: "t" });

    // URLSearchParams encodes `$` as `%24` and `/` as `%2F`; spaces become
    // `+`. The mime-type's `.` is not percent-encoded.
    expect(fetchSpy.mock.calls[0]![0]).toMatch(
      /%24filter=file%2FmimeType\+eq\+%27application%2Fvnd\.openxmlformats-officedocument\.spreadsheetml\.sheet%27/,
    );
    expect(result.workbooks).toHaveLength(1);
    expect(result.workbooks[0]).toMatchObject({
      id: "wb-1",
      name: "Q1.xlsx",
      size: 12345,
    });
    expect(result.nextLink).toMatch(/skiptoken/);
  });

  it("returns nextLink: null when Graph omits @odata.nextLink", async () => {
    mockFetchOnce({ ok: true, json: { value: [] } });

    const result = await workbooksList({ accessToken: "t" });

    expect(result.nextLink).toBeNull();
  });

  it("forwards top to $top", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { value: [] } });

    await workbooksList({ accessToken: "t", top: 25 });

    expect(fetchSpy.mock.calls[0]![0]).toMatch(/%24top=25/);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      workbooksList({ accessToken: "stale" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });
});
