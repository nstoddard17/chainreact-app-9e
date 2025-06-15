/**
 * Get the base URL for the current environment
 * This ensures consistent URL generation across environments
 */
export function getBaseUrl(req?: Request): string {
  // First priority: Use environment variable if set
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "")
  }

  // Second priority: Use request origin if available (for API routes)
  if (req) {
    const url = new URL(req.url)
    return `${url.protocol}//${url.host}`
  }

  // Third priority: Use window.location in browser
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // Fallback for production (should be set in env vars)
  return "https://chainreact.app"
}
