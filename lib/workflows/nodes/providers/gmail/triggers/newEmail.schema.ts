import { NodeComponent } from "../../../types"

export const newEmailTriggerSchema: NodeComponent = {
  type: "gmail_trigger_new_email",
  title: "New Email",
  description: "Triggers when a new email is received.",
  isTrigger: true,
  providerId: "gmail",
  category: "Communication",
  icon: "Mail" as any, // Will be resolved in index file
  producesOutput: true,
  configSchema: [
    {
      name: "from",
      label: "From",
      type: "email-autocomplete",
      dynamic: "gmail-recent-recipients",
      required: true,
      placeholder: "Filter by sender email",
      description: "Filter emails by sender address"
    },
    {
      name: "subject",
      label: "Subject",
      type: "text",
      placeholder: "Optional: filter by subject",
      description: "Filter emails by subject line"
    },
    {
      name: "hasAttachment",
      label: "Has Attachment",
      type: "select",
      options: ["any", "yes", "no"],
      defaultValue: "any",
      description: "Filter emails based on attachment presence"
    },
  ],
  outputSchema: [
    {
      name: "id",
      label: "Email ID",
      type: "string",
      description: "The unique ID of the email"
    },
    {
      name: "threadId",
      label: "Thread ID",
      type: "string",
      description: "The ID of the email thread"
    },
    {
      name: "from",
      label: "From",
      type: "string",
      description: "The sender's email address"
    },
    {
      name: "to",
      label: "To",
      type: "string",
      description: "The recipient's email address"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The subject of the email"
    },
    {
      name: "body",
      label: "Body",
      type: "string",
      description: "The full body of the email"
    },
    {
      name: "snippet",
      label: "Snippet",
      type: "string",
      description: "A short snippet of the email's content"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "array",
      description: "An array of attachment objects"
    },
    {
      name: "receivedAt",
      label: "Received At",
      type: "string",
      description: "The timestamp when the email was received"
    }
  ],
}