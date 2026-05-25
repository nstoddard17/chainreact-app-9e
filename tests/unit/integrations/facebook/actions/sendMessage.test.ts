/**
 * @jest-environment node
 *
 * Tests for `facebook:send_message` — Slice 3.FACEBOOK-2 (Messenger).
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockMessagesSend = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/messagesSend", () => ({
  messagesSend: (...a: unknown[]) => mockMessagesSend(...a),
}));

import { sendMessage } from "@/integrations/facebook/actions/sendMessage";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

function input(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf", userId: "user-1", runId: "run", nodeId: "node", config,
    triggerEvent: { provider: "manual", eventType: "manual", eventId: "e", occurredAt: "t", accountId: "a", payload: {} },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("USER_TOK"));
  mockGetPageToken.mockResolvedValue("PAGE_TOK");
  mockMessagesSend.mockResolvedValue({ message_id: "mid_1", recipient_id: "psid-1" });
});

describe("facebook send_message", () => {
  it("sends to a raw PSID recipient and returns the message id", async () => {
    const result = await sendMessage(input({ pageId: "p", recipientId: "psid-1", message: "hi" }));
    expect(mockMessagesSend.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK", pageId: "p", recipientId: "psid-1", text: "hi",
    });
    expect(result.output).toMatchObject({ messageId: "mid_1", recipientId: "psid-1" });
  });

  it("extracts the PSID from a 'conversationId:psid' recipient (V1 picker format)", async () => {
    await sendMessage(input({ pageId: "p", recipientId: "t_conv123:psid-9", message: "hi" }));
    expect(mockMessagesSend.mock.calls[0]![0].recipientId).toBe("psid-9");
  });
});
