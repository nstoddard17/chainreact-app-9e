import { getIntegrationToken } from "./getIntegrationToken"
import type { IntegrationConfiguration } from "./types"

/**
 * Retrieves a valid access token for the given integration configuration.
 * If a valid token exists in the configuration, it is returned.
 * Otherwise, a new token is fetched using the getIntegrationToken function.
 *
 * @param integrationConfiguration The integration configuration object.
 * @returns A promise that resolves to the valid access token.
 * @throws Error if unable to retrieve a valid access token.
 */
export async function getValidAccessToken(integrationConfiguration: IntegrationConfiguration): Promise<string> {
  if (integrationConfiguration.accessToken && integrationConfiguration.accessTokenExpiry) {
    const expiryDate = new Date(integrationConfiguration.accessTokenExpiry)
    if (expiryDate > new Date()) {
      return integrationConfiguration.accessToken
    }
  }

  const newToken = await getIntegrationToken(integrationConfiguration)
  return newToken
}
