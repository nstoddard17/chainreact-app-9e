import { NodeComponent } from "../../../types"

export const duplicateBoardActionSchema: NodeComponent = {
  type: "monday_action_duplicate_board",
  title: "Duplicate Board",
  description: "Create a duplicate copy of an entire Monday.com board",
  icon: "Copy" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "newBoardId",
      label: "New Board ID",
      type: "string",
      description: "The unique ID of the duplicated board",
      example: "1234567890"
    },
    {
      name: "newBoardName",
      label: "New Board Name",
      type: "string",
      description: "The name of the duplicated board",
      example: "Project Board (copy)"
    },
    {
      name: "newBoardUrl",
      label: "New Board URL",
      type: "string",
      description: "Direct link to the duplicated board",
      example: "https://mycompany.monday.com/boards/1234567890"
    },
    {
      name: "originalBoardId",
      label: "Original Board ID",
      type: "string",
      description: "The ID of the original board that was duplicated",
      example: "9876543210"
    },
    {
      name: "workspaceId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the workspace containing the duplicated board",
      example: "1111222233"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the duplicate was created",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "boardId",
      label: "Board to Duplicate",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select a board...",
      description: "The Monday.com board to create a duplicate of"
    },
    {
      name: "newBoardName",
      label: "New Board Name",
      type: "text",
      required: false,
      placeholder: "Leave empty to auto-generate...",
      description: "Optional: Name for the duplicated board (defaults to 'Original Name (copy)')",
      supportsAI: true
    },
    {
      name: "duplicateType",
      label: "Duplication Options",
      type: "select",
      required: false,
      options: [
        { label: "Structure only (default)", value: "duplicate_board_with_structure" },
        { label: "Structure and items", value: "duplicate_board_with_pulses" },
        { label: "Structure, items, and updates", value: "duplicate_board_with_pulses_and_updates" }
      ],
      placeholder: "Structure only...",
      description: "What to include in the duplicate"
    }
  ],
}
