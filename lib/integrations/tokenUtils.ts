import { encrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"

/**
 * Encrypts OAuth tokens before storing them in the database
 * @param accessToken The access token to encrypt
 * @param refreshToken The refresh token to encrypt (optional)
 * @returns Object with encrypted tokens
 */
export async function encryptTokens(accessToken: string, refreshToken?: string) {
  const secret = await getSecret("encryption_key")
  if (!secret) {
    throw new Error('Encryption secret is not configured')
  }

  const encryptedAccessToken = encrypt(accessToken, secret)
  const encryptedRefreshToken = refreshToken ? encrypt(refreshToken, secret) : null

  return {
    encryptedAccessToken,
    encryptedRefreshToken
  }
}

/**
 * Prepares integration data with encrypted tokens
 * @param userId The user ID
 * @param provider The provider name
 * @param accessToken The access token
 * @param refreshToken The refresh token (optional)
 * @param scopes The scopes (optional)
 * @param expiresIn The expiration time in seconds (optional)
 * @param metadata Additional metadata (optional)
 * @returns Integration data object with encrypted tokens
 */
export async function prepareIntegrationData(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken?: string,
  scopes?: string[],
  expiresIn?: number,
  metadata?: Record<string, any>
) {
  const { encryptedAccessToken, encryptedRefreshToken } = await encryptTokens(accessToken, refreshToken)
  
  const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

  return {
    user_id: userId,
    provider,
    access_token: encryptedAccessToken,
    refresh_token: encryptedRefreshToken,
    scopes: scopes || [],
    status: 'connected',
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    updated_at: new Date().toISOString(),
    ...(metadata && { metadata })
  }
}
