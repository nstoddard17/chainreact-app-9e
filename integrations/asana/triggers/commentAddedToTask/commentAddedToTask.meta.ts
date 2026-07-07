import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `asana:comment_added_to_task` — ASANA-2.
 *
 * Webhook-activated (POST /webhooks, filter story+added
 * resource_subtype:"comment_added"). The receive path post-fetches the
 * story detail (scope stories:read) for the comment text and author.
 */
export const asanaCommentAddedToTaskTriggerMeta: TriggerMeta = {
  key: "asana:comment_added_to_task",
  provider: "asana",
  type: "comment_added_to_task",
  displayName: "Comment Added to Task",
  description:
    "Fires when a comment is added to any task in the configured Asana project. The payload carries the comment text (truncated to 4,000 characters) and the author's display name.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "Scopes the project picker.",
      type: "combobox",
      optionsSource: "asana:workspaces",
      required: false,
      placeholder: "Search workspaces…",
    },
    {
      name: "projectId",
      label: "Project",
      description: "Project whose task comments fire this trigger.",
      type: "combobox",
      optionsSource: "asana:projects",
      dependsOn: "workspaceId",
      required: true,
      placeholder: "Select a workspace first",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always 'comment_added_to_task'.",
    },
    {
      name: "storyGid",
      type: "string",
      description: "Gid of the comment (Asana story).",
    },
    {
      name: "taskGid",
      type: "string",
      description: "Gid of the commented task (feed into Get Task).",
      nullable: true,
    },
    {
      name: "projectGid",
      type: "string",
      description: "The watched project's gid.",
      nullable: true,
    },
    {
      name: "commentText",
      type: "string",
      description:
        "Comment text (plain text, truncated to 4,000 characters). Sensitive — free-form user content.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "authorGid",
      type: "string",
      description: "Gid of the comment author (when present).",
      nullable: true,
    },
    {
      name: "authorName",
      type: "string",
      description: "Display name of the comment author. Sensitive — a person's name.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "Comment timestamp (when present).",
      nullable: true,
    },
  ],
  displayOrder: 50,
};
