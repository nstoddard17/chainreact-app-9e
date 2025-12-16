import { NodeComponent } from "../../../types"

export const listGroupsActionSchema: NodeComponent = {
  type: "monday_action_list_groups",
  title: "List Groups",
  description: "Get a list of all groups in a Monday.com board",
  icon: "FolderPlus" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "groups",
      label: "Groups",
      type: "array",
      description: "Array of all groups in the board",
      example: '[{"id": "topics", "title": "To Do", "color": "#00c875", "position": "0"}]'
    },
    {
      name: "count",
      label: "Group Count",
      type: "number",
      description: "Total number of groups",
      example: "5"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board",
      example: "1234567890"
    },
    {
      name: "boardName",
      label: "Board Name",
      type: "string",
      description: "The name of the board",
      example: "Project Board"
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
      description: "The board to list groups from"
    }
  ],
}
