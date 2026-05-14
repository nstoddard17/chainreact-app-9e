/**
 * @jest-environment node
 */
import { usersMessagesGet } from "@/integrations/gmail/api/usersMessagesGet";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset?.();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GMAIL_API_BASE;
});

function mockFetchOnce(response: { ok: boolean; status?: number; json: unknown }) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        typeof response.json === "string"
          ? response.json
          : JSON.stringify(response.json),
        { status: response.status ?? (response.ok ? 200 : 500) },
      ),
    );
}

describe("usersMessagesGet — request shape", () => {
  it("GETs format=metadata with the default header set", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "m1",
        threadId: "t1",
        labelIds: ["INBOX"],
        snippet: "hi",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "text/plain", headers: [] },
      },
    });

    await usersMessagesGet({ accessToken: "x", messageId: "m1" });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(
      "/gmail/v1/users/me/messages/m1?",
    );
    expect(url).toContain("format=metadata");
    // Default headers must be threaded as repeated metadataHeaders params.
    for (const h of ["From", "To", "Cc", "Bcc", "Subject", "Date", "Delivered-To", "Message-ID"]) {
      expect(url).toContain(`metadataHeaders=${encodeURIComponent(h)}`);
    }
  });

  it("URL-encodes message ids that contain unsafe characters", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "msg/with+chars",
        threadId: "t",
        labelIds: [],
        snippet: "",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "x", headers: [] },
      },
    });

    await usersMessagesGet({ accessToken: "x", messageId: "msg/with+chars" });

    expect(fetchSpy.mock.calls[0]![0] as string).toContain(
      "/messages/msg%2Fwith%2Bchars?",
    );
  });

  it("uses caller-supplied metadataHeaders when provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "m1",
        threadId: "t1",
        labelIds: [],
        snippet: "",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "x", headers: [] },
      },
    });

    await usersMessagesGet({
      accessToken: "x",
      messageId: "m1",
      metadataHeaders: ["Subject"],
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("metadataHeaders=Subject");
    expect(url).not.toContain("metadataHeaders=From");
  });
});

describe("usersMessagesGet — format option (Gmail 2.3 Commit 4)", () => {
  it("omitted format remains metadata (backwards-compatible)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "m1",
        threadId: "t1",
        labelIds: [],
        snippet: "",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "x", headers: [] },
      },
    });

    await usersMessagesGet({ accessToken: "x", messageId: "m1" });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("format=metadata");
    expect(url).not.toContain("format=full");
  });

  it("explicit format='metadata' behaves identically to the default", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "m1",
        threadId: "t1",
        labelIds: [],
        snippet: "",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "x", headers: [] },
      },
    });

    await usersMessagesGet({
      accessToken: "x",
      messageId: "m1",
      format: "metadata",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("format=metadata");
    // Default metadata headers must still be threaded.
    for (const h of ["From", "To", "Subject"]) {
      expect(url).toContain(`metadataHeaders=${encodeURIComponent(h)}`);
    }
  });

  it("format='full' sets format=full on the URL", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "m1",
        threadId: "t1",
        labelIds: [],
        snippet: "",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "multipart/mixed", headers: [], parts: [] },
      },
    });

    await usersMessagesGet({
      accessToken: "x",
      messageId: "m1",
      format: "full",
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("format=full");
    expect(url).not.toContain("format=metadata");
  });

  it("format='full' does NOT send metadataHeaders (Gmail honors it only with format=metadata)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "m1",
        threadId: "t1",
        labelIds: [],
        snippet: "",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "multipart/mixed", headers: [], parts: [] },
      },
    });

    await usersMessagesGet({
      accessToken: "x",
      messageId: "m1",
      format: "full",
      // Even when caller provides metadataHeaders explicitly, they
      // are dropped for format=full per API semantics.
      metadataHeaders: ["From", "Subject"],
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).not.toContain("metadataHeaders=");
  });

  it("metadataHeaders behavior unchanged for format=metadata", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "m1",
        threadId: "t1",
        labelIds: [],
        snippet: "",
        internalDate: "0",
        sizeEstimate: 0,
        payload: { mimeType: "x", headers: [] },
      },
    });

    await usersMessagesGet({
      accessToken: "x",
      messageId: "m1",
      format: "metadata",
      metadataHeaders: ["Subject"],
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("metadataHeaders=Subject");
    expect(url).not.toContain("metadataHeaders=From");
  });
});

describe("usersMessagesGet — error handling", () => {
  it("throws Unauthorized401Error on 401", async () => {
    mockFetchOnce({ ok: false, status: 401, json: { error: { code: 401 } } });
    await expect(
      usersMessagesGet({ accessToken: "x", messageId: "m1" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces error.message on non-401 errors", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: { error: { code: 404, message: "Not Found" } },
    });
    await expect(
      usersMessagesGet({ accessToken: "x", messageId: "missing" }),
    ).rejects.toThrow(/Not Found/);
  });
});
