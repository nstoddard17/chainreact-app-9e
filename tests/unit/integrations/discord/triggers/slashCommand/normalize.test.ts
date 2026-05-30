/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-6 — `discord:slash_command` normalize fn.
 *
 * Pinned contracts:
 *   - `eventId` = Discord interaction id (snowflake). Drives
 *     `(provider, eventId)` dedup.
 *   - `provider` / `eventType` set canonically.
 *   - `accountId` = guild id (slash commands are guild-scoped).
 *   - Flattens `data.options[]` into `payload.options` as a flat
 *     `{name: value}` record.
 *   - Invoker comes from `member.user` (guild context) or `user` (DM
 *     context).
 *   - Raw interaction body is forwarded under `payload.interaction`
 *     with `token` STRIPPED (write-permission credential — must not
 *     leak to variable picker).
 */
import { normalizeSlashCommand } from "@/integrations/discord/triggers/slashCommand/normalize";

const SAMPLE: Record<string, unknown> = {
  id: "interaction-snowflake-1",
  application_id: "app-snowflake",
  type: 2,
  token: "SECRET_INTERACTION_TOKEN",
  version: 1,
  guild_id: "guild-snowflake",
  channel_id: "channel-snowflake",
  channel: { id: "channel-snowflake", name: "general" },
  member: {
    user: {
      id: "user-snowflake",
      username: "alice",
      global_name: "Alice",
      discriminator: "0",
    },
    roles: ["role-1"],
    joined_at: "2024-01-01T00:00:00Z",
  },
  data: {
    id: "command-snowflake",
    name: "report",
    type: 1,
    options: [
      { name: "subject", type: 3, value: "weekly" },
      { name: "count", type: 4, value: 5 },
      { name: "include_archived", type: 5, value: false },
    ],
  },
};

describe("normalizeSlashCommand — canonical fields", () => {
  it("sets provider=discord, eventType=slash_command", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.provider).toBe("discord");
    expect(event.eventType).toBe("slash_command");
  });

  it("uses the interaction id as the dedup key (eventId)", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.eventId).toBe("interaction-snowflake-1");
  });

  it("sets accountId to the guild id", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.providerAccountId).toBe("guild-snowflake");
  });

  it("sets occurredAt to a non-empty ISO-8601 string (current time)", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.occurredAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });
});

describe("normalizeSlashCommand — payload shape", () => {
  it("surfaces commandName + commandId + channelId + channelName + guildId", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.payload.commandName).toBe("report");
    expect(event.payload.commandId).toBe("command-snowflake");
    expect(event.payload.channelId).toBe("channel-snowflake");
    expect(event.payload.channelName).toBe("general");
    expect(event.payload.guildId).toBe("guild-snowflake");
  });

  it("extracts invoker from member.user in guild context", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.payload.userId).toBe("user-snowflake");
    expect(event.payload.userName).toBe("alice");
  });

  it("falls back to body.user when member.user is absent (DM context)", () => {
    const dmBody: Record<string, unknown> = {
      ...SAMPLE,
      member: undefined,
      user: { id: "dm-user", username: "bob" },
    };
    delete dmBody.member;
    const event = normalizeSlashCommand({ body: dmBody });
    expect(event.payload.userId).toBe("dm-user");
    expect(event.payload.userName).toBe("bob");
  });

  it("flattens options[] into {name: value}", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    expect(event.payload.options).toEqual({
      subject: "weekly",
      count: 5,
      include_archived: false,
    });
  });

  it("returns empty options when data.options is missing", () => {
    const noOpts: Record<string, unknown> = {
      ...SAMPLE,
      data: { id: "cmd", name: "ping", type: 1 },
    };
    const event = normalizeSlashCommand({ body: noOpts });
    expect(event.payload.options).toEqual({});
  });

  it("skips option entries with no name", () => {
    const malformed: Record<string, unknown> = {
      ...SAMPLE,
      data: {
        id: "cmd",
        name: "report",
        type: 1,
        options: [{ name: "ok", type: 3, value: "v" }, { type: 3, value: "x" }],
      },
    };
    const event = normalizeSlashCommand({ body: malformed });
    expect(event.payload.options).toEqual({ ok: "v" });
  });
});

describe("normalizeSlashCommand — security: token stripping", () => {
  it("STRIPS the interaction token from payload.interaction (write-perm credential)", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    const interaction = event.payload.interaction as Record<string, unknown>;
    expect(interaction).toBeDefined();
    expect("token" in interaction).toBe(false);
    // Other fields ride through unchanged.
    expect(interaction.id).toBe("interaction-snowflake-1");
    expect(interaction.data).toBeDefined();
  });

  it("does NOT leak the token via any other top-level payload field", () => {
    const event = normalizeSlashCommand({ body: SAMPLE });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("SECRET_INTERACTION_TOKEN");
  });
});

describe("normalizeSlashCommand — defensive fallbacks", () => {
  it("falls back to a synthetic eventId when the interaction body has no id", () => {
    const noId: Record<string, unknown> = { ...SAMPLE };
    delete noId.id;
    const event = normalizeSlashCommand({ body: noId });
    expect(event.eventId).toMatch(/^discord-interaction-\d+/);
  });

  it("falls back to accountId='unknown' when guild_id is absent (DM-context safety)", () => {
    const dm: Record<string, unknown> = { ...SAMPLE };
    delete dm.guild_id;
    const event = normalizeSlashCommand({ body: dm });
    expect(event.providerAccountId).toBe("unknown");
  });
});
