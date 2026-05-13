/**
 * @jest-environment node
 *
 * Tests for the Gmail users.messages.trash API wrapper.
 */
import { usersMessagesTrash } from "@/integrations/gmail/api/usersMessagesTrash";
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

describe("usersMessagesTrash — request shape", () => {
  it("POSTs to the trash endpoint with Bearer auth", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "msg-1", threadId: "thr-1", labelIds: ["TRASH"] },
    });

    await usersMessagesTrash({
      accessToken: "ya29.access-token",
      messageId: "msg-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/trash",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer ya29.access-token" },
      }),
    );
  });

  it("URL-encodes the messageId in the path", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "x", threadId: "t" },
    });

    await usersMessagesTrash({
      accessToken: "x",
      messageId: "m+id/with/slashes",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/m%2Bid%2Fwith%2Fslashes/trash",
    );
  });

  it("returns the parsed response (modified message with TRASH label)", async () => {
    mockFetchOnce({
      ok: true,
      json: { id: "msg-99", threadId: "thr-99", labelIds: ["TRASH"] },
    });

    const result = await usersMessagesTrash({
      accessToken: "x",
      messageId: "msg-99",
    });

    expect(result).toEqual({
      id: "msg-99",
      threadId: "thr-99",
      labelIds: ["TRASH"],
    });
  });

  it("respects GMAIL_API_BASE override", async () => {
    process.env.GMAIL_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "m", threadId: "t" },
    });

    await usersMessagesTrash({ accessToken: "x", messageId: "m" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9877/gmail/v1/users/me/messages/m/trash",
    );
  });
});

describe("usersMessagesTrash — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: 401, message: "invalid_token" } },
    });

    await expect(
      usersMessagesTrash({ accessToken: "stale", messageId: "m" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Google's error.message on 4xx", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: {
        error: { code: 404, message: "Requested entity was not found." },
      },
    });

    await expect(
      usersMessagesTrash({ accessToken: "x", messageId: "missing" }),
    ).rejects.toThrow(/Requested entity was not found/);
  });

  it("falls back to error.status when message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED" } },
    });

    await expect(
      usersMessagesTrash({ accessToken: "x", messageId: "m" }),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, json: "Bad Gateway plain text" });

    await expect(
      usersMessagesTrash({ accessToken: "x", messageId: "m" }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
