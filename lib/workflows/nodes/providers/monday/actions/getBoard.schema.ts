import { NodeComponent } from "../../../types"

export const getBoardActionSchema: NodeComponent = {
  type: "monday_action_get_board",
  title: "Get Board",
  description: "Retrieve details of a specific board by its ID",
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
      description: "The unique ID of the board",
      example: "1234567890"
    },
    {
      name: "boardName",
      label: "Board Name",
      type: "string",
      description: "The name of the board",
      example: "Project Board"
    },
    {
      name: "boardUrl",
      label: "Board URL",
      type: "string",
      description: "Direct link to the board",
      example: "https://mycompany.monday.com/boards/1234567890"
    },
    {
      name: "description",
      label: "Description",
      type: "string",
      description: "The board's description",
      example: "Q1 project tracking board"
    },
    {
      name: "workspaceId",
      label: "Workspace ID",
      type: "string",
      description: "The ID of the workspace containing the board",
      example: "9876543210"
    },
    {
      name: "state",
      label: "State",
      type: "string",
      description: "The state of the board (active, archived, deleted)",
      example: "active"
    },
    {
      name: "boardKind",
      label: "Board Type",
      type: "string",
      description: "The type of board (public, private, share)",
      example: "public"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the board was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "columnCount",
      label: "Column Count",
      type: "number",
      description: "Number of columns in the board",
      example: "8"
    },
    {
      name: "groupCount",
      label: "Group Count",
      type: "number",
      description: "Number of groups in the board",
      example: "3"
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
      description: "The board to retrieve details for",
      supportsAI: true
    }
  ],
}
