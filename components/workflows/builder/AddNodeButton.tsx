"use client"

import React from "react"
import { Plus } from "lucide-react"

interface AddNodeButtonProps {
  onClick: () => void
  position: { x: number; y: number }
  showLine?: boolean // Whether to show the line extending from the button (for after last node)
}

/**
 * AddNodeButton - Zapier-style always-visible plus button
 *
 * Positioned on the connecting line between nodes.
 * Shows a dashed vertical line before the button when after the last node.
 * Always visible, not just on hover.
 */
export function AddNodeButton({ onClick, position, showLine = false }: AddNodeButtonProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      {/* Vertical dashed line before button (only for "after last node") - matches edge style */}
      {showLine && (
        <svg
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
          }}
          width="2"
          height="40"
        >
          <line
            x1="1"
            y1="0"
            x2="1"
            y2="40"
            stroke="rgb(156 163 175)" // gray-400
            strokeWidth="2"
            strokeDasharray="5,5"
            className="dark:stroke-gray-600"
          />
        </svg>
      )}

      {/* Plus button on the line */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        className="group relative flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer"
        aria-label="Add node"
      >
        <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-orange-600 dark:group-hover:text-orange-400" />
      </button>
    </div>
  )
}
