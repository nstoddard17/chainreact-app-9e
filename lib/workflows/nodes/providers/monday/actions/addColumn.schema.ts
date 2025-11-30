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
      name: "statusLabels",
      label: "Status Labels",
      type: "text",
      required: false,
      placeholder: "Working on it, Done, Stuck (comma-separated)",
      description: "Status label options (comma-separated). Example: Not Started, In Progress, Done",
      supportsAI: true,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "status" } }
      }
    },
    {
      name: "statusColors",
      label: "Status Colors (Optional)",
      type: "text",
      required: false,
      placeholder: "working_orange, done_green, stuck_red (comma-separated)",
      description: "Colors for each status (comma-separated). Options: working_orange, done_green, stuck_red, sky, dark_orange, etc.",
      supportsAI: true,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "status" } }
      }
    },
    {
      name: "dropdownLabels",
      label: "Dropdown Options",
      type: "text",
      required: false,
      placeholder: "Option 1, Option 2, Option 3 (comma-separated)",
      description: "Dropdown option values (comma-separated). Example: High, Medium, Low",
      supportsAI: true,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "dropdown" } }
      }
    },
    {
      name: "allowMultipleSelection",
      label: "Allow Multiple Selection",
      type: "select",
      required: false,
      options: [
        { label: "No - Single selection only", value: "false" },
        { label: "Yes - Allow multiple selections", value: "true" }
      ],
      placeholder: "Select...",
      description: "Whether users can select multiple options from the dropdown",
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "dropdown" } }
      }
    },
    {
      name: "defaultRating",
      label: "Default Rating",
      type: "select",
      required: false,
      options: [
        { label: "5 Stars", value: "5" },
        { label: "10 Stars", value: "10" }
      ],
      placeholder: "Select rating scale...",
      description: "Number of stars for rating column",
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "rating" } }
      }
    },
    {
      name: "tagLabels",
      label: "Tag Options",
      type: "text",
      required: false,
      placeholder: "Tag 1, Tag 2, Tag 3 (comma-separated)",
      description: "Available tag values (comma-separated). Example: Urgent, Important, Review",
      supportsAI: true,
      dependsOn: "columnType",
      hidden: {
        $deps: ["columnType"],
        $condition: { columnType: { $ne: "tag" } }
      }
    }
  ],
}
