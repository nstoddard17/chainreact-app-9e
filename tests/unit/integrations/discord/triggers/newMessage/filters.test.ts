/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Discord new_message filter helper.
 */
import type { DiscordMessage } from "@/integrations/_shared/discord/api/messages";
import { matchesNewMessageFilters } from "@/integrations/discord/triggers/newMessage/filters";
import type { DiscordNewMessageConfig } from "@/integrations/discord/triggers/newMessage/schema";

function makeMessage(
  partial: Partial<DiscordMessage> & { author?: { id: string; username?: string } },
): DiscordMessage {
  return {
    id: "msg-1",
    channel_id: "ch-1",
    content: "Hello world",
    type: 0,
    ...partial,
    author:
      partial.author === undefined
        ? { id: "u-1", username: "alice" }
        : partial.author,
  } as DiscordMessage;
}

function baseConfig(
  partial: Partial<DiscordNewMessageConfig> = {},
): DiscordNewMessageConfig {
  return {
    guildId: "g-1",
    channelId: "ch-1",
    contentFilter: [],
    authorFilter: undefined,
    pollingEnabled: true,
    ...partial,
  };
}

describe("matchesNewMessageFilters — empty filters", () => {
  it("passes every message when both filters are empty/absent", () => {
    expect(matchesNewMessageFilters(makeMessage({}), baseConfig())).toBe(true);
  });
});

describe("matchesNewMessageFilters — contentFilter", () => {
  it("matches case-insensitively (lowercase needle vs uppercase content)", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "HELLO World" }),
        baseConfig({ contentFilter: ["hello"] }),
      ),
    ).toBe(true);
  });

  it("matches case-insensitively (uppercase needle vs lowercase content)", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "hello world" }),
        baseConfig({ contentFilter: ["HELLO"] }),
      ),
    ).toBe(true);
  });

  it("OR-match across keywords — passes if ANY keyword matches", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "release notes for v2" }),
        baseConfig({ contentFilter: ["urgent", "release", "production"] }),
      ),
    ).toBe(true);
  });

  it("rejects when NO keyword matches", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "lunch plans" }),
        baseConfig({ contentFilter: ["urgent", "release", "production"] }),
      ),
    ).toBe(false);
  });

  it("rejects empty-content message when keywords are non-empty (MESSAGE_CONTENT-intent-stripped case)", () => {
    // Documents the MESSAGE_CONTENT intent behavior: if the bot lacks
    // the privileged intent, Discord auto-strips content; the trigger
    // still matches the filter correctly (no false-positive).
    expect(
      matchesNewMessageFilters(
        makeMessage({ content: "" }),
        baseConfig({ contentFilter: ["anything"] }),
      ),
    ).toBe(false);
  });
});

describe("matchesNewMessageFilters — authorFilter", () => {
  it("matches when author.id equals authorFilter", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ author: { id: "alice-id", username: "alice" } }),
        baseConfig({ authorFilter: "alice-id" }),
      ),
    ).toBe(true);
  });

  it("rejects when author.id does not match", () => {
    expect(
      matchesNewMessageFilters(
        makeMessage({ author: { id: "bob-id", username: "bob" } }),
        baseConfig({ authorFilter: "alice-id" }),
      ),
    ).toBe(false);
  });

  it("rejects when message has no author and authorFilter is set", () => {
    const msg = makeMessage({}) as DiscordMessage;
    delete (msg as unknown as { author?: unknown }).author;
    expect(matchesNewMessageFilters(msg, baseConfig({ authorFilter: "alice-id" }))).toBe(
      false,
    );
  });
});

describe("matchesNewMessageFilters — AND composition", () => {
  it("requires BOTH filters to pass when both are set", () => {
    const msg = makeMessage({
      author: { id: "alice-id", username: "alice" },
      content: "release notes",
    });
    expect(
      matchesNewMessageFilters(
        msg,
        baseConfig({ authorFilter: "alice-id", contentFilter: ["release"] }),
      ),
    ).toBe(true);
    // Same author, wrong content keyword.
    expect(
      matchesNewMessageFilters(
        msg,
        baseConfig({ authorFilter: "alice-id", contentFilter: ["urgent"] }),
      ),
    ).toBe(false);
    // Same content, wrong author.
    expect(
      matchesNewMessageFilters(
        msg,
        baseConfig({ authorFilter: "bob-id", contentFilter: ["release"] }),
      ),
    ).toBe(false);
  });
});
