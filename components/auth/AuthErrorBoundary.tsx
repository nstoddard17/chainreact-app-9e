"use client"

import { useEffect } from "react"
import { clearCorruptedAuthData } from "@/lib/utils/cookieValidator"

export default function AuthErrorBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Clean up any corrupted auth data on mount
    clearCorruptedAuthData()
    
    // Set up an interval to periodically check for corruption
    const interval = setInterval(() => {
      try {
        // Check if localStorage has corrupted data
        const authData = localStorage.getItem('chainreact-auth')
        if (authData && (authData.startsWith('base64-') || authData.includes('eyJ') && !authData.includes('{'))) {
          console.warn('Detected corrupted auth data, cleaning up...')
          clearCorruptedAuthData()
          // Reload to get fresh state
          window.location.reload()
        }
      } catch (error) {
        console.error('Error in auth cleanup interval:', error)
      }
    }, 30000) // Check every 30 seconds
    
    return () => clearInterval(interval)
  }, [])
  
  return <>{children}</>
}