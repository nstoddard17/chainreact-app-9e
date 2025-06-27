export function getBaseUrl(): string {
  // Server-side logic
  // For production OAuth redirects, always use the custom domain
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  // For development, use localhost
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }

  // Check if we're in a browser environment
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // Server-side or when environment variable is set, use the configured URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Fallback
  return "http://localhost:3000"
}

// Separate function for API calls that should use localhost in development
export function getApiBaseUrl(): string {
  // For production, use the configured URL (prioritize environment variables)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // For local development (when no production environment variables are set), use localhost
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }

  return "http://localhost:3000"
}
