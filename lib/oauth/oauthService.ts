import { DiscordOAuthService } from "./discord"
import { SlackOAuthService } from "./slack"
import { DropboxOAuthService } from "./dropbox"

export class OAuthService {
  static async validateToken(
    provider: string,
    accessToken: string,
  ): Promise<{ valid: boolean; grantedScopes: string[]; missingScopes: string[] }> {
    switch (provider) {
      case "discord":
        return await DiscordOAuthService.validateToken(accessToken)
      case "slack":
        return await SlackOAuthService.validateToken(accessToken)
      case "dropbox":
        return await DropboxOAuthService.validateToken(accessToken)
      default:
        console.warn(`No token validation implemented for provider: ${provider}`)
        return { valid: true, grantedScopes: [], missingScopes: [] }
    }
  }

  static async validateIntegrationScopes(integration: any): Promise<boolean> {
    switch (integration.provider) {
      case "discord":
        return await DiscordOAuthService.validateExistingIntegration(integration)
      default:
        return true
    }
  }
}
