import { NodeComponent } from "../../../types"

const GMAIL_CREATE_LABEL_METADATA = {
  key: "gmail_action_create_label",
  name: "Create Label",
  description: "Create a new Gmail label (folder)"
}

export const createLabelActionSchema: NodeComponent = {
  type: GMAIL_CREATE_LABEL_METADATA.key,
  title: "Create Label",
  description: GMAIL_CREATE_LABEL_METADATA.description,
  icon: "TagPlus" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.labels"],
  category: "Communication",
  outputSchema: [
    {
      name: "labelId",
      label: "Label ID",
      type: "string",
      description: "Unique identifier for the created label",
      example: "Label_123"
    },
    {
      name: "labelName",
      label: "Label Name",
      type: "string",
      description: "Name of the created label",
      example: "Important/Work"
    },
    {
      name: "color",
      label: "Label Color",
      type: "object",
      description: "Color assigned to the label",
      example: { backgroundColor: "#42d692", textColor: "#ffffff" }
    },
    {
      name: "createdAt",
      label: "Created Time",
      type: "string",
      description: "When the label was created",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "labelName",
      label: "Label Name",
      type: "text",
      required: true,
      placeholder: "Work/Projects",
      description: "Name for the new label. Use '/' to create nested labels (e.g., 'Work/Projects')",
      tooltip: "Gmail supports nested labels using forward slashes. For example, 'Work/Important' creates a label 'Important' inside a parent label 'Work'."
    },
    {
      name: "labelListVisibility",
      label: "Show in Label List",
      type: "select",
      required: false,
      defaultValue: "labelShow",
      options: [
        { value: "labelShow", label: "Show in label list" },
        { value: "labelShowIfUnread", label: "Show only if there are unread messages" },
        { value: "labelHide", label: "Hide from label list" }
      ],
      description: "Control when this label appears in Gmail's label list"
    },
    {
      name: "messageListVisibility",
      label: "Show in Message List",
      type: "select",
      required: false,
      defaultValue: "show",
      options: [
        { value: "show", label: "Show in message list" },
        { value: "hide", label: "Hide from message list (acts like archive)" }
      ],
      description: "Control whether messages with this label appear in the message list"
    },
    {
      name: "backgroundColor",
      label: "Background Color (Optional)",
      type: "select",
      required: false,
      options: [
        { value: "#000000", label: "Black" },
        { value: "#434343", label: "Gray" },
        { value: "#666666", label: "Light Gray" },
        { value: "#999999", label: "Pale Gray" },
        { value: "#cccccc", label: "Very Light Gray" },
        { value: "#efefef", label: "White Gray" },
        { value: "#f3f3f3", label: "White" },
        { value: "#fb4c2f", label: "Red" },
        { value: "#ffad47", label: "Orange" },
        { value: "#fad165", label: "Yellow" },
        { value: "#16a766", label: "Green" },
        { value: "#43d692", label: "Teal" },
        { value: "#4a86e8", label: "Blue" },
        { value: "#a479e2", label: "Purple" },
        { value: "#f691b3", label: "Pink" }
      ],
      description: "Background color for the label"
    },
    {
      name: "textColor",
      label: "Text Color (Optional)",
      type: "select",
      required: false,
      options: [
        { value: "#000000", label: "Black" },
        { value: "#ffffff", label: "White" }
      ],
      description: "Text color for the label"
    },
  ],
}
