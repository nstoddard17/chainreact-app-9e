export function getBaseUrl(): string {
  // Priority order: NEXT_PUBLIC_BASE_URL > NEXT_PUBLIC_APP_URL > environment detection > fallback
  
  // If NEXT_PUBLIC_BASE_URL is explicitly set, use it
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  
  // If NEXT_PUBLIC_APP_URL is set, use it
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
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
  
  // Fallback to production URL
  return "https://chainreact.app"
}

// Separate function for API calls that should use localhost in development
export function getApiBaseUrl(): string {
  // Priority order: NEXT_PUBLIC_BASE_URL > NEXT_PUBLIC_APP_URL > environment detection > fallback
  
  // If NEXT_PUBLIC_BASE_URL is explicitly set, use it
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  
  // If NEXT_PUBLIC_APP_URL is set, use it
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  
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
  
  // Fallback to production URL
  return "https://chainreact.app"
}
