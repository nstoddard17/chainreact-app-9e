import { isSupabaseConfigured } from "@/lib/supabase"
import { validateEnvironmentVariables, isIntegrationConfigured } from "@/lib/integrations/integrationScopes"

export interface ConfigurationStatus {
  overall: "healthy" | "warning" | "error"
  supabase: {
    configured: boolean
    missing: string[]
  }
  integrations: {
    total: number
    configured: number
    available: string[]
    missing: Array<{
      provider: string
      missingVars: string[]
    }>
  }
  recommendations: string[]
}

export function checkConfiguration(): ConfigurationStatus {
  const supabaseConfigured = isSupabaseConfigured()
  const envValidation = validateEnvironmentVariables()

  // Check individual integrations
  const allProviders = [
    "slack",
    "discord",
    "github",
    "google",
    "gmail",
    "google-sheets",
    "google-calendar",
    "google-docs",
    "google-drive",
    "youtube",
    "notion",
    "trello",
    "airtable",
    "dropbox",
    "twitter",
    "linkedin",
    "facebook",
    "instagram",
    "tiktok",
    "teams",
    "onedrive",
    "hubspot",
    "mailchimp",
    "shopify",
    "stripe",
    "paypal",
    "gitlab",
    "docker",
  ]

  const configuredIntegrations = allProviders.filter((provider) => isIntegrationConfigured(provider))
  const missingIntegrations = allProviders
    .filter((provider) => !isIntegrationConfigured(provider))
    .map((provider) => ({
      provider,
      missingVars: getRequiredEnvVarsForProvider(provider).filter(
        (envVar) => !process.env[envVar] || process.env[envVar]?.trim() === "",
      ),
    }))

  const recommendations: string[] = []

  if (!supabaseConfigured) {
    recommendations.push("Set up Supabase environment variables for authentication")
  }

  if (configuredIntegrations.length === 0) {
    recommendations.push("Configure at least one integration provider (Slack, Google, GitHub, etc.)")
  }

  if (configuredIntegrations.length < 5) {
    recommendations.push("Consider adding more integration providers for better user experience")
  }

  const overall: ConfigurationStatus["overall"] = !supabaseConfigured
    ? "error"
    : configuredIntegrations.length === 0
      ? "error"
      : configuredIntegrations.length < 3
        ? "warning"
        : "healthy"

  return {
    overall,
    supabase: {
      configured: supabaseConfigured,
      missing: envValidation.missing.filter((v) => v.includes("SUPABASE")),
    },
    integrations: {
      total: allProviders.length,
      configured: configuredIntegrations.length,
      available: configuredIntegrations,
      missing: missingIntegrations,
    },
    recommendations,
  }
}

function getRequiredEnvVarsForProvider(provider: string): string[] {
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
    twitter: ["NEXT_PUBLIC_TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
    linkedin: ["NEXT_PUBLIC_LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    facebook: ["NEXT_PUBLIC_FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
    instagram: ["NEXT_PUBLIC_INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"],
    tiktok: ["NEXT_PUBLIC_TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"],
    teams: ["NEXT_PUBLIC_TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET"],
    onedrive: ["NEXT_PUBLIC_ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET"],
    hubspot: ["NEXT_PUBLIC_HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"],
    mailchimp: ["NEXT_PUBLIC_MAILCHIMP_CLIENT_ID", "MAILCHIMP_CLIENT_SECRET"],
    shopify: ["NEXT_PUBLIC_SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
    stripe: ["NEXT_PUBLIC_STRIPE_CLIENT_ID", "STRIPE_CLIENT_SECRET"],
    paypal: ["NEXT_PUBLIC_PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
    gitlab: ["NEXT_PUBLIC_GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET"],
    docker: ["NEXT_PUBLIC_DOCKER_CLIENT_ID", "DOCKER_CLIENT_SECRET"],
  }

  return envVarMap[provider] || []
}

// Development helper to log configuration status
export function logConfigurationStatus() {
  if (process.env.NODE_ENV === "development") {
    const status = checkConfiguration()
    console.log("🔧 Configuration Status:", status)
  }
}
