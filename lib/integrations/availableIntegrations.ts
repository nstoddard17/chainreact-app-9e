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
}

// Complete integration configurations with all metadata
export const INTEGRATION_CONFIGS: Record<string, IntegrationConfig> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    description: "Send and manage emails through Gmail",
    category: "communication",
    capabilities: ["Send Emails", "Read Emails", "Manage Labels", "Search"],
    scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
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
    scopes: ["https://www.googleapis.com/auth/calendar"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
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
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
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
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
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
    capabilities: ["Create Documents", "Edit Documents", "Share Documents", "Export"],
    scopes: ["https://www.googleapis.com/auth/documents"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#4285F4",
    docsUrl: "https://developers.google.com/docs/api",
    authType: "oauth",
  },

  youtube: {
    id: "youtube",
    name: "YouTube",
    description: "Manage YouTube channels and videos",
    category: "social",
    capabilities: ["Upload Videos", "Manage Playlists", "Analytics", "Comments"],
    scopes: ["https://www.googleapis.com/auth/youtube"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_YOUTUBE_CLIENT_ID",
    requiresClientSecret: "YOUTUBE_CLIENT_SECRET",
    color: "#FF0000",
    docsUrl: "https://docs.microsoft.com/en-us/graph/api/resources/teams-api-overview",
    authType: "oauth",
  },

  // Microsoft Services
  teams: {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate and communicate through Microsoft Teams",
    category: "communication",
    capabilities: ["Send Messages", "Create Meetings", "File Sharing", "Notifications"],
    scopes: ["User.Read", "Chat.ReadWrite"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    requiresClientSecret: "MICROSOFT_CLIENT_SECRET",
    color: "#6264A7",
    docsUrl: "https://docs.microsoft.com/en-us/graph/api/resources/teams-api-overview",
    authType: "oauth",
  },

  onedrive: {
    id: "onedrive",
    name: "OneDrive",
    description: "Store and sync files with Microsoft OneDrive",
    category: "storage",
    capabilities: ["File Storage", "File Sync", "Sharing", "Collaboration"],
    scopes: ["Files.Read", "Files.ReadWrite"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    requiresClientSecret: "MICROSOFT_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://docs.microsoft.com/en-us/onedrive/developer/",
    authType: "oauth",
  },

  // Communication Platforms
  slack: {
    id: "slack",
    name: "Slack",
    description: "Team communication and collaboration platform",
    category: "communication",
    capabilities: ["Send Messages", "Create Channels", "File Sharing", "Notifications"],
    scopes: ["chat:write", "channels:read", "users:read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_SLACK_CLIENT_ID",
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
    scopes: ["identify", "guilds", "bot"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_DISCORD_CLIENT_ID",
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
    requiresClientId: "NEXT_PUBLIC_TWITTER_CLIENT_ID",
    requiresClientSecret: "TWITTER_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developer.x.com/en/docs",
    authType: "oauth",
  },

  facebook: {
    id: "facebook",
    name: "Facebook",
    description: "Manage Facebook pages and social media presence",
    category: "social",
    capabilities: ["Post Updates", "Manage Pages", "Analytics", "Advertising"],
    scopes: ["public_profile", "pages_manage_posts"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_FACEBOOK_CLIENT_ID",
    requiresClientSecret: "FACEBOOK_CLIENT_SECRET",
    color: "#1877F2",
    docsUrl: "https://developers.facebook.com/docs",
    authType: "oauth",
  },

  instagram: {
    id: "instagram",
    name: "Instagram",
    description: "Share photos and stories on Instagram",
    category: "social",
    capabilities: ["Post Photos", "Stories", "Analytics", "Comments"],
    scopes: ["user_profile", "user_media"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_INSTAGRAM_CLIENT_ID",
    requiresClientSecret: "INSTAGRAM_CLIENT_SECRET",
    color: "#E4405F",
    docsUrl: "https://developers.facebook.com/docs/instagram",
    authType: "oauth",
  },

  tiktok: {
    id: "tiktok",
    name: "TikTok",
    description: "Create and share short-form videos on TikTok",
    category: "social",
    capabilities: ["Upload Videos", "Analytics", "User Info", "Video Management"],
    scopes: ["user.info.basic", "video.list"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_TIKTOK_CLIENT_ID",
    requiresClientSecret: "TIKTOK_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developers.tiktok.com/",
    authType: "oauth",
  },

  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    description: "Manage your professional network and business presence",
    category: "social",
    capabilities: ["Share Posts", "Company Pages", "Lead Generation", "Profile Info"],
    scopes: ["r_liteprofile", "w_member_social"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_LINKEDIN_CLIENT_ID",
    requiresClientSecret: "LINKEDIN_CLIENT_SECRET",
    color: "#0A66C2",
    docsUrl: "https://developer.linkedin.com/docs",
    authType: "oauth",
  },

  // Development & Productivity
  github: {
    id: "github",
    name: "GitHub",
    description: "Code hosting and version control with Git",
    category: "development",
    capabilities: ["Manage Repositories", "Create Issues", "Pull Requests", "Gists"],
    scopes: ["repo", "gist"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GITHUB_CLIENT_ID",
    requiresClientSecret: "GITHUB_CLIENT_SECRET",
    color: "#181717",
    docsUrl: "https://docs.github.com/en/developers",
    authType: "oauth",
  },

  gitlab: {
    id: "gitlab",
    name: "GitLab",
    description: "DevOps platform for the entire software development lifecycle",
    category: "development",
    capabilities: ["Manage Repositories", "CI/CD Pipelines", "Issues", "Merge Requests"],
    scopes: ["api"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GITLAB_CLIENT_ID",
    requiresClientSecret: "GITLAB_CLIENT_SECRET",
    color: "#FC6D26",
    docsUrl: "https://docs.gitlab.com/ee/api/",
    authType: "oauth",
  },

  notion: {
    id: "notion",
    name: "Notion",
    description: "All-in-one workspace for notes, docs, and collaboration",
    category: "productivity",
    capabilities: ["Create Pages", "Update Pages", "Database Management", "User Info"],
    scopes: ["all"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_NOTION_CLIENT_ID",
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
    scopes: ["read,write"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_TRELLO_CLIENT_ID",
    requiresClientSecret: "",
    color: "#0079BF",
    docsUrl: "https://developer.atlassian.com/cloud/trello/",
    authType: "oauth",
  },

  // Business & CRM
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM platform for marketing, sales, and customer service",
    category: "crm",
    capabilities: ["Manage Contacts", "Log Activities", "Create Deals", "Marketing Emails"],
    scopes: ["crm.objects.contacts.write", "crm.objects.deals.write"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_HUBSPOT_CLIENT_ID",
    requiresClientSecret: "HUBSPOT_CLIENT_SECRET",
    color: "#FF7A59",
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
    authType: "oauth",
  },

  airtable: {
    id: "airtable",
    name: "Airtable",
    description: "Spreadsheet-database hybrid for creating powerful apps",
    category: "productivity",
    capabilities: ["Read Records", "Create Records", "Update Records", "Delete Records"],
    scopes: ["data.records:read", "data.records:write", "schema.bases:read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_AIRTABLE_CLIENT_ID",
    requiresClientSecret: "AIRTABLE_CLIENT_SECRET",
    color: "#FBCB35",
    docsUrl: "https://airtable.com/developers/web/api/introduction",
    authType: "oauth",
  },

  mailchimp: {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing and automation platform",
    category: "marketing",
    capabilities: ["Manage Audiences", "Send Campaigns", "Automations", "Reporting"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MAILCHIMP_CLIENT_ID",
    requiresClientSecret: "MAILCHIMP_CLIENT_SECRET",
    color: "#FFE01B",
    docsUrl: "https://mailchimp.com/developer/",
    authType: "oauth",
  },

  // E-commerce & Payments
  shopify: {
    id: "shopify",
    name: "Shopify",
    description: "E-commerce platform for online stores",
    category: "e-commerce",
    capabilities: ["Manage Products", "Process Orders", "Customer Data", "Inventory"],
    scopes: ["read_products", "write_orders"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_SHOPIFY_CLIENT_ID",
    requiresClientSecret: "SHOPIFY_CLIENT_SECRET",
    color: "#78B144",
    docsUrl: "https://shopify.dev/api",
    authType: "oauth",
  },

  paypal: {
    id: "paypal",
    name: "PayPal",
    description: "Online payment processing and money transfers",
    category: "payments",
    capabilities: ["Payment Processing", "Transaction History", "Invoicing", "Subscriptions"],
    scopes: ["openid", "email"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
    requiresClientSecret: "PAYPAL_CLIENT_SECRET",
    color: "#003087",
    docsUrl: "https://developer.paypal.com/home",
    authType: "oauth",
  },

  stripe: {
    id: "stripe",
    name: "Stripe",
    description: "Online payment processing for internet businesses",
    category: "finance",
    capabilities: ["Create Charges", "Manage Customers", "Subscriptions", "Refunds"],
    scopes: ["read_write"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_STRIPE_CLIENT_ID",
    requiresClientSecret: "STRIPE_CLIENT_SECRET",
    color: "#635BFF",
    docsUrl: "https://stripe.com/docs/api",
    authType: "oauth",
  },

  // Cloud Storage
  box: {
    id: "box",
    name: "Box",
    description: "Content management and file sharing for businesses",
    category: "storage",
    capabilities: ["File Management", "Collaboration", "Security Policies", "Tasks"],
    scopes: ["root_readwrite"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_BOX_CLIENT_ID",
    requiresClientSecret: "BOX_CLIENT_SECRET",
    color: "#0061D5",
    docsUrl: "https://developer.box.com/guides/",
    authType: "oauth",
  },

  dropbox: {
    id: "dropbox",
    name: "Dropbox",
    description: "File hosting service for cloud storage and file synchronization",
    category: "storage",
    capabilities: ["Upload Files", "Download Files", "Sharing", "File Previews"],
    scopes: ["files.content.write", "files.content.read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_DROPBOX_CLIENT_ID",
    requiresClientSecret: "DROPBOX_CLIENT_SECRET",
    color: "#0061FF",
    docsUrl: "https://www.dropbox.com/developers/documentation",
    authType: "oauth",
  },

  // New Integrations Start Here

  "youtube-studio": {
    id: "youtube-studio",
    name: "YouTube Studio",
    description: "Manage your YouTube presence, view analytics, and engage with your audience.",
    category: "social",
    capabilities: ["Content Management", "Audience Engagement", "Channel Analytics", "Monetization Tracking"],
    scopes: [
      "https://www.googleapis.com/auth/youtubepartner",
      "https://www.googleapis.com/auth/youtube"
    ],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_YOUTUBE_CLIENT_ID",
    requiresClientSecret: "YOUTUBE_CLIENT_SECRET",
    color: "#FF0000",
    docsUrl: "https://developers.google.com/youtube/partner/docs",
    authType: "oauth",
  },

  convertkit: {
    id: "convertkit",
    name: "ConvertKit",
    description: "Email marketing and automation for creators.",
    category: "marketing",
    capabilities: ["Manage Subscribers", "Send Broadcasts", "Automate Funnels", "View Reports"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_CONVERTKIT_CLIENT_ID",
    requiresClientSecret: "CONVERTKIT_CLIENT_SECRET",
    color: "#F97316",
    docsUrl: "https://developers.convertkit.com/",
    authType: "oauth",
  },

  blackbaud: {
    id: "blackbaud",
    name: "Blackbaud",
    description: "Cloud-based fundraising and donor management software",
    category: "crm",
    capabilities: ["Manage Constituents", "Process Donations", "Track Campaigns", "Generate Reports"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_BLACKBAUD_CLIENT_ID",
    requiresClientSecret: "BLACKBAUD_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developer.blackbaud.com/skyapi/docs",
    authType: "oauth",
  },

  globalpayments: {
    id: "globalpayments",
    name: "Global Payments",
    description: "Payment technology and software solutions",
    category: "finance",
    capabilities: ["Process Payments", "Manage Transactions", "Generate Invoices", "View Reports"],
    scopes: ["read", "write"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GLOBALPAYMENTS_CLIENT_ID",
    requiresClientSecret: "GLOBALPAYMENTS_CLIENT_SECRET",
    color: "#007BC0",
    docsUrl: "https://developer.globalpay.com/",
    authType: "oauth",
  },

  gumroad: {
    id: "gumroad",
    name: "Gumroad",
    description: "Sell digital products, memberships, and more",
    category: "ecommerce",
    capabilities: ["Manage Products", "Track Sales", "Customer Data"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "GUMROAD_API_KEY",
    requiresClientSecret: "",
    color: "#FF90E8",
    docsUrl: "https://app.gumroad.com/api",
    authType: "apiKey",
  },

  manychat: {
    id: "manychat",
    name: "ManyChat",
    description: "Automate conversations on Instagram, Facebook Messenger, and SMS",
    category: "communication",
    capabilities: ["Send Messages", "Manage Subscribers", "Run Automations"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "MANYCHAT_API_KEY",
    requiresClientSecret: "",
    color: "#007AFF",
    docsUrl: "https://api.manychat.com/swagger",
    authType: "apiKey",
  },

  beehiiv: {
    id: "beehiiv",
    name: "beehiiv",
    description: "The newsletter platform built for growth",
    category: "communication",
    capabilities: ["Manage Publications", "Manage Posts", "Subscriber Data"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "BEEHIIV_API_KEY",
    requiresClientSecret: "",
    color: "#FFD000",
    docsUrl: "https://developers.beehiiv.com/docs/getting-started",
    authType: "apiKey",
  },

  "microsoft-outlook": {
    id: "microsoft-outlook",
    name: "Microsoft Outlook",
    description: "Manage emails and calendar with Microsoft Outlook",
    category: "communication",
    capabilities: ["Send Emails", "Read Emails", "Manage Calendar", "Contacts"],
    scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    requiresClientSecret: "MICROSOFT_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://docs.microsoft.com/en-us/graph/api/resources/mail-api-overview",
    authType: "oauth",
  },

  "microsoft-onenote": {
    id: "microsoft-onenote",
    name: "Microsoft OneNote",
    description: "Create and organize notes with Microsoft OneNote",
    category: "productivity",
    capabilities: ["Create Notes", "Organize Notebooks", "Share Notes", "Collaborate"],
    scopes: ["User.Read", "Notes.ReadWrite.All"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    requiresClientSecret: "MICROSOFT_CLIENT_SECRET",
    color: "#7719AA",
    docsUrl: "https://docs.microsoft.com/en-us/graph/api/resources/onenote-api-overview",
    authType: "oauth",
  },

  // New Integrations End Here
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
