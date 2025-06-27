export function getBaseUrl(): string {
  // For OAuth redirects, always use the production domain
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
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

  // In browser, use current origin only as fallback when no environment variables are set
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  return "http://localhost:3000"
}

// Separate function for API calls that should use localhost in development
export function getApiBaseUrl(): string {
  // For local development, use localhost for API calls
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }

  // For production, use the configured URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return "http://localhost:3000"
}
