/**
 * @jest-environment node
 */
import { driveRootDelta } from "@/integrations/microsoft-onedrive/api/driveRootDelta";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json?: unknown }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(r.json ?? {}), {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

describe("driveRootDelta wrapper", () => {
  it("initial-baseline mode: hits /me/drive/root/delta?$top=1, walks nextLink to terminal deltaLink, returns NO items", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          value: [{ id: "should-be-ignored-on-baseline" }],
          "@odata.nextLink": "https://graph/x?token=mid",
        },
      },
      {
        ok: true,
        json: {
          value: [{ id: "also-ignored" }],
          "@odata.deltaLink": "https://graph/x?token=terminal",
        },
      },
    ]);

    const result = await driveRootDelta({ accessToken: "t" });

    // First call has $top=1 query param.
    const firstUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(firstUrl).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root/delta?%24top=1",
    );
    // Second call uses the nextLink verbatim.
    expect(fetchSpy.mock.calls[1]![0]).toBe("https://graph/x?token=mid");
    // Returned items list is empty in initial mode.
    expect(result.items).toEqual([]);
    expect(result.deltaLink).toBe("https://graph/x?token=terminal");
  });

  it("incremental mode: fetches the nextLink URL verbatim and returns items + new deltaLink", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          value: [
            { id: "item-1", name: "report.pdf" },
            { id: "item-2", name: "draft.docx" },
          ],
          "@odata.deltaLink": "https://graph/x?token=next",
        },
      },
    ]);

    const result = await driveRootDelta({
      accessToken: "t",
      nextLink: "https://graph/x?token=current",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe("https://graph/x?token=current");
    expect(result.items).toHaveLength(2);
    expect(result.deltaLink).toBe("https://graph/x?token=next");
  });

  it("incremental mode: paginates through @odata.nextLink and concatenates items across pages", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          value: [{ id: "i-1" }],
          "@odata.nextLink": "https://graph/x?token=p2",
        },
      },
      {
        ok: true,
        json: {
          value: [{ id: "i-2" }, { id: "i-3" }],
          "@odata.deltaLink": "https://graph/x?token=terminal",
        },
      },
    ]);

    const result = await driveRootDelta({
      accessToken: "t",
      nextLink: "https://graph/x?token=p1",
    });

    expect(result.items.map((i) => i.id)).toEqual(["i-1", "i-2", "i-3"]);
    expect(result.deltaLink).toBe("https://graph/x?token=terminal");
  });

  it("incremental mode: surfaces deleted items with the deleted facet preserved", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          value: [
            { id: "live", name: "live.txt" },
            {
              id: "dead",
              name: "dead.txt",
              deleted: { state: "deleted" },
            },
          ],
          "@odata.deltaLink": "https://graph/x?token=next",
        },
      },
    ]);

    const result = await driveRootDelta({
      accessToken: "t",
      nextLink: "https://graph/x?token=current",
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[1]!.deleted).toEqual({ state: "deleted" });
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchSequence([{ ok: false, status: 401, json: {} }]);
    await expect(
      driveRootDelta({ accessToken: "stale", nextLink: "https://graph/x" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces resyncRequired error message on HTTP 410 (caller catches and re-baselines)", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 410,
        json: {
          error: {
            code: "resyncRequired",
            message: "delta token expired",
          },
        },
      },
    ]);
    await expect(
      driveRootDelta({ accessToken: "t", nextLink: "https://graph/x" }),
    ).rejects.toThrow(/resyncRequired|delta token expired/);
  });

  it("throws when Graph response carries neither nextLink nor deltaLink", async () => {
    mockFetchSequence([{ ok: true, json: { value: [{ id: "x" }] } }]);
    await expect(
      driveRootDelta({ accessToken: "t", nextLink: "https://graph/x" }),
    ).rejects.toThrow(/missing both/);
  });
});
