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
  logoUrl: string
  capabilities: string[]
  scopes: string[]
  isAvailable: boolean
  requiresClientId: string
  requiresClientSecret: string
  authUrl?: string
  tokenUrl?: string
  revokeUrl?: string
  color: string
  docsUrl?: string
}

// Complete integration configurations with all metadata
export const INTEGRATION_CONFIGS: Record<string, IntegrationConfig> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    description: "Send and manage emails through Gmail",
    category: "communication",
    logoUrl: "/integrations/gmail.svg",
    capabilities: ["Send Emails", "Read Emails", "Manage Labels", "Search"],
    scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#EA4335",
    docsUrl: "https://developers.google.com/gmail/api",
  },

  "google-calendar": {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage events and schedules in Google Calendar",
    category: "productivity",
    logoUrl: "/integrations/google-calendar.svg",
    capabilities: ["Create Events", "Read Events", "Update Events", "Delete Events"],
    scopes: ["https://www.googleapis.com/auth/calendar"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#4285F4",
    docsUrl: "https://developers.google.com/calendar/api",
  },

  "google-drive": {
    id: "google-drive",
    name: "Google Drive",
    description: "Access and manage files in Google Drive",
    category: "storage",
    logoUrl: "/integrations/google-drive.svg",
    capabilities: ["Upload Files", "Download Files", "Share Files", "Organize Folders"],
    scopes: ["https://www.googleapis.com/auth/drive"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#4285F4",
    docsUrl: "https://developers.google.com/drive/api",
  },

  "google-sheets": {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Create and manage spreadsheets in Google Sheets",
    category: "productivity",
    logoUrl: "/integrations/google-sheets.svg",
    capabilities: ["Read Spreadsheets", "Write Data", "Create Sheets", "Format Cells"],
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#34A853",
    docsUrl: "https://developers.google.com/sheets/api",
  },

  "google-docs": {
    id: "google-docs",
    name: "Google Docs",
    description: "Create and edit documents in Google Docs",
    category: "productivity",
    logoUrl: "/integrations/google-docs.svg",
    capabilities: ["Create Documents", "Edit Documents", "Share Documents", "Export"],
    scopes: ["https://www.googleapis.com/auth/documents"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    requiresClientSecret: "GOOGLE_CLIENT_SECRET",
    color: "#4285F4",
    docsUrl: "https://developers.google.com/docs/api",
  },

  youtube: {
    id: "youtube",
    name: "YouTube",
    description: "Manage YouTube channels and videos",
    category: "social",
    logoUrl: "/integrations/youtube.svg",
    capabilities: ["Upload Videos", "Manage Playlists", "Analytics", "Comments"],
    scopes: ["https://www.googleapis.com/auth/youtube"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_YOUTUBE_CLIENT_ID",
    requiresClientSecret: "YOUTUBE_CLIENT_SECRET",
    color: "#FF0000",
    docsUrl: "https://developers.google.com/youtube/v3",
  },

  // Microsoft Services
  teams: {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate and communicate through Microsoft Teams",
    category: "communication",
    logoUrl: "/integrations/teams.svg",
    capabilities: ["Send Messages", "Create Meetings", "File Sharing", "Notifications"],
    scopes: ["User.Read", "Chat.ReadWrite"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_TEAMS_CLIENT_ID",
    requiresClientSecret: "TEAMS_CLIENT_SECRET",
    color: "#6264A7",
    docsUrl: "https://docs.microsoft.com/en-us/graph/api/resources/teams-api-overview",
  },

  onedrive: {
    id: "onedrive",
    name: "OneDrive",
    description: "Store and sync files with Microsoft OneDrive",
    category: "storage",
    logoUrl: "/integrations/onedrive.svg",
    capabilities: ["File Storage", "File Sync", "Sharing", "Collaboration"],
    scopes: ["Files.Read", "Files.ReadWrite"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_ONEDRIVE_CLIENT_ID",
    requiresClientSecret: "ONEDRIVE_CLIENT_SECRET",
    color: "#0078D4",
    docsUrl: "https://docs.microsoft.com/en-us/onedrive/developer/",
  },

  // Communication Platforms
  slack: {
    id: "slack",
    name: "Slack",
    description: "Team communication and collaboration platform",
    category: "communication",
    logoUrl: "/integrations/slack.svg",
    capabilities: ["Send Messages", "Create Channels", "File Sharing", "Notifications"],
    scopes: ["chat:write", "channels:read", "users:read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_SLACK_CLIENT_ID",
    requiresClientSecret: "SLACK_CLIENT_SECRET",
    color: "#4A154B",
    docsUrl: "https://api.slack.com/",
  },

  discord: {
    id: "discord",
    name: "Discord",
    description: "Voice, video and text communication for communities",
    category: "communication",
    logoUrl: "/integrations/discord.svg",
    capabilities: ["Send Messages", "Voice Chat", "Server Management", "Bots"],
    scopes: ["identify", "guilds", "bot"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_DISCORD_CLIENT_ID",
    requiresClientSecret: "DISCORD_CLIENT_SECRET",
    color: "#5865F2",
    docsUrl: "https://discord.com/developers/docs",
  },

  // Social Media
  twitter: {
    id: "twitter",
    name: "Twitter",
    description: "Share updates and engage with your Twitter audience",
    category: "social",
    logoUrl: "/integrations/twitter.svg",
    capabilities: ["Post Tweets", "Read Timeline", "Manage Followers", "Analytics"],
    scopes: ["tweet.read", "tweet.write", "users.read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_TWITTER_CLIENT_ID",
    requiresClientSecret: "TWITTER_CLIENT_SECRET",
    color: "#1DA1F2",
    docsUrl: "https://developer.twitter.com/en/docs",
  },

  facebook: {
    id: "facebook",
    name: "Facebook",
    description: "Manage Facebook pages and social media presence",
    category: "social",
    logoUrl: "/integrations/facebook.svg",
    capabilities: ["Post Updates", "Manage Pages", "Analytics", "Advertising"],
    scopes: ["public_profile", "pages_manage_posts"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_FACEBOOK_CLIENT_ID",
    requiresClientSecret: "FACEBOOK_CLIENT_SECRET",
    color: "#1877F2",
    docsUrl: "https://developers.facebook.com/docs",
  },

  instagram: {
    id: "instagram",
    name: "Instagram",
    description: "Share photos and stories on Instagram",
    category: "social",
    logoUrl: "/integrations/instagram.svg",
    capabilities: ["Post Photos", "Stories", "Analytics", "Comments"],
    scopes: ["user_profile", "user_media"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_INSTAGRAM_CLIENT_ID",
    requiresClientSecret: "INSTAGRAM_CLIENT_SECRET",
    color: "#E4405F",
    docsUrl: "https://developers.facebook.com/docs/instagram",
  },

  tiktok: {
    id: "tiktok",
    name: "TikTok",
    description: "Create and share short-form videos on TikTok",
    category: "social",
    logoUrl: "/integrations/tiktok.svg",
    capabilities: ["Upload Videos", "Analytics", "User Info", "Video Management"],
    scopes: ["user.info.basic", "video.list"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_TIKTOK_CLIENT_ID",
    requiresClientSecret: "TIKTOK_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developers.tiktok.com/",
  },

  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    description: "Professional networking and content sharing",
    category: "social",
    logoUrl: "/integrations/linkedin.svg",
    capabilities: ["Post Updates", "Network", "Company Pages", "Analytics"],
    scopes: ["r_liteprofile", "w_member_social"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_LINKEDIN_CLIENT_ID",
    requiresClientSecret: "LINKEDIN_CLIENT_SECRET",
    color: "#0A66C2",
    docsUrl: "https://docs.microsoft.com/en-us/linkedin/",
  },

  // Development & Productivity
  github: {
    id: "github",
    name: "GitHub",
    description: "Code hosting and version control with Git",
    category: "development",
    logoUrl: "/integrations/github.svg",
    capabilities: ["Repository Management", "Issues", "Pull Requests", "Actions"],
    scopes: ["repo", "user", "read:org"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GITHUB_CLIENT_ID",
    requiresClientSecret: "GITHUB_CLIENT_SECRET",
    color: "#181717",
    docsUrl: "https://docs.github.com/en/developers",
  },

  gitlab: {
    id: "gitlab",
    name: "GitLab",
    description: "DevOps platform for the entire software development lifecycle",
    category: "development",
    logoUrl: "/integrations/gitlab.svg",
    capabilities: ["Repository Management", "CI/CD", "Issue Tracking", "Merge Requests"],
    scopes: ["read_user", "read_api", "read_repository"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_GITLAB_CLIENT_ID",
    requiresClientSecret: "GITLAB_CLIENT_SECRET",
    color: "#FC6D26",
    docsUrl: "https://docs.gitlab.com/ee/api/",
  },

  docker: {
    id: "docker",
    name: "Docker Hub",
    description: "Container registry and image management",
    category: "development",
    logoUrl: "/integrations/docker.svg",
    capabilities: ["Image Management", "Repository Access", "Webhooks", "Analytics"],
    scopes: ["repo:read", "repo:write"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_DOCKER_CLIENT_ID",
    requiresClientSecret: "DOCKER_CLIENT_SECRET",
    color: "#2496ED",
    docsUrl: "https://docs.docker.com/docker-hub/api/latest/",
  },

  notion: {
    id: "notion",
    name: "Notion",
    description: "All-in-one workspace for notes, docs, and collaboration",
    category: "productivity",
    logoUrl: "/integrations/notion.svg",
    capabilities: ["Page Management", "Database Access", "Content Creation", "Collaboration"],
    scopes: ["read_content", "insert_content", "update_content"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_NOTION_CLIENT_ID",
    requiresClientSecret: "NOTION_CLIENT_SECRET",
    color: "#000000",
    docsUrl: "https://developers.notion.com/",
  },

  trello: {
    id: "trello",
    name: "Trello",
    description: "Visual project management with boards and cards",
    category: "productivity",
    logoUrl: "/integrations/trello.svg",
    capabilities: ["Board Management", "Card Creation", "List Organization", "Team Collaboration"],
    scopes: ["read", "write", "account"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_TRELLO_CLIENT_ID",
    requiresClientSecret: "TRELLO_CLIENT_SECRET",
    color: "#0079BF",
    docsUrl: "https://developer.atlassian.com/cloud/trello/",
  },

  // Business & CRM
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    description: "Customer relationship management and marketing automation",
    category: "business",
    logoUrl: "/integrations/hubspot.svg",
    capabilities: ["Contact Management", "Deal Tracking", "Email Marketing", "Analytics"],
    scopes: ["crm.objects.contacts.read", "crm.objects.deals.read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_HUBSPOT_CLIENT_ID",
    requiresClientSecret: "HUBSPOT_CLIENT_SECRET",
    color: "#FF7A59",
    docsUrl: "https://developers.hubspot.com/",
  },

  airtable: {
    id: "airtable",
    name: "Airtable",
    description: "Database and spreadsheet hybrid for organizing data",
    category: "productivity",
    logoUrl: "/integrations/airtable.svg",
    capabilities: ["Database Management", "Record Creation", "Field Updates", "Collaboration"],
    scopes: ["data.records:read", "data.records:write", "schema.bases:read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_AIRTABLE_CLIENT_ID",
    requiresClientSecret: "AIRTABLE_CLIENT_SECRET",
    color: "#18BFFF",
    docsUrl: "https://airtable.com/developers/web/api/introduction",
  },

  mailchimp: {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing and automation platform",
    category: "business",
    logoUrl: "/integrations/mailchimp.svg",
    capabilities: ["Email Campaigns", "Audience Management", "Automation", "Analytics"],
    scopes: ["basic_access"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_MAILCHIMP_CLIENT_ID",
    requiresClientSecret: "MAILCHIMP_CLIENT_SECRET",
    color: "#FFE01B",
    docsUrl: "https://mailchimp.com/developer/",
  },

  // E-commerce & Payments
  shopify: {
    id: "shopify",
    name: "Shopify",
    description: "E-commerce platform for online stores",
    category: "ecommerce",
    logoUrl: "/integrations/shopify.svg",
    capabilities: ["Product Management", "Order Processing", "Inventory", "Analytics"],
    scopes: ["read_products", "write_products", "read_orders"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_SHOPIFY_CLIENT_ID",
    requiresClientSecret: "SHOPIFY_CLIENT_SECRET",
    color: "#7AB55C",
    docsUrl: "https://shopify.dev/",
  },

  paypal: {
    id: "paypal",
    name: "PayPal",
    description: "Online payment processing and money transfers",
    category: "payments",
    logoUrl: "/integrations/paypal.svg",
    capabilities: ["Payment Processing", "Transaction History", "Invoicing", "Subscriptions"],
    scopes: ["openid", "profile", "email"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
    requiresClientSecret: "PAYPAL_CLIENT_SECRET",
    color: "#003087",
    docsUrl: "https://developer.paypal.com/",
  },

  stripe: {
    id: "stripe",
    name: "Stripe",
    description: "Online payment processing for businesses",
    category: "payments",
    logoUrl: "/integrations/stripe.svg",
    capabilities: ["Payment Processing", "Subscription Management", "Analytics", "Webhooks"],
    scopes: ["read_write"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_STRIPE_CLIENT_ID",
    requiresClientSecret: "STRIPE_CLIENT_SECRET",
    color: "#635BFF",
    docsUrl: "https://stripe.com/docs/api",
  },

  // Cloud Storage
  dropbox: {
    id: "dropbox",
    name: "Dropbox",
    description: "Cloud storage and file synchronization service",
    category: "storage",
    logoUrl: "/integrations/dropbox.svg",
    capabilities: ["File Storage", "File Sharing", "Synchronization", "Collaboration"],
    scopes: ["files.content.read", "files.content.write", "sharing.read"],
    isAvailable: false,
    requiresClientId: "NEXT_PUBLIC_DROPBOX_CLIENT_ID",
    requiresClientSecret: "DROPBOX_CLIENT_SECRET",
    color: "#0061FF",
    docsUrl: "https://www.dropbox.com/developers",
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
