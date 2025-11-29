import { NodeComponent } from "../../../types"

export const addColumnActionSchema: NodeComponent = {
  type: "monday_action_add_column",
  title: "Add Column to Board",
  description: "Create a new column in a Monday.com board",
  icon: "ColumnsIcon" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "columnId",
      label: "Column ID",
      type: "string",
      description: "The unique ID of the created column",
      example: "text_column_123"
    },
    {
      name: "columnTitle",
      label: "Column Title",
      type: "string",
      description: "The title of the created column",
      example: "Priority"
    },
    {
      name: "columnType",
      label: "Column Type",
      type: "string",
      description: "The type of column created",
      example: "status"
    },
    {
      name: "boardId",
      label: "Board ID",
      type: "string",
      description: "The ID of the board containing the column",
      example: "1234567890"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "Timestamp when the column was created",
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
      description: "The Monday.com board to add the column to"
    },
    {
      name: "columnTitle",
      label: "Column Title",
      type: "text",
      required: true,
      placeholder: "Enter column title...",
      description: "The title/name of the new column",
      supportsAI: true
    },
    {
      name: "columnType",
      label: "Column Type",
      type: "select",
      required: true,
      options: [
        { label: "Text", value: "text" },
        { label: "Status", value: "status" },
        { label: "Date", value: "date" },
        { label: "Person", value: "people" },
        { label: "Numbers", value: "numbers" },
        { label: "Timeline", value: "timeline" },
        { label: "Email", value: "email" },
        { label: "Phone", value: "phone" },
        { label: "Link", value: "link" },
        { label: "Dropdown", value: "dropdown" },
        { label: "Rating", value: "rating" },
        { label: "Checkbox", value: "checkbox" },
        { label: "Long Text", value: "long_text" },
        { label: "File", value: "file" },
        { label: "Tags", value: "tag" },
        { label: "Location", value: "location" },
        { label: "World Clock", value: "world_clock" },
        { label: "Week", value: "week" },
        { label: "Color Picker", value: "color_picker" }
      ],
      placeholder: "Select column type...",
      description: "The type of data the column will contain"
    },
    {
      name: "columnDefaults",
      label: "Column Settings (JSON)",
      type: "json",
      required: false,
      placeholder: '{"labels": {"0": "Not Started", "1": "Working on it"}}',
      description: "Optional: Column-specific settings like status labels or dropdown options (JSON format)",
      supportsAI: true
    }
  ],
}
