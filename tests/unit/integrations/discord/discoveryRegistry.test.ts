/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-4 — Discord discovery registry assertions.
 *
 * Pins:
 *   - 5 Discord action metas registered (no more, no less).
 *   - 0 Discord trigger metas (triggers deferred per D-DC1).
 *   - No duplicate keys.
 *   - Per-meta field-name preservation (camelCase).
 *   - Per-meta sensitive-output flags match the Slice 3.DISCORD-1
 *     audit recommendations.
 *   - Risk + destructive-trio classification matches the audit table.
 *   - Cascade dependencies match the resolver `requiredDeps` keys.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("Discord action metas — registration", () => {
  const EXPECTED_KEYS = [
    "discord:send_message",
    "discord:edit_message",
    "discord:delete_message",
    "discord:fetch_messages",
    "discord:assign_role",
  ];

  it("registers exactly 5 Discord action metas", () => {
    const metas = listActionMetasForProvider("discord");
    expect(metas).toHaveLength(5);
  });

  it.each(EXPECTED_KEYS)("registers %s", (key) => {
    expect(getActionMeta(key)).toBeDefined();
  });

  it("registers zero Discord trigger metas (D-DC1 — triggers deferred)", () => {
    expect(listTriggerMetasForProvider("discord")).toEqual([]);
  });

  it("sorts Discord actions by their displayOrder in the per-provider list", () => {
    const metas = listActionMetasForProvider("discord");
    const orders = metas.map((m) => m.displayOrder);
    // Strictly ascending — confirms displayOrder values are unique and
    // the central sort respects them.
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]!);
    }
  });
});

describe("Discord send_message meta", () => {
  const meta = getActionMeta("discord:send_message")!;

  it("preserves V1 camelCase field names: guildId / channelId / message", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "guildId",
      "channelId",
      "message",
    ]);
  });

  it("wires the cascade: channelId depends on guildId, uses discord:channels", () => {
    const channelField = meta.fields.find((f) => f.name === "channelId")!;
    expect(channelField.dependsOn).toBe("guildId");
    expect(channelField.optionsSource).toBe("discord:channels");
  });

  it("guildId uses discord:guilds with no deps", () => {
    const guildField = meta.fields.find((f) => f.name === "guildId")!;
    expect(guildField.optionsSource).toBe("discord:guilds");
    expect(guildField.dependsOn).toBeUndefined();
  });

  it("message is a textarea (NOT discord-rich-text)", () => {
    expect(meta.fields.find((f) => f.name === "message")!.type).toBe("textarea");
  });

  it("risk: medium, not destructive, no confirmation", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("marks output `content` as sensitive (echoed message body)", () => {
    const content = meta.outputs.find((o) => o.name === "content")!;
    expect(content.sensitive).toBe(true);
  });

  it("opaque ids on output are NOT sensitive", () => {
    for (const name of ["messageId", "channelId", "guildId", "timestamp"]) {
      expect(meta.outputs.find((o) => o.name === name)?.sensitive).toBeUndefined();
    }
  });
});

describe("Discord edit_message meta", () => {
  const meta = getActionMeta("discord:edit_message")!;

  it("preserves V1 field names: guildId / channelId / messageId / content", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "guildId",
      "channelId",
      "messageId",
      "content",
    ]);
  });

  it("messageId wires the bot-authored-only picker (discord:bot_messages)", () => {
    const field = meta.fields.find((f) => f.name === "messageId")!;
    expect(field.optionsSource).toBe("discord:bot_messages");
    expect(field.dependsOn).toBe("channelId");
  });

  it("output `content` sensitive", () => {
    expect(meta.outputs.find((o) => o.name === "content")?.sensitive).toBe(true);
  });
});

describe("Discord delete_message meta — destructive trio", () => {
  const meta = getActionMeta("discord:delete_message")!;

  it("preserves V1 field names verbatim", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "guildId",
      "channelId",
      "messageIds",
      "userIds",
      "keywords",
      "keywordMatchType",
    ]);
  });

  it("isDestructive: true + requiresConfirmation: true + riskLevel: high", () => {
    expect(meta.isDestructive).toBe(true);
    expect(meta.requiresConfirmation).toBe(true);
    expect(meta.riskLevel).toBe("high");
  });

  it("riskDescription mentions irreversibility + default partial match", () => {
    expect(meta.riskDescription).toMatch(/irreversible/i);
    expect(meta.riskDescription).toMatch(/partial/i);
  });

  it("array filter fields use string-array (no optionsSource — contract limitation)", () => {
    for (const name of ["messageIds", "userIds", "keywords"]) {
      const field = meta.fields.find((f) => f.name === name)!;
      expect(field.type).toBe("string-array");
      // Contract: optionsSource is not permitted on string-array fields.
      // Documented limitation per Slice 3.DISCORD-4 instruction.
      expect(field.optionsSource).toBeUndefined();
    }
  });

  it("keywordMatchType defaultValue is 'partial' (mirrors V1 runtime default)", () => {
    const field = meta.fields.find((f) => f.name === "keywordMatchType")!;
    expect(field.type).toBe("select");
    expect(field.defaultValue).toBe("partial");
    expect(field.options?.map((o) => o.value).sort()).toEqual(["exact", "partial", "whole"]);
  });

  it("output excludes message content (deletedCount / messageIds / channelId only)", () => {
    const names = meta.outputs.map((o) => o.name);
    expect(names).toContain("deletedCount");
    expect(names).toContain("messageIds");
    expect(names).not.toContain("content");
    expect(names).not.toContain("messages");
  });
});

describe("Discord fetch_messages meta", () => {
  const meta = getActionMeta("discord:fetch_messages")!;

  it("preserves V1 field names verbatim including 9-value filterType", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "guildId",
      "channelId",
      "limit",
      "sortOrder",
      "filterType",
      "filterAuthor",
      "filterContent",
      "caseSensitive",
    ]);
  });

  it("limit: number with V1 default 20 and numeric bounds 1..100", () => {
    const field = meta.fields.find((f) => f.name === "limit")!;
    expect(field.type).toBe("number");
    expect(field.defaultValue).toBe(20);
    expect(field.numeric).toMatchObject({ min: 1, max: 100, integer: true });
  });

  it("sortOrder defaults to newest", () => {
    const field = meta.fields.find((f) => f.name === "sortOrder")!;
    expect(field.defaultValue).toBe("newest");
    expect(field.options?.map((o) => o.value).sort()).toEqual(["newest", "oldest"]);
  });

  it("filterType is the V1 9-value enum with default 'none'", () => {
    const field = meta.fields.find((f) => f.name === "filterType")!;
    expect(field.defaultValue).toBe("none");
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "author",
      "content",
      "from_bots",
      "from_humans",
      "has_attachments",
      "has_embeds",
      "has_reactions",
      "is_pinned",
      "none",
    ]);
  });

  it("caseSensitive defaults to false", () => {
    expect(meta.fields.find((f) => f.name === "caseSensitive")!.defaultValue).toBe(false);
  });

  it("filterAuthor wires discord:members with deps ['guildId']", () => {
    const field = meta.fields.find((f) => f.name === "filterAuthor")!;
    expect(field.optionsSource).toBe("discord:members");
    expect(field.dependsOn).toBe("guildId");
  });

  it("output `messages` marked sensitive (bulk PII / user-typed bodies)", () => {
    expect(meta.outputs.find((o) => o.name === "messages")?.sensitive).toBe(true);
  });

  it("risk: low (pure read), not destructive", () => {
    expect(meta.riskLevel).toBe("low");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });
});

describe("Discord assign_role meta", () => {
  const meta = getActionMeta("discord:assign_role")!;

  it("preserves V1 field names verbatim: guildId / userId / roleId", () => {
    expect(meta.fields.map((f) => f.name)).toEqual([
      "guildId",
      "userId",
      "roleId",
    ]);
  });

  it("userId wires discord:members and depends on guildId", () => {
    const field = meta.fields.find((f) => f.name === "userId")!;
    expect(field.optionsSource).toBe("discord:members");
    expect(field.dependsOn).toBe("guildId");
  });

  it("roleId wires discord:roles and depends on guildId", () => {
    const field = meta.fields.find((f) => f.name === "roleId")!;
    expect(field.optionsSource).toBe("discord:roles");
    expect(field.dependsOn).toBe("guildId");
  });

  it("output `userId` marked sensitive per DISCORD-1 §5.1", () => {
    expect(meta.outputs.find((o) => o.name === "userId")?.sensitive).toBe(true);
  });

  it("risk: medium (recoverable, but may grant elevated permissions)", () => {
    expect(meta.riskLevel).toBe("medium");
    expect(meta.isDestructive).toBe(false);
    expect(meta.requiresConfirmation).toBe(false);
  });

  it("description warns about elevated permissions + hierarchy", () => {
    expect(meta.description).toMatch(/elevated permissions/i);
    expect(meta.description).toMatch(/hierarchy/i);
  });
});

describe("Discord meta secret-shape guards (defense-in-depth)", () => {
  it("no meta output uses a secret-shaped name (token / secret / api_key / etc.)", () => {
    const FORBIDDEN = new Set([
      "token",
      "secret",
      "clientSecret",
      "client_secret",
      "apiKey",
      "accessToken",
      "refreshToken",
      "webhookSecret",
    ]);
    const metas = listActionMetasForProvider("discord");
    for (const meta of metas) {
      for (const out of meta.outputs) {
        expect(FORBIDDEN.has(out.name)).toBe(false);
      }
    }
  });
});
