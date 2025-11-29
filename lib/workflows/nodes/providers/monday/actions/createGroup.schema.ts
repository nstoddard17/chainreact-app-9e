import { NodeComponent } from "../../../types"

export const createGroupActionSchema: NodeComponent = {
  type: "monday_action_create_group",
  title: "Create Group",
  description: "Create a new group in a Monday.com board",
  icon: "FolderPlus" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "groupId",
      label: "Group ID",
      type: "string",
      description: "The unique ID of the created group",
      example: "new_group_123"
    },
    {
      name: "groupTitle",
      label: "Group Title",
      type: "string",
      description: "The title of the created group",
      example: "In Progress"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the group",
      example: "1234567890"
    },
    {
      name: "position",
      label: "Position",
      type: "string",
      description: "The position of the group in the board",
      example: "0"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the group was created",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select a board...",
      description: "The Monday.com board where the group will be created"
    },
    {
      name: "groupTitle",
      label: "Group Title",
      type: "text",
      required: true,
      placeholder: "Enter group title...",
      description: "The title of the new group",
      supportsAI: true
    },
    {
      name: "position",
      label: "Position",
      type: "select",
      required: false,
      options: [
        { label: "Top", value: "top" },
        { label: "Bottom", value: "bottom" }
      ],
      placeholder: "Select position (default: bottom)...",
      description: "Where to place the new group in the board"
    },
    {
      name: "color",
      label: "Group Color",
      type: "select",
      required: false,
      options: [
        { label: "Berry", value: "berry" },
        { label: "River", value: "river" },
        { label: "Winter", value: "winter" },
        { label: "Grass", value: "grass" },
        { label: "Lipstick", value: "lipstick" },
        { label: "Egg Yolk", value: "egg_yolk" },
        { label: "Working Orange", value: "working_orange" },
        { label: "Dark Purple", value: "dark_purple" },
        { label: "Sofia Pink", value: "sofia_pink" },
        { label: "Blackish", value: "blackish" },
        { label: "Sunset", value: "sunset" },
        { label: "Purple", value: "purple" },
        { label: "Azure", value: "azure" },
        { label: "Bright Green", value: "bright_green" },
        { label: "Bright Blue", value: "bright_blue" },
        { label: "Done Green", value: "done_green" }
      ],
      placeholder: "Select group color (optional)...",
      description: "Optional color for the group"
    }
  ],
}
