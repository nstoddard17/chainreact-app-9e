/**
 * @jest-environment node
 *
 * Tests for the Gmail users.messages.modify API wrapper. Mocks fetch
 * and verifies request shape, body construction (addLabelIds /
 * removeLabelIds inclusion rules), response passthrough, and the
 * 401-throws-Unauthorized401Error contract that refreshAndRetry
 * depends on. Mirrors the test layout of `usersMessagesSend.test.ts`.
 */
import { usersMessagesModify } from "@/integrations/gmail/api/usersMessagesModify";
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

describe("usersMessagesModify — request shape", () => {
  it("POSTs to the Gmail modify endpoint with Bearer auth + JSON body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "msg-1", threadId: "thr-1", labelIds: ["SENT", "Label_5"] },
    });

    await usersMessagesModify({
      accessToken: "ya29.access-token",
      messageId: "msg-1",
      addLabelIds: ["Label_5"],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/modify",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer ya29.access-token",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({ addLabelIds: ["Label_5"] });
  });

  it("URL-encodes the messageId in the path", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "m+id/with/slashes", threadId: "t" },
    });

    await usersMessagesModify({
      accessToken: "x",
      messageId: "m+id/with/slashes",
      addLabelIds: ["INBOX"],
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/m%2Bid%2Fwith%2Fslashes/modify",
    );
  });

  it("includes addLabelIds and removeLabelIds when both provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "m", threadId: "t", labelIds: ["A", "B"] },
    });

    await usersMessagesModify({
      accessToken: "x",
      messageId: "m",
      addLabelIds: ["A", "B"],
      removeLabelIds: ["INBOX"],
    });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({
      addLabelIds: ["A", "B"],
      removeLabelIds: ["INBOX"],
    });
  });

  it("omits both fields when neither is set (empty body — caller's responsibility, not the wrapper's, to avoid this)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "m", threadId: "t" },
    });

    await usersMessagesModify({ accessToken: "x", messageId: "m" });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({});
  });

  it("omits an empty addLabelIds (no key for [] — Gmail rejects empty arrays)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "m", threadId: "t" },
    });

    await usersMessagesModify({
      accessToken: "x",
      messageId: "m",
      addLabelIds: [],
      removeLabelIds: ["X"],
    });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({ removeLabelIds: ["X"] });
  });

  it("returns the parsed response unchanged", async () => {
    mockFetchOnce({
      ok: true,
      json: { id: "m", threadId: "t", labelIds: ["SENT", "Label_1"] },
    });

    const result = await usersMessagesModify({
      accessToken: "x",
      messageId: "m",
      addLabelIds: ["Label_1"],
    });

    expect(result).toEqual({
      id: "m",
      threadId: "t",
      labelIds: ["SENT", "Label_1"],
    });
  });

  it("respects GMAIL_API_BASE override (e2e mock surface)", async () => {
    process.env.GMAIL_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "m", threadId: "t" },
    });

    await usersMessagesModify({
      accessToken: "x",
      messageId: "m",
      addLabelIds: ["L"],
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9877/gmail/v1/users/me/messages/m/modify",
    );
  });
});

describe("usersMessagesModify — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: 401, message: "invalid_token" } },
    });

    await expect(
      usersMessagesModify({
        accessToken: "stale",
        messageId: "m",
        addLabelIds: ["L"],
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Google's error.message on 4xx (non-401)", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: {
        error: { code: 400, message: "Invalid label ID.", status: "INVALID_ARGUMENT" },
      },
    });

    await expect(
      usersMessagesModify({
        accessToken: "x",
        messageId: "m",
        addLabelIds: ["bad"],
      }),
    ).rejects.toThrow(/Invalid label ID/);
  });

  it("falls back to Google's error.status when message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED" } },
    });

    await expect(
      usersMessagesModify({
        accessToken: "x",
        messageId: "m",
        addLabelIds: ["L"],
      }),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, json: "Bad Gateway plain text" });

    await expect(
      usersMessagesModify({
        accessToken: "x",
        messageId: "m",
        addLabelIds: ["L"],
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
