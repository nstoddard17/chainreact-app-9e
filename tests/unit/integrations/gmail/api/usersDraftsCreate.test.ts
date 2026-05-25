/**
 * @jest-environment node
 *
 * Tests for the Gmail users.drafts.create API wrapper. Mocks fetch
 * and verifies request shape, body construction (threadId inclusion
 * rule), response passthrough, and the 401-throws-Unauthorized401Error
 * contract that refreshAndRetry depends on. Mirrors the test layout
 * of `usersMessagesSend.test.ts` and `usersMessagesModify.test.ts`.
 */
import { usersDraftsCreate } from "@/integrations/gmail/api/usersDraftsCreate";
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

describe("usersDraftsCreate — request shape", () => {
  it("POSTs to the Gmail drafts endpoint with Bearer auth + JSON body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: {
        id: "draft-1",
        message: { id: "msg-1", threadId: "thr-1", labelIds: ["DRAFT"] },
      },
    });

    await usersDraftsCreate({
      accessToken: "ya29.access-token",
      rawMessage: "RFC5322-base64url",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer ya29.access-token",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({ message: { raw: "RFC5322-base64url" } });
  });

  it("includes message.threadId when threadId is provided (for draft replies)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "d", message: { id: "m", threadId: "thr-abc" } },
    });

    await usersDraftsCreate({
      accessToken: "x",
      rawMessage: "raw",
      threadId: "thr-abc",
    });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({
      message: { raw: "raw", threadId: "thr-abc" },
    });
  });

  it("omits message.threadId when threadId is undefined or empty (new draft)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "d", message: { id: "m", threadId: "thr-new" } },
    });
    await usersDraftsCreate({
      accessToken: "x",
      rawMessage: "raw",
      threadId: "",
    });
    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({ message: { raw: "raw" } });
  });

  it("returns the parsed response (id + message subset)", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "draft-99",
        message: {
          id: "msg-99",
          threadId: "thr-99",
          labelIds: ["DRAFT"],
        },
      },
    });

    const result = await usersDraftsCreate({
      accessToken: "x",
      rawMessage: "y",
    });

    expect(result).toEqual({
      id: "draft-99",
      message: {
        id: "msg-99",
        threadId: "thr-99",
        labelIds: ["DRAFT"],
      },
    });
  });

  it("respects GMAIL_API_BASE override (e2e mock surface)", async () => {
    process.env.GMAIL_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "d", message: { id: "m", threadId: "t" } },
    });

    await usersDraftsCreate({ accessToken: "x", rawMessage: "y" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9877/gmail/v1/users/me/drafts",
    );
  });
});

describe("usersDraftsCreate — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: 401, message: "invalid_token" } },
    });

    await expect(
      usersDraftsCreate({ accessToken: "stale", rawMessage: "y" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Google's error.message on 4xx (non-401)", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: {
        error: {
          code: 400,
          message: "Recipient address required.",
          status: "INVALID_ARGUMENT",
        },
      },
    });

    await expect(
      usersDraftsCreate({ accessToken: "x", rawMessage: "y" }),
    ).rejects.toThrow(/Recipient address required/);
  });

  it("falls back to Google's error.status when message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED" } },
    });

    await expect(
      usersDraftsCreate({ accessToken: "x", rawMessage: "y" }),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, json: "Bad Gateway plain text" });

    await expect(
      usersDraftsCreate({ accessToken: "x", rawMessage: "y" }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
