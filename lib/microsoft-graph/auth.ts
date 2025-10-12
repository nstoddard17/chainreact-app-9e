import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface MicrosoftTokenInfo {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
}

export class MicrosoftGraphAuth {
  private clientId = process.env.OUTLOOK_CLIENT_ID!
  private clientSecret = process.env.OUTLOOK_CLIENT_SECRET!
  private redirectUri = process.env.MICROSOFT_REDIRECT_URI!

  /**
   * Get Microsoft OAuth URL for authorization
   */
  getAuthUrl(state?: string): string {
    const scopes = [
      'offline_access',
      'Mail.Read',
      'Mail.ReadWrite',
      'Calendars.Read',
      'Calendars.ReadWrite',
      'Files.Read',
      'Files.ReadWrite',
      'User.Read'
    ].join(' ')

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scopes,
      response_mode: 'query',
      ...(state && { state })
    })

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<MicrosoftTokenInfo> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code'
    })

    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to exchange code for token: ${response.status} ${error}`)
    }

    const data = await response.json()
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      scope: data.scope
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<MicrosoftTokenInfo> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })

    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${response.status} ${error}`)
    }

    const data = await response.json()
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided
      expiresAt: Date.now() + (data.expires_in * 1000),
      scope: data.scope
    }
  }

  /**
   * Store tokens for a user in integrations table
   * Note: Tokens are encrypted before storage
   */
  async storeTokens(userId: string, tokenInfo: MicrosoftTokenInfo, provider: string = 'microsoft-outlook'): Promise<void> {
    const { safeEncrypt } = await import('@/lib/security/encryption')

    const { error } = await supabase
      .from('integrations')
      .update({
        access_token: safeEncrypt(tokenInfo.accessToken),
        refresh_token: safeEncrypt(tokenInfo.refreshToken),
        expires_at: new Date(tokenInfo.expiresAt).toISOString(),
        scopes: tokenInfo.scope.split(' '),
        updated_at: new Date().toISOString(),
        status: 'connected'
      })
      .eq('user_id', userId)
      .eq('provider', provider)

    if (error) {
      logger.error('Error storing Microsoft tokens:', error)
      throw error
    }
  }

  /**
   * Get valid access token for a user (refresh if needed)
   * Supports multiple Microsoft providers (microsoft-outlook, onedrive, etc.)
   */
  async getValidAccessToken(userId: string, preferredProvider?: string): Promise<string> {
    const { safeDecrypt } = await import('@/lib/security/encryption')

    // Query for any Microsoft-related integration
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .or('provider.like.microsoft%,provider.eq.onedrive,provider.eq.teams')

    if (error || !integrations || integrations.length === 0) {
      throw new Error('No Microsoft integration found for user')
    }

    // Prefer the specified provider, otherwise use the first one that matches
    let integration
    if (preferredProvider) {
      integration = integrations.find(i => i.provider === preferredProvider)
      if (!integration) {
        throw new Error(`Microsoft integration for provider '${preferredProvider}' not found`)
      }
    } else {
      // If no preferred provider, use the first one (this shouldn't happen)
      integration = integrations[0]
    }

    if (!integration || !integration.access_token || !integration.refresh_token) {
      throw new Error('Microsoft integration missing access or refresh token')
    }

    // Decrypt tokens
    const accessToken = safeDecrypt(integration.access_token)
    const refreshToken = safeDecrypt(integration.refresh_token)

    if (!accessToken || !refreshToken) {
      throw new Error('Failed to decrypt Microsoft tokens')
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = new Date(integration.expires_at).getTime()
    const now = Date.now()
    const buffer = 5 * 60 * 1000 // 5 minutes

    if (now + buffer >= expiresAt) {
      // Token is expired or will expire soon, refresh it
      logger.debug('🔄 Refreshing expired Microsoft token for user:', userId, 'provider:', integration.provider)
      logger.debug('🔍 Current scopes:', integration.scopes)

      const newTokenInfo = await this.refreshAccessToken(refreshToken)
      await this.storeTokens(userId, newTokenInfo, integration.provider)

      logger.debug('✅ Token refreshed successfully. New scopes:', newTokenInfo.scope)
      return newTokenInfo.accessToken
    }

    logger.debug('✅ Using existing valid token. Scopes:', integration.scopes?.join(', '))
    return accessToken
  }

  /**
   * Check if user has valid Microsoft tokens
   */
  async hasValidTokens(userId: string): Promise<boolean> {
    try {
      await this.getValidAccessToken(userId)
      return true
    } catch {
      return false
    }
  }

  /**
   * Revoke tokens for a user
   */
  async revokeTokens(userId: string, provider: string = 'microsoft-outlook'): Promise<void> {
    const { safeDecrypt } = await import('@/lib/security/encryption')

    const { data } = await supabase
      .from('integrations')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single()

    if (data?.refresh_token) {
      const decryptedRefreshToken = safeDecrypt(data.refresh_token)

      if (decryptedRefreshToken) {
        // Revoke the refresh token
        const params = new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          token: decryptedRefreshToken
        })

        await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        })
      }
    }

    // Update integration status to disconnected
    const { error } = await supabase
      .from('integrations')
      .update({
        status: 'disconnected',
        access_token: null,
        refresh_token: null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('provider', provider)

    if (error) {
      logger.error('Error revoking Microsoft tokens:', error)
      throw error
    }
  }
}
