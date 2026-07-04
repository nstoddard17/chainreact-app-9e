import { asanaRequest } from "./_request";

/**
 * Typed Asana story (comment) wrapper — Slice 5.ASANA-1.
 *
 * `POST /tasks/{task_gid}/stories` with `data: { text }` creates a comment
 * story (scope `stories:write`). Bounded response fields only.
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
