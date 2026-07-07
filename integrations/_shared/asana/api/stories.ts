import { asanaRequest } from "./_request";

/**
 * Typed Asana story (comment) wrappers — Slice 5.ASANA-1 + ASANA-2.
 *
 * `POST /tasks/{task_gid}/stories` with `data: { text }` creates a comment
 * story (scope `stories:write`). `GET /stories/{story_gid}` (ASANA-2,
 * scope `stories:read`) reads one story for the comment_added_to_task
 * trigger's post-fetch. Bounded response fields only.
 */

export interface AsanaStory {
  gid: string;
  text: string | null;
  created_at: string | null;
}

export interface StoriesCreateForTaskInput {
  accessToken: string;
  taskGid: string;
  text: string;
}

export async function storiesCreateForTask(
  input: StoriesCreateForTaskInput,
): Promise<AsanaStory> {
  const query = new URLSearchParams({ opt_fields: "text,created_at" });
  return asanaRequest<AsanaStory>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/tasks/${encodeURIComponent(input.taskGid)}/stories`,
    query,
    data: { text: input.text },
    resourceForNotFound: `task ${input.taskGid} (add comment)`,
  });
}

/**
 * Bounded story-detail shape for the ASANA-2 `comment_added_to_task`
 * post-fetch. `target` is the task the story lives on; `created_by`
 * carries gid + display name only (never email).
 */
export interface AsanaStoryDetail {
  gid: string;
  text: string | null;
  resource_subtype: string | null;
  created_at: string | null;
  created_by: { gid: string; name?: string | null } | null;
  target: { gid: string } | null;
}

const STORY_DETAIL_OPT_FIELDS = [
  "text",
  "resource_subtype",
  "created_at",
  "created_by.name",
  "target",
].join(",");

export interface StoriesGetInput {
  accessToken: string;
  storyGid: string;
}

/** `GET /stories/{story_gid}` — ASANA-2 (scope `stories:read`). */
export async function storiesGet(
  input: StoriesGetInput,
): Promise<AsanaStoryDetail> {
  const query = new URLSearchParams({ opt_fields: STORY_DETAIL_OPT_FIELDS });
  return asanaRequest<AsanaStoryDetail>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/stories/${encodeURIComponent(input.storyGid)}`,
    query,
    resourceForNotFound: `story ${input.storyGid}`,
  });
}
