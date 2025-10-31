"use client"

import React from 'react'
import { Handle, Position } from '@xyflow/react'
import './styles/handle-variations.css'

/**
 * Handle Design Tester Component
 *
 * Shows 4 different handle design options side by side for comparison:
 * 1. Half-moons with pulse on hover (current + enhanced)
 * 2. Dots with pulse (Figma style)
 * 3. Full circles (n8n style)
 * 4. Half-moons with center dot
 *
 * Place this component in the workflow builder to test different designs.
 */

interface HandleDesignTesterProps {
  onClose?: () => void
}

export function HandleDesignTester({ onClose }: HandleDesignTesterProps) {
  const designs = [
    {
      id: 'halfmoon-pulse',
      name: 'Half-Moons with Pulse',
      description: 'Current design with subtle pulse animation on hover',
      handleClass: 'handle-halfmoon-pulse',
      width: '16px',
      height: '32px',
      borderRadius: {
        left: '0 9999px 9999px 0',
        right: '9999px 0 0 9999px'
      },
      position: { left: '0px', right: '0px' }
    },
    {
      id: 'dots',
      name: 'Dots (Figma Style)',
      description: 'Small circular dots that pulse and expand on hover',
      handleClass: 'handle-dot',
      width: '10px',
      height: '10px',
      borderRadius: { left: '50%', right: '50%' },
      position: { left: '-5px', right: '-5px' }
    },
    {
      id: 'circles',
      name: 'Full Circles (n8n Style)',
      description: 'Traditional circular handles with shadow',
      handleClass: 'handle-circle',
      width: '14px',
      height: '14px',
      borderRadius: { left: '50%', right: '50%' },
      position: { left: '-7px', right: '-7px' }
    },
    {
      id: 'halfmoon-dot',
      name: 'Half-Moons with Center Dot',
      description: 'Half-moons with a dot in the center for connection point',
      handleClass: 'handle-halfmoon-dot',
      width: '16px',
      height: '32px',
      borderRadius: {
        left: '0 9999px 9999px 0',
        right: '9999px 0 0 9999px'
      },
      position: { left: '0px', right: '0px' }
    }
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
      <div className="bg-background rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Handle Design Options</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Compare different handle designs. Hover over each to see interaction.
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Design Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {designs.map((design) => (
            <div
              key={design.id}
              className="border rounded-lg overflow-hidden bg-card"
            >
              {/* Design Header */}
              <div className="px-4 py-3 bg-muted/50 border-b">
                <h3 className="font-semibold text-sm">{design.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {design.description}
                </p>
              </div>

              {/* Visual Preview */}
              <div className="p-8 flex items-center justify-center bg-muted/20">
                <div className="relative w-[400px] h-[120px] bg-background rounded-lg border-2 border-border shadow-sm">
                  {/* Mock node content */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded bg-muted" />
                        <span className="text-sm font-medium">Sample Node</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Hover over the handles →
                      </p>
                    </div>
                  </div>

                  {/* Left Handle */}
                  <div
                    className={design.handleClass}
                    data-handlepos="left"
                    style={{
                      position: 'absolute',
                      left: design.position.left,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: design.width,
                      height: design.height,
                      borderRadius: design.borderRadius.left,
                      background: 'hsl(var(--muted) / 0.3)',
                      border: '1.5px solid hsl(var(--border))',
                      borderRight: design.id.includes('halfmoon') ? '1.5px solid hsl(var(--border))' : undefined,
                      borderLeft: design.id.includes('halfmoon') ? 'none' : undefined,
                      borderTop: design.id.includes('halfmoon') ? 'none' : undefined,
                      borderBottom: design.id.includes('halfmoon') ? 'none' : undefined,
                      cursor: 'pointer',
                      zIndex: 10,
                    }}
                  />

                  {/* Right Handle */}
                  <div
                    className={design.handleClass}
                    data-handlepos="right"
                    style={{
                      position: 'absolute',
                      right: design.position.right,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: design.width,
                      height: design.height,
                      borderRadius: design.borderRadius.right,
                      background: 'hsl(var(--muted) / 0.3)',
                      border: '1.5px solid hsl(var(--border))',
                      borderLeft: design.id.includes('halfmoon') ? '1.5px solid hsl(var(--border))' : undefined,
                      borderRight: design.id.includes('halfmoon') ? 'none' : undefined,
                      borderTop: design.id.includes('halfmoon') ? 'none' : undefined,
                      borderBottom: design.id.includes('halfmoon') ? 'none' : undefined,
                      cursor: 'pointer',
                      zIndex: 10,
                    }}
                  />
                </div>
              </div>

              {/* Pros/Cons */}
              <div className="px-4 py-3 bg-muted/30 text-xs space-y-2">
                <div>
                  <span className="font-semibold text-green-600">Pros:</span>
                  <span className="ml-2 text-muted-foreground">
                    {design.id === 'halfmoon-pulse' && 'Unique, blends with edges, professional'}
                    {design.id === 'dots' && 'Minimal, modern (Figma), clear pulse feedback'}
                    {design.id === 'circles' && 'Traditional, familiar (n8n), easy to see'}
                    {design.id === 'halfmoon-dot' && 'Shows exact connection point, unique style'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-red-600">Cons:</span>
                  <span className="ml-2 text-muted-foreground">
                    {design.id === 'halfmoon-pulse' && 'Less obvious when not hovering'}
                    {design.id === 'dots' && 'Small target area (but expands on hover)'}
                    {design.id === 'circles' && 'Can look generic, less unique'}
                    {design.id === 'halfmoon-dot' && 'Dot might feel cluttered'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer with Recommendations */}
        <div className="sticky bottom-0 bg-muted/50 border-t px-6 py-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Recommendation</h3>
            <p className="text-xs text-muted-foreground">
              <strong>Option 1 (Half-moons with pulse)</strong> keeps your unique design while adding better hover feedback.
              <br />
              <strong>Option 2 (Dots)</strong> if you want a more minimal, modern look like Figma.
              <br />
              <strong>Option 3 (Circles)</strong> if you want maximum familiarity and visibility.
              <br />
              <strong>Option 4 (Half-moons + dot)</strong> if you want to show the exact connection point.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HandleDesignTester
