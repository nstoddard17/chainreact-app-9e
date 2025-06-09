import type { Database } from "../database/Database"
import type { EncryptionService } from "../security/EncryptionService"
import type { TokenData } from "../services/TokenManagerService"

export class TokenRepository {
  constructor(
    private db: Database,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Get token data for a specific user and provider
   */
  async getTokenData(userId: string, provider: string): Promise<TokenData | null> {
    try {
      const result = await this.db.query(
        `SELECT * FROM integrations 
         WHERE user_id = $1 AND provider = $2 
         LIMIT 1`,
        [userId, provider],
      )

      if (!result || result.length === 0) {
        return null
      }

      const integration = result[0]

      // Decrypt the tokens
      const accessToken = await this.encryptionService.decrypt(
        integration.access_token,
        integration.encryption_iv,
        integration.encryption_tag,
      )

      let refreshToken = null
      if (integration.refresh_token) {
        refreshToken = await this.encryptionService.decrypt(
          integration.refresh_token,
          integration.refresh_token_iv,
          integration.refresh_token_tag,
        )
      }

      return {
        id: integration.id,
        userId: integration.user_id,
        provider: integration.provider,
        accessToken,
        refreshToken,
        expiresAt: integration.expires_at ? new Date(integration.expires_at) : undefined,
        scopes: integration.scopes,
        metadata: integration.metadata,
        isActive: integration.is_active,
        createdAt: new Date(integration.created_at),
        updatedAt: new Date(integration.updated_at),
      }
    } catch (error) {
      console.error(`Error getting token data for ${provider}:`, error)
      throw error
    }
  }

  /**
   * Update token data
   */
  async updateTokenData(id: string, data: Partial<TokenData>): Promise<void> {
    try {
      const updates: Record<string, any> = {
        updated_at: new Date(),
      }

      // Handle access token update with encryption
      if (data.accessToken) {
        const {
          encrypted: encryptedAccessToken,
          iv: accessTokenIv,
          tag: accessTokenTag,
        } = await this.encryptionService.encrypt(data.accessToken)

        updates.access_token = encryptedAccessToken
        updates.encryption_iv = accessTokenIv
        updates.encryption_tag = accessTokenTag
      }

      // Handle refresh token update with encryption
      if (data.refreshToken) {
        const {
          encrypted: encryptedRefreshToken,
          iv: refreshTokenIv,
          tag: refreshTokenTag,
        } = await this.encryptionService.encrypt(data.refreshToken)

        updates.refresh_token = encryptedRefreshToken
        updates.refresh_token_iv = refreshTokenIv
        updates.refresh_token_tag = refreshTokenTag
      }

      // Handle other fields
      if (data.expiresAt) updates.expires_at = data.expiresAt
      if (data.scopes) updates.scopes = data.scopes
      if (data.metadata) updates.metadata = data.metadata
      if (data.isActive !== undefined) updates.is_active = data.isActive

      // Build the SQL update statement
      const fields = Object.keys(updates)
      const placeholders = fields.map((_, i) => `$${i + 2}`)
      const setClause = fields.map((field, i) => `${this.toSnakeCase(field)} = ${placeholders[i]}`).join(", ")

      await this.db.query(`UPDATE integrations SET ${setClause} WHERE id = $1`, [id, ...Object.values(updates)])
    } catch (error) {
      console.error(`Error updating token data for integration ${id}:`, error)
      throw error
    }
  }

  /**
   * Get all tokens that are expiring soon
   */
  async getExpiringTokens(thresholdSeconds: number): Promise<TokenData[]> {
    try {
      const thresholdDate = new Date(Date.now() + thresholdSeconds * 1000)

      const result = await this.db.query(
        `SELECT * FROM integrations 
         WHERE is_active = true 
         AND expires_at IS NOT NULL 
         AND expires_at < $1 
         AND refresh_token IS NOT NULL`,
        [thresholdDate],
      )

      if (!result || result.length === 0) {
        return []
      }

      // Map and decrypt all tokens
      return Promise.all(
        result.map(async (integration) => {
          const accessToken = await this.encryptionService.decrypt(
            integration.access_token,
            integration.encryption_iv,
            integration.encryption_tag,
          )

          let refreshToken = null
          if (integration.refresh_token) {
            refreshToken = await this.encryptionService.decrypt(
              integration.refresh_token,
              integration.refresh_token_iv,
              integration.refresh_token_tag,
            )
          }

          return {
            id: integration.id,
            userId: integration.user_id,
            provider: integration.provider,
            accessToken,
            refreshToken,
            expiresAt: integration.expires_at ? new Date(integration.expires_at) : undefined,
            scopes: integration.scopes,
            metadata: integration.metadata,
            isActive: integration.is_active,
            createdAt: new Date(integration.created_at),
            updatedAt: new Date(integration.updated_at),
          }
        }),
      )
    } catch (error) {
      console.error("Error getting expiring tokens:", error)
      throw error
    }
  }

  /**
   * Convert camelCase to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  }
}
