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
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
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
    capabilities: ["Create Documents", "Edit Documents", "Share Documents", "Export", "List Documents"],
    scopes: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
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
    docsUrl: "https://developers.google.com/docs/api/deprecated",
    authType: "oauth",
  },

  // Microsoft Services
  teams: {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate and communicate through Microsoft Teams",
    category: "communication",
    capabilities: ["Send Messages", "Create Meetings", "File Sharing", "Notifications"],
    scopes: ["Files.Read", "Files.ReadWrite"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    requiresClientSecret: "MICROSOFT_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://developer.microsoft.com/en-us/onedrive",
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
    docsUrl: "https://developer.microsoft.com/en-us/onedrive",
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
    description: "Share photos and videos with Instagram Business accounts",
    category: "social",
    capabilities: ["Post Photos", "Stories", "Analytics", "Comments"],
    scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments", "instagram_business_manage_messages"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_INSTAGRAM_CLIENT_ID",
    requiresClientSecret: "INSTAGRAM_CLIENT_SECRET",
    color: "#E4405F",
    docsUrl: "https://developers.facebook.com/docs/instagram-api",
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
    docsUrl: "https://developers.tiktok.com/documentation/overview",
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
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/",
    authType: "oauth",
  },

  // Development & Productivity
  github: {
    id: "github",
    name: "GitHub",
    description: "Code hosting and version control with Git",
    category: "developer",
    capabilities: ["Manage Repositories", "Create Issues", "Pull Requests", "Gists"],
    scopes: ["repo", "gist"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GITHUB_CLIENT_ID",
    requiresClientSecret: "GITHUB_CLIENT_SECRET",
    color: "#181717",
    docsUrl: "https://docs.github.com/en/rest",
    authType: "oauth",
  },

  gitlab: {
    id: "gitlab",
    name: "GitLab",
    description: "DevOps platform for the entire software development lifecycle",
    category: "developer",
    capabilities: ["Manage Repositories", "CI/CD Pipelines", "Issues", "Merge Requests"],
    scopes: ["api"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GITLAB_CLIENT_ID",
    requiresClientSecret: "GITLAB_CLIENT_SECRET",
    color: "#FCA121",
    docsUrl: "https://docs.gitlab.com/ee/api/",
    authType: "oauth",
  },

  notion: {
    id: "notion",
    name: "Notion",
    description: "All-in-one workspace for notes, docs, and collaboration",
    category: "productivity",
    capabilities: ["Create Pages", "Update Pages", "Database Management", "User Info"],
    scopes: ["users.read", "content.read", "content.write"],
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
    scopes: ["read", "write"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_TRELLO_CLIENT_ID",
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
    requiresClientId: "NEXT_PUBLIC_HUBSPOT_CLIENT_ID",
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
    requiresClientId: "NEXT_PUBLIC_AIRTABLE_CLIENT_ID",
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
    requiresClientId: "NEXT_PUBLIC_MAILCHIMP_CLIENT_ID",
    requiresClientSecret: "MAILCHIMP_CLIENT_SECRET",
    color: "#FFE01B",
    docsUrl: "https://mailchimp.com/developer/marketing/docs/fundamentals/",
    authType: "oauth",
  },

  // E-commerce & Payments
  shopify: {
    id: "shopify",
    name: "Shopify",
    description: "E-commerce platform for online stores",
    category: "e-commerce",
    capabilities: ["Manage Products", "Process Orders", "Customer Data", "Inventory", "Analytics", "Marketing"],
    scopes: ["read_products", "write_products", "read_orders", "write_orders"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_SHOPIFY_CLIENT_ID",
    requiresClientSecret: "SHOPIFY_CLIENT_SECRET",
    color: "#7AB55C",
    docsUrl: "https://shopify.dev/docs/api",
    authType: "oauth",
  },

  paypal: {
    id: "paypal",
    name: "PayPal",
    description: "Online payment processing and money transfers",
    category: "e-commerce",
    capabilities: ["Process Payments", "Issue Invoices", "Manage Subscriptions", "Analytics"],
    scopes: ["openid", "profile", "email"],
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
    category: "e-commerce",
    capabilities: ["Process Payments", "Manage Subscriptions", "Invoicing", "Fraud Prevention"],
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
    capabilities: ["Secure File Storage", "Content Collaboration", "Workflow Automation", "Enterprise Security"],
    scopes: ["root_readwrite", "manage_managed_users"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_BOX_CLIENT_ID",
    requiresClientSecret: "BOX_CLIENT_SECRET",
    color: "#0052CC",
    docsUrl: "https://developer.box.com/",
    authType: "oauth",
  },

  dropbox: {
    id: "dropbox",
    name: "Dropbox",
    description: "Secure file storage and collaboration platform",
    category: "storage",
    capabilities: ["File Storage", "File Sharing", "Team Collaboration", "Backup & Sync"],
    scopes: ["files.content.write", "files.content.read", "account_info.read"],
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
    description: "Manage your YouTube channel analytics and content",
    category: "social",
    capabilities: ["View Analytics", "Manage Videos", "Channel Management", "Content ID"],
    scopes: ["https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtubepartner"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_YOUTUBE_CLIENT_ID",
    requiresClientSecret: "YOUTUBE_CLIENT_SECRET",
    color: "#FF0000",
    docsUrl: "https://developers.google.com/youtube/partner/docs",
    authType: "oauth",
  },

  blackbaud: {
    id: "blackbaud",
    name: "Blackbaud",
    description: "Cloud software for social good",
    category: "other",
    capabilities: ["Donor Management", "Fundraising", "Grant Management", "Financial Management"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_BLACKBAUD_CLIENT_ID",
    requiresClientSecret: "BLACKBAUD_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developer.blackbaud.com/skyapi/",
    authType: "oauth",
  },

  gumroad: {
    id: "gumroad",
    name: "Gumroad",
    description: "E-commerce platform for digital creators",
    category: "e-commerce",
    capabilities: ["Sell Digital Products", "Manage Customers", "Analytics", "Affiliate Marketing"],
    scopes: ["view_profile", "edit_products", "view_sales"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GUMROAD_CLIENT_ID",
    requiresClientSecret: "GUMROAD_CLIENT_SECRET",
    color: "#FF90E8",
    docsUrl: "https://app.gumroad.com/api",
    authType: "oauth",
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
    description: "Manage your email, calendar, and contacts with Outlook",
    category: "communication",
    capabilities: ["Send Email", "Read Email", "Manage Calendar Events", "Organize Contacts"],
    scopes: ["User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite", "Contacts.ReadWrite"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    requiresClientSecret: "MICROSOFT_CLIENT_SECRET",
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
    scopes: ["User.Read", "Notes.ReadWrite.All"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    requiresClientSecret: "MICROSOFT_CLIENT_SECRET",
    color: "#7719AA",
    docsUrl: "https://learn.microsoft.com/en-us/graph/integrate-with-onenote",
    authType: "oauth",
  },

  kit: {
    id: "kit",
    name: "Kit",
    description: "The everything store for creators",
    category: "e-commerce",
    capabilities: ["Create Kits", "Share Products", "Earn Commissions"],
    scopes: [],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_KIT_CLIENT_ID",
    requiresClientSecret: "KIT_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://kit.co/developers",
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
