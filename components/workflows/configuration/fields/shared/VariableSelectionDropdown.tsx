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
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { extractNodeOutputs, sanitizeAlias } from '../../autoMapping'
import { getDownstreamRequiredVariables } from '@/lib/workflows/actions/hitl/downstreamVariables'
import { getActionOutputSchema } from '@/lib/workflows/actions/outputSchemaRegistry'

/**
 * Helper function to recursively get ALL previous nodes in the workflow
 * Not just the immediate parent, but all ancestors
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

  // Get upstream nodes (nodes that connect to the current node)
  interface UpstreamNode {
    id: string
    title: string
    alias: string
    type?: string
    providerId?: string
    outputs: any[]
    isTrigger?: boolean
  }

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
        const registryOutputs = getActionOutputSchema(node.data?.type || '', node.data?.config)
        const staticOutputs = nodeComponent?.outputSchema || []

        // Merge outputs from multiple sources
        let outputs = (registryOutputs && registryOutputs.length > 0)
          ? registryOutputs
          : (baseOutputs && baseOutputs.length > 0)
            ? baseOutputs
            : staticOutputs

        // HITL Node: Add dynamic outputs based on downstream nodes
        // This allows the variable picker to show specific variables
        // that the AI will extract based on what node comes after HITL
        if (node.data?.type === 'hitl_conversation') {
          const downstreamVariables = getDownstreamRequiredVariables(
            node.id,
            workflowData.nodes,
            edges
          )

          // Convert downstream variables to output schema format
          const dynamicOutputs = downstreamVariables.map(v => ({
            name: v.name,
            label: v.label,
            type: v.type,
            description: v.description,
            _isDynamicHITLVariable: true
          }))

          // Merge with existing outputs, avoiding duplicates
          const existingNames = new Set(outputs.map((o: any) => o.name))
          dynamicOutputs.forEach(dynamicOutput => {
            if (!existingNames.has(dynamicOutput.name)) {
              outputs = [...outputs, dynamicOutput]
            }
          })
        }

        // Flatten array properties - if an output has 'properties', include those as individual outputs
        const flattenedOutputs: any[] = []
        outputs.forEach((output: any) => {
          // Always include the top-level field
          flattenedOutputs.push(output)

          // If this is an array with properties, also include the properties as separate fields
          // These will be accessible via events[].fieldName syntax
          if (output.type === 'array' && Array.isArray(output.properties)) {
            output.properties.forEach((prop: any) => {
              flattenedOutputs.push({
                ...prop,
                name: `${output.name}[].${prop.name}`,
                label: prop.label || prop.name, // Just use the property label, node title will be shown separately
                _isArrayProperty: true,
                _parentArray: output.name,
                _parentArrayLabel: output.label || output.name
              })
            })
          }
        })

        const title = node.data?.title || node.data?.label || nodeComponent?.title || 'Unnamed'
        const isTrigger = node.data?.isTrigger || nodeComponent?.isTrigger || false

        return {
          id: node.id,
          title,
          alias: sanitizeAlias(node.data?.label || node.data?.title || node.data?.type || node.id),
          type: node.data?.type,
          outputs: flattenedOutputs,
          providerId: node.data?.providerId || nodeComponent?.providerId,
          position: node.position || { x: 0, y: 0 }, // Include position for sorting
          isTrigger,
        }
      })

    // Sort by Y position (top to bottom order in the workflow builder)
    return nodes.sort((a, b) => a.position.y - b.position.y)
  }, [workflowData, currentNodeId])

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
    return `${node.title} → ${field?.label || parsed.fieldName}`
  }

  // Only show nodes that expose variables
  const nodesWithVariables = useMemo(
    () => upstreamNodes.filter(node => node.outputs.length > 0),
    [upstreamNodes]
  )

  const hasUpstreamNodes = upstreamNodes.length > 0
  const hasContent = nodesWithVariables.length > 0

  // If no variables, show message directly in the trigger
  if (!hasUpstreamNodes || !hasContent) {
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
                  // Use friendly node type for variable reference (engine resolves by type)
                  const referencePrefix = node.isTrigger ? 'trigger' : (node.type || node.id)
                  const variableRef = `{{${referencePrefix}.${field.name}}}`
                  const displayRef = `${referencePrefix}.${field.name}`
                  const isSelected = value === variableRef

                  return (
                    <CommandItem
                      key={`${node.id}.${field.name}`}
                      value={`${node.title} ${field.name} ${displayRef} ${field.label || ''} ${field.type || ''}`}
                      onSelect={() => {
                        onChange(variableRef)
                        setOpen(false)
                      }}
                      className="px-2 py-2"
                    >
                      <div className="flex w-full items-center gap-3">
                        <div className="flex-1">
                          <code className="text-sm font-medium font-mono leading-tight">
                            {displayRef}
                          </code>
                          <p className="text-xs text-muted-foreground">
                            {field.description ? field.description : `From ${node.title}`}
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
