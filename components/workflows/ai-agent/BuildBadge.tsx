"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { DESIGN_TOKENS } from '@/lib/workflows/ai-agent/design-tokens'
import {
  CanvasBadge,
  type CanvasBadgeVariant,
} from '@/components/workflows/builder/ui/CanvasBadge'

interface BuildBadgeProps {
  text: string
  subtext?: string
  stage: 'idle' | 'building' | 'waiting' | 'preparing' | 'testing' | 'complete'
}

/**
 * Build Badge - Top-center overlay showing build progress
 */
export function BuildBadge({ text, subtext, stage }: BuildBadgeProps) {
  const [visible, setVisible] = useState(stage !== 'idle')
  const [fadeOut, setFadeOut] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => setReducedMotion(mediaQuery.matches)
    handleChange()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    if (stage === 'idle') {
      setVisible(false)
      setFadeOut(false)
      return () => {
        if (fadeTimer) clearTimeout(fadeTimer)
        if (hideTimer) clearTimeout(hideTimer)
      }
    }

    setVisible(true)
    setFadeOut(false)

    if (stage === 'complete') {
      fadeTimer = setTimeout(() => {
        setFadeOut(true)
        hideTimer = setTimeout(() => setVisible(false), 300)
      }, DESIGN_TOKENS.BADGE_FADE_OUT_DELAY)

      return () => {
        if (fadeTimer) clearTimeout(fadeTimer)
        if (hideTimer) clearTimeout(hideTimer)
      }
    }

    return () => {
      if (fadeTimer) clearTimeout(fadeTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [stage])

  const variant: CanvasBadgeVariant = useMemo(() => {
    switch (stage) {
      case 'waiting':
      case 'preparing':
      case 'testing':
        return 'waiting'
      case 'complete':
        return 'success'
      case 'idle':
      case 'building':
      default:
        return 'active'
    }
  }, [stage])

  const showDots = stage === 'building'
  const showSpinner = stage === 'building' || stage === 'preparing' || stage === 'testing'

  if (!visible) {
    return null
  }

  return (
    <div
      className={[
        'pointer-events-none',
        'absolute',
        'top-20',
        'left-1/2',
        '-translate-x-1/2',
        'z-50',
        'transition-opacity',
        'duration-300',
        fadeOut ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <CanvasBadge
        text={text}
        subtext={subtext}
        variant={variant}
        showDots={showDots}
        showSpinner={showSpinner}
        reducedMotion={reducedMotion}
      />
    </div>
  )
}
