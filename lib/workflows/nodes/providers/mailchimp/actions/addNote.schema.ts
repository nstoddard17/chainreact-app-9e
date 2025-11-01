import { NodeComponent } from "../../../types"

export const addNoteActionSchema: NodeComponent = {
  type: "mailchimp_action_add_note",
  title: "Add Note to Subscriber",
  description: "Add a note to a subscriber's profile for tracking interactions and context",
  icon: "StickyNote" as any,
  providerId: "mailchimp",
  category: "Email",
  isTrigger: false,
  configSchema: [
    {
      name: "audience_id",
      label: "Audience",
      type: "select",
      required: true,
      dynamic: "mailchimp_audiences",
      placeholder: "Select an audience",
      loadOnMount: true
    },
    {
      name: "email",
      label: "Email Address",
      type: "email",
      required: true,
      placeholder: "subscriber@example.com",
      supportsAI: true,
      description: "Email address of the subscriber"
    },
    {
      name: "note",
      label: "Note",
      type: "textarea",
      required: true,
      placeholder: "e.g., Customer requested product information about Enterprise plan",
      supportsAI: true,
      description: "The note content to add to this subscriber's profile"
    }
  ],
  outputSchema: [
    {
      name: "noteId",
      label: "Note ID",
      type: "number",
      description: "Unique identifier for the created note"
    },
    {
      name: "note",
      label: "Note Content",
      type: "string",
      description: "The note content that was added"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "ISO timestamp when note was created"
    },
    {
      name: "createdBy",
      label: "Created By",
      type: "string",
      description: "Who created the note"
    },
    {
      name: "subscriberEmail",
      label: "Subscriber Email",
      type: "string",
      description: "Email of the subscriber the note was added to"
    }
  ]
}
