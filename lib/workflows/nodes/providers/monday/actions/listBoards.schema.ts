import { NodeComponent } from "../../../types"

export const listBoardsActionSchema: NodeComponent = {
  type: "monday_action_list_boards",
  title: "List Boards",
  description: "Get a list of all boards in the Monday.com account or workspace",
  icon: "LayoutGrid" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "boards",
      label: "Boards",
      type: "array",
      description: "Array of all boards",
      example: '[{"id": "123", "name": "Project Board", "state": "active", "workspace_id": "456"}]'
    },
    {
      name: "count",
      label: "Board Count",
      type: "number",
      description: "Total number of boards",
      example: "15"
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
      description: "Optionally filter to boards in a specific workspace"
    },
    {
      name: "state",
      label: "Board State",
      type: "select",
      required: false,
      options: [
        { label: "Active (default)", value: "active" },
        { label: "Archived", value: "archived" },
        { label: "Deleted", value: "deleted" },
        { label: "All", value: "all" }
      ],
      placeholder: "Active boards...",
      description: "Filter boards by state"
    },
    {
      name: "limit",
      label: "Board Limit",
      type: "number",
      required: false,
      placeholder: "100",
      description: "Maximum number of boards to return (default: 100)"
    }
  ],
}
