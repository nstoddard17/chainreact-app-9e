/**
 * Handles chunk loading errors that occur when Next.js chunks fail to load
 * This commonly happens after deployments when old chunks are no longer available
 */

interface ChunkErrorConfig {
  maxRetries: number
  retryDelay: number
  onError?: (error: Error) => void
}

class ChunkErrorHandler {
  private retryCount = new Map<string, number>()
  private config: ChunkErrorConfig = {
    maxRetries: 3,
    retryDelay: 1000,
  }

  constructor(config?: Partial<ChunkErrorConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }

    // Set up global error handler
    this.setupGlobalHandler()
  }

  private setupGlobalHandler() {
    if (typeof window === 'undefined') return

    // Listen for unhandled chunk errors
    window.addEventListener('error', (event) => {
      if (this.isChunkLoadError(event.error)) {
        event.preventDefault()
        this.handleChunkError(event.error)
      }
    })

    // Listen for promise rejections (async chunk loads)
    window.addEventListener('unhandledrejection', (event) => {
      if (this.isChunkLoadError(event.reason)) {
        event.preventDefault()
        this.handleChunkError(event.reason)
      }
    })
  }

  private isChunkLoadError(error: any): boolean {
    return (
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Unable to preload CSS')
    )
  }

  private async handleChunkError(error: Error) {
    console.warn('Chunk load error detected:', error)

    // Extract chunk ID from error message
    const chunkMatch = error.message.match(/chunk (\d+)/)
    const chunkId = chunkMatch ? chunkMatch[1] : 'unknown'

    // Get retry count for this chunk
    const retries = this.retryCount.get(chunkId) || 0

    if (retries < this.config.maxRetries) {
      // Increment retry count
      this.retryCount.set(chunkId, retries + 1)

      console.log(`Retrying chunk ${chunkId} (attempt ${retries + 1}/${this.config.maxRetries})`)

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * (retries + 1)))

      // Try to reload the page with cache bypass
      if (retries === this.config.maxRetries - 1) {
        // Last retry - do a hard reload
        this.showReloadPrompt()
      } else {
        // Try soft reload of the failed module
        this.attemptSoftReload()
      }
    } else {
      // Max retries reached
      console.error(`Failed to load chunk ${chunkId} after ${this.config.maxRetries} retries`)
      this.showReloadPrompt()
    }
  }

  private attemptSoftReload() {
    // Try to reload the current route without full page reload
    if (typeof window !== 'undefined' && window.location) {
      // Use Next.js router if available
      const router = (window as any).next?.router
      if (router) {
        router.reload()
      }
    }
  }

  private showReloadPrompt() {
    // Check if we've already shown a prompt
    if (document.getElementById('chunk-error-prompt')) return

    const prompt = document.createElement('div')
    prompt.id = 'chunk-error-prompt'
    prompt.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: slideDown 0.3s ease-out;
    `

    prompt.innerHTML = `
      <style>
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      </style>
      <div style="flex-shrink: 0;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">
          Update Available
        </div>
        <div style="color: #6b7280; font-size: 14px;">
          A new version is available. Please refresh to update.
        </div>
      </div>
      <button
        onclick="window.location.reload(true)"
        style="
          background: #3b82f6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        "
        onmouseover="this.style.background='#2563eb'"
        onmouseout="this.style.background='#3b82f6'"
      >
        Refresh
      </button>
      <button
        onclick="this.parentElement.remove()"
        style="
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
          margin-left: -8px;
        "
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `

    document.body.appendChild(prompt)

    // Auto-remove after 30 seconds
    setTimeout(() => {
      prompt.remove()
    }, 30000)
  }

  /**
   * Manually retry loading a specific chunk
   */
  retryChunk(chunkId: string): void {
    this.retryCount.delete(chunkId)
    this.attemptSoftReload()
  }

  /**
   * Clear retry counts
   */
  reset(): void {
    this.retryCount.clear()
  }
}

// Create and export singleton instance
let chunkErrorHandler: ChunkErrorHandler | null = null

export function initChunkErrorHandler(config?: Partial<ChunkErrorConfig>): ChunkErrorHandler {
  if (!chunkErrorHandler) {
    chunkErrorHandler = new ChunkErrorHandler(config)
  }
  return chunkErrorHandler
}

export function getChunkErrorHandler(): ChunkErrorHandler | null {
  return chunkErrorHandler
}

// Auto-initialize with default config if in browser
if (typeof window !== 'undefined') {
  initChunkErrorHandler()
}