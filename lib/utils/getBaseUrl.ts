export function getBaseUrl(): string {
  // Debug logging
  console.log("🔍 getBaseUrl() called with environment:", {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    isBrowser: typeof window !== "undefined",
    windowOrigin: typeof window !== "undefined" ? window.location.origin : "N/A"
  })

  // Server-side logic
  // For production OAuth redirects, always use the custom domain
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    console.log("✅ Using NEXT_PUBLIC_SITE_URL:", process.env.NEXT_PUBLIC_SITE_URL)
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  // For development, use localhost
  if (process.env.NODE_ENV === "development") {
    console.log("✅ Using development localhost")
    return "http://localhost:3000"
  }

  // Check if we're in a browser environment
  if (typeof window !== "undefined") {
    console.log("✅ Using browser origin:", window.location.origin)
    return window.location.origin
  }

  // Server-side or when environment variable is set, use the configured URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    console.log("✅ Using NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL)
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    console.log("✅ Using NEXT_PUBLIC_BASE_URL:", process.env.NEXT_PUBLIC_BASE_URL)
    return process.env.NEXT_PUBLIC_BASE_URL
  }

  if (process.env.VERCEL_URL) {
    console.log("✅ Using VERCEL_URL:", process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}`
  }

  // Fallback
  console.log("⚠️ Using fallback localhost")
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
