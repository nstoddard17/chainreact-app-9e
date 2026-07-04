import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { storiesCreateForTask } from "@/integrations/_shared/asana/api/stories";
import { AddCommentToTaskConfigSchema } from "./addCommentToTask.schema";

/**
 * Asana `add_comment_to_task` action handler — Slice 5.ASANA-1.
 *
 * POST /tasks/{gid}/stories via the shared `storiesCreateForTask` wrapper,
 * wrapped in `refreshAndRetry` (Q3). The comment is authored AS the
 * connecting user (personal credential class — the token acts as the
 * human).
 *
 * Output (bounded): { storyGid, text, createdAt }
 */
export const addCommentToTask: ActionHandler = async (input) => {
  const config = AddCommentToTaskConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "asana"
      ? input.triggerEvent.providerAccountId
      : null;

  const story = await refreshAndRetry({
    accountId: input.accountId,
    provider: "asana",
    providerAccountId,
    apiCall: (accessToken) =>
      storiesCreateForTask({
        accessToken,
        taskGid: config.taskGid,
        text: config.text,
      }),
  });

  return {
    output: {
      storyGid: story.gid,
      text: story.text ?? config.text,
      createdAt: story.created_at ?? null,
    },
  };
};
