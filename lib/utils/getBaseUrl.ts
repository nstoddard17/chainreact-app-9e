import { getEnvironmentConfig } from './environment'

export function getBaseUrl(): string {
  // For Vercel deployment, use VERCEL_URL if available
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Use the new environment configuration system
  const config = getEnvironmentConfig()
  
  // For backward compatibility, check if old environment variables are set
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }

  // Use the new environment-based configuration
  return config.url
}
