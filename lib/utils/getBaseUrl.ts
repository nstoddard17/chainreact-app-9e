export function getBaseUrl(): string {
  // Always use the production URL for OAuth redirects to ensure consistency
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return "https://chainreact.app"
  }

  // In browser, use current origin for development
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  // Server-side fallback with proper priority
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Development fallback
  return "http://localhost:3000"
}

export function getOAuthRedirectUri(provider: string): string {
  // Always use production URL for OAuth redirects
  const baseUrl = process.env.NODE_ENV === "production" ? "https://chainreact.app" : getBaseUrl()
  return `${baseUrl}/api/integrations/${provider}/callback`
}

export function getOAuthReturnUrl(): string {
  const baseUrl = getBaseUrl()
  return `${baseUrl}/integrations`
}
