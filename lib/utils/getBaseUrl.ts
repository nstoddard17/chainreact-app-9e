export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"
}

// Separate function for API calls that should use localhost in development
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"
}
