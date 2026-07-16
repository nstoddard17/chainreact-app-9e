/**
 * CS-2 — eligible Slack channel config fields use the searchable
 * `slack:channels` combobox (name-or-ID, manual paste allowed) while storing
 * the stable channel id. Proves the conversion, the deliberate eligibility
 * boundaries (DMs / group-DMs / user / new-channel-name fields stay as-is),
 * schema validity, and that the stored config KEY handlers read is unchanged.
 */
import { TriggerMetaSchema } from "@/contracts/triggerMeta";
import { ActionMetaSchema, type FieldMeta } from "@/contracts/actionMeta";
import {
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

import { newMessageChannelTriggerMeta } from "@/integrations/slack/triggers/newMessageChannel/newMessageChannel.meta";
import { reactionAddedTriggerMeta } from "@/integrations/slack/triggers/reactionAdded/reactionAdded.meta";
import { reactionRemovedTriggerMeta } from "@/integrations/slack/triggers/reactionRemoved/reactionRemoved.meta";
import { memberJoinedChannelTriggerMeta } from "@/integrations/slack/triggers/memberJoinedChannel/memberJoinedChannel.meta";
import { memberLeftChannelTriggerMeta } from "@/integrations/slack/triggers/memberLeftChannel/memberLeftChannel.meta";
import { newMessagePrivateChannelTriggerMeta } from "@/integrations/slack/triggers/newMessagePrivateChannel/newMessagePrivateChannel.meta";
import { fileUploadedTriggerMeta } from "@/integrations/slack/triggers/fileUploaded/fileUploaded.meta";

import { newGroupDirectMessageTriggerMeta } from "@/integrations/slack/triggers/newGroupDirectMessage/newGroupDirectMessage.meta";
import { newDirectMessageTriggerMeta } from "@/integrations/slack/triggers/newDirectMessage/newDirectMessage.meta";
import { channelCreatedTriggerMeta } from "@/integrations/slack/triggers/channelCreated/channelCreated.meta";
import { slackSendDirectMessageMeta } from "@/integrations/slack/actions/sendDirectMessage.meta";
import { slackCreateChannelMeta } from "@/integrations/slack/actions/channels/createChannel.meta";

const CONVERTED = [
  newMessageChannelTriggerMeta,
  reactionAddedTriggerMeta,
  reactionRemovedTriggerMeta,
  memberJoinedChannelTriggerMeta,
  memberLeftChannelTriggerMeta,
  newMessagePrivateChannelTriggerMeta,
  fileUploadedTriggerMeta,
];

function channelField(fields: readonly FieldMeta[]): FieldMeta | undefined {
  return fields.find((f) => f.name === "channelId");
}

describe("CS-2 — eligible Slack channel fields became searchable comboboxes", () => {
  it.each(CONVERTED.map((m) => [m.key, m] as const))(
    "%s channelId is a slack:channels combobox with manual entry, storing the id",
    (_key, meta) => {
      const f = channelField(meta.fields);
      expect(f).toBeDefined();
      expect(f!.type).toBe("combobox");
      expect(f!.optionsSource).toBe("slack:channels");
      expect(f!.allowManualEntry).toBe(true);
      // Stored config KEY is unchanged → Slack handlers/schemas keep reading
      // `config.channelId` exactly as before (no handler/schema change).
      expect(f!.name).toBe("channelId");
      // Optional channel filters stay optional.
      expect(f!.required).toBe(false);
      // User-facing label, not "Channel ID".
      expect(f!.label).toBe("Channel (optional)");
      expect(f!.placeholder).toMatch(/search channels or paste/i);
    },
  );

  it("all converted trigger metas still validate against TriggerMetaSchema", () => {
    for (const meta of CONVERTED) {
      expect(TriggerMetaSchema.safeParse(meta).success).toBe(true);
    }
  });
});

describe("CS-2 — ineligible Slack fields are deliberately left unchanged", () => {
  it("group-DM trigger channelId uses the slack:group_dms picker (mpim — built in SWEEP-4)", () => {
    // SWEEP-4 added `mpim:read` + the `slack:group_dms` resolver, so the mpim
    // filter is now a searchable picker (with a manual-id fallback) instead of
    // raw text. slack:channels still excludes mpims; this is its own resolver.
    const f = channelField(newGroupDirectMessageTriggerMeta.fields);
    expect(f!.type).toBe("combobox");
    expect(f!.optionsSource).toBe("slack:group_dms");
    expect(f!.allowManualEntry).toBe(true);
    expect(f!.name).toBe("channelId");
  });

  it("direct-message trigger has no channel field (filters by sender user id)", () => {
    expect(channelField(newDirectMessageTriggerMeta.fields)).toBeUndefined();
    expect(newDirectMessageTriggerMeta.fields.some((f) => f.name === "withUserId")).toBe(true);
  });

  it("channel-created trigger has no input fields to convert", () => {
    expect(channelCreatedTriggerMeta.fields).toHaveLength(0);
  });

  it("send-direct-message userId now uses the slack:users picker (built in the config-field UX sweep)", () => {
    const userField = slackSendDirectMessageMeta.fields.find((f) => f.name === "userId");
    expect(userField!.type).toBe("combobox");
    expect(userField!.optionsSource).toBe("slack:users");
    expect(userField!.allowManualEntry).toBe(true);
    expect(ActionMetaSchema.safeParse(slackSendDirectMessageMeta).success).toBe(true);
  });

  it("create-channel keeps name as a free-text new-channel name (not a picker)", () => {
    const nameField = slackCreateChannelMeta.fields.find((f) => f.name === "name");
    expect(nameField!.type).toBe("text");
    expect(nameField!.optionsSource).toBeUndefined();
  });
});

// ─── CS-2b — Slack ACTION channel comboboxes get manual entry too ───────────

const isSlackChannelField = (f: FieldMeta): boolean =>
  f.type === "combobox" && f.optionsSource === "slack:channels";

describe("CS-2b — every Slack channel combobox (action + trigger) allows manual entry", () => {
  const slackActionMetas = listActionMetasForProvider("slack");
  const slackTriggerMetas = listTriggerMetasForProvider("slack");

  it("finds Slack action metas with slack:channels fields (sanity — registry wired)", () => {
    const withChannel = slackActionMetas.filter((m) => m.fields.some(isSlackChannelField));
    // CS-2b touched 24 action channel fields; guard against an empty/over-broad match.
    expect(withChannel.length).toBeGreaterThanOrEqual(20);
  });

  it("ALL slack:channels combobox fields (actions) carry allowManualEntry + store the channel value", () => {
    for (const meta of slackActionMetas) {
      for (const f of meta.fields.filter(isSlackChannelField)) {
        expect(f.allowManualEntry).toBe(true);
        // Field name (the stored config key handlers read) is unchanged.
        expect(f.name === "channel" || f.name === "channelId").toBe(true);
        // User-facing label, never "Channel ID".
        expect(f.label?.toLowerCase()).not.toContain("channel id");
      }
    }
  });

  it("ALL slack:channels combobox fields (triggers, from CS-2) still carry allowManualEntry", () => {
    for (const meta of slackTriggerMetas) {
      for (const f of meta.fields.filter(isSlackChannelField)) {
        expect(f.allowManualEntry).toBe(true);
      }
    }
  });

  it("manual entry only appears on the slack channel/user/group-DM pickers (no accidental conversion)", () => {
    // After the sweep, allowManualEntry is valid on the slack:channels,
    // slack:users, and slack:group_dms single-select picker comboboxes AND on
    // the per-chip slack:users string-array picker (invite_users_to_channel,
    // Group A config-UX sweep) — but never on any other field.
    const isSlackPicker = (f: FieldMeta): boolean =>
      (f.type === "combobox" &&
        (f.optionsSource === "slack:channels" ||
          f.optionsSource === "slack:users" ||
          f.optionsSource === "slack:group_dms")) ||
      (f.type === "string-array" && f.optionsSource === "slack:users");
    const allFields = [
      ...slackActionMetas.flatMap((m) => m.fields),
      ...slackTriggerMetas.flatMap((m) => m.fields),
    ];
    for (const f of allFields) {
      if (!isSlackPicker(f)) {
        expect(f.allowManualEntry).toBeUndefined();
      }
    }
    // The new-channel-name field stays a non-picker.
    const nameField = slackCreateChannelMeta.fields.find((f) => f.name === "name");
    expect(nameField!.allowManualEntry).toBeUndefined();
    expect(nameField!.optionsSource).toBeUndefined();
  });

  it("every Slack action + trigger meta still validates (handlers/schemas untouched — metadata only)", () => {
    for (const meta of slackActionMetas) {
      expect(ActionMetaSchema.safeParse(meta).success).toBe(true);
    }
    for (const meta of slackTriggerMetas) {
      expect(TriggerMetaSchema.safeParse(meta).success).toBe(true);
    }
  });
});
