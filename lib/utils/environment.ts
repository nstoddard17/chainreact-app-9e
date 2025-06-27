/**
 * Environment configuration utility
 * Handles different environments (local, development, production) with flexible URL configuration
 */

export type Environment = 'local' | 'development' | 'production'

export interface EnvironmentConfig {
  url: string
}

/**
 * Get the current environment
 */
export function getCurrentEnvironment(): Environment {
  // Check NODE_ENV first for production builds
  if (process.env.NODE_ENV === 'production') return 'production'
  
  // Check explicit environment setting
  if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'development') return 'development'
  if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'production') return 'production'
  
  // If VERCEL_URL is set, we're in production
  if (process.env.VERCEL_URL) return 'production'
  
  // Default to local for development
  return 'local'
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = getCurrentEnvironment()
  switch (env) {
    case 'local':
      return {
        url: process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000',
      }
    case 'development':
      return {
        url: process.env.NEXT_PUBLIC_DEV_URL || 'https://dev.chainreact.app',
      }
    case 'production':
      return {
        url: process.env.NEXT_PUBLIC_PROD_URL || 'https://chainreact.app',
      }
  }
}

/**
 * Get the base URL for the current environment
 */
export function getBaseUrl(): string {
  return getEnvironmentConfig().url
}

/**
 * Get the OAuth redirect base URL for the current environment
 */
export function getOAuthRedirectBase(): string {
  return getEnvironmentConfig().url
}

/**
 * Get the app URL for the current environment
 */
export function getAppUrl(): string {
  return getEnvironmentConfig().url
}

/**
 * Get the site URL for the current environment
 */
export function getSiteUrl(): string {
  return getEnvironmentConfig().url
}

/**
 * Build a full OAuth redirect URI for a specific provider
 */
export function buildOAuthRedirectUri(provider: string): string {
  return `${getEnvironmentConfig().url}/api/integrations/${provider}/callback`
}

/**
 * Check if we're running in a local environment
 */
export function isLocalEnvironment(): boolean {
  return getCurrentEnvironment() === 'local'
}

/**
 * Check if we're running in a development environment
 */
export function isDevelopmentEnvironment(): boolean {
  return getCurrentEnvironment() === 'development'
}

/**
 * Check if we're running in a production environment
 */
export function isProductionEnvironment(): boolean {
  return getCurrentEnvironment() === 'production'
}

/**
 * Get environment-specific OAuth client credentials
 */
export function getEnvironmentOAuthClientCredentials(provider: string): { clientId: string; clientSecret: string } {
  const env = getCurrentEnvironment()
  const envSuffix = env === 'local' ? '_LOCAL' : env === 'development' ? '_DEV' : '_PROD'
  const clientIdEnv = `NEXT_PUBLIC_${provider.toUpperCase()}_CLIENT_ID${envSuffix}`
  const clientSecretEnv = `${provider.toUpperCase()}_CLIENT_SECRET${envSuffix}`
  const clientId = process.env[clientIdEnv] || process.env[`NEXT_PUBLIC_${provider.toUpperCase()}_CLIENT_ID`]
  const clientSecret = process.env[clientSecretEnv] || process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]
  if (!clientId || !clientSecret) {
    throw new Error(`Missing OAuth credentials for ${provider}. Required environment variables: ${clientIdEnv} (or NEXT_PUBLIC_${provider.toUpperCase()}_CLIENT_ID), ${clientSecretEnv} (or ${provider.toUpperCase()}_CLIENT_SECRET)`)
  }
  return { clientId, clientSecret }
} 