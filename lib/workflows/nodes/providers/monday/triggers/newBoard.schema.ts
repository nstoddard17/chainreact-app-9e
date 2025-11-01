import { NodeComponent } from "../../../types"

export const newBoardTriggerSchema: NodeComponent = {
  type: "monday_trigger_new_board",
  title: "New Board",
  description: "Triggers when a new board is created in Monday.com",
  icon: "CheckSquare" as any,
  isTrigger: true,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The unique identifier of the newly created board",
      example: "1234567890"
    },
    {
      name: "boardName",
      label: "Board Name",
      type: "string",
      description: "The name of the newly created board",
      example: "Q1 2024 Projects"
    },
    {
      name: "workspaceId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the workspace containing the board",
      example: "9876543210"
    },
    {
      name: "creatorId",
      label: "Creator ID",
      type: "string",
      description: "The ID of the user who created the board",
      example: "12345"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the board was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "boardUrl",
      label: "Board URL",
      type: "string",
      description: "Direct link to the board in Monday.com",
      example: "https://mycompany.monday.com/boards/1234567890"
    }
  ],
  configSchema: [
    {
      name: "workspaceId",
      label: "Workspace (Optional)",
      type: "select",
      dynamic: "monday_workspaces",
      required: false,
      loadOnMount: true,
      placeholder: "All workspaces...",
      description: "Optionally filter to only trigger for boards created in a specific workspace"
    }
  ],
}
