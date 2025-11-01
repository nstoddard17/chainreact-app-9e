"use client"

import React, { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { DESIGN_TOKENS } from '@/lib/workflows/ai-agent/design-tokens'

interface BuildBadgeProps {
  text: string
  subtext?: string
  stage: 'idle' | 'building' | 'waiting' | 'preparing' | 'testing' | 'complete'
}

/**
 * Build Badge - Top-center overlay showing build progress
 */
export function BuildBadge({ text, subtext, stage }: BuildBadgeProps) {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    if (stage === 'complete') {
      // Start fade out after delay
      const timeout = setTimeout(() => {
        setFadeOut(true)
        setTimeout(() => setVisible(false), 300)
      }, DESIGN_TOKENS.BADGE_FADE_OUT_DELAY)

      return () => clearTimeout(timeout)
    }
  }, [stage])

  if (!visible || stage === 'idle') {
    return null
  }

  const showSpinner = stage === 'building' || stage === 'preparing' || stage === 'testing'
  const isComplete = stage === 'complete'

  return (
    <div
      className={`absolute top-20 left-1/2 transform -translate-x-1/2 z-50 transition-opacity duration-300 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Badge
        variant={isComplete ? 'default' : 'secondary'}
        className={`
          px-4 py-2 shadow-lg
          ${isComplete ? 'bg-green-500 hover:bg-green-600' : 'bg-white border-2'}
        `}
      >
        <div className="flex items-center gap-2">
          {showSpinner && <Loader2 className="w-4 h-4 animate-spin" />}
          <div className="flex flex-col items-start">
            <span className="font-medium text-sm">{text}</span>
            {subtext && (
              <span className="text-xs opacity-80">{subtext}</span>
            )}
          </div>
          {stage === 'building' && (
            <div className="flex gap-1 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </Badge>
    </div>
  )
}
