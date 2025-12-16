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
    // Status Column Settings
    {
      name: "statusLabels",
      label: "Status Labels",
      type: "text",
      required: false,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "status" } }
      },
      placeholder: "Not Started, Working on it, Done, Stuck",
      description: "Comma-separated list of status options",
      supportsAI: true
    },
    // Dropdown Column Settings
    {
      name: "dropdownLabels",
      label: "Dropdown Options",
      type: "text",
      required: false,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "dropdown" } }
      },
      placeholder: "Option 1, Option 2, Option 3",
      description: "Comma-separated list of dropdown options",
      supportsAI: true
    },
    {
      name: "allowMultipleSelection",
      label: "Allow Multiple Selection",
      type: "select",
      required: false,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "dropdown" } }
      },
      options: [
        { label: "No (Single Selection)", value: "false" },
        { label: "Yes (Multiple Selection)", value: "true" }
      ],
      description: "Allow selecting multiple options",
      supportsAI: false
    },
    // Rating Column Settings
    {
      name: "defaultRating",
      label: "Maximum Rating",
      type: "select",
      required: false,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "rating" } }
      },
      options: [
        { label: "3 Stars", value: "3" },
        { label: "5 Stars", value: "5" },
        { label: "10 Stars", value: "10" }
      ],
      description: "Maximum number of stars/rating",
      supportsAI: false
    },
    // Tags Column Settings
    {
      name: "tagLabels",
      label: "Available Tags",
      type: "text",
      required: false,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "tag" } }
      },
      placeholder: "Bug, Feature, Enhancement, Documentation",
      description: "Comma-separated list of available tags",
      supportsAI: true
    }
  ],
}
