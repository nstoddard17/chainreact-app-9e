import {
  ActionMetaSchema,
  type ActionMeta,
} from "@/contracts/actionMeta";
import {
  TriggerMetaSchema,
  type TriggerMeta,
} from "@/contracts/triggerMeta";

// Native action metadata (Slice 3.0 coverage scope).
import { httpRequestMeta } from "@/integrations/native/actions/httpRequest.meta";
import { formatTransformerMeta } from "@/integrations/native/actions/formatTransformer.meta";
import { delayMeta } from "@/integrations/native/actions/delay.meta";
import { ifThenConditionMeta } from "@/integrations/native/actions/ifThenCondition.meta";
import { routerMeta } from "@/integrations/native/actions/router.meta";

// Native trigger metadata.
import { manualTriggerMeta } from "@/integrations/native/triggers/manualTrigger.meta";
import { scheduledTriggerMeta } from "@/integrations/native/triggers/scheduledTrigger.meta";

// GitHub action metadata (Slice 3.0b coverage scope).
import { createIssueMeta } from "@/integrations/github/actions/createIssue.meta";
import { createRepositoryMeta } from "@/integrations/github/actions/createRepository.meta";
import { createPullRequestMeta } from "@/integrations/github/actions/createPullRequest.meta";
import { createBranchMeta } from "@/integrations/github/actions/createBranch.meta";
import { createGistMeta } from "@/integrations/github/actions/createGist.meta";
import { addCommentMeta } from "@/integrations/github/actions/addComment.meta";

// Microsoft Outlook Mail action metadata (Slice 3.17 coverage scope).
import { outlookSendEmailMeta } from "@/integrations/microsoft-outlook/actions/sendEmail.meta";
import { outlookReplyToEmailMeta } from "@/integrations/microsoft-outlook/actions/replyToEmail.meta";
import { outlookForwardEmailMeta } from "@/integrations/microsoft-outlook/actions/forwardEmail.meta";
import { outlookCreateDraftEmailMeta } from "@/integrations/microsoft-outlook/actions/createDraftEmail.meta";
import { outlookFetchEmailsMeta } from "@/integrations/microsoft-outlook/actions/fetchEmails.meta";
import { outlookGetAttachmentMeta } from "@/integrations/microsoft-outlook/actions/getAttachment.meta";
import { outlookAddCategoriesMeta } from "@/integrations/microsoft-outlook/actions/addCategories.meta";
import { outlookMoveEmailMeta } from "@/integrations/microsoft-outlook/actions/moveEmail.meta";
import { outlookDeleteEmailMeta } from "@/integrations/microsoft-outlook/actions/deleteEmail.meta";

// Microsoft Outlook Mail trigger metadata (Slice 3.17 coverage scope).
import { outlookNewEmailTriggerMeta } from "@/integrations/microsoft-outlook/triggers/newEmail/newEmail.meta";
import { outlookEmailSentTriggerMeta } from "@/integrations/microsoft-outlook/triggers/emailSent/emailSent.meta";
import { outlookEmailFlaggedTriggerMeta } from "@/integrations/microsoft-outlook/triggers/emailFlagged/emailFlagged.meta";

// Gmail action metadata (Slice 3.15 coverage scope).
import { sendEmailMeta } from "@/integrations/gmail/actions/sendEmail.meta";
import { replyToEmailMeta } from "@/integrations/gmail/actions/replyToEmail.meta";
import { createDraftMeta } from "@/integrations/gmail/actions/createDraft.meta";
import { createDraftReplyMeta } from "@/integrations/gmail/actions/createDraftReply.meta";
import { searchEmailsMeta } from "@/integrations/gmail/actions/searchEmails.meta";
import { getAttachmentMeta } from "@/integrations/gmail/actions/getAttachment.meta";
import { addLabelMeta } from "@/integrations/gmail/actions/addLabel.meta";
import { removeLabelMeta } from "@/integrations/gmail/actions/removeLabel.meta";
import { createLabelMeta } from "@/integrations/gmail/actions/createLabel.meta";
import { markAsReadMeta } from "@/integrations/gmail/actions/markAsRead.meta";
import { markAsUnreadMeta } from "@/integrations/gmail/actions/markAsUnread.meta";
import { archiveEmailMeta } from "@/integrations/gmail/actions/archiveEmail.meta";
import { deleteEmailMeta } from "@/integrations/gmail/actions/deleteEmail.meta";

// GitHub trigger metadata.
import { newCommitTriggerMeta } from "@/integrations/github/triggers/newCommit/newCommit.meta";

// Gmail trigger metadata (Slice 3.12 coverage scope).
import { newEmailTriggerMeta } from "@/integrations/gmail/triggers/newEmail/newEmail.meta";
import { newLabeledEmailTriggerMeta } from "@/integrations/gmail/triggers/newLabeledEmail/newLabeledEmail.meta";
import { newAttachmentTriggerMeta } from "@/integrations/gmail/triggers/newAttachment/newAttachment.meta";

// Slack action metadata (Slice 3.26 + 3.27 + 3.35 — partial coverage:
// file actions + messaging Group A; Slack remains intentionally absent
// from COVERED_PROVIDERS in
// tests/structure/discovery-meta-coverage.test.ts until every Slack
// runtime handler has a meta — the channels / reactions / users /
// block-kit surfaces are still pending).
import { slackDownloadFileMeta } from "@/integrations/slack/actions/files/downloadFile.meta";
import { slackUploadFileMeta } from "@/integrations/slack/actions/files/uploadFile.meta";
// Slice 3.35 — Slack messaging Group A.
import { slackSendChannelMessageMeta } from "@/integrations/slack/actions/sendChannelMessage.meta";
import { slackSendDirectMessageMeta } from "@/integrations/slack/actions/sendDirectMessage.meta";
import { slackUpdateMessageMeta } from "@/integrations/slack/actions/updateMessage.meta";
import { slackDeleteMessageMeta } from "@/integrations/slack/actions/deleteMessage.meta";
import { slackGetMessagesMeta } from "@/integrations/slack/actions/getMessages.meta";
import { slackGetThreadMessagesMeta } from "@/integrations/slack/actions/getThreadMessages.meta";
import { slackScheduleMessageMeta } from "@/integrations/slack/actions/scheduleMessage.meta";
import { slackCancelScheduledMessageMeta } from "@/integrations/slack/actions/cancelScheduledMessage.meta";
// Slice 3.36 — Slack reactions / pins / list_scheduled_messages (Group B).
import { slackAddReactionMeta } from "@/integrations/slack/actions/addReaction.meta";
import { slackRemoveReactionMeta } from "@/integrations/slack/actions/removeReaction.meta";
import { slackPinMessageMeta } from "@/integrations/slack/actions/pinMessage.meta";
import { slackUnpinMessageMeta } from "@/integrations/slack/actions/unpinMessage.meta";
import { slackListScheduledMessagesMeta } from "@/integrations/slack/actions/listScheduledMessages.meta";
// Slice 3.37 — Slack channel management (Group C, 12 actions).
import { slackListChannelsMeta } from "@/integrations/slack/actions/channels/listChannels.meta";
import { slackGetChannelInfoMeta } from "@/integrations/slack/actions/channels/getChannelInfo.meta";
import { slackCreateChannelMeta } from "@/integrations/slack/actions/channels/createChannel.meta";
import { slackArchiveChannelMeta } from "@/integrations/slack/actions/channels/archiveChannel.meta";
import { slackUnarchiveChannelMeta } from "@/integrations/slack/actions/channels/unarchiveChannel.meta";
import { slackRenameChannelMeta } from "@/integrations/slack/actions/channels/renameChannel.meta";
import { slackJoinChannelMeta } from "@/integrations/slack/actions/channels/joinChannel.meta";
import { slackLeaveChannelMeta } from "@/integrations/slack/actions/channels/leaveChannel.meta";
import { slackInviteUsersToChannelMeta } from "@/integrations/slack/actions/channels/inviteUsersToChannel.meta";
import { slackRemoveUserFromChannelMeta } from "@/integrations/slack/actions/channels/removeUserFromChannel.meta";
import { slackSetChannelTopicMeta } from "@/integrations/slack/actions/channels/setChannelTopic.meta";
import { slackSetChannelPurposeMeta } from "@/integrations/slack/actions/channels/setChannelPurpose.meta";

// Slack trigger metadata (Slice 3.11 coverage scope).
import { newMessageChannelTriggerMeta } from "@/integrations/slack/triggers/newMessageChannel/newMessageChannel.meta";
import { newDirectMessageTriggerMeta } from "@/integrations/slack/triggers/newDirectMessage/newDirectMessage.meta";
import { newMessagePrivateChannelTriggerMeta } from "@/integrations/slack/triggers/newMessagePrivateChannel/newMessagePrivateChannel.meta";
import { newGroupDirectMessageTriggerMeta } from "@/integrations/slack/triggers/newGroupDirectMessage/newGroupDirectMessage.meta";
import { reactionAddedTriggerMeta } from "@/integrations/slack/triggers/reactionAdded/reactionAdded.meta";
import { reactionRemovedTriggerMeta } from "@/integrations/slack/triggers/reactionRemoved/reactionRemoved.meta";
import { channelCreatedTriggerMeta } from "@/integrations/slack/triggers/channelCreated/channelCreated.meta";
import { memberJoinedChannelTriggerMeta } from "@/integrations/slack/triggers/memberJoinedChannel/memberJoinedChannel.meta";
import { memberLeftChannelTriggerMeta } from "@/integrations/slack/triggers/memberLeftChannel/memberLeftChannel.meta";
import { fileUploadedTriggerMeta } from "@/integrations/slack/triggers/fileUploaded/fileUploaded.meta";

/**
 * Hand-maintained discovery metadata registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.0:
 *   - Explicit imports surface in PRs. Adding metadata for a new action
 *     means adding the import + the export array entry below.
 *   - Every meta is parsed against its Zod contract at module load.
 *     Build fails on any malformed meta with a clear error.
 *   - Duplicate (provider, type) keys are rejected at module load.
 *   - The exported lookup maps are frozen — no runtime mutation.
 *
 * Why this is hand-maintained rather than generated:
 *   - Matches the existing pattern in `services/execution/handlers/_registry.ts`
 *     and `integrations/_registry.ts`. Reviewer scans the PR diff to see
 *     exactly which actions a slice covers; no implicit auto-discovery.
 *   - Decouples the builder discovery surface from handler-schema Zod
 *     internals. The contracts in `contracts/actionMeta.ts` and
 *     `contracts/triggerMeta.ts` express UI concerns that don't belong
 *     in runtime validation schemas (labels, descriptions, dependsOn,
 *     optionsSource, displayOrder, FileRef awareness).
 *
 * Coverage scope: native (Slice 3.0) + GitHub (Slice 3.0b). Subsequent
 * commits expand coverage one provider at a time, validated by a
 * coverage structural test that grows its expected-coverage set
 * alongside the imports.
 */

const ALL_ACTION_META: ReadonlyArray<ActionMeta> = [
  // Native (Slice 3.0).
  httpRequestMeta,
  formatTransformerMeta,
  delayMeta,
  ifThenConditionMeta,
  routerMeta,
  // GitHub (Slice 3.0b).
  createIssueMeta,
  createRepositoryMeta,
  createPullRequestMeta,
  createBranchMeta,
  createGistMeta,
  addCommentMeta,
  // Gmail (Slice 3.15). Ordered to match each meta's displayOrder
  // (10/20/30/40/50/60/70/80/90/100/110/120/130) so the registry
  // diff lines up with the sorted output of listActionMetasForProvider.
  sendEmailMeta,
  replyToEmailMeta,
  createDraftMeta,
  createDraftReplyMeta,
  searchEmailsMeta,
  getAttachmentMeta,
  addLabelMeta,
  removeLabelMeta,
  createLabelMeta,
  markAsReadMeta,
  markAsUnreadMeta,
  archiveEmailMeta,
  deleteEmailMeta,
  // Microsoft Outlook Mail (Slice 3.17). Ordered to match each meta's
  // displayOrder (10/20/30/40/50/60/70/80/90).
  outlookSendEmailMeta,
  outlookReplyToEmailMeta,
  outlookForwardEmailMeta,
  outlookCreateDraftEmailMeta,
  outlookFetchEmailsMeta,
  outlookGetAttachmentMeta,
  outlookAddCategoriesMeta,
  outlookMoveEmailMeta,
  outlookDeleteEmailMeta,
  // Slack file actions (Slice 3.26 + 3.27). `download_file` is the
  // FileRef producer; `upload_file` is the FileRef consumer that
  // exercises the Slice 3.25 single-FileRef FileField (chip + picker
  // + replace semantics). Ordered by displayOrder (10/20).
  slackDownloadFileMeta,
  slackUploadFileMeta,
  // Slack messaging Group A (Slice 3.35). 8 actions sharing the
  // channel-picker (`slack:channels`) + message-reference UX shape.
  // user-id field on send_direct_message stays `text` for v1; a
  // future `slack:users` resolver slice (3.39+) will flip it.
  // Ordered to match displayOrder (30..100).
  slackSendChannelMessageMeta,
  slackSendDirectMessageMeta,
  slackUpdateMessageMeta,
  slackDeleteMessageMeta,
  slackGetMessagesMeta,
  slackGetThreadMessagesMeta,
  slackScheduleMessageMeta,
  slackCancelScheduledMessageMeta,
  // Slack reactions / pins / list_scheduled_messages (Slice 3.36 —
  // Group B). All small `{channel, ts, …}`-shape actions; no user-id
  // fields. `list_scheduled_messages` lives here because it's the
  // read companion to Group A's schedule/cancel pair. Ordered to
  // match displayOrder (110..150).
  slackAddReactionMeta,
  slackRemoveReactionMeta,
  slackPinMessageMeta,
  slackUnpinMessageMeta,
  slackListScheduledMessagesMeta,
  // Slack channel management (Slice 3.37 — Group C, 12 actions).
  // Reads + lifecycle + membership + topic/purpose. Every action's
  // channel field uses the `slack:channels` picker; required for the
  // single-channel ops, optional only on list_channels (which has no
  // channel field at all — it discovers them). `invite_users_to_channel`
  // uses `string-array` for `users` since multi-select combobox is
  // deferred (Slice 3.7) and the `slack:users` resolver is deferred
  // (Slice 3.39+). Slack still absent from COVERED_PROVIDERS because
  // users + block-kit surfaces remain pending. Ordered to match
  // displayOrder (160..270).
  slackListChannelsMeta,
  slackGetChannelInfoMeta,
  slackCreateChannelMeta,
  slackArchiveChannelMeta,
  slackUnarchiveChannelMeta,
  slackRenameChannelMeta,
  slackJoinChannelMeta,
  slackLeaveChannelMeta,
  slackInviteUsersToChannelMeta,
  slackRemoveUserFromChannelMeta,
  slackSetChannelTopicMeta,
  slackSetChannelPurposeMeta,
];

const ALL_TRIGGER_META: ReadonlyArray<TriggerMeta> = [
  // Native (Slice 3.0).
  manualTriggerMeta,
  scheduledTriggerMeta,
  // GitHub (Slice 3.0b).
  newCommitTriggerMeta,
  // Gmail (Slice 3.12). Polling triggers — each registers an activation
  // function in `integrations/gmail/triggers/<event>/index.ts` that
  // seeds `snapshot.historyId` at activate time. The activation-registry
  // invariant test is satisfied by those registrations (no exemption
  // needed); adding one here would silently mask the first-poll-miss
  // protection contract.
  newEmailTriggerMeta,
  newLabeledEmailTriggerMeta,
  newAttachmentTriggerMeta,
  // Slack (Slice 3.11). Slack uses a single global webhook URL — no
  // per-workflow activation work — so every key below is registered in
  // SHARED_INFRA_EXEMPT_KEYS of the activation invariant test.
  newMessageChannelTriggerMeta,
  newDirectMessageTriggerMeta,
  newMessagePrivateChannelTriggerMeta,
  newGroupDirectMessageTriggerMeta,
  reactionAddedTriggerMeta,
  reactionRemovedTriggerMeta,
  channelCreatedTriggerMeta,
  memberJoinedChannelTriggerMeta,
  memberLeftChannelTriggerMeta,
  fileUploadedTriggerMeta,
  // Microsoft Outlook Mail (Slice 3.17). Webhook subscription-watch
  // triggers — each registers a per-workflow Graph subscription via
  // `registerActivation("microsoft-outlook", <type>, ...)`. The
  // activation-registry invariant test is satisfied by those
  // registrations (no exemption needed). Ordered to match each meta's
  // displayOrder (10/20/30).
  outlookNewEmailTriggerMeta,
  outlookEmailSentTriggerMeta,
  outlookEmailFlaggedTriggerMeta,
];

// Validate each meta against its contract at module load. parse() throws on
// any malformed meta; loading any importer of this module fails the build
// with the exact path / message from Zod.
for (const meta of ALL_ACTION_META) {
  ActionMetaSchema.parse(meta);
}
for (const meta of ALL_TRIGGER_META) {
  TriggerMetaSchema.parse(meta);
}

// Build keyed lookups, rejecting duplicates at module load.
const actionByKey: ReadonlyMap<string, ActionMeta> = (() => {
  const m = new Map<string, ActionMeta>();
  for (const meta of ALL_ACTION_META) {
    if (m.has(meta.key)) {
      throw new Error(
        `Duplicate action meta registered for key '${meta.key}'.`,
      );
    }
    m.set(meta.key, meta);
  }
  return m;
})();

const triggerByKey: ReadonlyMap<string, TriggerMeta> = (() => {
  const m = new Map<string, TriggerMeta>();
  for (const meta of ALL_TRIGGER_META) {
    if (m.has(meta.key)) {
      throw new Error(
        `Duplicate trigger meta registered for key '${meta.key}'.`,
      );
    }
    m.set(meta.key, meta);
  }
  return m;
})();

// ─── Public accessors ────────────────────────────────────────────────────────

/**
 * Stable ordering helper: (displayOrder asc, displayName asc). Used by
 * every listing accessor so route responses and lib/api consumers see
 * deterministic shapes — important for snapshot tests + AI agents that
 * reason about ordering.
 */
function compareMeta<T extends { displayName: string; displayOrder: number | null }>(
  a: T,
  b: T,
): number {
  const ao = a.displayOrder;
  const bo = b.displayOrder;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  return a.displayName.localeCompare(b.displayName);
}

/**
 * All action metas across every provider, sorted by displayOrder then
 * displayName. Use when you need the full catalog (admin tools, AI
 * planner, structural tests). For per-provider listings prefer
 * `listActionMetasForProvider`.
 */
export function listAllActionMetas(): readonly ActionMeta[] {
  return [...ALL_ACTION_META].sort(compareMeta);
}

/**
 * All trigger metas across every provider, sorted by displayOrder then
 * displayName.
 */
export function listAllTriggerMetas(): readonly TriggerMeta[] {
  return [...ALL_TRIGGER_META].sort(compareMeta);
}

export function listActionMetasForProvider(
  provider: string,
): readonly ActionMeta[] {
  return ALL_ACTION_META
    .filter((m) => m.provider === provider)
    .sort(compareMeta);
}

export function listTriggerMetasForProvider(
  provider: string,
): readonly TriggerMeta[] {
  return ALL_TRIGGER_META
    .filter((m) => m.provider === provider)
    .sort(compareMeta);
}

export function getActionMeta(key: string): ActionMeta | undefined {
  return actionByKey.get(key);
}

export function getTriggerMeta(key: string): TriggerMeta | undefined {
  return triggerByKey.get(key);
}

/**
 * Returns the set of provider ids that have at least one action OR
 * trigger meta registered. Used by the providers index route to filter
 * the provider-manifest list to "providers the builder can fully
 * surface today."
 */
export function listProvidersWithMetadata(): readonly string[] {
  const set = new Set<string>();
  for (const m of ALL_ACTION_META) set.add(m.provider);
  for (const m of ALL_TRIGGER_META) set.add(m.provider);
  return [...set].sort();
}
