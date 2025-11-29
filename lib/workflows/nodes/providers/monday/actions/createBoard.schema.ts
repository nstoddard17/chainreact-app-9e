import { NodeComponent } from "../../../types"

export const createBoardActionSchema: NodeComponent = {
  type: "monday_action_create_board",
  title: "Create Board",
  description: "Create a new board in Monday.com",
  icon: "LayoutGrid" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The unique ID of the created board",
      example: "1234567890"
    },
    {
      name: "boardName",
      label: "Board Name",
      type: "string",
      description: "The name of the created board",
      example: "Q1 2024 Projects"
    },
    {
      name: "boardUrl",
      label: "Board URL",
      type: "string",
      description: "Direct link to the board in Monday.com",
      example: "https://mycompany.monday.com/boards/1234567890"
    },
    {
      name: "workspaceId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the workspace containing the board",
      example: "9876543210"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the board was created",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "boardName",
      label: "Board Name",
      type: "text",
      required: true,
      placeholder: "Enter board name...",
      description: "The name of the new board",
      supportsAI: true
    },
    {
      name: "workspaceId",
      label: "Workspace",
      type: "select",
      dynamic: "monday_workspaces",
      required: false,
      loadOnMount: true,
      placeholder: "Select a workspace (optional)...",
      description: "The workspace where the board will be created (uses default if not specified)"
    },
    {
      name: "boardKind",
      label: "Board Type",
      type: "select",
      required: true,
      options: [
        { label: "Public", value: "public" },
        { label: "Private", value: "private" },
        { label: "Share", value: "share" }
      ],
      placeholder: "Select board type...",
      description: "The visibility type of the board"
    },
    {
      name: "description",
      label: "Description",
      type: "text",
      required: false,
      placeholder: "Enter board description...",
      description: "Optional description for the board",
      supportsAI: true
    }
  ],
}
