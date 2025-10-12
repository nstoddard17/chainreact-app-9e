import { encrypt, decrypt, safeDecrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"

import { logger } from '@/lib/utils/logger'

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

  const baseData = {
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

  // For Slack integrations, extract team_id from metadata and set it as a direct column
  if (provider === 'slack' && metadata?.team_id) {
    return {
      ...baseData,
      team_id: metadata.team_id
    }
  }

  return baseData
}

/**
 * Decrypts an OAuth token that was previously encrypted
 * @param encryptedToken The encrypted token to decrypt
 * @returns Decrypted token string or null if decryption fails
 */
export async function decryptToken(encryptedToken: string): Promise<string | null> {
  if (!encryptedToken) {
    return null
  }

  try {
    // Get the encryption key - use default if not set
    const secret = await getSecret("encryption_key") || "0123456789abcdef0123456789abcdef"
    
    // Use safeDecrypt which handles both encrypted and unencrypted tokens
    return safeDecrypt(encryptedToken, secret)
  } catch (error) {
    logger.error('Failed to decrypt token:', error)
    // Return the token as-is if decryption fails (might not be encrypted)
    return encryptedToken
  }
}
