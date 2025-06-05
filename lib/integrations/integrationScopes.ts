export interface IntegrationScope {
  scope: string
  description: string
  required: boolean
}

export interface IntegrationScopeConfig {
  provider: string
  scopes: IntegrationScope[]
  components: {
    [componentType: string]: string[]
  }
}

export const INTEGRATION_SCOPES: Record<string, IntegrationScopeConfig> = {
    slack: {
        provider: "slack",
        scopes: [
            { scope: "channels:read", description: "View channels in workspace", required: true },
            { scope: "chat:write", description: "Send messages", required: true },
            { scope: "files:write", description: "Upload files", required: true },
            { scope: "reactions:write", description: "Add reactions to messages", required: true },
            { scope: "users:read", description: "View people in workspace", required: false },
            { scope: "channels:history", description: "View messages in channels", required: false },
            { scope: "groups:read", description: "View private channels", required: false },
            { scope: "im:read", description: "View direct messages", required: false },
            { scope: "mpim:read", description: "View group direct messages", required: false },
        ],
        components: {
            "slack-send-message": ["channels:read", "chat:write"],
            "slack-upload-file": ["files:write"],
            "slack-add-reaction": ["reactions:write"],
            "slack-get-channels": ["channels:read"],
            "slack-get-users": ["users:read"],
            "slack-get-messages": ["channels:history"],
        },
    },
    google: {
        provider: "google",
        scopes: [
            {
                scope: "https://www.googleapis.com/auth/userinfo.email",
                description: "View email address",
                required: true,
            },
            {
                scope: "https://www.googleapis.com/auth/userinfo.profile",
                description: "View basic profile info",
                required: true,
            },
            {
                scope: "https://www.googleapis.com/auth/gmail.send",
                description: "Send emails",
                required: false,
            },
            {
                scope: "https://www.googleapis.com/auth/gmail.readonly",
                description: "Read emails",
                required: false,
            },
            {
                scope: "https://www.googleapis.com/auth/gmail.modify",
                description: "Read and modify emails",
                required: false,
            },
            {
                scope: "https://www.googleapis.com/auth/drive",
                description: "Full access to Google Drive",
                required: false,
            },
            {
                scope: "https://www.googleapis.com/auth/drive.file",
                description: "View and manage Google Drive files created by this app",
                required: false,
            },
            {
                scope: "https://www.googleapis.com/auth/calendar",
                description: "View and manage calendar",
                required: false,
            },
            {
                scope: "https://www.googleapis.com/auth/calendar.events",
                description: "View and edit calendar events",
                required: false,
            },
            {
                scope: "https://www.googleapis.com/auth/spreadsheets",
                description: "View and edit Google Sheets",
                required: false,
            },
        ],
        components: {
            "gmail-send-email": ["https://www.googleapis.com/auth/gmail.send"],
            "gmail-read-emails": ["https://www.googleapis.com/auth/gmail.readonly"],
            "gmail-modify-emails": ["https://www.googleapis.com/auth/gmail.modify"],
            "drive-upload-file": ["https://www.googleapis.com/auth/drive.file"],
            "drive-full-access": ["https://www.googleapis.com/auth/drive"],
            "calendar-read-events": ["https://www.googleapis.com/auth/calendar"],
            "calendar-create-event": ["https://www.googleapis.com/auth/calendar.events"],
            "sheets-read-data": ["https://www.googleapis.com/auth/spreadsheets"],
            "sheets-write-data": ["https://www.googleapis.com/auth/spreadsheets"],
        },
    },
    discord: {
        provider: "discord",
        scopes: [
            { scope: "identify", description: "Access basic account info", required: true },
            { scope: "bot", description: "Add bot to server", required: true },
            { scope: "applications.commands", description: "Create slash commands", required: true },
            { scope: "guilds", description: "View servers", required: false },
            { scope: "guilds.join", description: "Join servers for you", required: false },
            { scope: "messages.read", description: "Read message history", required: false },
        ],
        components: {
            "discord-send-message": ["bot"],
            "discord-create-command": ["applications.commands"],
            "discord-get-guilds": ["guilds"],
            "discord-join-guild": ["guilds.join"],
            "discord-read-messages": ["messages.read"],
        },
    },
  github: {
    provider: "github",
    scopes: [
      { scope: "user:email", description: "Access user email addresses", required: true },
      { scope: "repo", description: "Full control of private repositories", required: false },
      { scope: "public_repo", description: "Access public repositories", required: false },
      { scope: "gist", description: "Create gists", required: false },
      { scope: "notifications", description: "Access notifications", required: false },
    ],
    components: {
      "github-create-repo": ["repo"],
      "github-create-issue": ["repo", "public_repo"],
      "github-create-gist": ["gist"],
      "github-get-notifications": ["notifications"],
    },
  },
  dropbox: {
    provider: "dropbox",
    scopes: [
      { scope: "account_info.read", description: "View account information", required: true },
      { scope: "files.metadata.write", description: "Edit file and folder metadata", required: false },
      { scope: "files.metadata.read", description: "View file and folder metadata", required: false },
      { scope: "files.content.write", description: "Edit file contents", required: false },
      { scope: "files.content.read", description: "View file contents", required: false },
    ],
    components: {
      "dropbox-upload-file": ["files.content.write"],
      "dropbox-download-file": ["files.content.read"],
      "dropbox-list-files": ["files.metadata.read"],
      "dropbox-create-folder": ["files.metadata.write"],
    },
    },
    notion: {
        provider: "notion",
        scopes: [
            { scope: "read", description: "Read workspace content", required: true },
            { scope: "insert", description: "Create pages and databases", required: true },
            { scope: "update", description: "Update existing pages and blocks", required: false },
            { scope: "delete", description: "Delete pages and databases", required: false },
        ],
        components: {
            "notion-create-page": ["insert"],
            "notion-read-page": ["read"],
            "notion-update-page": ["update"],
            "notion-delete-page": ["delete"],
        },
    },
    airtable: {
        provider: "airtable",
        scopes: [
            { scope: "data.records:read", description: "Read records from Airtable bases", required: true },
            { scope: "data.records:write", description: "Write records to Airtable bases", required: true },
            { scope: "schema.bases:read", description: "Read Airtable base schema", required: true },
            { scope: "schema.bases:write", description: "Write Airtable base schema", required: false },
        ],
        components: {
            "airtable-read-records": ["data.records:read"],
            "airtable-write-records": ["data.records:write"],
            "airtable-read-schema": ["schema.bases:read"],
            "airtable-write-schema": ["schema.bases:write"],
        },
    },
    teams: {
        provider: "teams",
        scopes: [
            { scope: "openid", description: "Authenticate with Microsoft", required: true },
            { scope: "profile", description: "Access basic profile info", required: true },
            { scope: "email", description: "Access email address", required: true },
            { scope: "offline_access", description: "Allow offline access (refresh tokens)", required: true },
            { scope: "User.Read", description: "Read user profile", required: true },
            { scope: "ChannelMessage.Send", description: "Send messages in channels", required: false },
            { scope: "Chat.ReadWrite", description: "Read and write chat messages", required: false },
            { scope: "Team.ReadBasic.All", description: "Read basic info about teams", required: false },
        ],
        components: {
            "teams-send-message": ["ChannelMessage.Send"],
            "teams-read-write-chat": ["Chat.ReadWrite"],
            "teams-get-teams": ["Team.ReadBasic.All"],
        },
    },
    trello: {
        provider: "trello",
        scopes: [
            { scope: "read", description: "Read boards, cards, and workspaces", required: true },
            { scope: "write", description: "Create and update cards, boards, and lists", required: true },
            { scope: "account", description: "Access account info", required: true },
        ],
        components: {
            "trello-read-board": ["read"],
            "trello-create-card": ["write"],
            "trello-update-card": ["write"],
            "trello-get-user": ["account"],
        },
    },
    facebook: {
        provider: "facebook",
        scopes: [
            { scope: "public_profile", description: "Access public profile information", required: true },
            { scope: "email", description: "Access your email address", required: true },
            { scope: "pages_show_list", description: "Show list of managed Facebook Pages", required: true },
            { scope: "pages_manage_posts", description: "Create and manage posts for Pages", required: false },
            { scope: "pages_read_engagement", description: "Read engagement metrics from Pages", required: false },
            { scope: "pages_manage_metadata", description: "Manage Page settings and metadata", required: false },
        ],
        components: {
            "facebook-post-to-page": ["pages_manage_posts"],
            "facebook-read-page-engagement": ["pages_read_engagement"],
            "facebook-get-pages": ["pages_show_list"],
        },
    },
    youtube: {
        provider: "youtube",
        scopes: [
            {
                scope: "https://www.googleapis.com/auth/youtube.upload",
                description: "Upload videos to your YouTube channel",
                required: true,
            },
            {
                scope: "https://www.googleapis.com/auth/youtube.readonly",
                description: "View your YouTube account",
                required: false,
            },
        ],
        components: {
            "youtube-upload-video": ["https://www.googleapis.com/auth/youtube.upload"],
            "youtube-get-channel": ["https://www.googleapis.com/auth/youtube.readonly"],
        },
    },
}

export function getRequiredScopes(provider: string): string[] {
  const config = INTEGRATION_SCOPES[provider]
  if (!config) return []

  return config.scopes.filter((scope) => scope.required).map((scope) => scope.scope)
}

export function getOptionalScopes(provider: string): string[] {
  const config = INTEGRATION_SCOPES[provider]
  if (!config) return []

  return config.scopes.filter((scope) => !scope.required).map((scope) => scope.scope)
}

export function getAllScopes(provider: string): string[] {
  const config = INTEGRATION_SCOPES[provider]
  if (!config) return []

  return config.scopes.map((scope) => scope.scope)
}

export function getComponentScopes(provider: string, componentType: string): string[] {
  const config = INTEGRATION_SCOPES[provider]
  if (!config || !config.components[componentType]) return []

  return config.components[componentType]
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

  let status: "valid" | "invalid" | "partial"
  if (missing.length === 0) {
    status = "valid"
  } else if (missing.length === requiredScopes.length) {
    status = "invalid"
  } else {
    status = "partial"
  }

  return {
    valid: missing.length === 0,
    missing,
    granted: grantedScopes,
    status,
  }
}

export function canUseComponent(provider: string, componentType: string, grantedScopes: string[]): boolean {
  const requiredScopes = getComponentScopes(provider, componentType)
  return requiredScopes.every((scope) => grantedScopes.includes(scope))
}

export function getScopeDescription(provider: string, scope: string): string {
  const config = INTEGRATION_SCOPES[provider]
  if (!config) return scope

  const scopeConfig = config.scopes.find((s) => s.scope === scope)
  return scopeConfig?.description || scope
}

export function isRequiredScope(provider: string, scope: string): boolean {
  const config = INTEGRATION_SCOPES[provider]
  if (!config) return false

  const scopeConfig = config.scopes.find((s) => s.scope === scope)
  return scopeConfig?.required || false
}

/**
 * Determines if a component is available based on granted scopes
 *
 * @param provider The integration provider (e.g., "slack", "google")
 * @param componentId The component identifier (e.g., "slack-send-message")
 * @param grantedScopes Array of scopes granted by the OAuth provider
 * @returns Boolean indicating if the component is available
 */
export function isComponentAvailable(provider: string, componentId: string, grantedScopes: string[]): boolean {
  return canUseComponent(provider, componentId, grantedScopes)
}

/**
 * Generates the OAuth URL with all required scopes for a provider
 *
 * @param provider The integration provider (e.g., "slack", "google")
 * @param baseUrl The base URL for the OAuth redirect
 * @param state OAuth state parameter
 * @returns The complete OAuth URL with all required scopes
 */
export function generateOAuthUrlWithScopes(provider: string, baseUrl: string, state: string): string | null {
  const allScopes = getAllScopes(provider)
  if (!allScopes.length) return null

  const redirectUri = `${baseUrl}/api/integrations/${provider}/callback`

  switch (provider) {
    case "slack":
      if (process.env.NEXT_PUBLIC_SLACK_CLIENT_ID) {
        const scopesParam = allScopes.join(",")
        return `https://slack.com/oauth/v2/authorize?client_id=${
          process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
        }&scope=${scopesParam}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
      }
      break
    case "google":
      if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        const scopesParam = allScopes.join(" ")
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        }&redirect_uri=${encodeURIComponent(
          redirectUri,
        )}&scope=${encodeURIComponent(scopesParam)}&response_type=code&state=${state}&access_type=offline&prompt=consent`
      }
      break
    case "discord":
      if (process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID) {
        const scopesParam = allScopes.join(" ")
        return `https://discord.com/api/oauth2/authorize?client_id=${
          process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
        }&redirect_uri=${encodeURIComponent(
          redirectUri,
        )}&response_type=code&scope=${encodeURIComponent(scopesParam)}&state=${state}`
      }
      break
    case "github":
      if (process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID) {
        const scopesParam = allScopes.join(" ")
        return `https://github.com/login/oauth/authorize?client_id=${
          process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
        }&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopesParam)}&state=${state}`
      }
      break
    case "dropbox":
      if (process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID) {
        return `https://www.dropbox.com/oauth2/authorize?client_id=${
          process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
        }&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`
      }
          break
      case "notion":
          if (process.env.NEXT_PUBLIC_NOTION_CLIENT_ID) {
              const scopesParam = allScopes.join(" ");
              return `https://api.notion.com/v1/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(
                      redirectUri,
                  )}&response_type=code&owner=user&scope=${encodeURIComponent(scopesParam)}&state=${state}`;
          }
          break;
      case "airtable":
          if (process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID) {
              const scopesParam = allScopes.join(" ");
              return `https://airtable.com/oauth2/v1/authorize?client_id=${process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
                      scopesParam,
                  )}&state=${state}`;
          }
          break;
      case "teams":
          if (process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID) {
              const scopesParam = allScopes.join(" ")
              return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(
                      redirectUri
                  )}&response_type=code&scope=${encodeURIComponent(
                      scopesParam
                  )}&response_mode=query&access_type=offline&prompt=consent&state=${state}`
          }
          break
      case "trello":
          if (process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID) {
              const scopesParam = getAllScopes("trello").join(",")
              return `https://trello.com/1/authorize?expiration=never&name=ChainReactApp&scope=${scopesParam}&response_type=token&client_id=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
          }
          break
      case "facebook":
          if (process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID) {
              const scopesParam = allScopes.join(",")
              return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopesParam)}&response_type=code`
          }
          break
      case "youtube":
          if (process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID) {
              const scopesParam = allScopes.join(" ")
              return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(
                      redirectUri
                  )}&scope=${encodeURIComponent(scopesParam)}&response_type=code&state=${state}&access_type=offline&prompt=consent`
          }
          break

    // Add other providers as needed
  }

  return null
}
