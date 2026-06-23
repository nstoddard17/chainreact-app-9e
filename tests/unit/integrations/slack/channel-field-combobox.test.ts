/**
 * CS-2 — eligible Slack channel config fields use the searchable
 * `slack:channels` combobox (name-or-ID, manual paste allowed) while storing
 * the stable channel id. Proves the conversion, the deliberate eligibility
 * boundaries (DMs / group-DMs / user / new-channel-name fields stay as-is),
 * schema validity, and that the stored config KEY handlers read is unchanged.
 */
import { TriggerMetaSchema } from "@/contracts/triggerMeta";
import { ActionMetaSchema, type FieldMeta } from "@/contracts/actionMeta";

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
  it("group-DM trigger keeps its channelId as text (slack:channels excludes mpims)", () => {
    const f = channelField(newGroupDirectMessageTriggerMeta.fields);
    expect(f!.type).toBe("text");
    expect(f!.optionsSource).toBeUndefined();
  });

  it("direct-message trigger has no channel field (filters by sender user id)", () => {
    expect(channelField(newDirectMessageTriggerMeta.fields)).toBeUndefined();
    expect(newDirectMessageTriggerMeta.fields.some((f) => f.name === "withUserId")).toBe(true);
  });

  it("channel-created trigger has no input fields to convert", () => {
    expect(channelCreatedTriggerMeta.fields).toHaveLength(0);
  });

  it("send-direct-message keeps userId as text (needs a future slack:users resolver)", () => {
    const userField = slackSendDirectMessageMeta.fields.find((f) => f.name === "userId");
    expect(userField!.type).toBe("text");
    expect(ActionMetaSchema.safeParse(slackSendDirectMessageMeta).success).toBe(true);
  });

  it("create-channel keeps name as a free-text new-channel name (not a picker)", () => {
    const nameField = slackCreateChannelMeta.fields.find((f) => f.name === "name");
    expect(nameField!.type).toBe("text");
    expect(nameField!.optionsSource).toBeUndefined();
  });
});
