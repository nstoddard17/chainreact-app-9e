export function getBaseUrl(): string {
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
