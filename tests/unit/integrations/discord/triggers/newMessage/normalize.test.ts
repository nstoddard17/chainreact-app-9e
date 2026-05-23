/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Discord new_message normalize.
 *
 * Pinned contracts:
 *   - eventId = Discord message id (snowflake) → drives (provider,
 *     eventId) dedup.
 *   - provider = "discord", eventType = "new_message".
 *   - accountId = guild id (from trigger config — Discord messages
 *     API doesn't include guild_id on each row).
 *   - 11-field payload mirrors V1 manifest.
 *   - attachments / mentions projected to bounded shape.
 *   - channelName / guildName surface as null (raw payload doesn't
 *     carry them; follow-up plumbs from picker labels).
 *   - occurredAt = message.timestamp if present, else now().
 */
import type { DiscordMessage } from "@/integrations/_shared/discord/api/messages";
import { normalizeNewMessage } from "@/integrations/discord/triggers/newMessage/normalize";

const SAMPLE: DiscordMessage = {
  id: "msg-snow-1",
  channel_id: "ch-1",
  content: "hello world",
  timestamp: "2026-05-23T12:00:00.000Z",
  edited_timestamp: null,
  author: {
    id: "user-snow-1",
    username: "alice",
    global_name: "Alice",
    bot: false,
  },
  attachments: [
    {
      id: "att-1",
      filename: "diagram.png",
      size: 1024,
      url: "https://cdn.discordapp.com/.../diagram.png",
      content_type: "image/png",
    },
  ],
  mentions: [{ id: "user-snow-2", username: "bob" }],
  pinned: false,
  type: 0,
};

describe("normalizeNewMessage — canonical TriggerEvent fields", () => {
  it("sets provider=discord and eventType=new_message", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.provider).toBe("discord");
    expect(event.eventType).toBe("new_message");
  });

  it("uses message.id as the dedup key", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.eventId).toBe("msg-snow-1");
  });

  it("sets accountId to the guild id from trigger config (NOT message.guild_id)", () => {
    // Discord's messages API doesn't populate guild_id on each row;
    // trigger config supplies it.
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-from-config" });
    expect(event.accountId).toBe("g-from-config");
  });

  it("uses message.timestamp for occurredAt when present", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.occurredAt).toBe("2026-05-23T12:00:00.000Z");
  });

  it("falls back to now() for occurredAt when message.timestamp is missing", () => {
    const noTs: DiscordMessage = { ...SAMPLE };
    delete (noTs as Partial<DiscordMessage>).timestamp;
    const event = normalizeNewMessage({ message: noTs, guildId: "g-1" });
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("normalizeNewMessage — payload shape", () => {
  it("surfaces messageId / content / authorId / authorName", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.messageId).toBe("msg-snow-1");
    expect(event.payload.content).toBe("hello world");
    expect(event.payload.authorId).toBe("user-snow-1");
    expect(event.payload.authorName).toBe("alice");
  });

  it("falls back authorName to global_name when username absent", () => {
    const noUser: DiscordMessage = {
      ...SAMPLE,
      author: { id: "user-x", global_name: "Display Name" },
    };
    const event = normalizeNewMessage({ message: noUser, guildId: "g-1" });
    expect(event.payload.authorName).toBe("Display Name");
  });

  it("sets authorName=null when author has neither username nor global_name", () => {
    const stripped: DiscordMessage = {
      ...SAMPLE,
      author: { id: "user-x" },
    };
    const event = normalizeNewMessage({ message: stripped, guildId: "g-1" });
    expect(event.payload.authorName).toBeNull();
  });

  it("echoes channelId from message + guildId from config", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-from-config" });
    expect(event.payload.channelId).toBe("ch-1");
    expect(event.payload.guildId).toBe("g-from-config");
  });

  it("surfaces channelName / guildName as null (known limitation, see normalize.ts header)", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.channelName).toBeNull();
    expect(event.payload.guildName).toBeNull();
  });

  it("normalizes attachments to {id, filename, size, url, contentType}", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.attachments).toEqual([
      {
        id: "att-1",
        filename: "diagram.png",
        size: 1024,
        url: "https://cdn.discordapp.com/.../diagram.png",
        contentType: "image/png",
      },
    ]);
  });

  it("normalizes mentions to {id, username}", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(event.payload.mentions).toEqual([{ id: "user-snow-2", username: "bob" }]);
  });

  it("returns empty arrays for attachments / mentions when message has none", () => {
    const bare: DiscordMessage = {
      ...SAMPLE,
      attachments: undefined,
      mentions: undefined,
    };
    const event = normalizeNewMessage({ message: bare, guildId: "g-1" });
    expect(event.payload.attachments).toEqual([]);
    expect(event.payload.mentions).toEqual([]);
  });

  it("preserves empty `content` (MESSAGE_CONTENT-intent-stripped case)", () => {
    const stripped: DiscordMessage = { ...SAMPLE, content: "" };
    const event = normalizeNewMessage({ message: stripped, guildId: "g-1" });
    expect(event.payload.content).toBe("");
  });
});

describe("normalizeNewMessage — security: no secret-shaped fields", () => {
  it("never surfaces an interaction reply token (defense-in-depth — token never lives on message)", () => {
    const event = normalizeNewMessage({ message: SAMPLE, guildId: "g-1" });
    expect(JSON.stringify(event)).not.toMatch(/"token"/);
  });
});
