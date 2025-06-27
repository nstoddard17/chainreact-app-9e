import { getEnvironmentConfig } from './environment'

export function getBaseUrl(): string {
  // For backward compatibility, check if old environment variables are set first
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }

  // Use the new environment configuration system
  const config = getEnvironmentConfig()
  
  // If we have a custom domain configured, use it
  if (config.url && !config.url.includes('localhost')) {
    return config.url
  }

  // For Vercel deployment without custom domain, use VERCEL_URL as fallback
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Use the environment-based configuration as final fallback
  return config.url
}
