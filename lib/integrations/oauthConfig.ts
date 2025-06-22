/**
 * Central configuration for OAuth providers
 * This file contains the configuration for all OAuth providers
 * and serves as a single source of truth for token refresh endpoints and parameters
 */

export interface OAuthProviderConfig {
  // Provider identifier
  id: string;
  // Display name
  name: string;
  // Environment variable names for client credentials
  clientIdEnv: string;
  clientSecretEnv: string;
  // Endpoints
  authEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint?: string;
  // OAuth configuration
  refreshRequiresClientAuth: boolean; // Whether client_id/client_secret needed during refresh
  authMethod: "body" | "basic" | "header"; // Where to send client auth (in body, basic auth, or header)
  refreshTokenExpirationSupported: boolean; // Whether this provider's refresh tokens expire
  // Token refresh settings
  accessTokenExpiryBuffer: number; // Minutes before expiry to refresh
  refreshTokenExpiryBuffer?: number; // Minutes before expiry to refresh (for refresh tokens that expire)
  sendScopeWithRefresh?: boolean; // Whether to include the scope parameter during token refresh
  sendClientIdWithRefresh?: boolean; // Whether to also send client_id in the body during refresh
  sendRedirectUriWithRefresh?: boolean; // Whether to send the redirect_uri during token refresh
  redirectUriPath?: string; // The path for the redirect URI (e.g., /api/integrations/callback)
  // Custom parameters for token refresh
  additionalRefreshParams?: Record<string, string>;
  // When a refresh happens, should we update scopes in the database?
  updateScopes?: boolean;
}

/**
 * Map of provider IDs to their OAuth configurations
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    id: "google",
    name: "Google",
    clientIdEnv: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revokeEndpoint: "https://oauth2.googleapis.com/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false, // Google refresh tokens don't expire unless revoked
    accessTokenExpiryBuffer: 30, // Refresh 30 minutes before expiry
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/google/callback",
  },
  gmail: {
    id: "gmail",
    name: "Gmail",
    clientIdEnv: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revokeEndpoint: "https://oauth2.googleapis.com/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/gmail/callback",
  },
  "google-calendar": {
    id: "google-calendar",
    name: "Google Calendar",
    clientIdEnv: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revokeEndpoint: "https://oauth2.googleapis.com/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "body", 
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/google-calendar/callback",
  },
  "google-drive": {
    id: "google-drive",
    name: "Google Drive",
    clientIdEnv: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revokeEndpoint: "https://oauth2.googleapis.com/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/google-drive/callback",
  },
  "google-sheets": {
    id: "google-sheets",
    name: "Google Sheets",
    clientIdEnv: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revokeEndpoint: "https://oauth2.googleapis.com/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/google-sheets/callback",
  },
  "google-docs": {
    id: "google-docs",
    name: "Google Docs",
    clientIdEnv: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    revokeEndpoint: "https://oauth2.googleapis.com/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/google-docs/callback",
  },
  github: {
    id: "github",
    name: "GitHub",
    clientIdEnv: "NEXT_PUBLIC_GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    authEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: true,
    accessTokenExpiryBuffer: 30,
    refreshTokenExpiryBuffer: 60, // Refresh 1 hour before expiry
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/github/callback",
  },
  microsoft: {
    id: "microsoft",
    name: "Microsoft",
    clientIdEnv: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    authEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendScopeWithRefresh: true,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/microsoft/callback",
  },
  onedrive: {
    id: "onedrive",
    name: "OneDrive",
    clientIdEnv: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    authEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendScopeWithRefresh: true,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/onedrive/callback",
  },
  slack: {
    id: "slack",
    name: "Slack",
    clientIdEnv: "NEXT_PUBLIC_SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    authEndpoint: "https://slack.com/oauth/v2/authorize",
    tokenEndpoint: "https://slack.com/api/oauth.v2.access",
    revokeEndpoint: "https://slack.com/api/auth.revoke",
    refreshRequiresClientAuth: true,
    authMethod: "basic",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 15, // Refresh 15 minutes before expiry
    sendScopeWithRefresh: true,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/slack/callback",
  },
  dropbox: {
    id: "dropbox",
    name: "Dropbox",
    clientIdEnv: "NEXT_PUBLIC_DROPBOX_CLIENT_ID",
    clientSecretEnv: "DROPBOX_CLIENT_SECRET",
    authEndpoint: "https://www.dropbox.com/oauth2/authorize",
    tokenEndpoint: "https://api.dropboxapi.com/oauth2/token",
    revokeEndpoint: "https://api.dropboxapi.com/2/auth/token/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "basic",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 15,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/dropbox/callback",
  },
  twitter: {
    id: "twitter",
    name: "Twitter",
    clientIdEnv: "NEXT_PUBLIC_TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    authEndpoint: "https://twitter.com/i/oauth2/authorize",
    tokenEndpoint: "https://api.twitter.com/2/oauth2/token",
    revokeEndpoint: "https://api.twitter.com/2/oauth2/revoke",
    refreshRequiresClientAuth: true,
    authMethod: "basic",
    sendClientIdWithRefresh: true,
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendScopeWithRefresh: true,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/twitter/callback",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    clientIdEnv: "NEXT_PUBLIC_FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
    authEndpoint: "https://www.facebook.com/v14.0/dialog/oauth",
    tokenEndpoint: "https://graph.facebook.com/v14.0/oauth/access_token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 15,
    // Facebook long-lived tokens last 60 days
    additionalRefreshParams: {
      grant_type: "fb_exchange_token",
      fb_exchange_token: "PLACEHOLDER", // Will be replaced with the actual token
    },
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/facebook/callback",
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    clientIdEnv: "NEXT_PUBLIC_LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    authEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
    tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 15,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/linkedin/callback",
  },
  discord: {
    id: "discord",
    name: "Discord",
    clientIdEnv: "NEXT_PUBLIC_DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
    authEndpoint: "https://discord.com/api/oauth2/authorize",
    tokenEndpoint: "https://discord.com/api/oauth2/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 15,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/discord/callback",
  },
  spotify: {
    id: "spotify",
    name: "Spotify",
    clientIdEnv: "NEXT_PUBLIC_SPOTIFY_CLIENT_ID",
    clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
    authEndpoint: "https://accounts.spotify.com/authorize",
    tokenEndpoint: "https://accounts.spotify.com/api/token",
    refreshRequiresClientAuth: true,
    authMethod: "basic",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 15,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/spotify/callback",
  },
  trello: {
    id: "trello",
    name: "Trello",
    clientIdEnv: "NEXT_PUBLIC_TRELLO_CLIENT_ID",
    clientSecretEnv: "TRELLO_CLIENT_SECRET",
    authEndpoint: "https://trello.com/1/authorize",
    tokenEndpoint: "https://trello.com/1/OAuthGetAccessToken",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 15,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/trello/callback",
  },
  "microsoft-onenote": {
    id: "microsoft-onenote",
    name: "Microsoft OneNote",
    clientIdEnv: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    authEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendScopeWithRefresh: true,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/microsoft-onenote/callback",
  },
  "microsoft-outlook": {
    id: "microsoft-outlook",
    name: "Microsoft Outlook",
    clientIdEnv: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    authEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendScopeWithRefresh: true,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/microsoft-outlook/callback",
  },
  teams: {
    id: "teams",
    name: "Microsoft Teams",
    clientIdEnv: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    authEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendScopeWithRefresh: true,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/teams/callback",
  },
  hubspot: {
    id: "hubspot",
    name: "HubSpot",
    clientIdEnv: "NEXT_PUBLIC_HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    authEndpoint: "https://app.hubspot.com/oauth/authorize",
    tokenEndpoint: "https://api.hubapi.com/oauth/v1/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/hubspot/callback",
  },
  airtable: {
    id: "airtable",
    name: "Airtable",
    clientIdEnv: "NEXT_PUBLIC_AIRTABLE_CLIENT_ID",
    clientSecretEnv: "AIRTABLE_CLIENT_SECRET",
    authEndpoint: "https://airtable.com/oauth2/v1/authorize",
    tokenEndpoint: "https://airtable.com/oauth2/v1/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/airtable/callback",
  },
  "youtube-studio": {
    id: "youtube-studio",
    name: "YouTube Studio",
    clientIdEnv: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/youtube-studio/callback",
  },
  gitlab: {
    id: "gitlab",
    name: "GitLab",
    clientIdEnv: "NEXT_PUBLIC_GITLAB_CLIENT_ID",
    clientSecretEnv: "GITLAB_CLIENT_SECRET",
    authEndpoint: "https://gitlab.com/oauth/authorize",
    tokenEndpoint: "https://gitlab.com/oauth/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/gitlab/callback",
  },
  notion: {
    id: "notion",
    name: "Notion",
    clientIdEnv: "NEXT_PUBLIC_NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
    authEndpoint: "https://api.notion.com/v1/oauth/authorize",
    tokenEndpoint: "https://api.notion.com/v1/oauth/token",
    refreshRequiresClientAuth: true,
    authMethod: "basic",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/notion/callback",
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    clientIdEnv: "NEXT_PUBLIC_INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
    authEndpoint: "https://api.instagram.com/oauth/authorize",
    tokenEndpoint: "https://api.instagram.com/oauth/access_token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/instagram/callback",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    clientIdEnv: "NEXT_PUBLIC_TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authEndpoint: "https://www.tiktok.com/v2/auth/authorize",
    tokenEndpoint: "https://open.tiktokapis.com/v2/oauth/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/tiktok/callback",
  },
  gumroad: {
    id: "gumroad",
    name: "Gumroad",
    clientIdEnv: "NEXT_PUBLIC_GUMROAD_CLIENT_ID",
    clientSecretEnv: "GUMROAD_CLIENT_SECRET",
    authEndpoint: "https://gumroad.com/oauth/authorize",
    tokenEndpoint: "https://gumroad.com/oauth/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/gumroad/callback",
  },
  shopify: {
    id: "shopify",
    name: "Shopify",
    clientIdEnv: "NEXT_PUBLIC_SHOPIFY_CLIENT_ID",
    clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
    authEndpoint: "https://{shop}.myshopify.com/admin/oauth/authorize",
    tokenEndpoint: "https://{shop}.myshopify.com/admin/oauth/access_token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/shopify/callback",
  },
  stripe: {
    id: "stripe",
    name: "Stripe",
    clientIdEnv: "NEXT_PUBLIC_STRIPE_CLIENT_ID",
    clientSecretEnv: "STRIPE_CLIENT_SECRET",
    authEndpoint: "https://connect.stripe.com/oauth/authorize",
    tokenEndpoint: "https://connect.stripe.com/oauth/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/stripe/callback",
  },
  paypal: {
    id: "paypal",
    name: "PayPal",
    clientIdEnv: "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
    clientSecretEnv: "PAYPAL_CLIENT_SECRET",
    authEndpoint: "https://www.paypal.com/webapps/merchantboarding/webflow/externalpartnerflow",
    tokenEndpoint: "https://api.paypal.com/v1/oauth2/token",
    refreshRequiresClientAuth: true,
    authMethod: "basic",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/paypal/callback",
  },
  mailchimp: {
    id: "mailchimp",
    name: "Mailchimp",
    clientIdEnv: "NEXT_PUBLIC_MAILCHIMP_CLIENT_ID",
    clientSecretEnv: "MAILCHIMP_CLIENT_SECRET",
    authEndpoint: "https://login.mailchimp.com/oauth2/authorize",
    tokenEndpoint: "https://login.mailchimp.com/oauth2/token",
    refreshRequiresClientAuth: true,
    authMethod: "body",
    refreshTokenExpirationSupported: false,
    accessTokenExpiryBuffer: 30,
    sendRedirectUriWithRefresh: true,
    redirectUriPath: "/api/integrations/mailchimp/callback",
  },
};

/**
 * Get the OAuth configuration for a provider
 * @param provider The provider ID
 * @returns The OAuth configuration for the provider or undefined if not found
 */
export function getOAuthConfig(provider: string): OAuthProviderConfig | undefined {
  // Handle Google service-specific aliases
  if (provider.startsWith("google-") || provider === "gmail" || provider === "youtube") {
    return OAUTH_PROVIDERS["google"];
  }
  
  // Handle Microsoft service-specific aliases
  if (provider === "teams" || provider === "onedrive" || provider === "microsoft-outlook") {
    return OAUTH_PROVIDERS["microsoft"];
  }
  
  return OAUTH_PROVIDERS[provider.toLowerCase()];
}

/**
 * Get client credentials for a provider
 * @param provider The provider or provider config
 * @returns An object with clientId and clientSecret
 */
export function getOAuthClientCredentials(provider: string | OAuthProviderConfig): { clientId: string; clientSecret: string } {
  const config = typeof provider === 'string' ? getOAuthConfig(provider) : provider;
  
  if (!config) {
    throw new Error(`No OAuth configuration found for provider: ${typeof provider === 'string' ? provider : provider.id}`);
  }
  
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  
  if (!clientId || !clientSecret) {
    throw new Error(`Missing OAuth credentials for ${config.name}. Required environment variables: ${config.clientIdEnv}, ${config.clientSecretEnv}`);
  }
  
  return { clientId, clientSecret };
} 