import { DiscordOAuthService } from "./discord"

export class OAuthService {
  static async validateIntegrationScopes(integration: any): Promise<boolean> {
    switch (integration.oauthProvider) {
      case "discord":
        return await DiscordOAuthService.validateExistingIntegration(integration)
      default:
        return false
    }
  }
}
