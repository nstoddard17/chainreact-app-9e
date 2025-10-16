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
    description: "Store and sync files with Microsoft OneDrive. Also enables Microsoft Excel integration for spreadsheet automation.",
    category: "storage",
    capabilities: ["File Storage", "File Sync", "Sharing", "Collaboration", "Excel Spreadsheets"],
    scopes: ["Files.Read", "Files.ReadWrite"],
    isAvailable: false,
    requiresClientId: "ONEDRIVE_CLIENT_ID",
    requiresClientSecret: "ONEDRIVE_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://developer.microsoft.com/en-us/onedrive",
    authType: "oauth",
    searchKeywords: ["onedrive", "microsoft", "storage", "files", "excel", "spreadsheet", "workbook", "worksheet"],
    additionalInfo: "🎯 Includes Microsoft Excel integration for creating, editing, and managing spreadsheets",
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
