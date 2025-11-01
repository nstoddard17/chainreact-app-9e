import { NodeComponent } from "../../../types"

export const unsubscribeSubscriberActionSchema: NodeComponent = {
  type: "mailchimp_action_unsubscribe_subscriber",
  title: "Unsubscribe Subscriber",
  description: "Mark a subscriber as unsubscribed (preserves subscriber record, different from removing)",
  icon: "UserMinus" as any,
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
      description: "Email address of the subscriber to unsubscribe"
    },
    {
      name: "sendGoodbye",
      label: "Send Goodbye Email",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Send a final goodbye email to the subscriber"
    },
    {
      name: "sendNotification",
      label: "Send Notification to List Owner",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Notify the list owner about this unsubscribe"
    },
    {
      name: "reason",
      label: "Unsubscribe Reason (Optional)",
      type: "textarea",
      required: false,
      placeholder: "e.g., User requested to be removed from mailing list",
      supportsAI: true,
      description: "Internal note about why this subscriber was unsubscribed"
    }
  ],
  outputSchema: [
    {
      name: "email",
      label: "Email",
      type: "string",
      description: "Email address of the unsubscribed subscriber"
    },
    {
      name: "status",
      label: "New Status",
      type: "string",
      description: "Should be 'unsubscribed'"
    },
    {
      name: "unsubscribeTime",
      label: "Unsubscribe Time",
      type: "string",
      description: "ISO timestamp when subscriber was unsubscribed"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the operation succeeded"
    }
  ]
}
