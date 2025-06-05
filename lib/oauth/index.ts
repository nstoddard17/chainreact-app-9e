import { AirtableOAuthService } from "./airtable"
import { DiscordOAuthService } from "./discord"
import { DropboxOAuthService } from "./dropbox"
import { GitHubOAuthService } from "./github"
import { GoogleOAuthService } from "./google"
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
import { YouTubeOAuthService } from "./youtube"
import { DockerOAuthService } from "./docker"
import { GitLabOAuthService } from "./gitlab"

export interface OAuthProvider {
  generateAuthUrl(baseUrl: string, reconnect?: boolean, integrationId?: string): string
  getRedirectUri(baseUrl: string): string
}

export const oauthProviders = {
  airtable: AirtableOAuthService,
  discord: DiscordOAuthService,
  dropbox: DropboxOAuthService,
  github: GitHubOAuthService,
  google: GoogleOAuthService,
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
  youtube: YouTubeOAuthService,
  docker: DockerOAuthService,
  gitlab: GitLabOAuthService,
} as const

export type SupportedProvider = keyof typeof oauthProviders

export function getOAuthProvider(provider: SupportedProvider): OAuthProvider {
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
): string {
  const service = getOAuthProvider(provider)
  return service.generateAuthUrl(baseUrl, reconnect, integrationId)
}
