import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { AsanaStoryDetail } from "@/integrations/_shared/asana/api/stories";
import type { AsanaEventObject } from "../_shared/eventMap";

/**
 * Normalize an Asana comment-story-added event into V2's canonical
 * `TriggerEvent` — ASANA-2 `comment_added_to_task`.
 *
 * The receive helper has ALREADY post-fetched the story detail (scope
 * stories:read) and confirmed `resource_subtype === "comment_added"`
 * before calling this — compact events carry gids only.
 *
 * Bounded output: comment text is truncated to COMMENT_TEXT_MAX chars
 * (Asana caps comments around 65k; a workflow variable should never
 * carry that). Text + author name are marked sensitive in the meta —
 * free-form user content / a person's name. Author is gid + display
 * name only, never an email.
 *
 * Dedup key (timestamp-free, stable semantic identity):
 * `comment_added_to_task:${projectGid}:${storyGid}` — the story gid is a
 * durable provider entity id unique to this comment, so redeliveries and
 * the per-workflow webhook fan-out collapse to one dispatch round with
 * no re-fire limitation (unlike task-scoped keys, every new comment is a
 * new gid).
 */

export const COMMENT_TEXT_MAX = 4000;

export function normalizeCommentAddedToTask(
  ev: AsanaEventObject,
  ctx: { projectId: string | null; story: AsanaStoryDetail },
): TriggerEvent {
  const storyGid = ctx.story.gid;
  const createdAt = ev.created_at ?? null;
  const occurredAt = ctx.story.created_at ?? createdAt ?? new Date().toISOString();
  const projectGid = ctx.projectId;

  const rawText = ctx.story.text ?? null;
  const commentText =
    rawText !== null && rawText.length > COMMENT_TEXT_MAX
      ? rawText.slice(0, COMMENT_TEXT_MAX)
      : rawText;

  // The task the comment lives on: prefer the story's own target (from
  // the authoritative post-fetch), fall back to the event's parent gid.
  const taskGid = ctx.story.target?.gid ?? ev.parent?.gid ?? null;

  return {
    provider: "asana",
    eventType: "comment_added_to_task",
    eventId: `comment_added_to_task:${projectGid ?? "no-project"}:${storyGid}`,
    occurredAt,
    providerAccountId: projectGid ?? "unknown",
    payload: {
      changeKind: "comment_added_to_task",
      storyGid,
      taskGid,
      projectGid,
      commentText,
      authorGid: ctx.story.created_by?.gid ?? ev.user?.gid ?? null,
      authorName: ctx.story.created_by?.name ?? null,
      createdAt: ctx.story.created_at ?? createdAt,
    },
  };
}
