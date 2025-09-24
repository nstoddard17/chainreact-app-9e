"use client"

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface PageLoaderProps {
  message?: string
  timeout?: number
  onTimeout?: () => void
}

export function PageLoader({
  message = "Loading...",
  timeout = 5000,
  onTimeout
}: PageLoaderProps) {
  const [isTimedOut, setIsTimedOut] = useState(false)
  const [showSlowMessage, setShowSlowMessage] = useState(false)

  useEffect(() => {
    // Show "taking longer than usual" after 2 seconds
    const slowTimer = setTimeout(() => {
      setShowSlowMessage(true)
    }, 2000)

    // Timeout after specified duration
    const timeoutTimer = setTimeout(() => {
      setIsTimedOut(true)
      onTimeout?.()
    }, timeout)

    return () => {
      clearTimeout(slowTimer)
      clearTimeout(timeoutTimer)
    }
  }, [timeout, onTimeout])

  if (isTimedOut) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="mb-4 text-red-500">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading Timeout</h2>
          <p className="text-gray-600 mb-4">
            The page is taking longer than expected to load. This might be due to network issues.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-700 font-medium">{message}</p>
        {showSlowMessage && (
          <p className="text-gray-500 text-sm mt-2">
            This is taking longer than usual...
          </p>
        )}
      </div>
    </div>
  )
}