import { createClient } from '@supabase/supabase-js'

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
  private clientId = process.env.MICROSOFT_CLIENT_ID!
  private clientSecret = process.env.MICROSOFT_CLIENT_SECRET!
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
   * Store tokens for a user
   */
  async storeTokens(userId: string, tokenInfo: MicrosoftTokenInfo): Promise<void> {
    const { error } = await supabase
      .from('microsoft_tokens')
      .upsert({
        user_id: userId,
        access_token: tokenInfo.accessToken,
        refresh_token: tokenInfo.refreshToken,
        expires_at: new Date(tokenInfo.expiresAt).toISOString(),
        scope: tokenInfo.scope,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    if (error) {
      console.error('Error storing Microsoft tokens:', error)
      throw error
    }
  }

  /**
   * Get valid access token for a user (refresh if needed)
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('microsoft_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      throw new Error('No Microsoft tokens found for user')
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = new Date(data.expires_at).getTime()
    const now = Date.now()
    const buffer = 5 * 60 * 1000 // 5 minutes

    if (now + buffer >= expiresAt) {
      // Token is expired or will expire soon, refresh it
      console.log('🔄 Refreshing expired Microsoft token for user:', userId)
      
      const newTokenInfo = await this.refreshAccessToken(data.refresh_token)
      await this.storeTokens(userId, newTokenInfo)
      
      return newTokenInfo.accessToken
    }

    return data.access_token
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
  async revokeTokens(userId: string): Promise<void> {
    const { data } = await supabase
      .from('microsoft_tokens')
      .select('refresh_token')
      .eq('user_id', userId)
      .single()

    if (data?.refresh_token) {
      // Revoke the refresh token
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        token: data.refresh_token
      })

      await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })
    }

    // Delete tokens from database
    const { error } = await supabase
      .from('microsoft_tokens')
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting Microsoft tokens:', error)
      throw error
    }
  }
}
