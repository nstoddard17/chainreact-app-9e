"use client"

import { useEffect } from 'react'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'

/**
 * Prefetch all integration icons to prevent flashing on load
 */
export function IconPrefetcher() {
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Prefetch all integration icons
    const prefetchIcons = () => {
      const iconUrls = Object.values(INTEGRATION_CONFIGS).map(
        config => `/integrations/${config.id}.svg`
      )

      iconUrls.forEach(url => {
        const link = document.createElement('link')
        link.rel = 'prefetch'
        link.as = 'image'
        link.href = url
        link.type = 'image/svg+xml'
        document.head.appendChild(link)
      })
    }

    // Delay slightly to not interfere with critical resources
    const timer = setTimeout(prefetchIcons, 100)

    return () => clearTimeout(timer)
  }, [])

  return null
}