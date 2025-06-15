export function getBaseUrl(): string {
  // In browser, use current origin to avoid CORS issues
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // Server-side fallback
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return "http://localhost:3000"
}
