import { getBaseUrl } from "./utils/getBaseUrl"

export const discordConfig = {
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  redirectUri: `${getBaseUrl()}/api/integrations/discord/callback`,
}
