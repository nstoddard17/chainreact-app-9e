import { AirtableOAuthService } from "./airtable"
import { DiscordOAuthService } from "./discord"
import { DropboxOAuthService } from "./dropbox"
import { GitHubOAuthService } from "./github"
import { SlackOAuthService } from "./slack"
import { TeamsOAuthService } from "./teams"
import { TwitterOAuthService } from "./twitter"
import { LinkedInOAuthService } from "./linkedin"
import { FacebookOAuthService } from "./facebook"
import { MailchimpOAuthService } from "./mailchimp"
import { ShopifyOAuthService } from "./shopify"
import { TikTokOAuthService } from "./tiktok"
import { PayPalOAuthService } from "./paypal"
import { HubSpotOAuthService } from "./hubspot"
import { NotionOAuthService } from "./notion"
import { TrelloOAuthService } from "./trello"
import { YouTubeOAuthService_Object } from "./youtube"
import { DockerOAuthService } from "./docker"
import { GitLabOAuthService } from "./gitlab"
import { GmailOAuthService } from "./gmail"
import { GoogleDriveOAuthService } from "./google-drive"
import { GoogleCalendarOAuthService } from "./google-calendar"
import { GoogleSheetsOAuthService } from "./google-sheets"
import { GoogleDocsOAuthService } from "./google-docs"

export interface OAuthProvider {
  generateAuthUrl(baseUrl: string, reconnect?: boolean, integrationId?: string, userId?: string): string
  getRedirectUri(): string
}

export const oauthProviders = {
  airtable: AirtableOAuthService,
  discord: DiscordOAuthService,
  dropbox: DropboxOAuthService,
  github: GitHubOAuthService,
  gmail: GmailOAuthService,
  "google-drive": GoogleDriveOAuthService,
  "google-calendar": GoogleCalendarOAuthService,
  "google-sheets": GoogleSheetsOAuthService,
  "google-docs": GoogleDocsOAuthService,
  slack: SlackOAuthService,
  teams: TeamsOAuthService,
  twitter: TwitterOAuthService,
  linkedin: LinkedInOAuthService,
  facebook: FacebookOAuthService,
  mailchimp: MailchimpOAuthService,
  shopify: ShopifyOAuthService,
  tiktok: TikTokOAuthService,
  paypal: PayPalOAuthService,
  hubspot: HubSpotOAuthService,
  notion: NotionOAuthService,
  trello: TrelloOAuthService,
  youtube: YouTubeOAuthService_Object,
  docker: DockerOAuthService,
  gitlab: GitLabOAuthService,
} as const

export type SupportedProvider = keyof typeof oauthProviders

export function getOAuthProvider(provider: SupportedProvider): OAuthProvider {
  const providerService = oauthProviders[provider]
  if (!providerService) {
    throw new Error(`Unsupported OAuth provider: ${provider}`)
  }

  if (!providerService.generateAuthUrl || !providerService.getRedirectUri) {
    throw new Error(`OAuth provider ${provider} is missing required methods`)
  }

  return providerService
}

export function getOAuthService(provider: SupportedProvider) {
  const providerService = oauthProviders[provider]
  if (!providerService) {
    throw new Error(`Unsupported OAuth provider: ${provider}`)
  }

  return providerService
}

export function generateOAuthUrl(
  provider: SupportedProvider,
  baseUrl: string,
  reconnect = false,
  integrationId?: string,
  userId?: string,
): string {
  try {
    const service = getOAuthProvider(provider)
    return service.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
  } catch (error: any) {
    console.error(`Failed to generate OAuth URL for ${provider}:`, error)

    if (error.message.includes("Missing") && error.message.includes("environment variable")) {
      throw new Error(`OAuth not configured for ${provider}: ${error.message}`)
    }

    throw new Error(`OAuth configuration error for ${provider}: ${error.message}`)
  }
}

export function isProviderSupported(provider: string): provider is SupportedProvider {
  return provider in oauthProviders
}

export function getSupportedProviders(): SupportedProvider[] {
  return Object.keys(oauthProviders) as SupportedProvider[]
}
