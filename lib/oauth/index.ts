import { AirtableOAuthService } from "./airtable"

export interface OAuthProvider {
  generateAuthUrl(baseUrl: string, reconnect?: boolean, integrationId?: string): string
  getRedirectUri(baseUrl: string): string
}

export const oauthProviders = {
  airtable: AirtableOAuthService,
  // Add other providers here as needed
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
