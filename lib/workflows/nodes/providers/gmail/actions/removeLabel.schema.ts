import { NodeComponent } from "../../../types"

const GMAIL_REMOVE_LABEL_METADATA = {
  key: "gmail_action_remove_label",
  name: "Remove Label",
  description: "Remove label from email"
}

export const removeLabelActionSchema: NodeComponent = {
  type: GMAIL_REMOVE_LABEL_METADATA.key,
  title: "Remove Label",
  description: GMAIL_REMOVE_LABEL_METADATA.description,
  icon: "TagOff" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
  category: "Communication",
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "ID of the email",
      example: "17c123456789abcd"
    },
    {
      name: "labelsRemoved",
      label: "Labels Removed",
      type: "array",
      description: "List of label IDs that were removed",
      example: ["Label_1", "Label_2"]
    },
    {
      name: "success",
      label: "Success Status",
      type: "boolean",
      description: "Whether the label was removed successfully",
      example: true
    }
  ],
  configSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}}",
      supportsAI: true,
      description: "The ID of the email to remove the label from"
    },
    {
      name: "labelIds",
      label: "Labels to Remove",
      type: "multiselect",
      required: true,
      dynamic: true,
      loadOnMount: true,
      placeholder: "Select labels to remove...",
      description: "Choose which labels to remove from the email"
    },
  ],
}
