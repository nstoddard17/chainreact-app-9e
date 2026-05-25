/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Shared Discord message filter helper.
 *
 * `isUserVisibleMessage` was extracted from `fetch_messages` action
 * into `_shared/` so the `new_message` polling trigger can reuse the
 * exact same system-message filter logic. Both surfaces import from
 * the same source.
 */
import type { DiscordMessage } from "@/integrations/_shared/discord/api/messages";
import { isUserVisibleMessage } from "@/integrations/_shared/discord/messageFilters";

function msg(partial: Partial<DiscordMessage>): DiscordMessage {
  return {
    id: "m-1",
    channel_id: "c-1",
    content: "x",
    ...partial,
  } as DiscordMessage;
}

describe("isUserVisibleMessage", () => {
  it("returns true for type === 0 (DEFAULT user/bot message)", () => {
    expect(isUserVisibleMessage(msg({ type: 0 }))).toBe(true);
  });

  it("returns true when type is undefined (defensive — malformed/partial payload)", () => {
    expect(isUserVisibleMessage(msg({}))).toBe(true);
  });

  it("returns false for a typical system message (type !== 0, no attachments, no embeds)", () => {
    // Discord MessageType: 6=CHANNEL_PINNED_MESSAGE, 7=USER_JOIN,
    // 8=GUILD_BOOST, etc.
    expect(isUserVisibleMessage(msg({ type: 6 }))).toBe(false);
    expect(isUserVisibleMessage(msg({ type: 7 }))).toBe(false);
    expect(isUserVisibleMessage(msg({ type: 8 }))).toBe(false);
  });

  it("returns true for a system message that still carries attachments", () => {
    expect(
      isUserVisibleMessage(
        msg({ type: 6, attachments: [{ id: "a-1", filename: "x.png" }] }),
      ),
    ).toBe(true);
  });

  it("returns true for a system message that still carries embeds", () => {
    expect(
      isUserVisibleMessage(msg({ type: 6, embeds: [{ title: "x" }] })),
    ).toBe(true);
  });

  it("returns false for a system message with empty attachments + embeds arrays", () => {
    expect(
      isUserVisibleMessage(msg({ type: 7, attachments: [], embeds: [] })),
    ).toBe(false);
  });
});
