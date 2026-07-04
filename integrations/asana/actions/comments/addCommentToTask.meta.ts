import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Asana `add_comment_to_task` ActionMeta — Slice 5.ASANA-1.
 *
 * The comment is authored AS the connecting user (personal credential
 * class), which is why the description says so explicitly — workflow
 * authors should know whose name appears on the comment.
 */
export const asanaAddCommentToTaskMeta: ActionMeta = {
  key: "asana:add_comment_to_task",
  provider: "asana",
  type: "add_comment_to_task",
  displayName: "Add Comment to Task",
  description:
    "Post a plain-text comment on an Asana task. The comment is authored as the connected Asana user.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      type: "combobox",
      optionsSource: "asana:workspaces",
      required: false,
      placeholder: "Search workspaces…",
      description: "Scopes the project and task pickers.",
    },
    {
      name: "projectId",
      label: "Project",
      type: "combobox",
      optionsSource: "asana:projects",
      dependsOn: "workspaceId",
      required: false,
      placeholder: "Select a workspace first",
    },
    {
      name: "taskGid",
      label: "Task",
      type: "combobox",
      optionsSource: "asana:tasks",
      dependsOn: "projectId",
      required: true,
      allowManualEntry: true,
      placeholder: "Select a project first, or paste a task gid",
    },
    {
      name: "text",
      label: "Comment",
      type: "textarea",
      required: true,
      placeholder: "Comment text…",
    },
  ],
  outputs: [
    { name: "storyGid", type: "string", description: "The created comment story gid." },
    {
      name: "text",
      type: "string",
      description: "Provider-confirmed comment text (falls back to the configured text).",
      sensitive: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "Asana-reported creation timestamp.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Posts a comment visible to the task's collaborators. Recoverable — delete the comment in Asana to undo.",
};
