import { useState, useEffect } from 'react'

// In-memory cache for signed URLs
const urlCache = new Map<string, {
  signedUrl: string
  expiresAt: number
}>()

// In-flight request tracker to prevent duplicate requests
const inflightRequests = new Map<string, Promise<string>>()

// Cache duration: 55 minutes (signed URLs expire after 60 minutes, we refresh at 55)
const CACHE_DURATION_MS = 55 * 60 * 1000

async function fetchSignedUrl(avatarUrl: string): Promise<string> {
  // Check cache first
  const cached = urlCache.get(avatarUrl)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signedUrl
  }

  // Check if there's already a request in flight for this URL
  const inflightRequest = inflightRequests.get(avatarUrl)
  if (inflightRequest) {
    return inflightRequest
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      const response = await fetch(`/api/user/avatar?url=${encodeURIComponent(avatarUrl)}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`Failed to get signed URL: ${errorData.error || response.statusText}`)
      }

      const data = await response.json()
      const signedUrl = data.signedUrl

      // Cache the result
      urlCache.set(avatarUrl, {
        signedUrl,
        expiresAt: Date.now() + CACHE_DURATION_MS
      })

      return signedUrl
    } finally {
      // Remove from in-flight tracker
      inflightRequests.delete(avatarUrl)
    }
  })()

  // Track the in-flight request
  inflightRequests.set(avatarUrl, requestPromise)

  return requestPromise
}

export function useSignedAvatarUrl(avatarUrl: string | undefined) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!avatarUrl) {
      setSignedUrl(null)
      return
    }

    // If it's a blob URL, use it directly
    if (avatarUrl.startsWith('blob:')) {
      setSignedUrl(avatarUrl)
      return
    }

    // If it's a Supabase storage URL, get a signed URL (with caching)
    if (avatarUrl.includes('supabase.co/storage')) {
      let cancelled = false

      const loadSignedUrl = async () => {
        // Check cache immediately for instant display
        const cached = urlCache.get(avatarUrl)
        if (cached && cached.expiresAt > Date.now()) {
          if (!cancelled) {
            setSignedUrl(cached.signedUrl)
            setLoading(false)
          }
          return
        }

        setLoading(true)
        setError(null)

        try {
          const url = await fetchSignedUrl(avatarUrl)
          if (!cancelled) {
            setSignedUrl(url)
          }
        } catch (err) {
          console.error('Error fetching signed avatar URL:', err)
          if (!cancelled) {
            setError(err instanceof Error ? err : new Error('Unknown error'))
            setSignedUrl(null)
          }
        } finally {
          if (!cancelled) {
            setLoading(false)
          }
        }
      }

      loadSignedUrl()

      // Cleanup function to prevent state updates after unmount
      return () => {
        cancelled = true
      }
    } else {
      // For other URLs, use directly
      setSignedUrl(avatarUrl)
    }
  }, [avatarUrl])

  return { signedUrl, loading, error }
}
