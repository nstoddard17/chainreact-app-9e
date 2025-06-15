export function getBaseUrl(): string {
  // In browser, use current origin
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // In server-side rendering, use environment variables
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  // Fallback for development
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }

  // Production fallback
  return "https://chainreact.app"
}
