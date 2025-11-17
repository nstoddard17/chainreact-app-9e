import { NodeComponent } from "../../../types"
// Import metadata from integrations folder
// Note: These imports may need adjustment based on project structure
const GMAIL_ADD_LABEL_METADATA = {
  key: "gmail_action_add_label",
  name: "Add Labels to Email",
  description: "Add one or more labels to a Gmail message"
}

export const addLabelActionSchema: NodeComponent = {
  type: GMAIL_ADD_LABEL_METADATA.key,
  title: GMAIL_ADD_LABEL_METADATA.name,
  description: GMAIL_ADD_LABEL_METADATA.description,
  icon: "Mail" as any, // Will be resolved in index file
  providerId: "gmail",
  category: "Communication",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
  configSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}}",
      supportsAI: true,
      description: "The ID of the email message to label"
    },
    {
      name: "labelIds",
      label: "Labels to Add",
      type: "multiselect",
      required: true,
      dynamic: true,
      loadOnMount: true,
      placeholder: "Select labels to add...",
      description: "Choose which labels to add to the email"
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the labels were successfully added"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "The ID of the labeled message"
    },
    {
      name: "labelsAdded",
      label: "Labels Added",
      type: "array",
      description: "List of label IDs that were added",
      example: ["Label_1", "Label_2"]
    }
  ]
}