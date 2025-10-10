import { Users, MailOpen, UserPlus, Mail, UserX, Tag, List, Search } from "lucide-react"
import { NodeComponent } from "../../types"

export const mailchimpNodes: NodeComponent[] = [
  // Triggers
  {
    type: "mailchimp_trigger_new_subscriber",
    title: "New subscriber added",
    description: "Triggers when a new subscriber is added to an audience",
    icon: Users,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
  },
  {
    type: "mailchimp_trigger_email_opened",
    title: "Email campaign opened",
    description: "Triggers when a subscriber opens an email campaign",
    icon: MailOpen,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
  },

  // Actions
  {
    type: "mailchimp_action_add_subscriber",
    title: "Add Subscriber",
    description: "Add a new subscriber to an audience",
    icon: UserPlus,
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
        placeholder: "subscriber@example.com"
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        defaultValue: "subscribed",
        options: [
          { value: "subscribed", label: "Subscribed" },
          { value: "pending", label: "Pending (Double Opt-in)" },
          { value: "unsubscribed", label: "Unsubscribed" },
          { value: "transactional", label: "Transactional" }
        ]
      },
      {
        name: "merge_fields",
        label: "Merge Fields",
        type: "multiselect",
        required: false,
        dynamic: "mailchimp_merge_fields",
        dependsOn: "audience_id",
        placeholder: "Select merge fields to set values for",
        description: "Select which subscriber fields to populate"
      },
      {
        name: "tags",
        label: "Tags",
        type: "multiselect",
        required: false,
        dynamic: "mailchimp_tags",
        dependsOn: "audience_id",
        creatable: true,
        placeholder: "Select existing tags or type to create new ones",
        description: "Add tags to categorize this subscriber"
      }
    ]
  },
  {
    type: "mailchimp_action_update_subscriber",
    title: "Update Subscriber",
    description: "Update an existing subscriber's information",
    icon: Users,
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
        description: "The current email address of the subscriber"
      },
      {
        name: "new_email",
        label: "New Email Address (optional)",
        type: "email",
        required: false,
        placeholder: "newemail@example.com",
        description: "Leave empty to keep current email"
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: false,
        options: [
          { value: "subscribed", label: "Subscribed" },
          { value: "pending", label: "Pending" },
          { value: "unsubscribed", label: "Unsubscribed" },
          { value: "transactional", label: "Transactional" }
        ]
      },
      {
        name: "merge_fields",
        label: "Merge Fields",
        type: "multiselect",
        required: false,
        dynamic: "mailchimp_merge_fields",
        dependsOn: "audience_id",
        placeholder: "Select merge fields to update",
        description: "Select which subscriber fields to update"
      }
    ]
  },
  {
    type: "mailchimp_action_remove_subscriber",
    title: "Remove Subscriber",
    description: "Remove a subscriber from an audience",
    icon: UserX,
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
        placeholder: "subscriber@example.com"
      },
      {
        name: "delete_permanently",
        label: "Delete Permanently",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "If enabled, permanently delete the subscriber. Otherwise, just unsubscribe them."
      }
    ]
  },
  {
    type: "mailchimp_action_add_tag",
    title: "Add Tag to Subscriber",
    description: "Add tags to a subscriber",
    icon: Tag,
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
        placeholder: "subscriber@example.com"
      },
      {
        name: "tags",
        label: "Tags to Add",
        type: "multiselect",
        required: true,
        dynamic: "mailchimp_tags",
        dependsOn: "audience_id",
        creatable: true,
        placeholder: "Select existing tags or type to create new ones",
        description: "Tags will be created if they don't exist"
      }
    ]
  },
  {
    type: "mailchimp_action_remove_tag",
    title: "Remove Tag from Subscriber",
    description: "Remove tags from a subscriber",
    icon: Tag,
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
        placeholder: "subscriber@example.com"
      },
      {
        name: "tags",
        label: "Tags to Remove",
        type: "multiselect",
        required: true,
        dynamic: "mailchimp_tags",
        dependsOn: "audience_id",
        placeholder: "Select tags to remove"
      }
    ]
  },
  {
    type: "mailchimp_action_send_campaign",
    title: "Send Campaign",
    description: "Send an email campaign",
    icon: Mail,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: false,
    configSchema: [
      {
        name: "campaign_id",
        label: "Campaign",
        type: "select",
        required: true,
        dynamic: "mailchimp_campaigns",
        placeholder: "Select a campaign",
        loadOnMount: true,
        description: "Select a saved/draft campaign to send"
      }
    ]
  },
  {
    type: "mailchimp_action_create_campaign",
    title: "Create Campaign",
    description: "Create a new email campaign",
    icon: Mail,
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
        name: "type",
        label: "Campaign Type",
        type: "select",
        required: true,
        defaultValue: "regular",
        options: [
          { value: "regular", label: "Regular" },
          { value: "plaintext", label: "Plain Text" },
          { value: "absplit", label: "A/B Split" },
          { value: "rss", label: "RSS" },
          { value: "variate", label: "Multivariate" }
        ]
      },
      {
        name: "subject_line",
        label: "Subject Line",
        type: "text",
        required: true,
        placeholder: "Your email subject"
      },
      {
        name: "preview_text",
        label: "Preview Text",
        type: "text",
        required: false,
        placeholder: "Text shown in email preview"
      },
      {
        name: "from_name",
        label: "From Name",
        type: "text",
        required: true,
        placeholder: "Your Company"
      },
      {
        name: "reply_to",
        label: "Reply To Email",
        type: "email",
        required: true,
        placeholder: "reply@example.com"
      },
      {
        name: "html_content",
        label: "HTML Content",
        type: "textarea",
        required: false,
        placeholder: "Your email HTML content"
      },
      {
        name: "text_content",
        label: "Plain Text Content",
        type: "textarea",
        required: false,
        placeholder: "Your email plain text content"
      }
    ]
  },
  {
    type: "mailchimp_action_get_subscribers",
    title: "Get Subscribers",
    description: "Retrieve subscribers from a Mailchimp audience with optional filtering",
    icon: Search,
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
        name: "status",
        label: "Subscriber Status",
        type: "select",
        required: false,
        defaultValue: "subscribed",
        options: [
          { value: "subscribed", label: "Subscribed" },
          { value: "unsubscribed", label: "Unsubscribed" },
          { value: "cleaned", label: "Cleaned" },
          { value: "pending", label: "Pending" },
          { value: "transactional", label: "Transactional" }
        ]
      },
      {
        name: "limit",
        label: "Maximum Results",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "Number of subscribers to retrieve (max 1000)"
      }
    ],
    outputSchema: [
      {
        name: "subscribers",
        label: "Subscribers",
        type: "array",
        description: "Array of subscribers from the audience"
      },
      {
        name: "count",
        label: "Count",
        type: "number",
        description: "Number of subscribers retrieved"
      }
    ]
  }
]
