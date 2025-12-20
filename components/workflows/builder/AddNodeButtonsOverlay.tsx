"use client"

import React, { useMemo } from "react"
import { Plus } from "lucide-react"

interface AddNodeButtonsOverlayProps {
  nodes: any[]
  onAddNode: (afterNodeId: string | null) => void
}

/**
 * AddNodeButtonsOverlay - Renders plus buttons between and after nodes
 *
 * Uses flow coordinates directly positioned on the canvas
 * Always visible, Zapier-style UX
 */
export function AddNodeButtonsOverlay({ nodes, onAddNode }: AddNodeButtonsOverlayProps) {
  // Calculate button positions
  const buttonPositions = useMemo(() => {
    if (!nodes || nodes.length === 0) return []

    const positions: Array<{ id: string; position: { x: number; y: number }; afterNodeId: string | null; showLine: boolean }> = []

    // Sort nodes by Y position (top to bottom)
    const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y)

    // Add buttons between consecutive nodes (on the connecting line)
    for (let i = 0; i < sortedNodes.length - 1; i++) {
      const currentNode = sortedNodes[i]
      const nextNode = sortedNodes[i + 1]

      // Calculate midpoint between nodes
      const midY = (currentNode.position.y + nextNode.position.y) / 2

      positions.push({
        id: `add-between-${currentNode.id}-${nextNode.id}`,
        position: {
          x: currentNode.position.x, // Same X as nodes (centered)
          y: midY,
        },
        afterNodeId: currentNode.id,
        showLine: false, // No line for between nodes (button is on existing line)
      })
    }

    // Add button after the last node with a line extending down
    // Use same distance as between nodes (midpoint = 90px if nodes are 180px apart)
    if (sortedNodes.length > 0) {
      const lastNode = sortedNodes[sortedNodes.length - 1]
      const buttonOffset = 90 // Half of 180px vertical spacing - matches midpoint between nodes
      positions.push({
        id: `add-after-${lastNode.id}`,
        position: {
          x: lastNode.position.x,
          y: lastNode.position.y + buttonOffset, // Same visual distance as between nodes
        },
        afterNodeId: lastNode.id,
        showLine: true, // Show line for last button
      })
    }

    return positions
  }, [nodes])

  if (buttonPositions.length === 0) return null

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {buttonPositions.map((btn) => (
        <div
          key={btn.id}
          style={{
            position: 'absolute',
            left: `${btn.position.x}px`,
            top: `${btn.position.y}px`,
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            pointerEvents: 'auto',
          }}
        >
          {/* Vertical dashed line before button (only for "after last node") - matches edge style */}
          {btn.showLine && (
            <svg
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '100%',
                transform: 'translateX(-50%)',
              }}
              width="2"
              height="50"
            >
              <line
                x1="1"
                y1="0"
                x2="1"
                y2="50"
                stroke="rgb(156 163 175)"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            </svg>
          )}

          {/* Plus button on the line */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddNode(btn.afterNodeId)
            }}
            className="group relative flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer"
            aria-label="Add node"
          >
            <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
          </button>
        </div>
      ))}
    </div>
  )
}
