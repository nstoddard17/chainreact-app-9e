import { refreshIntegrationToken } from '@/lib/integrations/refreshToken'
import { decrypt } from '@/lib/security/encryption'

/**
 * Refreshes a Microsoft OAuth token and returns the new access token
 * This is a convenience wrapper around refreshIntegrationToken for Microsoft providers
 */
export async function refreshMicrosoftToken(
  userId: string,
  provider: string = 'microsoft-outlook'
): Promise<string> {
  const tokenData = await refreshIntegrationToken(userId, provider)

  // The token data from refreshIntegrationToken returns encrypted tokens
  // We need to decrypt the access token before returning
  const accessToken = decrypt(tokenData.access_token)

  return accessToken
}
