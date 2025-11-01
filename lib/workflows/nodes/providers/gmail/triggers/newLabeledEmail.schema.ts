import { NodeComponent } from "../../../types"

export const newLabeledEmailTriggerSchema: NodeComponent = {
  type: "gmail_trigger_new_labeled_email",
  title: "New Labeled Email",
  description: "Triggers when an email receives a specific label (also triggers for replies)",
  icon: "Tag" as any, // Will be resolved in index file
  providerId: "gmail",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "labelId",
      label: "Label",
      type: "select",
      required: true,
      dynamic: "gmail-labels",
      loadOnMount: true,
      placeholder: "Select a label to watch...",
      description: "Trigger when emails receive this label"
    },
    {
      name: "from",
      label: "From (Optional)",
      type: "email-autocomplete",
      dynamic: "gmail-recent-senders",
      required: false,
      placeholder: "Filter by sender email...",
      description: "Only trigger for emails from specific senders"
    },
    {
      name: "includeReplies",
      label: "Include Replies",
      type: "boolean",
      defaultValue: true,
      description: "Also trigger when a reply is added to a labeled conversation",
      tooltip: "When enabled, this will trigger both when new emails receive the label AND when replies are added to labeled conversations."
    },
  ],
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "Unique identifier for the email"
    },
    {
      name: "threadId",
      label: "Thread ID",
      type: "string",
      description: "Conversation thread ID"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "Email subject line"
    },
    {
      name: "from",
      label: "From",
      type: "string",
      description: "Sender's email address"
    },
    {
      name: "fromName",
      label: "From Name",
      type: "string",
      description: "Sender's display name"
    },
    {
      name: "bodyPlain",
      label: "Body (Plain Text)",
      type: "string",
      description: "Email body in plain text"
    },
    {
      name: "bodyHtml",
      label: "Body (HTML)",
      type: "string",
      description: "Email body in HTML format"
    },
    {
      name: "receivedAt",
      label: "Received At",
      type: "string",
      description: "When the email was received"
    },
    {
      name: "labeledAt",
      label: "Labeled At",
      type: "string",
      description: "When the label was applied"
    },
    {
      name: "labels",
      label: "All Labels",
      type: "array",
      description: "All Gmail labels applied to this email"
    },
    {
      name: "isReply",
      label: "Is Reply",
      type: "boolean",
      description: "Whether this is a reply in an existing conversation"
    },
    {
      name: "hasAttachments",
      label: "Has Attachments",
      type: "boolean",
      description: "Whether the email has attachments"
    }
  ],
}
