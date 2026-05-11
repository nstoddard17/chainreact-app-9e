/**
 * @jest-environment node
 */
import { chatMessageSend } from "@/integrations/microsoft-teams/api/chatMessageSend";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchOnce(opts: {
  ok: boolean;
  status?: number;
  json?: unknown;
  bodyText?: string;
}) {
  const status = opts.status ?? (opts.ok ? 201 : 500);
  const body =
    opts.bodyText !== undefined
      ? opts.bodyText
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : "";
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(body, { status }));
}

describe("chatMessageSend wrapper", () => {
  it("POSTs to /chats/{id}/messages with body envelope", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "msg-1" } });

    await chatMessageSend({
      accessToken: "t",
      chatId: "chat-1",
      contentType: "text",
      content: "hello",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/chats/chat-1/messages",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      body: { contentType: "text", content: "hello" },
    });
  });

  it("URL-encodes the chat id (Teams chats use 19:... thread IDs)", async () => {
    const fetchSpy = mockFetchOnce({ ok: true, json: { id: "m" } });

    await chatMessageSend({
      accessToken: "t",
      chatId: "19:abc-def@thread.v2",
      contentType: "html",
      content: "hi",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://graph.microsoft.com/v1.0/chats/19%3Aabc-def%40thread.v2/messages",
    );
  });

  it("throws Unauthorized401Error on HTTP 401", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    await expect(
      chatMessageSend({
        accessToken: "stale",
        chatId: "chat-1",
        contentType: "html",
        content: "hi",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws NotFoundError on HTTP 404 (chat missing or user not a participant)", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      bodyText: '{"error":{"code":"NotFound","message":"Chat not found."}}',
    });

    await expect(
      chatMessageSend({
        accessToken: "t",
        chatId: "gone",
        contentType: "html",
        content: "hi",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
