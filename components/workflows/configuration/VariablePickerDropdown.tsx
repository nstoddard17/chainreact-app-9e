"use client"

/**
 * VariablePickerDropdown
 *
 * Inline variable picker that appears next to input fields.
 * Shows available variables from previous nodes with search.
 * Uses the same format as VariableSelectionDropdown for consistency.
 *
 * Features:
 * - Triggered by 🔗 icon button
 * - Searchable list of variables
 * - Organized by node with headers
 * - Click to insert variable reference
 */

import React, { useState, useMemo } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Link2 } from 'lucide-react'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { cn } from '@/lib/utils'
import { useUpstreamVariables } from './hooks/useUpstreamVariables'

interface VariablePickerDropdownProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onSelect: (variableReference: string) => void
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function VariablePickerDropdown({
  workflowData,
  currentNodeId,
  onSelect,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
}: VariablePickerDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false)

  // Use controlled or internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = controlledOnOpenChange || setInternalOpen

  // Use shared hook to get upstream variables (same data as VariableSelectionDropdown)
  const { upstreamNodes, hasUpstreamNodes, hasVariables } = useUpstreamVariables({
    workflowData,
    currentNodeId
  })

  // Only show nodes that expose variables
  const nodesWithVariables = useMemo(
    () => upstreamNodes.filter(node => node.outputs.length > 0),
    [upstreamNodes]
  )

  const renderNodeIcon = (nodeTitle: string, providerId?: string) => {
    if (providerId) {
      return (
        <div className="w-6 h-6 flex items-center justify-center">
          <StaticIntegrationLogo providerId={providerId} providerName={nodeTitle} />
        </div>
      )
    }

    return (
      <div className="w-6 h-6 rounded-md bg-muted text-muted-foreground text-[11px] font-semibold flex items-center justify-center uppercase">
        {nodeTitle?.charAt(0)?.toUpperCase() || '#'}
      </div>
    )
  }

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
      type="button"
    >
      <Link2 className="h-4 w-4" />
    </Button>
  )

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-80 p-0 rounded-md border border-border bg-popover shadow-xl"
      >
        <Command>
          <CommandInput placeholder="Search variables..." />
          <CommandEmpty>
            {!hasUpstreamNodes
              ? "No upstream nodes found. Connect nodes to this one to see available data."
              : "No variables found."}
          </CommandEmpty>
          <CommandList className="max-h-64">
            {nodesWithVariables.map((node) => (
              <CommandGroup
                key={node.id}
                heading={
                  <div className="flex items-center gap-3">
                    {renderNodeIcon(node.title, node.providerId)}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{node.title}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase tracking-tight">
                        {node.outputs.length} field{node.outputs.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </div>
                }
              >
                {node.outputs.map((field: any) => {
                  const variableRef = `{{${node.id}.${field.name}}}`

                  return (
                    <CommandItem
                      key={`${node.id}.${field.name}`}
                      value={`${node.title} ${field.label || field.name} ${field.type || ''}`}
                      onSelect={() => {
                        onSelect(variableRef)
                        setIsOpen(false)
                      }}
                      className="px-2 py-2"
                    >
                      <div className="flex w-full items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-tight">
                            {field.label || field.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {field.description ? field.description : `From ${node.title}`}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-tight">
                          {field.type || 'text'}
                        </Badge>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
