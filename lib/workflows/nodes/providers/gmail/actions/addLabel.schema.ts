import { NodeComponent } from "../../../types"
// Import metadata from integrations folder
// Note: These imports may need adjustment based on project structure
const GMAIL_ADD_LABEL_METADATA = {
  key: "gmail_action_add_label",
  name: "Apply Gmail Labels",
  description: "Add one or more labels to incoming Gmail messages from a specific email address"
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
      type: "select",
      dynamic: "gmail_messages",
      required: true,
      placeholder: "Select a message or use a variable",
      hasVariablePicker: true,
      description: "The ID of the email message to label"
    },
    {
      name: "labelId",
      label: "Label",
      type: "select",
      dynamic: "gmail_labels",
      required: true,
      placeholder: "Select a label to apply",
      description: "The label to add to the message"
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the label was successfully added"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "The ID of the labeled message"
    },
    {
      name: "labelId",
      label: "Label ID",
      type: "string",
      description: "The ID of the label that was added"
    }
  ]
}