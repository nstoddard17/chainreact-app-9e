export interface RefreshTokenResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  message?: string
}

export interface OAuthProviderAdapter {
  /**
   * Refresh an access token using a refresh token
   */
  refreshToken(refreshToken: string): Promise<RefreshTokenResult>

  /**
   * Validate an access token with the provider
   */
  validateToken(accessToken: string): Promise<boolean>

  /**
   * Get the provider's OAuth configuration
   */
  getOAuthConfig(): OAuthConfig
}

export interface OAuthConfig {
  clientId: string
  clientSecret: string
  tokenUrl: string
  authUrl: string
  scopes: string[]
  redirectUri: string
}
