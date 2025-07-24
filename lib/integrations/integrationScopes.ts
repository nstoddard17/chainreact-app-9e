import { useIntegrationStore } from "@/stores/integrationStore"

// Add comprehensive scope definitions for all providers
export const INTEGRATION_SCOPES = {
  slack: {
    required: ["chat:write", "channels:read", "groups:write", "users:read", "team:read"],
    optional: ["files:read", "groups:read", "im:read", "mpim:read"],
  },
  discord: {
    required: ["identify", "guilds"],
    optional: ["guilds.join", "messages.read"],
  },
  github: {
    required: ["repo"],
    optional: ["read:org", "gist"],
  },
  google: {
    required: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
    optional: [],
  },
  gmail: {
    required: ["https://www.googleapis.com/auth/gmail.modify"],
    optional: ["https://www.googleapis.com/auth/gmail.readonly"],
  },
  "google-sheets": {
    required: ["https://www.googleapis.com/auth/spreadsheets"],
    optional: ["https://www.googleapis.com/auth/drive.readonly"],
  },
  "google-calendar": {
    required: ["https://www.googleapis.com/auth/calendar"],
    optional: ["https://www.googleapis.com/auth/calendar.events"],
  },
  "google-docs": {
    required: ["https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
    optional: ["https://www.googleapis.com/auth/drive.file"],
  },
  "google-drive": {
    required: ["https://www.googleapis.com/auth/drive"],
    optional: ["https://www.googleapis.com/auth/drive.file"],
  },
  youtube: {
    required: ["https://www.googleapis.com/auth/youtube.readonly"],
    optional: ["https://www.googleapis.com/auth/youtube.upload"],
  },
  notion: {
    required: [],
    optional: [],
  },
  trello: {
    required: ["read", "write"],
    optional: ["account"],
  },
  airtable: {
    required: ["data.records:read", "data.records:write"],
    optional: ["schema.bases:read"],
  },
  dropbox: {
    required: ["files.content.read", "files.content.write"],
    optional: ["sharing.read", "sharing.write"],
  },
  box: {
    required: ["root_readwrite", "manage_users", "manage_groups", "manage_webhooks", "enable_integrations"],
    optional: [],
  },
  twitter: {
    required: ["tweet.read", "users.read"],
    optional: ["tweet.write", "follows.read"],
  },
  linkedin: {
    required: [],
    optional: ["w_member_social"],
  },
  facebook: {
    required: ["public_profile"],
    optional: ["pages_manage_posts", "pages_read_engagement"],
  },
  instagram: {
    required: ["user_profile"],
    optional: ["user_media"],
  },
  tiktok: {
    required: ["user.info.basic"],
    optional: ["video.list", "video.upload"],
  },
  teams: {
    required: [
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Team.ReadBasic.All", 
      "https://graph.microsoft.com/Channel.ReadBasic.All",
      "https://graph.microsoft.com/Chat.Read",
      "https://graph.microsoft.com/Chat.ReadWrite",
      "https://graph.microsoft.com/ChatMessage.Send",
      "https://graph.microsoft.com/OnlineMeetings.ReadWrite",
      "https://graph.microsoft.com/TeamMember.Read.All",
      "https://graph.microsoft.com/TeamMember.ReadWrite.All",
      "https://graph.microsoft.com/Channel.Create",
      "https://graph.microsoft.com/Team.Create"
    ],
    optional: [],
  },
  onedrive: {
    required: ["User.Read", "Files.ReadWrite.All"],
    optional: [],
  },
  "microsoft-outlook": {
    required: [
      "User.Read",
      "Mail.Read",
      "Mail.ReadWrite", 
      "Mail.Send",
      "Calendars.Read",
      "Calendars.ReadWrite",
      "Contacts.Read",
      "Contacts.ReadWrite"
    ],
    optional: [],
  },
  "microsoft-onenote": {
    required: [
      "User.Read",
      "Notes.ReadWrite.All",
      "Files.Read"
    ],
    optional: [],
  },
  hubspot: {
    required: [
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.objects.contacts.read", 
      "crm.objects.contacts.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write"
    ],
    optional: [],
  },
  mailchimp: {
    required: ["basic_access"],
    optional: [],
  },
  shopify: {
    required: ["read_products"],
    optional: ["write_products", "read_orders"],
  },
  stripe: {
    required: [],
    optional: [],
  },
  paypal: {
    required: [],
    optional: [],
  },
  gitlab: {
    required: ["read_user", "read_api"],
    optional: ["read_repository"],
  },
  docker: {
    required: [],
    optional: [],
  },
} as const

export type IntegrationProvider = keyof typeof INTEGRATION_SCOPES

export function isKnownProvider(provider: string): provider is IntegrationProvider {
  return provider in INTEGRATION_SCOPES
}

export function getRequiredScopes(provider: string): string[] {
  if (!isKnownProvider(provider)) return []
  const scopes = INTEGRATION_SCOPES[provider]
  return scopes ? [...scopes.required] : []
}

export function getOptionalScopes(provider: string): string[] {
  if (!isKnownProvider(provider)) return []
  const scopes = INTEGRATION_SCOPES[provider]
  return scopes ? [...scopes.optional] : []
}

export function getAllScopes(provider: string): string[] {
  if (!isKnownProvider(provider)) return []
  const config = INTEGRATION_SCOPES[provider]
  if (!config) return []
  return [...config.required, ...config.optional]
}

export function validateScopes(
  provider: string,
  grantedScopes: string[],
): {
  valid: boolean
  missing: string[]
  granted: string[]
  status: "valid" | "invalid" | "partial"
} {
  const requiredScopes = getRequiredScopes(provider)
  const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
  const granted = grantedScopes.filter((scope) => requiredScopes.includes(scope))

  return {
    valid: missing.length === 0,
    missing,
    granted,
    status: (missing.length === 0
      ? "valid"
      : missing.length === requiredScopes.length
        ? "invalid"
        : "partial") as "valid" | "invalid" | "partial",
  }
}

export async function isComponentAvailable(
  providerId: string,
  requiredScopes: string[],
): Promise<boolean> {
  const { getIntegrationByProvider } = useIntegrationStore.getState()
  const integration = getIntegrationByProvider(providerId)

  if (!integration || integration.status !== "connected") {
    return false
  }

  const grantedScopes = integration.scopes || []
  return requiredScopes.every((scope) => grantedScopes.includes(scope))
}

function getRequiredEnvVars(provider: string): string[] {
  const envVarMap: Record<string, string[]> = {
    slack: ["NEXT_PUBLIC_SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    discord: ["NEXT_PUBLIC_DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
    github: ["NEXT_PUBLIC_GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    google: ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    gmail: ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-sheets": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-calendar": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-docs": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-drive": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    youtube: ["NEXT_PUBLIC_YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
    notion: ["NEXT_PUBLIC_NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
    trello: ["NEXT_PUBLIC_TRELLO_CLIENT_ID", "TRELLO_CLIENT_SECRET"],
    airtable: ["NEXT_PUBLIC_AIRTABLE_CLIENT_ID", "AIRTABLE_CLIENT_SECRET"],
    dropbox: ["NEXT_PUBLIC_DROPBOX_CLIENT_ID", "DROPBOX_CLIENT_SECRET"],
    box: ["NEXT_PUBLIC_BOX_CLIENT_ID", "BOX_CLIENT_SECRET"],
    twitter: ["NEXT_PUBLIC_TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
    linkedin: ["NEXT_PUBLIC_LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    facebook: ["NEXT_PUBLIC_FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
    instagram: ["NEXT_PUBLIC_INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"],
    tiktok: ["NEXT_PUBLIC_TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"],
    teams: ["NEXT_PUBLIC_TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET"],
    onedrive: ["NEXT_PUBLIC_ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET"],
    "microsoft-outlook": ["NEXT_PUBLIC_OUTLOOK_CLIENT_ID", "OUTLOOK_CLIENT_SECRET"],
    "microsoft-onenote": ["NEXT_PUBLIC_ONENOTE_CLIENT_ID", "ONENOTE_CLIENT_SECRET"],
    hubspot: ["NEXT_PUBLIC_HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"],
    mailchimp: ["NEXT_PUBLIC_MAILCHIMP_CLIENT_ID", "MAILCHIMP_CLIENT_SECRET"],
    shopify: ["NEXT_PUBLIC_SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
    stripe: ["NEXT_PUBLIC_STRIPE_CLIENT_ID", "STRIPE_CLIENT_SECRET"],
    paypal: ["NEXT_PUBLIC_PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
    gitlab: ["NEXT_PUBLIC_GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET"],
    docker: ["NEXT_PUBLIC_DOCKER_CLIENT_ID", "DOCKER_CLIENT_SECRET"],
  }

  if (!isKnownProvider(provider)) return []
  return envVarMap[provider] || []
}
