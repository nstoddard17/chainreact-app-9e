import { normalizeSlackEvent } from "@/integrations/slack/webhooks/normalize";

const baseSlackPayload = {
  type: "event_callback" as const,
  team_id: "T0001",
  event_id: "Ev123",
  event_time: 1730000000,
  event: {
    type: "message",
    channel: "C123",
    user: "U1",
    text: "hi",
  },
};

describe("normalizeSlackEvent — canonical envelope shape", () => {
  it("maps the Slack envelope to the canonical TriggerEvent shape", () => {
    const result = normalizeSlackEvent(baseSlackPayload);
    expect(result).toEqual({
      provider: "slack",
      // C-prefixed channel + no explicit channel_type → public channel.
      eventType: "slack.message.channel",
      eventId: "Ev123",
      occurredAt: new Date(1730000000 * 1000).toISOString(),
      accountId: "T0001",
      payload: baseSlackPayload.event,
    });
  });

  it("preserves the inner event object verbatim as `payload` (filters + handlers index into it)", () => {
    const richEvent = {
      ...baseSlackPayload,
      event: {
        type: "message",
        channel: "C456",
        user: "U2",
        text: "hello world",
        ts: "1234567890.123",
        thread_ts: "1234567890.000",
      },
    };
    const result = normalizeSlackEvent(richEvent);
    expect(result.payload).toEqual(richEvent.event);
  });

  it("is pure: same input -> same output, no side effects", () => {
    const a = normalizeSlackEvent(baseSlackPayload);
    const b = normalizeSlackEvent(baseSlackPayload);
    expect(a).toEqual(b);
  });

  it("throws (Zod) when the inner event has no type — defense-in-depth before dispatch", () => {
    const invalid = {
      ...baseSlackPayload,
      event: { type: "", channel: "C1" },
    };
    expect(() => normalizeSlackEvent(invalid)).toThrow();
  });
});

describe("normalizeSlackEvent — message channel-kind resolution (P-S2 canonical types)", () => {
  it("emits slack.message.channel when channel_type='channel' (Slack-authoritative)", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "C1", channel_type: "channel", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.channel");
  });

  it("emits slack.message.im when channel_type='im' (DM)", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "D1", channel_type: "im", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.im");
  });

  it("emits slack.message.mpim when channel_type='mpim' (group DM)", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "G1", channel_type: "mpim", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.mpim");
  });

  it("emits slack.message.group when channel_type='group' (private channel — Slack 2.2)", () => {
    // Modern private channels carry channel_type='group' (Slack's own
    // taxonomy). The channel id is commonly C-prefixed in current
    // workspaces; channel_type is authoritative so the id prefix
    // doesn't override.
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "C9", channel_type: "group", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.group");
  });

  it("emits slack.message.group when channel_type='group' even with a G-prefixed id (legacy private channel — Slack 2.2)", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "GLEGACY1", channel_type: "group", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.group");
  });

  it("falls back to channel-id prefix when channel_type is missing — C → channel", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "C-no-type", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.channel");
  });

  it("falls back to channel-id prefix when channel_type is missing — D → im", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "D-no-type", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.im");
  });

  it("does NOT map a G-prefixed id to mpim when channel_type is missing (Slack 2.2 tightening — ambiguous between legacy private channel and group DM)", () => {
    // Slack 2.2 contract change: V1 + Slack 2.1 mapped G→mpim by prefix.
    // The prefix is ambiguous (legacy private channels share it with
    // group DMs), so we drop the heuristic and emit generic `slack.message`
    // when channel_type is absent. No filter is registered for that
    // canonical type → dispatcher drops with matched=0 (fail-safe).
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "G-no-type", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message");
  });

  it("channel_type takes precedence over channel-id prefix (e.g. mismatched test fixture)", () => {
    // If Slack ever ships a channel_type that disagrees with the prefix,
    // honor channel_type — Slack's canonical signal.
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "C1", channel_type: "im", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message.im");
  });

  it("emits generic slack.message when neither channel_type nor recognizable prefix is present", () => {
    // No filter is registered for `slack.message`, so dispatcher will
    // return matched=0 and silently drop — safe behavior for malformed
    // edge-case Slack events.
    const evt = {
      ...baseSlackPayload,
      event: { type: "message", channel: "Z-unknown", user: "U1", text: "hi" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.message");
  });

  it("preserves message subtype info inside payload but does not re-namespace the canonical type (S-R8)", () => {
    // V1 emitted slack_trigger_message_deleted as a separate canonical
    // type without a corresponding trigger schema (audit S-R8 dead emit).
    // V2 keeps subtype in the payload only — no slack.message.deleted.
    const evt = {
      ...baseSlackPayload,
      event: {
        type: "message",
        channel: "C1",
        channel_type: "channel",
        subtype: "message_deleted",
        deleted_ts: "1234.567",
      },
    };
    const result = normalizeSlackEvent(evt);
    expect(result.eventType).toBe("slack.message.channel");
    expect(result.payload).toMatchObject({ subtype: "message_deleted", deleted_ts: "1234.567" });
  });
});

describe("normalizeSlackEvent — reaction events (P-S2 canonical types)", () => {
  it("emits slack.reaction_added with the full Slack event payload preserved", () => {
    const evt = {
      ...baseSlackPayload,
      event: {
        type: "reaction_added",
        user: "U1",
        reaction: "+1",
        item: { type: "message", channel: "C1", ts: "1234.567" },
        item_user: "U2",
        event_ts: "1234.567",
      },
    };
    const result = normalizeSlackEvent(evt);
    expect(result.eventType).toBe("slack.reaction_added");
    expect(result.payload).toEqual(evt.event);
  });

  it("emits slack.reaction_removed with the full Slack event payload preserved", () => {
    const evt = {
      ...baseSlackPayload,
      event: {
        type: "reaction_removed",
        user: "U1",
        reaction: "thumbsup",
        item: { type: "message", channel: "C1", ts: "1234.567" },
        item_user: "U2",
        event_ts: "1234.568",
      },
    };
    const result = normalizeSlackEvent(evt);
    expect(result.eventType).toBe("slack.reaction_removed");
    expect(result.payload).toEqual(evt.event);
  });
});

describe("normalizeSlackEvent — forward-compatible namespace for unknown event types", () => {
  it("emits slack.<event.type> for event types Slack 2.1 doesn't filter (channel_created)", () => {
    // No filter registered for slack.channel_created — dispatcher will
    // return matched=0 and silently drop. Adding a Slack 2.2 trigger for
    // channel_created later is a code change in only the filter registry.
    const evt = {
      ...baseSlackPayload,
      event: { type: "channel_created", channel: { id: "C999", name: "new-room" } },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.channel_created");
  });

  it("emits slack.<event.type> for app_mention (out-of-scope but forward-compat)", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "app_mention", user: "U1", text: "<@BOT> hi", channel: "C1" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.app_mention");
  });

  it("emits slack.<event.type> for member_joined_channel (Slack 2.2 candidate)", () => {
    const evt = {
      ...baseSlackPayload,
      event: { type: "member_joined_channel", user: "U1", channel: "C1" },
    };
    expect(normalizeSlackEvent(evt).eventType).toBe("slack.member_joined_channel");
  });
});
