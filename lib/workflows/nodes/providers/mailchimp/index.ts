import { Users, MailOpen, UserPlus, Mail, UserX, Tag, List, Search, BarChart, Calendar, User, FileText, UserMinus, StickyNote, Filter } from "lucide-react"
import { NodeComponent } from "../../types"

// Import new action schemas
import { getCampaignStatsActionSchema } from "./actions/getCampaignStats.schema"
import { scheduleCampaignActionSchema } from "./actions/scheduleCampaign.schema"
import { getSubscriberActionSchema } from "./actions/getSubscriber.schema"
import { getCampaignActionSchema } from "./actions/getCampaign.schema"
import { unsubscribeSubscriberActionSchema } from "./actions/unsubscribeSubscriber.schema"
import { addNoteActionSchema } from "./actions/addNote.schema"
import { createSegmentActionSchema } from "./actions/createSegment.schema"

// Apply icons to new action schemas
const getCampaignStats: NodeComponent = {
  ...getCampaignStatsActionSchema,
  icon: BarChart
}

const scheduleCampaign: NodeComponent = {
  ...scheduleCampaignActionSchema,
  icon: Calendar
}

const getSubscriber: NodeComponent = {
  ...getSubscriberActionSchema,
  icon: User
}

const getCampaign: NodeComponent = {
  ...getCampaignActionSchema,
  icon: FileText
}

const unsubscribeSubscriber: NodeComponent = {
  ...unsubscribeSubscriberActionSchema,
  icon: UserMinus
}

const addNote: NodeComponent = {
  ...addNoteActionSchema,
  icon: StickyNote
}

const createSegment: NodeComponent = {
  ...createSegmentActionSchema,
  icon: Filter
}

export const mailchimpNodes: NodeComponent[] = [
  // Triggers
  {
    type: "mailchimp_trigger_new_subscriber",
    title: "New Subscriber Added",
    description: "Triggers when a new subscriber is added to an audience",
    icon: Users,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "audienceId",
        label: "Audience",
        type: "combobox",
        required: true,
        dynamic: "mailchimp_audiences",
        loadOnMount: true,
        placeholder: "Select an audience",
        description: "Choose which Mailchimp audience to monitor for new subscribers"
      }
    ],
    outputSchema: [
      {
        name: "email",
        label: "Email Address",
        type: "string",
        description: "Email address of the new subscriber"
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
        name: "status",
        label: "Subscription Status",
        type: "string",
        description: "Current subscription status (subscribed, unsubscribed, pending, etc.)"
      },
      {
        name: "audienceId",
        label: "Audience ID",
        type: "string",
        description: "The ID of the audience the subscriber joined"
      },
      {
        name: "subscriberId",
        label: "Subscriber ID",
        type: "string",
        description: "Unique identifier for the subscriber"
      },
      {
        name: "tags",
        label: "Tags",
        type: "array",
        description: "Tags assigned to this subscriber"
      },
      {
        name: "source",
        label: "Subscription Source",
        type: "string",
        description: "How the subscriber joined (e.g., API, signup form, import)"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the subscriber was added"
      }
    ]
  },
  {
    type: "mailchimp_trigger_email_opened",
    title: "Email Campaign Opened",
    description: "Triggers when a subscriber opens an email campaign",
    icon: MailOpen,
    providerId: "mailchimp",
    category: "Email",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "campaignId",
        label: "Campaign (Optional)",
        type: "combobox",
        required: false,
        dynamic: "mailchimp_campaigns",
        loadOnMount: true,
        placeholder: "All campaigns",
        description: "Monitor a specific campaign, or leave empty to monitor all campaigns"
      }
    ],
    outputSchema: [
      {
        name: "email",
        label: "Subscriber Email",
        type: "string",
        description: "Email address of the subscriber who opened the campaign"
      },
      {
        name: "campaignId",
        label: "Campaign ID",
        type: "string",
        description: "Unique identifier for the email campaign"
      },
      {
        name: "campaignTitle",
        label: "Campaign Title",
        type: "string",
        description: "Title/subject of the email campaign"
      },
      {
        name: "openTime",
        label: "Open Time",
        type: "string",
        description: "ISO timestamp when the email was opened"
      },
      {
        name: "subscriberId",
        label: "Subscriber ID",
        type: "string",
        description: "Unique identifier for the subscriber"
      },
      {
        name: "audienceId",
        label: "Audience ID",
        type: "string",
        description: "The ID of the audience the subscriber belongs to"
      },
      {
        name: "ipAddress",
        label: "IP Address",
        type: "string",
        description: "IP address from which the email was opened"
      },
      {
        name: "userAgent",
        label: "User Agent",
        type: "string",
        description: "Browser/email client information"
      },
      {
        name: "location",
        label: "Location",
        type: "object",
        description: "Geographic location data (city, country, timezone)"
      }
    ]
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
        placeholder: "subscriber@example.com",
        supportsAI: true
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
        name: "first_name",
        label: "First Name",
        type: "text",
        required: false,
        placeholder: "John",
        supportsAI: true
      },
      {
        name: "last_name",
        label: "Last Name",
        type: "text",
        required: false,
        placeholder: "Doe",
        supportsAI: true
      },
      {
        name: "phone",
        label: "Phone Number",
        type: "text",
        required: false,
        placeholder: "+1234567890",
        supportsAI: true
      },
      {
        name: "address",
        label: "Address",
        type: "text",
        required: false,
        placeholder: "123 Main St",
        supportsAI: true
      },
      {
        name: "city",
        label: "City",
        type: "text",
        required: false,
        placeholder: "New York",
        supportsAI: true
      },
      {
        name: "state",
        label: "State/Province",
        type: "text",
        required: false,
        placeholder: "NY",
        supportsAI: true
      },
      {
        name: "zip",
        label: "Zip/Postal Code",
        type: "text",
        required: false,
        placeholder: "10001",
        supportsAI: true
      },
      {
        name: "country",
        label: "Country",
        type: "text",
        required: false,
        placeholder: "US",
        supportsAI: true
      },
      {
        name: "tags",
        label: "Tags (Optional)",
        type: "text",
        required: false,
        placeholder: "customer, vip, newsletter (comma-separated)",
        description: "Add tags to categorize this subscriber (separate with commas)",
        supportsAI: true
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
        name: "subscriber_email",
        label: "Select Subscriber",
        type: "select",
        required: true,
        dynamic: "mailchimp_subscribers",
        dependsOn: "audience_id",
        placeholder: "Search for subscriber by email...",
        description: "Select the subscriber you want to update",
        searchable: true
      },
      {
        name: "new_email",
        label: "New Email Address (optional)",
        type: "email",
        required: false,
        placeholder: "newemail@example.com",
        description: "Leave empty to keep current email",
        supportsAI: true
      },
      {
        name: "status",
        label: "Status (Optional)",
        type: "select",
        required: false,
        options: [
          { value: "subscribed", label: "Subscribed" },
          { value: "pending", label: "Pending" },
          { value: "unsubscribed", label: "Unsubscribed" },
          { value: "transactional", label: "Transactional" }
        ],
        placeholder: "Keep current status",
        description: "Leave empty to keep current status"
      },
      {
        name: "first_name",
        label: "First Name (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
      },
      {
        name: "last_name",
        label: "Last Name (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
      },
      {
        name: "phone",
        label: "Phone Number (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
      },
      {
        name: "address",
        label: "Address (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
      },
      {
        name: "city",
        label: "City (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
      },
      {
        name: "state",
        label: "State/Province (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
      },
      {
        name: "zip",
        label: "Zip/Postal Code (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
      },
      {
        name: "country",
        label: "Country (Optional)",
        type: "text",
        required: false,
        placeholder: "Leave empty to keep current value",
        supportsAI: true
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
        placeholder: "subscriber@example.com",
        supportsAI: true
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
        placeholder: "subscriber@example.com",
        supportsAI: true
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
        placeholder: "subscriber@example.com",
        supportsAI: true
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
        placeholder: "Your email subject",
        supportsAI: true
      },
      {
        name: "preview_text",
        label: "Preview Text",
        type: "text",
        required: false,
        placeholder: "Text shown in email preview",
        supportsAI: true
      },
      {
        name: "from_name",
        label: "From Name",
        type: "text",
        required: true,
        placeholder: "Your Company",
        supportsAI: true
      },
      {
        name: "reply_to",
        label: "Reply To Email",
        type: "email",
        required: true,
        placeholder: "reply@example.com",
        supportsAI: true
      },
      {
        name: "html_content",
        label: "HTML Content",
        type: "textarea",
        required: false,
        placeholder: "Your email HTML content",
        supportsAI: true
      },
      {
        name: "text_content",
        label: "Plain Text Content",
        type: "textarea",
        required: false,
        placeholder: "Your email plain text content",
        supportsAI: true
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
      },
      {
        name: "offset",
        label: "Offset (Optional)",
        type: "number",
        required: false,
        defaultValue: 0,
        placeholder: "Starting position for pagination",
        tooltip: "Skip this many subscribers before returning results. Use for pagination in combination with limit."
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
  },
  // New schema-based actions
  getCampaignStats,
  scheduleCampaign,
  getSubscriber,
  getCampaign,
  unsubscribeSubscriber,
  addNote,
  createSegment
]
