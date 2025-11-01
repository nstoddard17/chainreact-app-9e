import { NodeComponent } from "../../../types"

export const newStarredEmailTriggerSchema: NodeComponent = {
  type: "gmail_trigger_new_starred_email",
  title: "New Starred Email",
  description: "Triggers when you star an email (within 2 days of receiving it)",
  icon: "Star" as any, // Will be resolved in index file
  providerId: "gmail",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "from",
      label: "From (Optional)",
      type: "email-autocomplete",
      dynamic: "gmail-recent-senders",
      required: false,
      placeholder: "Filter by sender email...",
      description: "Only trigger for starred emails from specific senders"
    },
    {
      name: "subject",
      label: "Subject Contains (Optional)",
      type: "text",
      required: false,
      placeholder: "Enter keywords...",
      description: "Only trigger if subject contains specific text"
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
      name: "starredAt",
      label: "Starred At",
      type: "string",
      description: "When the email was starred"
    },
    {
      name: "labels",
      label: "Labels",
      type: "array",
      description: "Gmail labels applied to this email"
    },
    {
      name: "hasAttachments",
      label: "Has Attachments",
      type: "boolean",
      description: "Whether the email has attachments"
    }
  ],
}
