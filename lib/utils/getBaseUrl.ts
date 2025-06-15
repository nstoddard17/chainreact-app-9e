export function getBaseUrl(): string {
  // In browser, use current origin to avoid CORS issues
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
  const baseUrl = getBaseUrl()
  return `${baseUrl}/api/integrations/${provider}/callback`
}

export function getOAuthReturnUrl(): string {
  const baseUrl = getBaseUrl()
  return `${baseUrl}/integrations`
}
