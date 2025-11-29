/**
 * Dynamic integration detection based on environment variables
 * This file automatically detects which integrations are available
 * based on the presence of required environment variables
 */

export interface IntegrationConfig {
  id: string
  name: string
  description: string
  category: string
  capabilities: string[]
  scopes: string[]
  isAvailable: boolean
  requiresClientId: string
  requiresClientSecret: string
  authUrl?: string
  tokenUrl?: string
  revokeUrl?: string
  color: string
  logo?: any
  docsUrl?: string
  authType?: "oauth" | "apiKey"
  searchKeywords?: string[]
  additionalInfo?: string
  // If set, this integration shares OAuth with another provider (e.g., microsoft-excel shares with onedrive)
  sharesAuthWith?: string
}

// Complete integration configurations with all metadata
// Note: UI components for each integration are in /components/workflows/configuration/providers/
export const INTEGRATION_CONFIGS: Record<string, IntegrationConfig> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    description: "Send and manage emails through Gmail",
    category: "communication",
    capabilities: ["Send Emails", "Read Emails", "Manage Labels", "Search", "Access Contacts"],
    scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.settings.basic", "https://www.googleapis.com/auth/gmail.settings.sharing", "https://www.googleapis.com/auth/contacts.readonly"],
    isAvailable: false,
    requiresClientId: "GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#EA4335",
    docsUrl: "https://developers.google.com/gmail/api",
    authType: "oauth",
  },
  "google-calendar": {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage events and schedules in Google Calendar",
    category: "productivity",
    capabilities: ["Create Events", "Read Events", "Update Events", "Delete Events"],
    scopes: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/contacts.readonly"],
    isAvailable: false,
    requiresClientId: "GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#4285F4",
    docsUrl: "https://developers.google.com/calendar/api",
    authType: "oauth",
  },

  "google-drive": {
    id: "google-drive",
    name: "Google Drive",
    description: "Access and manage files in Google Drive",
    category: "storage",
    capabilities: ["Upload Files", "Download Files", "Share Files", "Organize Folders"],
    scopes: ["https://www.googleapis.com/auth/drive"],
    isAvailable: false,
    requiresClientId: "GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#4285F4",
    docsUrl: "https://developers.google.com/drive/api",
    authType: "oauth",
  },

  "google-sheets": {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Create and manage spreadsheets in Google Sheets",
    category: "productivity",
    capabilities: ["Read Spreadsheets", "Write Data", "Create Sheets", "Format Cells"],
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
    isAvailable: false,
    requiresClientId: "GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#34A853",
    docsUrl: "https://developers.google.com/sheets/api",
    authType: "oauth",
  },

  "google-docs": {
    id: "google-docs",
    name: "Google Docs",
    description: "Create and edit documents in Google Docs",
    category: "productivity",
    capabilities: ["Create Documents", "Edit Documents", "Share Documents", "Export", "List Documents"],
    scopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
    isAvailable: false,
    requiresClientId: "GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#4285F4",
    docsUrl: "https://developers.google.com/docs/api",
    authType: "oauth",
  },

  // Microsoft Services
  teams: {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate and communicate through Microsoft Teams",
    category: "communication",
    capabilities: ["Send Messages", "Create Meetings", "File Sharing", "Notifications", "Team Management", "Channel Management"],
    scopes: ["https://graph.microsoft.com/User.Read", "https://graph.microsoft.com/Team.ReadBasic.All", "https://graph.microsoft.com/Team.Create", "https://graph.microsoft.com/TeamMember.Read.All", "https://graph.microsoft.com/Channel.ReadBasic.All", "https://graph.microsoft.com/Channel.Create", "https://graph.microsoft.com/ChannelMessage.Read.All", "https://graph.microsoft.com/ChannelMessage.Send", "https://graph.microsoft.com/Chat.Read", "https://graph.microsoft.com/Chat.Create", "https://graph.microsoft.com/ChatMessage.Send"],
    isAvailable: false,
    requiresClientId: "TEAMS_CLIENT_ID",
    requiresClientSecret: "TEAMS_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://developer.microsoft.com/en-us/graph/docs/api-reference/v1.0/resources/teams-api-overview",
    authType: "oauth",
  },

  onedrive: {
    id: "onedrive",
    name: "OneDrive",
    description: "Store and sync files with Microsoft OneDrive cloud storage.",
    category: "storage",
    capabilities: ["File Storage", "File Sync", "Sharing", "Collaboration"],
    scopes: ["Files.Read", "Files.ReadWrite"],
    isAvailable: false,
    requiresClientId: "ONEDRIVE_CLIENT_ID",
    requiresClientSecret: "ONEDRIVE_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://developer.microsoft.com/en-us/onedrive",
    authType: "oauth",
    searchKeywords: ["onedrive", "microsoft", "storage", "files", "cloud"],
    additionalInfo: "Cloud file storage and synchronization",
  },

  "microsoft-excel": {
    id: "microsoft-excel",
    name: "Microsoft Excel",
    description: "Create, edit, and manage Excel spreadsheets stored in OneDrive",
    category: "productivity",
    capabilities: ["Add Rows", "Update Rows", "Delete Rows", "Export Data", "Create Workbooks", "Manage Worksheets"],
    scopes: ["Files.Read", "Files.ReadWrite"],
    isAvailable: false,
    requiresClientId: "EXCEL_CLIENT_ID",
    requiresClientSecret: "EXCEL_CLIENT_SECRET",
    color: "#217346",
    docsUrl: "https://docs.microsoft.com/en-us/graph/api/resources/excel",
    authType: "oauth",
    searchKeywords: ["excel", "microsoft", "spreadsheet", "workbook", "worksheet", "data", "csv"],
    additionalInfo: "📊 Work with Excel spreadsheets stored in OneDrive or SharePoint",
  },

  // Communication Platforms
  slack: {
    id: "slack",
    name: "Slack",
    description: "Team communication and collaboration platform",
    category: "communication",
    capabilities: ["Send Messages", "Create Channels", "File Sharing", "Notifications"],
    scopes: ["chat:write", "channels:read", "groups:write", "users:read", "team:read"],
    isAvailable: false,
    requiresClientId: "SLACK_CLIENT_ID",
    requiresClientSecret: "SLACK_CLIENT_SECRET",
    color: "#4A154B",
    docsUrl: "https://api.slack.com/",
    authType: "oauth",
  },

  discord: {
    id: "discord",
    name: "Discord",
    description: "Voice, video and text communication for communities",
    category: "communication",
    capabilities: ["Send Messages", "Voice Chat", "Server Management", "Bots"],
    scopes: ["identify", "guilds", "email", "guilds.join", "bot"],
    isAvailable: false,
    requiresClientId: "DISCORD_CLIENT_ID",
    requiresClientSecret: "DISCORD_CLIENT_SECRET",
    color: "#5865F2",
    docsUrl: "https://discord.com/developers/docs",
    authType: "oauth",
  },

  // Social Media
  twitter: {
    id: "twitter",
    name: "X (Twitter)",
    description: "Share updates and engage with your X audience",
    category: "social",
    capabilities: ["Post Tweets", "Read Timeline", "Manage Followers", "Analytics"],
    scopes: ["tweet.read", "tweet.write", "users.read"],
    isAvailable: false,
    requiresClientId: "TWITTER_CLIENT_ID",
    requiresClientSecret: "TWITTER_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developer.x.com/en/docs",
    authType: "oauth",
    // dynamicTypes: ["twitter_mentions"] // (optional, for documentation)
  },

  facebook: {
    id: "facebook",
    name: "Facebook",
    description: "Manage Facebook pages and social media presence",
    category: "social",
    capabilities: ["Post Updates", "Manage Pages", "Analytics", "Advertising"],
    scopes: ["public_profile", "pages_manage_posts"],
    isAvailable: false,
    requiresClientId: "FACEBOOK_CLIENT_ID",
    requiresClientSecret: "FACEBOOK_CLIENT_SECRET",
    color: "#1877F2",
    docsUrl: "https://developers.facebook.com/docs",
    authType: "oauth",
  },

  // Development & Productivity
  notion: {
    id: "notion",
    name: "Notion",
    description: "All-in-one workspace for notes, docs, and collaboration",
    category: "productivity",
    capabilities: ["Create Pages", "Update Pages", "Database Management", "User Info"],
    scopes: ["users.read", "content.read", "content.write"],
    isAvailable: false,
    requiresClientId: "NOTION_CLIENT_ID",
    requiresClientSecret: "NOTION_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developers.notion.com/",
    authType: "oauth",
  },

  trello: {
    id: "trello",
    name: "Trello",
    description: "Organize projects and collaborate with your team",
    category: "productivity",
    capabilities: ["Create Cards", "Move Cards", "Manage Boards", "Add Comments"],
    scopes: ["read", "write"],
    isAvailable: false,
    requiresClientId: "TRELLO_CLIENT_ID",
    requiresClientSecret: "TRELLO_CLIENT_SECRET",
    color: "#0079BF",
    docsUrl: "https://developer.atlassian.com/cloud/trello/rest/",
    authType: "oauth",
  },

  // Business & CRM
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM platform for marketing, sales, and customer service",
    category: "crm",
    capabilities: ["Manage Contacts", "Log Activities", "Create Deals", "Marketing Emails"],
    scopes: [
      "crm.objects.companies.read", 
      "crm.objects.companies.write", 
      "crm.objects.contacts.read", 
      "crm.objects.contacts.write", 
      "crm.objects.deals.read", 
      "crm.objects.deals.write"
    ],
    isAvailable: false,
    requiresClientId: "HUBSPOT_CLIENT_ID",
    requiresClientSecret: "HUBSPOT_CLIENT_SECRET",
    color: "#FF7A59",
    docsUrl: "https://developers.hubspot.com/documentation/overview",
    authType: "oauth",
  },

  airtable: {
    id: "airtable",
    name: "Airtable",
    description: "Spreadsheet-database hybrid for creating powerful apps",
    category: "productivity",
    capabilities: ["Read Records", "Create Records", "Update Records", "Delete Records"],
    scopes: ["data.records:read", "data.records:write", "schema.bases:read", "schema.bases:write"],
    isAvailable: false,
    requiresClientId: "AIRTABLE_CLIENT_ID",
    requiresClientSecret: "AIRTABLE_CLIENT_SECRET",
    color: "#FBCB0A",
    docsUrl: "https://airtable.com/developers/web/api/introduction",
    authType: "oauth",
  },

  mailchimp: {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing and automation platform",
    category: "e-commerce",
    capabilities: ["Email Campaigns", "Audience Management", "Automations", "Analytics"],
    scopes: ["campaigns", "lists", "automations"],
    isAvailable: false,
    requiresClientId: "MAILCHIMP_CLIENT_ID",
    requiresClientSecret: "MAILCHIMP_CLIENT_SECRET",
    color: "#FFE01B",
    docsUrl: "https://mailchimp.com/developer/marketing/docs/fundamentals/",
    authType: "oauth",
  },

  manychat: {
    id: "manychat",
    name: "ManyChat",
    description: "Chatbot platform for automated conversations on Facebook Messenger and WhatsApp",
    category: "communication",
    capabilities: [
      "Send Messages",
      "Send Flows",
      "Manage Tags",
      "Manage Custom Fields",
      "Subscribe to Sequences",
      "Get Subscriber Info",
      "Find Users",
      "Tag Subscribers",
      "Unsubscribe from Sequences"
    ],
    scopes: [],
    isAvailable: false,
    requiresClientId: "",
    requiresClientSecret: "",
    color: "#00B2FF",
    docsUrl: "https://api.manychat.com/swagger",
    authType: "apiKey",
    searchKeywords: ["chatbot", "messenger", "facebook", "whatsapp", "automation", "chat", "bot", "flow", "sequence"],
  },

  monday: {
    id: "monday",
    name: "Monday.com",
    description: "Work OS for teams to run projects and workflows",
    category: "productivity",
    capabilities: ["Create Items", "Update Items", "Manage Boards", "Post Updates", "Track Progress"],
    scopes: ["boards:read", "boards:write", "workspaces:read", "me:read", "webhooks:write"],
    isAvailable: false,
    requiresClientId: "MONDAY_CLIENT_ID",
    requiresClientSecret: "MONDAY_CLIENT_SECRET",
    color: "#FF3D57",
    docsUrl: "https://developer.monday.com/api-reference/docs",
    authType: "oauth",
  },

  gumroad: {
    id: "gumroad",
    name: "Gumroad",
    description: "Platform for creators to sell products directly to consumers",
    category: "e-commerce",
    capabilities: ["Manage Products", "Process Sales", "Track Analytics", "Manage Customers"],
    scopes: ["view_sales", "edit_products"],
    isAvailable: false,
    requiresClientId: "GUMROAD_CLIENT_ID",
    requiresClientSecret: "GUMROAD_CLIENT_SECRET",
    color: "#FF90E8",
    docsUrl: "https://gumroad.com/api",
    authType: "oauth",
  },

  // E-commerce & Payments
  stripe: {
    id: "stripe",
    name: "Stripe",
    description: "Online payment processing for internet businesses",
    category: "e-commerce",
    capabilities: ["Process Payments", "Manage Subscriptions", "Invoicing", "Fraud Prevention"],
    scopes: ["read_write"],
    isAvailable: false,
    requiresClientId: "STRIPE_CLIENT_ID",
    requiresClientSecret: "STRIPE_CLIENT_SECRET",
    color: "#635BFF",
    docsUrl: "https://stripe.com/docs/api",
    authType: "oauth",
  },

  // Cloud Storage
  dropbox: {
    id: "dropbox",
    name: "Dropbox",
    description: "Secure file storage and collaboration platform",
    category: "storage",
    capabilities: ["File Storage", "File Sharing", "Team Collaboration", "Backup & Sync"],
    scopes: ["files.content.write", "files.content.read", "account_info.read"],
    isAvailable: false,
    requiresClientId: "DROPBOX_CLIENT_ID",
    requiresClientSecret: "DROPBOX_CLIENT_SECRET",
    color: "#0061FF",
    docsUrl: "https://www.dropbox.com/developers/documentation",
    authType: "oauth",
  },

  // Development & Version Control
  github: {
    id: "github",
    name: "GitHub",
    description: "Version control and collaborative development platform",
    category: "productivity",
    capabilities: ["Create Issues", "Manage Repositories", "Pull Requests", "Create Gists", "Add Comments"],
    scopes: ["repo", "gist", "user:read"],
    isAvailable: false,
    requiresClientId: "GITHUB_CLIENT_ID",
    requiresClientSecret: "GITHUB_CLIENT_SECRET",
    color: "#181717",
    docsUrl: "https://docs.github.com/en/rest",
    authType: "oauth",
  },

  // Analytics
  "google-analytics": {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Track website analytics and user behavior with Google Analytics 4",
    category: "analytics",
    capabilities: ["Track Events", "Real-Time Data", "Run Reports", "User Activity", "Conversion Tracking"],
    scopes: ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/analytics.edit"],
    isAvailable: false,
    requiresClientId: "GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#F9AB00",
    docsUrl: "https://developers.google.com/analytics",
    authType: "oauth",
  },

  // E-commerce
  shopify: {
    id: "shopify",
    name: "Shopify",
    description: "E-commerce platform for online stores and retail point-of-sale",
    category: "e-commerce",
    capabilities: ["Manage Orders", "Create Products", "Update Inventory", "Customer Management", "Order Fulfillment"],
    scopes: ["read_orders", "write_orders", "read_products", "write_products", "read_customers", "write_customers", "read_inventory", "write_inventory"],
    isAvailable: false,
    requiresClientId: "SHOPIFY_CLIENT_ID",
    requiresClientSecret: "SHOPIFY_CLIENT_SECRET",
    color: "#96BF48",
    docsUrl: "https://shopify.dev/docs/api",
    authType: "oauth",
  },

  // New Integrations Start Here

  "microsoft-outlook": {
    id: "microsoft-outlook",
    name: "Microsoft Outlook",
    description: "Manage your email, calendar, and contacts with Outlook",
    category: "communication",
    capabilities: ["Send Email", "Read Email", "Manage Calendar Events", "Organize Contacts"],
    scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Contacts.ReadWrite"],
    isAvailable: false,
    requiresClientId: "OUTLOOK_CLIENT_ID",
    requiresClientSecret: "OUTLOOK_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://learn.microsoft.com/en-us/graph/integrating-applications-with-outlook",
    authType: "oauth",
  },

  "microsoft-onenote": {
    id: "microsoft-onenote",
    name: "Microsoft OneNote",
    description: "Capture thoughts, ideas, and to-dos in OneNote",
    category: "productivity",
    capabilities: ["Create Notes", "Read Notes", "Organize Notebooks", "Attach Files"],
    scopes: ["User.Read", "Notes.ReadWrite.All", "offline_access"],
    isAvailable: true,
    requiresClientId: "ONENOTE_CLIENT_ID",
    requiresClientSecret: "ONENOTE_CLIENT_SECRET",
    color: "#7719AA",
    docsUrl: "https://learn.microsoft.com/en-us/graph/integrate-with-onenote",
    authType: "oauth",
  },

  // New Integrations End Here

  // Logic & Control Flow
  logic: {
    id: "logic",
    name: "Logic & Control",
    description: "Control flow, conditions, and timing for your workflows",
    category: "logic",
    capabilities: ["Conditional Logic", "Wait/Delay", "Branching", "Data Processing"],
    scopes: [],
    isAvailable: true, // Always available
    requiresClientId: "",
    requiresClientSecret: "",
    color: "#6B7280",
    docsUrl: "",
    authType: "none" as any,
  },

  // AI & Automation
  ai: {
    id: "ai",
    name: "AI Automation",
    description: "Add AI Message and AI Router steps to generate content or route workflows intelligently",
    category: "ai",
    capabilities: ["AI Message", "AI Router", "Content Generation", "Intelligent Branching"],
    scopes: [],
    isAvailable: true, // Always available
    requiresClientId: "",
    requiresClientSecret: "",
    color: "#8B5CF6",
    docsUrl: "",
    authType: "none" as any,
  },
}

/**
 * Detects available integrations based on environment variables
 */
export function detectAvailableIntegrations(): IntegrationConfig[] {
  const availableIntegrations: IntegrationConfig[] = []

  for (const [key, config] of Object.entries(INTEGRATION_CONFIGS)) {
    // Check if both client ID and secret are available
    const hasClientId = !!(
      process.env[config.requiresClientId] ||
      (typeof window !== "undefined" && (window as any).ENV?.[config.requiresClientId])
    )
    const hasClientSecret = !!process.env[config.requiresClientSecret]

    // Mark all integrations as available for connection attempts
    const isAvailable = true

    availableIntegrations.push({
      ...config,
      isAvailable,
    })
  }

  return availableIntegrations
}

/**
 * Get integration configuration by ID
 */
export function getIntegrationConfig(id: string): IntegrationConfig | null {
  return INTEGRATION_CONFIGS[id] || null
}

/**
 * Get all available integration IDs
 */
export function getAvailableIntegrationIds(): string[] {
  return detectAvailableIntegrations()
    .filter((integration) => integration.isAvailable)
    .map((integration) => integration.id)
}

/**
 * Check if a specific integration is available
 */
export function isIntegrationAvailable(id: string): boolean {
  const config = getIntegrationConfig(id)
  return !!config
}

/**
 * Get integrations grouped by category
 */
export function getIntegrationsByCategory(): Record<string, IntegrationConfig[]> {
  const integrations = detectAvailableIntegrations()
  const grouped: Record<string, IntegrationConfig[]> = {}

  for (const integration of integrations) {
    if (!grouped[integration.category]) {
      grouped[integration.category] = []
    }
    grouped[integration.category].push(integration)
  }

  return grouped
}

/**
 * Get integration statistics
 */
export function getIntegrationStats() {
  const integrations = detectAvailableIntegrations()
  const available = integrations.filter((i) => i.isAvailable)
  const byCategory = getIntegrationsByCategory()

  return {
    total: integrations.length,
    available: available.length,
    unavailable: integrations.length - available.length,
    categories: Object.keys(byCategory).length,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([category, items]) => [
        category,
        {
          total: items.length,
          available: items.filter((i) => i.isAvailable).length,
        },
      ]),
    ),
  }
}
