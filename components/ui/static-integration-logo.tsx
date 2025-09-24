"use client"

import { memo } from 'react'
import { cn } from '@/lib/utils'

interface StaticIntegrationLogoProps {
  providerId: string
  providerName: string
  providerColor?: string
}

/**
 * A truly static logo component that NEVER re-renders after initial mount
 * Uses only primitive props (strings) to ensure React's memo works perfectly
 */
export const StaticIntegrationLogo = memo(function StaticIntegrationLogo({
  providerId,
  providerName,
  providerColor
}: StaticIntegrationLogoProps) {
  const logoPath = `/integrations/${providerId}.svg`
  const needsInversion = ['airtable', 'github', 'google-docs', 'instagram', 'tiktok', 'x'].includes(providerId)

  return (
    <div className="w-6 h-6 relative">
      <img
        src={logoPath}
        alt={`${providerName} logo`}
        className={cn(
          "w-6 h-6 object-contain",
          needsInversion && "dark:invert"
        )}
        loading="eager"
        onError={(e) => {
          // On error, hide the image and show fallback
          const img = e.currentTarget
          img.style.display = 'none'
          const fallback = img.nextElementSibling as HTMLElement
          if (fallback) {
            fallback.style.display = 'flex'
          }
        }}
      />
      {/* Fallback - hidden by default, shown only on error */}
      <div
        className="w-6 h-6 rounded-full items-center justify-center text-white text-xs font-semibold absolute inset-0"
        style={{
          backgroundColor: providerColor || '#6B7280',
          display: 'none'
        }}
      >
        {providerName.charAt(0).toUpperCase()}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom equality check - only re-render if these specific props change
  return (
    prevProps.providerId === nextProps.providerId &&
    prevProps.providerName === nextProps.providerName &&
    prevProps.providerColor === nextProps.providerColor
  )
})