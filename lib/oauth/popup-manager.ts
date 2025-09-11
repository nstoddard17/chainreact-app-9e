/**
 * OAuthPopupManager handles OAuth popup window management
 * Extracted from integrationStore.ts for better separation of concerns
 */

export interface PopupOptions {
  width?: number
  height?: number
  provider: string
}

export interface PopupResponse {
  type: 'oauth-success' | 'oauth-error' | 'oauth-cancelled' | 'oauth-info'
  message?: string
  provider?: string
  [key: string]: any
}

/**
 * OAuthPopupManager manages OAuth popup windows and communication
 * Handles COOP (Cross-Origin Opener Policy) restrictions safely
 */
export class OAuthPopupManager {
  private static currentPopup: Window | null = null
  private static windowHasLostFocus = false
  private static initialized = false
  
  /**
   * Initialize and clean up any stale references
   */
  private static initialize(): void {
    if (!this.initialized) {
      // Clean up any stale popup reference on first use
      if (this.currentPopup) {
        try {
          if (this.currentPopup.closed) {
            this.currentPopup = null
          }
        } catch (e) {
          // COOP might block access, assume it's stale
          this.currentPopup = null
        }
      }
      this.initialized = true
    }
  }

  /**
   * Check if popup is still valid
   * Note: COOP policy blocks window.closed checks, so we rely on message events and localStorage
   */
  static isPopupValid(popup: Window | null): boolean {
    return !!popup
  }

  /**
   * Close existing popup and reset state
   */
  static closeExistingPopup(): void {
    if (this.currentPopup) {
      try {
        // Check if popup is actually open before trying to close
        if (!this.currentPopup.closed) {
          this.currentPopup.close()
        }
      } catch (e) {
        // COOP might block access, just log warning
        console.warn("Failed to close existing popup:", e)
      }
      this.currentPopup = null
    }
    this.windowHasLostFocus = false
  }

  /**
   * Open OAuth popup window
   */
  static openOAuthPopup(
    authUrl: string, 
    options: PopupOptions
  ): Window | null {
    const { width = 600, height = 700, provider } = options
    
    // Initialize on first use
    this.initialize()
    
    // Close any existing popup before opening a new one
    this.closeExistingPopup()
    
    // Add timestamp to make popup name unique each time
    const popupName = `oauth_popup_${provider}_${Date.now()}`
    const popupFeatures = `width=${width},height=${height},scrollbars=yes,resizable=yes`
    
    // Check if document has focus (required for popup opening)
    if (!document.hasFocus()) {
      console.warn(`⚠️ Document doesn't have focus, popup might be blocked for ${provider}`)
    }
    
    let popup = window.open(authUrl, popupName, popupFeatures)
    
    // Retry popup opening if it failed (sometimes helps with timing issues)
    if (!popup) {
      console.warn(`⚠️ First popup attempt failed for ${provider}, retrying...`)
      // Wait a bit and try again
      setTimeout(() => {
        popup = window.open(authUrl, popupName, popupFeatures)
      }, 100)
    }
    
    if (!popup) {
      throw new Error("Popup was blocked. Please allow popups for this site in your browser settings.")
    }
    
    // Check if popup was immediately closed (blocked)
    setTimeout(() => {
      try {
        if (popup && popup.closed) {
          console.error(`❌ Popup was immediately closed for ${provider}`)
          throw new Error("Popup was immediately closed. Please check popup blocker settings.")
        }
      } catch (e) {
        // COOP policy may block access to popup.closed
      }
    }, 100)
    
    // Update global popup reference
    this.currentPopup = popup
    
    return popup
  }

  /**
   * Setup popup message listeners and polling
   */
  static setupPopupListeners(
    popup: Window,
    provider: string,
    onSuccess: (data: any) => void,
    onError: (error: string) => void,
    onCancel: () => void,
    onInfo?: (message: string) => void
  ): {
    cleanup: () => void
    promise: Promise<void>
  } {
    let closedByMessage = false
    let popupClosedManually = false
    
    // Clear any stale OAuth responses from localStorage before starting
    const storageCheckPrefix = `oauth_response_${provider}`
    try {
      const allKeys = Object.keys(localStorage)
      const staleKeys = allKeys.filter(key => key.startsWith(storageCheckPrefix))
      staleKeys.forEach(key => {
        console.log(`🧹 [OAuth] Clearing stale localStorage entry: ${key}`)
        localStorage.removeItem(key)
      })
    } catch (e) {
      console.warn('Failed to clear stale OAuth responses:', e)
    }
    
    const cleanup = () => {
      if (popupCheckTimer) clearInterval(popupCheckTimer)
      if (storageCheckTimer) clearInterval(storageCheckTimer)
      if (connectionTimeout) clearTimeout(connectionTimeout)
      window.removeEventListener("message", messageHandler)
      this.currentPopup = null
    }

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      const data = event.data as PopupResponse

      if (data && data.type === "oauth-success") {
        closedByMessage = true
        cleanup()
        try {
          popup.close()
        } catch (error) {
          console.warn("Failed to close popup:", error)
        }
        onSuccess(data)
      } else if (data && data.type === "oauth-info") {
        closedByMessage = true
        cleanup()
        this.currentPopup = null
        if (onInfo) {
          onInfo(data.message || "OAuth info received")
        }
      } else if (data && data.type === "oauth-error") {
        // For HubSpot, don't log errors - handle silently
        if (provider !== 'hubspot') {
          console.error(`❌ OAuth error for ${provider}:`, data.message)
        }
        closedByMessage = true
        cleanup()
        popup?.close()
        onError(data.message || "OAuth error occurred")
      } else if (data && data.type === "oauth-cancelled") {
        closedByMessage = true
        cleanup()
        onCancel()
      }
    }

    window.addEventListener("message", messageHandler)

    // Add popup close detection (manual close by user)
    let cancelCheckScheduled = false
    const popupCheckTimer = setInterval(() => {
      try {
        if (popup && popup.closed && !closedByMessage && !popupClosedManually) {
          popupClosedManually = true
          
          // Only schedule the cancellation check once
          if (!cancelCheckScheduled) {
            cancelCheckScheduled = true
            
            // For HubSpot, check immediately without any delay
            if (provider === 'hubspot') {
              // Instant check for HubSpot - no waiting
              if (!closedByMessage) {
                cleanup()
                onCancel() // This will trigger the instant check in integrationStore
              }
            } else {
              // For other providers, wait before checking
              const cancelDelay = 2000
              console.log(`⏳ [OAuth] Popup closed for ${provider}, waiting ${cancelDelay}ms for success message...`)
              
              setTimeout(() => {
                if (!closedByMessage) {
                  console.log(`❌ [OAuth] No success message received for ${provider} after ${cancelDelay}ms, treating as cancelled`)
                  cleanup()
                  onCancel() // User intentionally cancelled
                } else {
                  console.log(`✅ [OAuth] Success message received for ${provider} within timeout`)
                }
              }, cancelDelay)
            }
          }
        }
      } catch (error) {
        // COOP policy may block popup.closed access - this is expected
      }
    }, 1000)

    // Use localStorage to check for OAuth responses (COOP-safe)
    // Check instantly for HubSpot
    const storageCheckInterval = provider === 'hubspot' ? 50 : 500
    const storageCheckTimer = setInterval(() => {
      // Continue checking even if popup closed manually - success might still be detected
      
      try {
        const allKeys = Object.keys(localStorage)
        const matchingKeys = allKeys.filter(key => key.startsWith(storageCheckPrefix))
        
        for (const key of matchingKeys) {
          try {
            const responseData = JSON.parse(localStorage.getItem(key) || '')
            
            if (responseData && responseData.type) {
              if (responseData.type === 'oauth-success') {
                // For HubSpot, handle silently
                if (provider !== 'hubspot') {
                  console.log(`✅ [OAuth] Success detected for ${provider} via localStorage`)
                }
                closedByMessage = true
                cleanup()
                localStorage.removeItem(key)
                onSuccess(responseData)
                return
              } else if (responseData.type === 'oauth-error') {
                // For HubSpot, don't log errors
                if (provider !== 'hubspot') {
                  console.error(`❌ OAuth error for ${provider} via localStorage:`, responseData.message)
                }
                closedByMessage = true
                cleanup()
                localStorage.removeItem(key)
                onError(responseData.message || "OAuth error occurred")
                return
              } else if (responseData.type === 'oauth-cancelled') {
                closedByMessage = true
                cleanup()
                localStorage.removeItem(key)
                onCancel()
                return
              }
            }
          } catch (parseError) {
            console.error(`Error parsing localStorage data for key ${key}:`, parseError)
          }
        }
      } catch (error) {
        console.error("Error checking localStorage for OAuth response:", error)
      }
    }, storageCheckInterval) // Check more frequently for HubSpot

    // Connection timeout (5 minutes)
    const connectionTimeout = setTimeout(() => {
      if (!closedByMessage && !popupClosedManually) {
        cleanup()
        try {
          popup.close()
        } catch (e) {
          console.warn("Failed to close popup on timeout:", e)
        }
        onError("Connection timed out. Please try again.")
      }
    }, 5 * 60 * 1000)

    const promise = new Promise<void>((resolve, reject) => {
      const originalOnSuccess = onSuccess
      const originalOnError = onError
      const originalOnCancel = onCancel
      
      // Wrap callbacks to resolve/reject the promise
      onSuccess = (data) => {
        originalOnSuccess(data)
        resolve()
      }
      onError = (error) => {
        originalOnError(error)
        reject(new Error(error))
      }
      onCancel = () => {
        originalOnCancel()
        // For HubSpot and Microsoft providers, don't reject - the cancel handler will check if it actually succeeded
        // These providers may close the popup before sending the success message
        const providersToResolve = [
          'hubspot', 
          'microsoft-onenote', 
          'onenote',
          'microsoft-outlook',
          'outlook',
          'teams',
          'onedrive'
        ]
        
        if (providersToResolve.includes(provider)) {
          resolve() // Resolve instead of reject for these providers
        } else {
          reject(new Error("OAuth cancelled by user"))
        }
      }
    })

    return { cleanup, promise }
  }

  /**
   * Open popup for reconnection flow
   */
  static async openReconnectionPopup(
    authUrl: string,
    provider: string,
    integrationId: string
  ): Promise<void> {
    // Calculate centered position
    const width = 600
    const height = 700
    const left = Math.max(0, (screen.width - width) / 2)
    const top = Math.max(0, (screen.height - height) / 2)
    
    const popupName = `oauth_reconnect_${provider}_${Date.now()}`
    
    // Clean up any existing storage entries
    const storageCheckPrefix = `oauth_response_${provider}`
    const allKeys = Object.keys(localStorage)
    for (const key of allKeys) {
      if (key.startsWith(storageCheckPrefix)) {
        localStorage.removeItem(key)
      }
    }
    
    // Close any existing popup
    this.closeExistingPopup()
    
    const popup = window.open(
      authUrl,
      popupName,
      `width=${width},height=${height},left=${left},top=${top}`,
    )

    if (!popup) {
      throw new Error("Failed to open OAuth popup. Please allow popups and try again.")
    }

    this.currentPopup = popup

    return new Promise((resolve, reject) => {
      let messageReceived = false
      
      const handleMessage = (event: MessageEvent) => {
        // Allow messages from both localhost and production domains
        const allowedOrigins = [
          window.location.origin,
          'http://localhost:3000',
          'https://chainreact.app',
          'https://www.chainreact.app'
        ]
        
        if (!allowedOrigins.includes(event.origin)) {
          console.log('[PopupManager] Ignoring message from unexpected origin:', event.origin)
          return
        }
        
        console.log('[PopupManager] Processing message from:', event.origin)
        messageReceived = true
        
        if (event.data.type === "oauth-success") {
          try {
            popup.close()
          } catch (e) {
            console.warn("Failed to close popup:", e)
          }
          window.removeEventListener("message", handleMessage)
          this.currentPopup = null
          resolve()
        } else if (event.data.type === "oauth-error") {
          console.error("❌ OAuth reconnection failed:", event.data.message)
          try {
            popup.close()
          } catch (e) {
            console.warn("Failed to close popup:", e)
          }
          window.removeEventListener("message", handleMessage)
          this.currentPopup = null
          reject(new Error(event.data.message || "OAuth reconnection failed"))
        } else if (event.data.type === "oauth-cancelled") {
          try {
            popup.close()
          } catch (e) {
            console.warn("Failed to close popup:", e)
          }
          window.removeEventListener("message", handleMessage)
          this.currentPopup = null
          reject(new Error("OAuth reconnection was cancelled"))
        }
      }

      window.addEventListener("message", handleMessage)
      
      // Add manual popup close detection
      let popupClosedManually = false
      const popupCloseCheckTimer = setInterval(() => {
        try {
          if (popup && popup.closed && !messageReceived) {
            popupClosedManually = true
            clearInterval(popupCloseCheckTimer)
            clearInterval(checkPopupClosed)
            window.removeEventListener("message", handleMessage)
            this.currentPopup = null
            // For HubSpot, don't log warnings - handled silently by integration store
            if (provider !== 'hubspot') {
              console.warn('🚫 [OAuth Popup] Popup closed without receiving success message. This could mean:')
              console.warn('  1. User manually closed the popup')
              console.warn('  2. Authorization was cancelled')
              console.warn('  3. Success message was blocked or delayed')
            }
            reject(new Error("User cancelled the reconnection"))
          }
        } catch (error) {
          // COOP policy may block popup.closed access
        }
      }, 1000)
      
      // Use localStorage to check for OAuth responses (COOP-safe)
      const checkPopupClosed = setInterval(() => {
        if (popupClosedManually) return
        
        try {
          const allKeys = Object.keys(localStorage)
          const matchingKeys = allKeys.filter(key => key.startsWith(storageCheckPrefix))
          
          for (const key of matchingKeys) {
            try {
              const responseData = JSON.parse(localStorage.getItem(key) || '')
              
              if (responseData && responseData.type) {
                if (responseData.type === 'oauth-success') {
                  messageReceived = true
                  clearInterval(popupCloseCheckTimer)
                  clearInterval(checkPopupClosed)
                  window.removeEventListener("message", handleMessage)
                  this.currentPopup = null
                  localStorage.removeItem(key)
                  resolve()
                  return
                } else if (responseData.type === 'oauth-error') {
                  // For HubSpot, don't log errors
                  if (provider !== 'hubspot') {
                    console.error(`❌ OAuth reconnection failed via localStorage:`, responseData.message)
                  }
                  messageReceived = true
                  clearInterval(popupCloseCheckTimer)
                  clearInterval(checkPopupClosed)
                  window.removeEventListener("message", handleMessage)
                  this.currentPopup = null
                  localStorage.removeItem(key)
                  reject(new Error(responseData.message || "OAuth reconnection failed"))
                  return
                } else if (responseData.type === 'oauth-cancelled') {
                  messageReceived = true
                  clearInterval(popupCloseCheckTimer)
                  clearInterval(checkPopupClosed)
                  window.removeEventListener("message", handleMessage)
                  this.currentPopup = null
                  localStorage.removeItem(key)
                  reject(new Error("OAuth reconnection was cancelled"))
                  return
                }
              }
            } catch (parseError) {
              console.error(`Error parsing localStorage data for key ${key}:`, parseError)
            }
          }
        } catch (error) {
          console.error("Error checking localStorage for OAuth response:", error)
        }
      }, 1000)

      // Timeout (5 minutes)
      const timeout = setTimeout(() => {
        clearInterval(popupCloseCheckTimer)
        clearInterval(checkPopupClosed)
        try {
          popup.close()
        } catch (e) {
          console.warn("Failed to close popup on timeout:", e)
        }
        window.removeEventListener("message", handleMessage)
        this.currentPopup = null
        reject(new Error("OAuth reconnection timed out"))
      }, 5 * 60 * 1000)
    })
  }

  /**
   * Reset connection state and close any popups
   */
  static resetConnectionState(): void {
    this.closeExistingPopup()
  }

  /**
   * Get current popup window
   */
  static getCurrentPopup(): Window | null {
    return this.currentPopup
  }

  /**
   * Check if window has lost focus
   */
  static hasWindowLostFocus(): boolean {
    return this.windowHasLostFocus
  }

  /**
   * Set window focus state
   */
  static setWindowFocusState(hasLostFocus: boolean): void {
    this.windowHasLostFocus = hasLostFocus
  }
}