export function getBaseUrl(): string {
  // In development, use localhost
  if (typeof window !== 'undefined') {
    // Client-side
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`
    }
  } else {
    // Server-side
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000'
    }
  }
  
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"
}

// Separate function for API calls that should use localhost in development
export function getApiBaseUrl(): string {
  // In development, use localhost
  if (typeof window !== 'undefined') {
    // Client-side
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`
    }
  } else {
    // Server-side
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000'
    }
  }
  
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"
}
