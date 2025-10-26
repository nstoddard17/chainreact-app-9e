"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface PlannedNode {
  title: string
  description: string
  type: 'trigger' | 'action'
  providerId?: string
}

interface WorkflowPlanProps {
  nodes: PlannedNode[]
  onContinue: () => void
  className?: string
  isBuilding?: boolean // New prop to indicate building in progress
}

function IntegrationIcon({ providerId }: { providerId: string }) {
  const [imageError, setImageError] = useState(false)
  const iconPath = `/integrations/${providerId}.svg`

  if (imageError) {
    // Fallback if image fails to load
    return (
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/20 border border-border flex items-center justify-center">
        <span className="text-xs font-medium text-primary">{providerId.substring(0, 2).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center p-1">
      <img
        src={iconPath}
        alt={providerId}
        className="w-full h-full object-contain"
        onError={() => setImageError(true)}
      />
    </div>
  )
}

export function WorkflowPlan({ nodes, onContinue, className, isBuilding = false }: WorkflowPlanProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="text-sm font-medium text-foreground">
        Here's what I'm going to build for you:
      </div>

      {/* Planned nodes as stacked badges */}
      <div className="space-y-2">
        {nodes.map((node, index) => (
            <div
              key={index}
              className="w-full bg-accent/50 border border-border rounded-lg px-4 py-3"
            >
              <div className="flex items-start gap-3">
                {/* Integration icon */}
                {node.providerId ? (
                  <IntegrationIcon providerId={node.providerId} />
                ) : (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/20 border border-border flex items-center justify-center" />
                )}

                {/* Node info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {node.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {node.description}
                  </div>
                </div>
              </div>
            </div>
        ))}
      </div>

      {/* Action button - only show when not building */}
      {!isBuilding && (
        <div className="pt-2">
          <Button
            onClick={onContinue}
            className="w-full"
            size="sm"
          >
            Continue Building
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Want to modify? Just type your changes in the chat
          </p>
        </div>
      )}
    </div>
  )
}
