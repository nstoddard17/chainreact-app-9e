/**
 * OAuth popup handler for integration connections
 */

interface OAuthPopupOptions {
  url: string
  name?: string
  width?: number
  height?: number
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export function openOAuthPopup({
  url,
  name = 'oauth_popup',
  width = 600,
  height = 700,
  onSuccess,
  onError
}: OAuthPopupOptions): Window | null {
  // Calculate center position
  const left = window.screen.width / 2 - width / 2
  const top = window.screen.height / 2 - height / 2

  // Open popup window
  const popup = window.open(
    url,
    name,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
  )

  if (!popup) {
    onError?.(new Error('Failed to open popup window. Please check your popup blocker settings.'))
    return null
  }

  // Set up message listener for OAuth completion
  const messageHandler = (event: MessageEvent) => {
    // Verify origin matches our domain
    if (event.origin !== window.location.origin) return

    // Check for OAuth completion message
    if (event.data?.type === 'oauth-complete') {
      window.removeEventListener('message', messageHandler)
      
      if (event.data.success) {
        onSuccess?.()
      } else {
        onError?.(new Error(event.data.error || 'OAuth authentication failed'))
      }
      
      // Close popup if still open
      if (popup && !popup.closed) {
        popup.close()
      }
    }
  }

  // Set up interval to check if popup was closed manually
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed)
      window.removeEventListener('message', messageHandler)
    }
  }, 1000)

  window.addEventListener('message', messageHandler)

  return popup
}

/**
 * Send OAuth completion message from callback page
 */
export function sendOAuthComplete(success: boolean, error?: string) {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({
      type: 'oauth-complete',
      success,
      error
    }, window.location.origin)
  }
  
  // Close the popup after a short delay
  setTimeout(() => {
    window.close()
  }, 100)
}