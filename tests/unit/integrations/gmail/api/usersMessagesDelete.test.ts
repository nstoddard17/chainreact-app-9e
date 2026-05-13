/**
 * @jest-environment node
 *
 * Tests for the Gmail users.messages.delete API wrapper
 * (PERMANENT delete; 204 No Content response).
 */
import { usersMessagesDelete } from "@/integrations/gmail/api/usersMessagesDelete";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset?.();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GMAIL_API_BASE;
});

function mockFetchOnce(response: { ok: boolean; status?: number; body?: string; json?: unknown }) {
  const status = response.status ?? (response.ok ? 204 : 500);
  // The Response constructor rejects non-null bodies for 204 / 205 /
  // 304 (null-body statuses per fetch spec). Force null body for those.
  const isNullBodyStatus = status === 204 || status === 205 || status === 304;
  const body: BodyInit | null = isNullBodyStatus
    ? null
    : response.body !== undefined
      ? response.body
      : response.json !== undefined
        ? JSON.stringify(response.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("usersMessagesDelete — request shape", () => {
  it("DELETEs the message endpoint with Bearer auth", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, body: "" });

    await usersMessagesDelete({
      accessToken: "ya29.access-token",
      messageId: "msg-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer ya29.access-token" },
      }),
    );
  });

  it("URL-encodes the messageId in the path", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, body: "" });

    await usersMessagesDelete({
      accessToken: "x",
      messageId: "m+id/with/slashes",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/m%2Bid%2Fwith%2Fslashes",
    );
  });

  it("returns the input messageId as the acknowledgment shape (204 has no body)", async () => {
    mockFetchOnce({ ok: true, status: 204, body: "" });

    const result = await usersMessagesDelete({
      accessToken: "x",
      messageId: "msg-77",
    });

    expect(result).toEqual({ messageId: "msg-77" });
  });

  it("respects GMAIL_API_BASE override", async () => {
    process.env.GMAIL_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({ ok: true, status: 204, body: "" });

    await usersMessagesDelete({ accessToken: "x", messageId: "m" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9877/gmail/v1/users/me/messages/m",
    );
  });
});

describe("usersMessagesDelete — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: 401, message: "invalid_token" } },
    });

    await expect(
      usersMessagesDelete({ accessToken: "stale", messageId: "m" }),
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
      usersMessagesDelete({ accessToken: "x", messageId: "missing" }),
    ).rejects.toThrow(/Requested entity was not found/);
  });

  it("falls back to error.status when message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED" } },
    });

    await expect(
      usersMessagesDelete({ accessToken: "x", messageId: "m" }),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, body: "Bad Gateway plain text" });

    await expect(
      usersMessagesDelete({ accessToken: "x", messageId: "m" }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
