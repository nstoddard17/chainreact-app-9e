/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/microsoft-teams/triggers/newChannelMessage/normalize";
import type { ChatMessageResource } from "@/integrations/microsoft-teams/api/types";

function ctx() {
  return {
    subscriptionId: "sub-1",
    teamId: "team-1",
    channelId: "ch-1",
    notificationOccurredAt: "2026-05-10T12:00:00.000Z",
    accountId: "alice@contoso.com",
  };
}

describe("Teams new_channel_message normalize", () => {
  it("produces the canonical V2 TriggerEvent shape", () => {
    const message: ChatMessageResource = {
      id: "msg-1",
      createdDateTime: "2026-05-10T12:01:00.000Z",
      lastModifiedDateTime: "2026-05-10T12:01:30.000Z",
      subject: "Project update",
      summary: "Project update preview",
      importance: "high",
      messageType: "message",
      replyToId: null,
      body: { contentType: "html", content: "<p>Hello team</p>" },
      from: { user: { id: "u-1", displayName: "Alice" } },
      webUrl: "https://teams.microsoft.com/l/msg",
    };

    const event = normalize(message, ctx());

    expect(event).toEqual({
      provider: "microsoft-teams",
      eventType: "new_channel_message",
      eventId: "sub-1:msg-1:created",
      occurredAt: "2026-05-10T12:01:00.000Z",
      providerAccountId: "alice@contoso.com",
      payload: {
        messageId: "msg-1",
        teamId: "team-1",
        channelId: "ch-1",
        subject: "Project update",
        bodyContent: "<p>Hello team</p>",
        bodyContentType: "html",
        bodyPreview: "Project update preview",
        importance: "high",
        messageType: "message",
        replyToId: null,
        fromUserId: "u-1",
        fromUserDisplayName: "Alice",
        createdDateTime: "2026-05-10T12:01:00.000Z",
        lastModifiedDateTime: "2026-05-10T12:01:30.000Z",
        webUrl: "https://teams.microsoft.com/l/msg",
        changeType: "created",
      },
    });
  });

  it("dedup key follows ${subscriptionId}:${messageId}:created", () => {
    const event = normalize({ id: "msg-99" }, ctx());
    expect(event.eventId).toBe("sub-1:msg-99:created");
  });

  it("falls back to notificationOccurredAt when message has no createdDateTime", () => {
    const event = normalize({ id: "m" }, ctx());
    expect(event.occurredAt).toBe("2026-05-10T12:00:00.000Z");
  });

  it("normalizes every missing optional field to null/empty (stable downstream contract)", () => {
    const event = normalize({ id: "m" }, ctx());

    expect(event.payload).toMatchObject({
      messageId: "m",
      teamId: "team-1",
      channelId: "ch-1",
      subject: null,
      bodyContent: "",
      bodyContentType: null,
      bodyPreview: null,
      importance: null,
      messageType: null,
      replyToId: null,
      fromUserId: null,
      fromUserDisplayName: null,
      createdDateTime: null,
      lastModifiedDateTime: null,
      webUrl: null,
      changeType: "created",
    });
  });

  it("preserves a non-null replyToId (reply message in a channel thread)", () => {
    const event = normalize(
      { id: "reply-1", replyToId: "parent-1" },
      ctx(),
    );
    expect(event.payload).toMatchObject({
      messageId: "reply-1",
      replyToId: "parent-1",
    });
  });
});
