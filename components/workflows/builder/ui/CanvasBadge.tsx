/**
 * CanvasBadge.tsx
 *
 * Floating top-center badge for the canvas during the build phase.
 * Shows current build status with bouncing dots animation.
 */

import React from 'react'
import Image from 'next/image'
import './CanvasBadge.css'

export type CanvasBadgeVariant = 'active' | 'waiting' | 'success' | 'error'

export interface CanvasBadgeProps {
  text: string
  subtext?: string
  variant?: CanvasBadgeVariant
  reducedMotion?: boolean
  className?: string
}

/**
 * CanvasBadge
 *
 * A floating badge positioned at the top-center of the canvas:
 * - Three bouncing dots animation (when variant='active')
 * - Subtext support for additional context
 * - Success/error states with appropriate styling
 * - aria-live for accessibility
 */
export function CanvasBadge({
  text,
  subtext,
  variant = 'active',
  reducedMotion = false,
  className = '',
}: CanvasBadgeProps) {
  const showDots = variant === 'active' && text.includes('…')
  const showWaitingSpinner = variant === 'waiting'
  const showIcon = variant === 'active' || variant === 'waiting'
  const waitingSpinner = showWaitingSpinner ? (
    <svg
      className={`canvas-badge-spinner-square ${reducedMotion ? 'paused' : ''}`}
      viewBox="0 0 20 20"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        rx="3"
        ry="3"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  ) : null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`canvas-badge ${variant} ${reducedMotion ? 'reduced-motion' : ''} ${className}`}
    >
      <div className="canvas-badge-content">
        <div className="canvas-badge-text-wrapper">
          {showIcon && (
            <Image
              src="/logo.png"
              alt="ChainReact"
              width={18}
              height={18}
              className="canvas-badge-icon"
              priority
            />
          )}
          <span className="canvas-badge-text">{text}</span>
          {!subtext && waitingSpinner}
          {showDots && !reducedMotion && (
            <div className="canvas-badge-dots" aria-hidden="true">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          )}
        </div>
        {subtext && (
          <div className="canvas-badge-subtext-wrapper">
            <span className="canvas-badge-subtext">{subtext}</span>
            {waitingSpinner}
          </div>
        )}
      </div>
    </div>
  )
}
