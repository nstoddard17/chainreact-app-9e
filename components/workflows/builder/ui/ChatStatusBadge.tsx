/**
 * ChatStatusBadge.tsx
 *
 * Reusable status badge component for the agent panel.
 * Shows the current state of the workflow build process with animations.
 */

import React from 'react'
import './ChatStatusBadge.css'

export type BadgeState = 'idle' | 'active' | 'waiting' | 'success' | 'error'

export interface ChatStatusBadgeProps {
  text: string
  subtext?: string
  state?: BadgeState
  reducedMotion?: boolean
  className?: string
}

/**
 * ChatStatusBadge
 *
 * A pill-shaped status indicator with:
 * - Pulsing dot on the left (when state='active')
 * - Shimmer effect (when state='active' and not reduced motion)
 * - Subtext support for additional context
 * - aria-live for accessibility
 */
export function ChatStatusBadge({
  text,
  subtext,
  state = 'active',
  reducedMotion = false,
  className = '',
}: ChatStatusBadgeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`chat-status-badge ${state} ${reducedMotion ? 'reduced-motion' : ''} ${className}`}
    >
      <div className="chat-status-badge-content">
        {state === 'active' && (
          <div className="chat-status-badge-dot" aria-hidden="true" />
        )}
        {state === 'success' && (
          <span className="chat-status-badge-icon" aria-hidden="true">✓</span>
        )}
        {state === 'error' && (
          <span className="chat-status-badge-icon error" aria-hidden="true">!</span>
        )}
        <div className="chat-status-badge-text">
          <span className="chat-status-badge-main">{text}</span>
          {subtext && (
            <span className="chat-status-badge-sub">{subtext}</span>
          )}
        </div>
      </div>
    </div>
  )
}
