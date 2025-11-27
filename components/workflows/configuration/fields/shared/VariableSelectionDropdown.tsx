"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, Check } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { useUpstreamVariables, formatProviderName, UpstreamNode } from '../../hooks/useUpstreamVariables'

interface VariableSelectionDropdownProps {
  workflowData: { nodes: any[]; edges: any[] }
  currentNodeId: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * VariableSelectionDropdown - Shows upstream nodes and their output fields
 * User selects ONE variable to connect to this field
 */
export function VariableSelectionDropdown({
  workflowData,
  currentNodeId,
  value,
  onChange,
  placeholder = "Select a variable...",
  disabled = false
}: VariableSelectionDropdownProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [popoverWidth, setPopoverWidth] = useState<number>()

  // Keep popover width in sync with trigger for polished alignment
  useEffect(() => {
    const button = triggerRef.current
    if (!button) return

    const updateWidth = () => {
      if (triggerRef.current) {
        setPopoverWidth(triggerRef.current.offsetWidth)
      }
    }

    updateWidth()

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateWidth())
      observer.observe(button)
    } else {
      window.addEventListener('resize', updateWidth)
    }

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [])

  // Close the popover when the control becomes disabled
  useEffect(() => {
    if (disabled && open) {
      setOpen(false)
    }
  }, [disabled, open])

  // Use shared hook to get upstream nodes (same data as VariablePickerDropdown)
  const { upstreamNodes, hasUpstreamNodes, hasVariables } = useUpstreamVariables({
    workflowData,
    currentNodeId
  })

  // Parse the current value to extract node ID and field name
  const parseVariable = (varString: string) => {
    // Convert to string if not already (handles number values from number fields)
    const stringValue = typeof varString === 'string' ? varString : String(varString || '')

    if (!stringValue || !stringValue.startsWith('{{') || !stringValue.endsWith('}}')) {
      return null
    }

    const content = stringValue.slice(2, -2) // Remove {{ and }}
    // Split only on the first dot to handle field names with dots (like events[].eventId)
    const firstDotIndex = content.indexOf('.')
    if (firstDotIndex === -1) {
      return { nodeId: content, fieldName: undefined }
    }
    const nodeId = content.substring(0, firstDotIndex)
    const fieldName = content.substring(firstDotIndex + 1)
    return { nodeId, fieldName }
  }

  const parsed = parseVariable(value)

  // Format value for display
  const getDisplayValue = () => {
    if (!parsed) return ""

    // Handle 'trigger' references - find the trigger node
    const node = parsed.nodeId === 'trigger'
      ? upstreamNodes.find(n => n.isTrigger)
      : upstreamNodes.find(n => n.id === parsed.nodeId)
    if (!node) return value

    const field = node.outputs.find((f: any) => f.name === parsed.fieldName)
    if (!field) return `${node.title} → ${parsed.fieldName}`

    const secondaryLabel = field.label && field.label !== field.name ? field.label : null
    const displayName = field.name
    return secondaryLabel ? `${node.title} → ${displayName} (${secondaryLabel})` : `${node.title} → ${displayName}`
  }

  // Only show nodes that expose variables
  const nodesWithVariables = useMemo(
    () => upstreamNodes.filter(node => node.outputs.length > 0),
    [upstreamNodes]
  )

  // If no variables, show message directly in the trigger
  if (!hasUpstreamNodes || !hasVariables) {
    const emptyMessage = !hasUpstreamNodes
      ? "No upstream nodes found. Connect nodes to this one to see available data."
      : "No variables available. The connected nodes don't output any data."

    return (
      <div className="relative w-full">
        <div className="h-10 w-full min-w-0 flex items-center rounded-md border border-input bg-white dark:bg-background px-3 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    )
  }

  const selectedLabel = value ? getDisplayValue() : ""
  const contentWidth = popoverWidth ? Math.max(popoverWidth, 260) : undefined
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

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
            disabled && "cursor-not-allowed opacity-60"
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={cn("truncate", selectedLabel ? "text-foreground" : "text-muted-foreground")}>
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 rounded-md border border-border bg-popover shadow-xl"
        style={contentWidth ? { width: contentWidth } : undefined}
      >
        <Command>
          <CommandInput placeholder="Search variables..." />
          <CommandEmpty>No variables found.</CommandEmpty>
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
                  // Use 'trigger' as the reference prefix for trigger nodes
                  const referencePrefix = node.isTrigger ? 'trigger' : node.id
                  const variableRef = `{{${referencePrefix}.${field.name}}}`
                  const isSelected = value === variableRef
                  const secondaryLabel = field.label && field.label !== field.name ? field.label : null
                  const descriptionText = secondaryLabel
                    ? `${secondaryLabel}${field.description ? ` • ${field.description}` : ''}`
                    : (field.description ? field.description : `From ${node.title}`)

                  return (
                    <CommandItem
                      key={`${node.id}.${field.name}`}
                      value={`${node.title} ${field.name} ${secondaryLabel || ''} ${field.type || ''}`}
                      onSelect={() => {
                        onChange(variableRef)
                        setOpen(false)
                      }}
                      className="px-2 py-2"
                    >
                      <div className="flex w-full items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-tight">
                            {field.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {descriptionText}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-tight">
                            {field.type || 'text'}
                          </Badge>
                          <Check
                            className={cn(
                              "h-4 w-4 text-primary transition-opacity",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </div>
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
