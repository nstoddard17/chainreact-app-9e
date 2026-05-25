/**
 * @jest-environment node
 *
 * Tests for the Microsoft Graph PATCH /me/messages/{id} API wrapper.
 * Used by add_categories (Outlook Mail 2.2 Commit 2) with an open-shape
 * patch field so future actions (set_read_status, set_flag) can reuse
 * the same wrapper.
 */
import { patchMessage } from "@/integrations/microsoft-outlook/api/patchMessage";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 200 : 400);
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(opts.bodyText ?? "{}", { status }));
}

describe("patchMessage wrapper", () => {
  it("PATCHes /v1.0/me/messages/{id} with Bearer + JSON content-type", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"msg-1","categories":["A"]}',
    });

    await patchMessage({
      accessToken: "ms-access",
      messageId: "AAMkAGI2",
      patch: { categories: ["A"] },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("PATCH");
    expect(init.headers).toEqual({
      Authorization: "Bearer ms-access",
      "Content-Type": "application/json",
    });
  });

  it("URL-encodes the messageId", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"msg-1"}',
    });

    await patchMessage({
      accessToken: "t",
      messageId: "AAMk/with=odd+chars",
      patch: { categories: ["A"] },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me/messages/AAMk%2Fwith%3Dodd%2Bchars",
    );
  });

  it("serializes the patch into the request body verbatim", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"msg-1"}',
    });

    await patchMessage({
      accessToken: "t",
      messageId: "msg-1",
      patch: { categories: ["Important", "Work"] },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ categories: ["Important", "Work"] });
  });

  it("sends an empty body when patch is empty (defensive — handlers shouldn't do this)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"msg-1"}',
    });

    await patchMessage({
      accessToken: "t",
      messageId: "msg-1",
      patch: {},
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({});
  });

  it("passes through future patch fields (open-shape contract)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"msg-1"}',
    });

    await patchMessage({
      accessToken: "t",
      messageId: "msg-1",
      // Future use: isRead toggle, flag.flagStatus, etc. The wrapper is
      // open-shape via `Record<string, unknown>` serialization — only
      // typed `categories` field is exposed via TS, but JSON.stringify
      // passes through everything.
      patch: { categories: ["A"], extra: "passthrough" } as unknown as {
        categories: string[];
      },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ categories: ["A"], extra: "passthrough" });
  });

  it("returns the parsed patched-message envelope on 200 OK", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      bodyText: JSON.stringify({
        id: "msg-1",
        categories: ["Important", "Work"],
      }),
    });

    const patched = await patchMessage({
      accessToken: "t",
      messageId: "msg-1",
      patch: { categories: ["Important", "Work"] },
    });

    expect(patched.id).toBe("msg-1");
    expect(patched.categories).toEqual(["Important", "Work"]);
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      patchMessage({
        accessToken: "stale",
        messageId: "msg-1",
        patch: { categories: ["A"] },
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Graph error.message on 404 ErrorItemNotFound", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText:
        '{"error":{"code":"ErrorItemNotFound","message":"The specified object was not found in the store."}}',
    });

    await expect(
      patchMessage({
        accessToken: "t",
        messageId: "missing",
        patch: { categories: ["A"] },
      }),
    ).rejects.toThrow(/not found in the store/);
  });

  it("surfaces Graph error.message on 403 ErrorAccessDenied", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      bodyText:
        '{"error":{"code":"ErrorAccessDenied","message":"Access is denied. Check credentials and try again."}}',
    });

    await expect(
      patchMessage({
        accessToken: "t",
        messageId: "msg-1",
        patch: { categories: ["A"] },
      }),
    ).rejects.toThrow(/Access is denied/);
  });

  it("falls back to HTTP status when error body is non-JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 503,
      bodyText: "<html>upstream timeout</html>",
    });

    await expect(
      patchMessage({
        accessToken: "t",
        messageId: "msg-1",
        patch: { categories: ["A"] },
      }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("uses MICROSOFT_GRAPH_API_BASE override when set", async () => {
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchOnce({
      ok: true,
      bodyText: '{"id":"msg-1"}',
    });

    await patchMessage({
      accessToken: "t",
      messageId: "msg-1",
      patch: { categories: ["A"] },
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me/messages/msg-1",
    );
  });
});
