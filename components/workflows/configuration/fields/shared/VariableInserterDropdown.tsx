"use client"

import React, { useEffect, useMemo, useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { extractNodeOutputs, sanitizeAlias } from '../../autoMapping'
import { ScrollArea } from '@/components/ui/scroll-area'

/**
 * Helper function to recursively get ALL previous nodes in the workflow
 */
function getAllPreviousNodeIds(currentNodeId: string, edges: any[]): string[] {
  const findPreviousNodes = (nodeId: string, visited = new Set<string>()): string[] => {
    if (visited.has(nodeId)) return []
    visited.add(nodeId)

    const incomingEdges = edges.filter((edge: any) => edge.target === nodeId)
    if (incomingEdges.length === 0) return []

    const sourceNodeIds = incomingEdges.map((edge: any) => edge.source)
    const allPreviousNodes: string[] = [...sourceNodeIds]

    sourceNodeIds.forEach(sourceId => {
      const previousNodes = findPreviousNodes(sourceId, visited)
      allPreviousNodes.push(...previousNodes)
    })

    return allPreviousNodes
  }

  return findPreviousNodes(currentNodeId)
}

interface VariableInserterDropdownProps {
  workflowData: { nodes: any[]; edges: any[] }
  currentNodeId: string
  onSelect: (variableRef: string, label: string) => void
  trigger: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface UpstreamNode {
  id: string
  title: string
  alias: string
  type?: string
  providerId?: string
  outputs: any[]
  position?: { x: number; y: number }
}

/**
 * VariableInserterDropdown - Styled like VariableSelectionDropdown
 * but designed for inserting variables into rich text fields
 */
export function VariableInserterDropdown({
  workflowData,
  currentNodeId,
  onSelect,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
}: VariableInserterDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false)

  // Use controlled or internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = controlledOnOpenChange || setInternalOpen

  // Get upstream nodes (nodes that connect to the current node)
  const upstreamNodes = useMemo<UpstreamNode[]>(() => {
    const nodeById = new Map(workflowData.nodes.map(n => [n.id, n]))
    const edges = workflowData.edges || []

    // Find ALL previous nodes (all ancestors, not just immediate parents)
    const sourceIds = getAllPreviousNodeIds(currentNodeId, edges)

    const nodes = sourceIds
      .map(id => nodeById.get(id))
      .filter(Boolean)
      .map(node => {
        const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
        const baseOutputs = extractNodeOutputs(node as any)
        const outputs = (baseOutputs && baseOutputs.length > 0)
          ? baseOutputs
          : (nodeComponent?.outputSchema || [])
        const title = node.data?.title || node.data?.label || nodeComponent?.title || 'Unnamed'

        return {
          id: node.id,
          title,
          alias: sanitizeAlias(node.data?.label || node.data?.title || node.data?.type || node.id),
          type: node.data?.type,
          outputs,
          providerId: node.data?.providerId || nodeComponent?.providerId,
          position: node.position || { x: 0, y: 0 },
        }
      })

    // Sort by Y position (top to bottom order in the workflow builder)
    return nodes.sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0))
  }, [workflowData, currentNodeId])

  // Handle variable selection
  const handleSelect = (nodeId: string, outputName: string, outputLabel: string) => {
    const variableRef = `{{${nodeId}.${outputName}}}`
    onSelect(variableRef, outputLabel)
    setOpen(false)
  }

  // Count total variables
  const totalVariables = useMemo(() => {
    return upstreamNodes.reduce((count, node) => count + node.outputs.length, 0)
  }, [upstreamNodes])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-[500px] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <Command className="rounded-lg border-none">
          <CommandInput placeholder="Search variables..." />
          <CommandEmpty>No variables found</CommandEmpty>
          <ScrollArea className="h-[400px]">
            <CommandList>
              {upstreamNodes.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <p>No upstream nodes available</p>
                  <p className="text-xs mt-1">Add nodes before this one to see their outputs</p>
                </div>
              ) : (
                upstreamNodes.map((node) => (
                  <CommandGroup
                    key={node.id}
                    heading={
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        {node.providerId && (
                          <StaticIntegrationLogo
                            providerId={node.providerId}
                            providerName={node.title}
                          />
                        )}
                        <span className="font-medium text-sm">{node.title}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {node.outputs.length} {node.outputs.length === 1 ? 'field' : 'fields'}
                        </Badge>
                      </div>
                    }
                  >
                    {node.outputs.map((output: any) => (
                      <CommandItem
                        key={`${node.id}-${output.name}`}
                        value={`${node.title} ${output.label || output.name}`}
                        onSelect={() => handleSelect(node.id, output.name, output.label || output.name)}
                        className="flex items-start gap-3 px-4 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm">
                              {output.label || output.name}
                            </span>
                            {output.type && (
                              <Badge variant="outline" className="text-xs font-mono">
                                {output.type}
                              </Badge>
                            )}
                          </div>
                          {output.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {output.description}
                            </p>
                          )}
                          <code className="text-xs text-muted-foreground/70 font-mono">
                            {`{{${node.id}.${output.name}}}`}
                          </code>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))
              )}
            </CommandList>
          </ScrollArea>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground bg-muted/30">
            {totalVariables} variable{totalVariables !== 1 ? 's' : ''} available from {upstreamNodes.length} node{upstreamNodes.length !== 1 ? 's' : ''}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
