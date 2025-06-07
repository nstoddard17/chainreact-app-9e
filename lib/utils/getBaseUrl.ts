export function getBaseUrl(req?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl

  if (typeof window !== "undefined") {
    return window.location.origin
  }

  if (req?.url) {
    try {
      const url = new URL(req.url)
      return url.origin
    } catch {
      // ignore
    }
  }

  return ""
}
