import { useState, useEffect } from 'react'

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

    // If it's a Supabase storage URL, get a signed URL
    if (avatarUrl.includes('supabase.co/storage')) {
      const fetchSignedUrl = async () => {
        setLoading(true)
        setError(null)

        try {
          const response = await fetch(`/api/user/avatar?url=${encodeURIComponent(avatarUrl)}`)

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
            console.error('Signed URL API error:', response.status, errorData)
            throw new Error(`Failed to get signed URL: ${errorData.error || response.statusText}`)
          }

          const data = await response.json()
          console.log('✅ Got signed URL:', data.signedUrl)
          setSignedUrl(data.signedUrl)
        } catch (err) {
          console.error('Error fetching signed avatar URL:', err)
          setError(err instanceof Error ? err : new Error('Unknown error'))
          setSignedUrl(null)
        } finally {
          setLoading(false)
        }
      }

      fetchSignedUrl()
    } else {
      // For other URLs, use directly
      setSignedUrl(avatarUrl)
    }
  }, [avatarUrl])

  return { signedUrl, loading, error }
}
