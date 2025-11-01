import { NodeComponent } from "../../../types"

export const getSubscriberActionSchema: NodeComponent = {
  type: "mailchimp_action_get_subscriber",
  title: "Get Subscriber",
  description: "Retrieve detailed information about a specific subscriber from an audience",
  icon: "User" as any,
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
      description: "Email address of the subscriber to retrieve"
    }
  ],
  outputSchema: [
    {
      name: "email",
      label: "Email",
      type: "string",
      description: "Subscriber's email address"
    },
    {
      name: "status",
      label: "Status",
      type: "string",
      description: "Subscription status (subscribed, unsubscribed, cleaned, pending, transactional)"
    },
    {
      name: "firstName",
      label: "First Name",
      type: "string",
      description: "Subscriber's first name"
    },
    {
      name: "lastName",
      label: "Last Name",
      type: "string",
      description: "Subscriber's last name"
    },
    {
      name: "phone",
      label: "Phone",
      type: "string",
      description: "Subscriber's phone number"
    },
    {
      name: "address",
      label: "Address",
      type: "object",
      description: "Subscriber's address information"
    },
    {
      name: "tags",
      label: "Tags",
      type: "array",
      description: "Tags assigned to this subscriber"
    },
    {
      name: "dateSubscribed",
      label: "Date Subscribed",
      type: "string",
      description: "ISO timestamp when subscriber joined"
    },
    {
      name: "lastChanged",
      label: "Last Changed",
      type: "string",
      description: "ISO timestamp of last profile update"
    },
    {
      name: "emailClient",
      label: "Email Client",
      type: "string",
      description: "Most commonly used email client"
    },
    {
      name: "location",
      label: "Location",
      type: "object",
      description: "Geographic location data (country, timezone, etc.)"
    },
    {
      name: "vip",
      label: "VIP Status",
      type: "boolean",
      description: "Whether subscriber is marked as VIP"
    }
  ]
}
