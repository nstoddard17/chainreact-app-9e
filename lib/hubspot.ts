import { getBaseUrl } from "./utils/getBaseUrl"

export const hubspotConfig = {
  clientId: process.env.HUBSPOT_CLIENT_ID!,
  clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
  redirectUri: `${getBaseUrl()}/api/integrations/hubspot/callback`,
}
