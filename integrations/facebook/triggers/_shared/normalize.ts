import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Facebook Page webhook payload normalization — Slice 3.FACEBOOK-5.
 *
 * Facebook PUSHES the change in the webhook body (unlike Dropbox's
 * account-only ping), so there is no cursor reconcile — each `feed` change
 * normalizes directly into a canonical `TriggerEvent`.
 *
 * Page webhook shape:
 *   { object: "page", entry: [
 *       { id: "<pageId>", time: <unix>, changes: [
 *           { field: "feed", value: { item, verb, post_id, comment_id,
 *               created_time, message, from: {id,name}, permalink_url,
 *               parent_id, ... } } ] } ] }
 *
 * Only `verb === "add"` changes fire (edits / removes / hides / likes /
 * reactions are ignored). `item === "comment"` → new_comment; post-like
 * items (status / photo / video / share / post / album / link / note) →
 * new_post.
 *
 * Sanitization (P-S3 + FACEBOOK-1 §6): the canonical payload carries ONLY
 * the documented fields — never the full raw change, media bytes, or the
 * access token. Message text / permalink / actor id are surfaced (the
 * trigger's whole purpose) but the meta marks them sensitive so the
 * run-detail API redacts them.
 */

/** A single `change` entry's `value` object (subset we read). */
export interface FacebookFeedChangeValue {
  item?: string;
  verb?: string;
  post_id?: string;
  comment_id?: string;
  created_time?: number;
  message?: string;
  permalink_url?: string;
  parent_id?: string;
  from?: { id?: string; name?: string };
}

export interface FacebookFeedChange {
  field?: string;
  value?: FacebookFeedChangeValue;
}

export interface FacebookWebhookEntry {
  id?: string;
  time?: number;
  changes?: FacebookFeedChange[];
}

export interface FacebookWebhookBody {
  object?: string;
  entry?: FacebookWebhookEntry[];
}

export type FacebookChangeKind = "new_post" | "new_comment";

/** Post-like feed item types that map to `new_post`. */
const POST_ITEMS: ReadonlySet<string> = new Set([
  "status",
  "photo",
  "video",
  "share",
  "post",
  "album",
  "link",
  "note",
]);

/**
 * Classify a `feed` change into a trigger kind, or `null` to ignore.
 * Only additions fire; edits / removes / hides / reactions are dropped.
 */
export function classifyFeedChange(
  change: FacebookFeedChange,
): FacebookChangeKind | null {
  if (change.field !== "feed") return null;
  const value = change.value;
  if (!value || value.verb !== "add") return null;
  const item = value.item;
  if (typeof item !== "string") return null;
  if (item === "comment") return "new_comment";
  if (POST_ITEMS.has(item)) return "new_post";
  return null;
}

function unixToIso(created: number | undefined, fallbackUnix: number | undefined): string {
  if (typeof created === "number" && Number.isFinite(created)) {
    return new Date(created * 1000).toISOString();
  }
  if (typeof fallbackUnix === "number" && Number.isFinite(fallbackUnix)) {
    return new Date(fallbackUnix * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function buildNewPostEventId(pageId: string, value: FacebookFeedChangeValue): string {
  const postId = value.post_id ?? `${value.created_time ?? "unknown"}`;
  return `new_post:${pageId}:${postId}`;
}

export function buildNewCommentEventId(pageId: string, value: FacebookFeedChangeValue): string {
  const commentId = value.comment_id ?? `${value.created_time ?? "unknown"}`;
  return `new_comment:${pageId}:${commentId}`;
}

export function normalizeNewPost(input: {
  pageId: string;
  value: FacebookFeedChangeValue;
  entryTime?: number;
}): TriggerEvent {
  const { pageId, value, entryTime } = input;
  const occurredAt = unixToIso(value.created_time, entryTime);
  return {
    provider: "facebook",
    eventType: "new_post",
    eventId: buildNewPostEventId(pageId, value),
    occurredAt,
    providerAccountId: pageId,
    payload: {
      changeKind: "new_post",
      pageId,
      postId: value.post_id ?? null,
      message: value.message ?? null,
      permalinkUrl: value.permalink_url ?? null,
      createdTime: occurredAt,
      fromId: value.from?.id ?? null,
      mediaType: value.item ?? null,
    },
  };
}

export function normalizeNewComment(input: {
  pageId: string;
  value: FacebookFeedChangeValue;
  entryTime?: number;
}): TriggerEvent {
  const { pageId, value, entryTime } = input;
  const occurredAt = unixToIso(value.created_time, entryTime);
  return {
    provider: "facebook",
    eventType: "new_comment",
    eventId: buildNewCommentEventId(pageId, value),
    occurredAt,
    providerAccountId: pageId,
    payload: {
      changeKind: "new_comment",
      pageId,
      postId: value.post_id ?? null,
      commentId: value.comment_id ?? null,
      message: value.message ?? null,
      createdTime: occurredAt,
      fromId: value.from?.id ?? null,
      parentId: value.parent_id ?? null,
    },
  };
}
