import {
  Webhook,
  Clock,
  MessageSquare,
  Calendar,
  FileSpreadsheet,
  Mail,
  Filter,
  Timer,
  GitBranch,
  Code,
  Database,
  FileText,
  Repeat,
  AlertTriangle,
  Settings,
  Upload,
  MailOpen,
  Plus,
  ExternalLink,
  Users,
  Briefcase,
  PenSquare,
  BarChart,
  Video,
  ShoppingCart,
  Zap,
} from "lucide-react"

export interface NodeComponent {
  type: string
  title: string
  description: string
  icon: React.ElementType
  providerId?: string
  scopes?: string[]
  requiredScopes?: string[]
  category: string
  isTrigger: boolean
}

export const ALL_NODE_COMPONENTS: NodeComponent[] = [
  // Generic Triggers
  {
    type: "webhook",
    title: "Webhook",
    description: "Receive HTTP requests",
    icon: Webhook,
    category: "Triggers",
    isTrigger: true,
  },
  {
    type: "schedule",
    title: "Schedule",
    description: "Cron-based scheduling",
    icon: Clock,
    category: "Triggers",
    isTrigger: true,
  },
  {
    type: "manual",
    title: "Manual",
    description: "Manually trigger a workflow",
    icon: Zap,
    category: "Triggers",
    isTrigger: true,
  },

  // Generic Actions
  {
    type: "filter",
    title: "Filter",
    description: "Filter data based on conditions",
    icon: Filter,
    category: "Logic",
    isTrigger: false,
  },
  {
    type: "delay",
    title: "Delay",
    description: "Wait for a specified time",
    icon: Timer,
    category: "Logic",
    isTrigger: false,
  },
  {
    type: "conditional",
    title: "Conditional Logic",
    description: "Branch workflow based on conditions",
    icon: GitBranch,
    category: "Logic",
    isTrigger: false,
  },
  {
    type: "custom_script",
    title: "Custom Script",
    description: "Run custom Javascript code",
    icon: Code,
    category: "Logic",
    isTrigger: false,
  },
  {
    type: "loop",
    title: "Loop",
    description: "Repeat actions for each item in a list",
    icon: Repeat,
    category: "Logic",
    isTrigger: false,
  },

  // Gmail
  {
    type: "gmail_trigger_new_email",
    title: "New Email (Gmail)",
    description: "Triggers when a new email is received",
    icon: Mail,
    providerId: "gmail",
    category: "Email",
    isTrigger: true,
  },
  {
    type: "gmail_action_send_email",
    title: "Send Email (Gmail)",
    description: "Send an email",
    icon: MailOpen,
    providerId: "gmail",
    requiredScopes: ["https://www.googleapis.com/auth/gmail.send"],
    category: "Email",
    isTrigger: false,
  },

  // Google Calendar
  {
    type: "google_calendar_trigger_new_event",
    title: "New Event (Google Calendar)",
    description: "Triggers when a new event is created",
    icon: Calendar,
    providerId: "google-calendar",
    category: "Productivity",
    isTrigger: true,
  },
  {
    type: "google_calendar_action_create_event",
    title: "Create Event (Google Calendar)",
    description: "Create a new calendar event",
    icon: Plus,
    providerId: "google-calendar",
    requiredScopes: ["https://www.googleapis.com/auth/calendar"],
    category: "Productivity",
    isTrigger: false,
  },

  // Google Drive
  {
    type: "google_drive_trigger_new_file",
    title: "New File in Folder (Google Drive)",
    description: "Triggers when a new file is added to a folder",
    icon: Upload,
    providerId: "google-drive",
    category: "Storage",
    isTrigger: true,
  },
  {
    type: "google_drive_action_upload_file",
    title: "Upload File (Google Drive)",
    description: "Upload a file to Google Drive",
    icon: Upload,
    providerId: "google-drive",
    requiredScopes: ["https://www.googleapis.com/auth/drive"],
    category: "Storage",
    isTrigger: false,
  },

  // Google Sheets
  {
    type: "google_sheets_trigger_new_row",
    title: "New Row (Google Sheets)",
    description: "Triggers when a new row is added to a sheet",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    category: "Productivity",
    isTrigger: true,
  },
  {
    type: "google_sheets_action_add_row",
    title: "Add Row (Google Sheets)",
    description: "Add a new row to a sheet",
    icon: Plus,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    isTrigger: false,
  },

  // Slack
  {
    type: "slack_trigger_new_message",
    title: "New Message in Channel (Slack)",
    description: "Triggers on a new message in a public channel",
    icon: MessageSquare,
    providerId: "slack",
    category: "Communication",
    isTrigger: true,
  },
  {
    type: "slack_action_send_message",
    title: "Send Channel Message (Slack)",
    description: "Send a message to a channel",
    icon: MessageSquare,
    providerId: "slack",
    requiredScopes: ["chat:write"],
    category: "Communication",
    isTrigger: false,
  },

  // Notion
  {
    type: "notion_trigger_new_page",
    title: "New Page in Database (Notion)",
    description: "Triggers when a page is added to a database",
    icon: FileText,
    providerId: "notion",
    category: "Productivity",
    isTrigger: true,
  },
  {
    type: "notion_action_create_page",
    title: "Create Page (Notion)",
    description: "Create a new page in Notion",
    icon: Plus,
    providerId: "notion",
    requiredScopes: ["insert"],
    category: "Productivity",
    isTrigger: false,
  },

  // GitHub
  {
    type: "github_trigger_new_commit",
    title: "New Commit (GitHub)",
    description: "Triggers on a new commit to a branch",
    icon: GitBranch,
    providerId: "github",
    category: "Development",
    isTrigger: true,
  },
  {
    type: "github_action_create_issue",
    title: "Create Issue (GitHub)",
    description: "Create a new issue in a repository",
    icon: Plus,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Development",
    isTrigger: false,
  },

  // Stripe
  {
    type: "stripe_trigger_new_payment",
    title: "New Payment (Stripe)",
    description: "Triggers on a new successful payment",
    icon: ShoppingCart,
    providerId: "stripe",
    category: "Finance",
    isTrigger: true,
  },
  {
    type: "stripe_action_create_customer",
    title: "Create Customer (Stripe)",
    description: "Create a new customer",
    icon: Users,
    providerId: "stripe",
    requiredScopes: ["customer:write"],
    category: "Finance",
    isTrigger: false,
  },

  // HubSpot
  {
    type: "hubspot_trigger_new_contact",
    title: "New Contact (HubSpot)",
    description: "Triggers when a new contact is created",
    icon: Users,
    providerId: "hubspot",
    category: "CRM",
    isTrigger: true,
  },
  {
    type: "hubspot_action_create_contact",
    title: "Create Contact (HubSpot)",
    description: "Create a new contact",
    icon: Plus,
    providerId: "hubspot",
    requiredScopes: ["crm.objects.contacts.write"],
    category: "CRM",
    isTrigger: false,
  },

  // Airtable
  {
    type: "airtable_trigger_new_record",
    title: "New Record (Airtable)",
    description: "Triggers when a new record is created in a base",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
  },
  {
    type: "airtable_action_create_record",
    title: "Create Record (Airtable)",
    description: "Create a new record in Airtable",
    icon: Plus,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
  },

  // Discord
  {
    type: "discord_trigger_new_message",
    title: "New Message in Channel (Discord)",
    description: "Triggers on a new message in a channel",
    icon: MessageSquare,
    providerId: "discord",
    category: "Communication",
    isTrigger: true,
  },
  {
    type: "discord_action_send_message",
    title: "Send Channel Message (Discord)",
    description: "Send a message to a channel",
    icon: MessageSquare,
    providerId: "discord",
    requiredScopes: ["bot"],
    category: "Communication",
    isTrigger: false,
  },

  // Microsoft Teams
  {
    type: "teams_trigger_new_message",
    title: "New Message in Channel (Teams)",
    description: "Triggers on a new message in a channel",
    icon: MessageSquare,
    providerId: "teams",
    category: "Communication",
    isTrigger: true,
  },
  {
    type: "teams_action_send_message",
    title: "Send Channel Message (Teams)",
    description: "Send a message to a channel",
    icon: MessageSquare,
    providerId: "teams",
    requiredScopes: ["Chat.ReadWrite"],
    category: "Communication",
    isTrigger: false,
  },
  {
    type: "teams_action_create_meeting",
    title: "Create Meeting (Teams)",
    description: "Create a new online meeting",
    icon: Calendar,
    providerId: "teams",
    requiredScopes: ["OnlineMeetings.ReadWrite"],
    category: "Communication",
    isTrigger: false,
  },

  // Twitter (X)
  {
    type: "twitter_trigger_new_tweet",
    title: "New Tweet by User",
    description: "Triggers when a specific user posts a tweet",
    icon: MessageSquare,
    providerId: "twitter",
    category: "Social",
    isTrigger: true,
  },
  {
    type: "twitter_action_post_tweet",
    title: "Post a Tweet",
    description: "Post a new tweet to your account",
    icon: PenSquare,
    providerId: "twitter",
    requiredScopes: ["tweet.write"],
    category: "Social",
    isTrigger: false,
  },

  // Trello
  {
    type: "trello_trigger_new_card",
    title: "New Card (Trello)",
    description: "Triggers when a new card is created in a list",
    icon: Briefcase,
    providerId: "trello",
    category: "Productivity",
    isTrigger: true,
  },
  {
    type: "trello_action_create_card",
    title: "Create Card (Trello)",
    description: "Create a new card in Trello",
    icon: Plus,
    providerId: "trello",
    requiredScopes: ["write"],
    category: "Productivity",
    isTrigger: false,
  },

  // Dropbox
  {
    type: "dropbox_trigger_new_file",
    title: "New File (Dropbox)",
    description: "Triggers when a new file is added to a folder",
    icon: Upload,
    providerId: "dropbox",
    category: "Storage",
    isTrigger: true,
  },
  {
    type: "dropbox_action_upload_file",
    title: "Upload File (Dropbox)",
    description: "Upload a file to Dropbox",
    icon: Upload,
    providerId: "dropbox",
    requiredScopes: ["files.content.write"],
    category: "Storage",
    isTrigger: false,
  },

  // YouTube
  {
    type: "youtube_trigger_new_video",
    title: "New Video by Channel",
    description: "Triggers when a new video is uploaded to a channel",
    icon: Video,
    providerId: "youtube",
    category: "Social",
    isTrigger: true,
  },
  {
    type: "youtube_action_upload_video",
    title: "Upload Video",
    description: "Upload a new video to your channel",
    icon: Upload,
    providerId: "youtube",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.upload"],
    category: "Social",
    isTrigger: false,
  },

  // Shopify
  {
    type: "shopify_trigger_new_order",
    title: "New Order (Shopify)",
    description: "Triggers when a new order is placed",
    icon: ShoppingCart,
    providerId: "shopify",
    category: "eCommerce",
    isTrigger: true,
  },
  {
    type: "shopify_action_create_product",
    title: "Create Product (Shopify)",
    description: "Create a new product in your store",
    icon: Plus,
    providerId: "shopify",
    requiredScopes: ["write_products"],
    category: "eCommerce",
    isTrigger: false,
  },
] 