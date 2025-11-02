"use client"

import React from "react"
import { WorkflowNode } from "@/stores/workflowStore"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { Puzzle } from "lucide-react"

interface ConnectedNodesDisplayProps {
  nodes: WorkflowNode[]
  maxDisplay?: number
}

export function ConnectedNodesDisplay({ nodes, maxDisplay = 3 }: ConnectedNodesDisplayProps) {
  // Filter out UI-only nodes
  const actionNodes = nodes.filter((node) => {
    const nodeType = node.data?.type || node.type
    // Filter out UI helper nodes
    return nodeType !== 'addAction' && nodeType !== 'custom' && !node.data?.isAIAgentChild
  })

  // Map all action nodes to display format (not deduplicating)
  const allNodes = actionNodes.map((node, idx) => {
    const providerId = node.data?.providerId || 'core'
    const title = node.data?.title || node.data?.label || 'Node'
    return {
      id: node.id,
      providerId,
      title,
      type: node.data?.type || node.type
    }
  })

  const displayNodes = allNodes.slice(0, maxDisplay)
  const remainingCount = allNodes.length - maxDisplay

  if (allNodes.length === 0) {
    return (
      <div className="flex items-center gap-1 text-slate-400">
        <Puzzle className="w-4 h-4" />
        <span className="text-xs">No nodes</span>
      </div>
    )
  }

  return (
    <div className="flex items-center -space-x-2">
      {displayNodes.map((node, index) => (
        <TooltipProvider key={node.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="relative w-6 h-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center overflow-hidden hover:border-slate-400 hover:z-10 transition-all"
                style={{ zIndex: index }}
              >
                <Image
                  src={`/integrations/${node.providerId}.svg`}
                  alt={node.providerId}
                  width={16}
                  height={16}
                  className="w-4 h-4"
                  onError={(e) => {
                    // Fallback to core icon if provider icon doesn't exist
                    const target = e.target as HTMLImageElement
                    target.src = '/integrations/core.svg'
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs font-medium">{node.title}</p>
              <p className="text-xs text-slate-400">{node.providerId}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}

      {remainingCount > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-6 px-2 text-xs font-medium bg-white text-slate-700 border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-400 transition-all cursor-default ml-1"
              >
                +{remainingCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs font-medium">{remainingCount} more node{remainingCount !== 1 ? 's' : ''}</p>
              <div className="mt-1 space-y-0.5">
                {allNodes.slice(maxDisplay).slice(0, 5).map((node, index) => (
                  <p key={index} className="text-xs text-slate-400">
                    {node.title} ({node.providerId})
                  </p>
                ))}
                {allNodes.length - maxDisplay > 5 && (
                  <p className="text-xs text-slate-400 italic">
                    ...and {allNodes.length - maxDisplay - 5} more
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}