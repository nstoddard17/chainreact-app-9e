/**
 * Cookie validation utilities to prevent parsing errors
 */

export function validateCookie(cookieString: string): boolean {
  if (!cookieString) return true // Empty is valid
  
  // Check for common corruption patterns
  if (cookieString.startsWith('base64-')) {
    console.warn('Detected base64 prefix in cookie, likely corrupted')
    return false
  }
  
  // Check if it looks like raw JWT/base64 without proper formatting
  if (cookieString.match(/^eyJ[A-Za-z0-9+/]/) && !cookieString.includes('=')) {
    console.warn('Detected malformed JWT/base64 in cookie')
    return false
  }
  
  return true
}

export function sanitizeCookies(cookies: string): string {
  if (!cookies) return ''
  
  try {
    // Split cookies and validate each one
    const cookieArray = cookies.split(';').map(c => c.trim())
    const validCookies = cookieArray.filter(cookie => {
      const [name, value] = cookie.split('=')
      if (!name || !value) return false
      
      // Skip corrupted auth cookies
      if (name.includes('supabase') || name.includes('auth')) {
        try {
          // Try to decode if it looks like base64
          if (value.startsWith('base64-') || value.includes('eyJ')) {
            console.warn(`Removing corrupted cookie: ${name}`)
            return false
          }
        } catch {
          return false
        }
      }
      
      return true
    })
    
    return validCookies.join('; ')
  } catch (error) {
    console.error('Error sanitizing cookies:', error)
    return ''
  }
}

export function clearCorruptedAuthData(): void {
  if (typeof window === 'undefined') return
  
  // Clear potentially corrupted auth data
  const keysToCheck = [
    'chainreact-auth',
    'supabase.auth.token',
    'auth-storage',
    'sb-auth-token'
  ]
  
  keysToCheck.forEach(key => {
    try {
      const value = localStorage.getItem(key)
      if (value) {
        // Check if it's valid JSON
        try {
          JSON.parse(value)
        } catch {
          console.warn(`Clearing corrupted localStorage key: ${key}`)
          localStorage.removeItem(key)
        }
      }
    } catch (error) {
      console.error(`Error checking localStorage key ${key}:`, error)
    }
  })
  
  // Clear corrupted session storage
  try {
    const sessionKeys = Object.keys(sessionStorage)
    sessionKeys.forEach(key => {
      if (key.includes('auth') || key.includes('supabase')) {
        const value = sessionStorage.getItem(key)
        if (value) {
          try {
            JSON.parse(value)
          } catch {
            console.warn(`Clearing corrupted sessionStorage key: ${key}`)
            sessionStorage.removeItem(key)
          }
        }
      }
    })
  } catch (error) {
    console.error('Error clearing session storage:', error)
  }
}