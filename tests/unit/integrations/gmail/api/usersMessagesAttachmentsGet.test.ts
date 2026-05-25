/**
 * @jest-environment node
 *
 * Tests for the Gmail users.messages.attachments.get API wrapper.
 * Mocks fetch and verifies request shape, URL encoding, response
 * passthrough, 401 contract, error message/status fallbacks, and the
 * GMAIL_API_BASE override. Mirrors the test layout of
 * usersMessagesModify / usersMessagesGet.
 */
import { usersMessagesAttachmentsGet } from "@/integrations/gmail/api/usersMessagesAttachmentsGet";
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

describe("usersMessagesAttachmentsGet — request shape", () => {
  it("GETs the attachment endpoint with Bearer auth", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { data: "aGVsbG8", size: 5 },
    });

    await usersMessagesAttachmentsGet({
      accessToken: "ya29.access-token",
      messageId: "msg-1",
      attachmentId: "att-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/attachments/att-1",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer ya29.access-token" },
      }),
    );
  });

  it("URL-encodes both messageId and attachmentId", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { data: "x" },
    });

    await usersMessagesAttachmentsGet({
      accessToken: "x",
      messageId: "msg/with+slash",
      attachmentId: "att/with+slash",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg%2Fwith%2Bslash/attachments/att%2Fwith%2Bslash",
    );
  });

  it("returns the parsed response unchanged", async () => {
    mockFetchOnce({
      ok: true,
      json: { data: "QUJDREVG", size: 6 },
    });

    const result = await usersMessagesAttachmentsGet({
      accessToken: "x",
      messageId: "m",
      attachmentId: "a",
    });

    expect(result).toEqual({ data: "QUJDREVG", size: 6 });
  });

  it("returns the response even without `size` (optional in wire shape)", async () => {
    mockFetchOnce({
      ok: true,
      json: { data: "QUJDREVG" },
    });

    const result = await usersMessagesAttachmentsGet({
      accessToken: "x",
      messageId: "m",
      attachmentId: "a",
    });

    expect(result).toEqual({ data: "QUJDREVG" });
  });

  it("respects GMAIL_API_BASE override (e2e mock surface)", async () => {
    process.env.GMAIL_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { data: "x" },
    });

    await usersMessagesAttachmentsGet({
      accessToken: "x",
      messageId: "m",
      attachmentId: "a",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9877/gmail/v1/users/me/messages/m/attachments/a",
    );
  });
});

describe("usersMessagesAttachmentsGet — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: 401, message: "invalid_token" } },
    });

    await expect(
      usersMessagesAttachmentsGet({
        accessToken: "stale",
        messageId: "m",
        attachmentId: "a",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Google's error.message on 4xx (non-401)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: {
        error: {
          code: 404,
          message: "Requested entity was not found.",
          status: "NOT_FOUND",
        },
      },
    });

    await expect(
      usersMessagesAttachmentsGet({
        accessToken: "x",
        messageId: "m",
        attachmentId: "missing",
      }),
    ).rejects.toThrow(/Requested entity was not found/);
  });

  it("falls back to Google's error.status when message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED" } },
    });

    await expect(
      usersMessagesAttachmentsGet({
        accessToken: "x",
        messageId: "m",
        attachmentId: "a",
      }),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, json: "Bad Gateway plain text" });

    await expect(
      usersMessagesAttachmentsGet({
        accessToken: "x",
        messageId: "m",
        attachmentId: "a",
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
