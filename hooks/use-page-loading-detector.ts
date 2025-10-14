"use client"

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { logger } from '@/lib/utils/logger'

/**
 * Detects when a page is stuck loading and provides recovery options
 */
export function usePageLoadingDetector() {
  const pathname = usePathname()
  const loadStartTime = useRef<number | null>(null)
  const checkInterval = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Track when page load starts
    loadStartTime.current = Date.now()

    // Check if page is stuck after 3 seconds
    checkInterval.current = setInterval(() => {
      if (loadStartTime.current) {
        const elapsed = Date.now() - loadStartTime.current

        // If page hasn't loaded after 10 seconds, something is wrong
        if (elapsed > 10000) {
          logger.error(`⚠️ Page stuck loading for ${elapsed}ms on ${pathname}`)

          // Show a user-friendly message
          const existingMessage = document.getElementById('loading-stuck-message')
          if (!existingMessage && document.readyState !== 'complete') {
            const message = document.createElement('div')
            message.id = 'loading-stuck-message'
            message.style.cssText = `
              position: fixed;
              bottom: 20px;
              right: 20px;
              background: #fff;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 16px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              z-index: 9999;
              max-width: 300px;
            `
            message.innerHTML = `
              <div style="display: flex; align-items: start; gap: 12px;">
                <div style="flex-shrink: 0; color: #f59e0b;">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">Slow Loading</div>
                  <div style="color: #6b7280; font-size: 14px; margin-bottom: 12px;">The page is taking longer than expected.</div>
                  <button
                    onclick="window.location.reload()"
                    style="
                      background: #3b82f6;
                      color: white;
                      border: none;
                      padding: 6px 12px;
                      border-radius: 6px;
                      font-size: 14px;
                      cursor: pointer;
                      font-weight: 500;
                    "
                    onmouseover="this.style.background='#2563eb'"
                    onmouseout="this.style.background='#3b82f6'"
                  >
                    Refresh Page
                  </button>
                </div>
                <button
                  onclick="this.parentElement.parentElement.remove()"
                  style="
                    flex-shrink: 0;
                    background: none;
                    border: none;
                    color: #6b7280;
                    cursor: pointer;
                    padding: 0;
                    font-size: 20px;
                    line-height: 1;
                  "
                  onmouseover="this.style.color='#374151'"
                  onmouseout="this.style.color='#6b7280'"
                >
                  ×
                </button>
              </div>
            `
            document.body.appendChild(message)
          }

          // Clear the interval
          if (checkInterval.current) {
            clearInterval(checkInterval.current)
            checkInterval.current = null
          }
        }
      }
    }, 1000)

    // Clean up when page loads or unmounts
    const handleLoad = () => {
      if (loadStartTime.current) {
        const loadTime = Date.now() - loadStartTime.current
        logger.debug(`✅ Page loaded in ${loadTime}ms: ${pathname}`)
        loadStartTime.current = null
      }

      // Remove any stuck message
      const message = document.getElementById('loading-stuck-message')
      if (message) {
        message.remove()
      }

      // Clear interval
      if (checkInterval.current) {
        clearInterval(checkInterval.current)
        checkInterval.current = null
      }
    }

    // Listen for page load complete
    if (document.readyState === 'complete') {
      handleLoad()
    } else {
      window.addEventListener('load', handleLoad)
    }

    return () => {
      window.removeEventListener('load', handleLoad)
      if (checkInterval.current) {
        clearInterval(checkInterval.current)
      }
      const message = document.getElementById('loading-stuck-message')
      if (message) {
        message.remove()
      }
    }
  }, [pathname])
}