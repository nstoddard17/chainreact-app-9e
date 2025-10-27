/**
 * Animated Cursor
 *
 * Shows an animated cursor that demonstrates UI interactions
 * Kadabra-style tutorial that teaches users where their config went
 */

'use client'

import { useEffect, useState } from 'react'

export interface CursorPosition {
  x: number
  y: number
}

export type CursorAnimation = 'idle' | 'move' | 'click' | 'double-click' | 'right-click' | 'scroll'

interface AnimatedCursorProps {
  isVisible: boolean
  position: CursorPosition
  animation: CursorAnimation
  label?: string
}

export function AnimatedCursor({
  isVisible,
  position,
  animation,
  label
}: AnimatedCursorProps) {
  const [showRipple, setShowRipple] = useState(false)

  useEffect(() => {
    if (animation === 'click' || animation === 'double-click') {
      setShowRipple(true)
      const timeout = setTimeout(() => setShowRipple(false), 600)
      return () => clearTimeout(timeout)
    }
  }, [animation])

  if (!isVisible) return null

  return (
    <>
      {/* Cursor */}
      <div
        className="fixed pointer-events-none z-[10000] transition-all duration-500 ease-out"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-4px, -4px)'
        }}
      >
        {/* Cursor Icon */}
        <svg
          width="28"
          height="32"
          viewBox="0 0 28 32"
          fill="none"
          className="drop-shadow-lg"
        >
          <path
            d="M5.65376 3.86957L22.6315 19.8029L15.4896 21.6759L12.0854 29.0056L8.53612 27.1125L12.0896 19.6411L5.65376 3.86957Z"
            fill="#3B82F6"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>

        {/* Click Ripple */}
        {showRipple && (
          <div className="absolute top-4 left-4">
            <div className="w-8 h-8 bg-blue-500 rounded-full opacity-40 animate-ping" />
            {animation === 'double-click' && (
              <div className="w-8 h-8 bg-blue-500 rounded-full opacity-40 animate-ping animation-delay-150" />
            )}
          </div>
        )}

        {/* Right-click indicator */}
        {animation === 'right-click' && (
          <div className="absolute -top-10 left-8 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            Right-clicking...
            <div className="absolute bottom-0 left-4 transform translate-y-full">
              <div className="border-4 border-transparent border-t-gray-900" />
            </div>
          </div>
        )}

        {/* Scroll indicator */}
        {animation === 'scroll' && (
          <div className="absolute -top-10 left-8 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap flex items-center gap-1">
            <svg className="w-3 h-3 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Scrolling...
            <div className="absolute bottom-0 left-4 transform translate-y-full">
              <div className="border-4 border-transparent border-t-gray-900" />
            </div>
          </div>
        )}

        {/* Custom label */}
        {label && !['right-click', 'scroll'].includes(animation) && (
          <div className="absolute -top-10 left-8 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            {label}
            <div className="absolute bottom-0 left-4 transform translate-y-full">
              <div className="border-4 border-transparent border-t-blue-600" />
            </div>
          </div>
        )}
      </div>

      {/* Spotlight effect on target */}
      <div
        className="fixed pointer-events-none z-[9999] transition-all duration-500"
        style={{
          left: `${position.x - 60}px`,
          top: `${position.y - 60}px`,
          width: '120px',
          height: '120px',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
          borderRadius: '50%'
        }}
      />
    </>
  )
}
