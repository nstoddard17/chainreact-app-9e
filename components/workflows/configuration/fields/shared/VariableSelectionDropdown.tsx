"use client"

import React, { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select"
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
  // Get upstream nodes (nodes that connect to the current node)
  const upstreamNodes = useMemo(() => {
    const nodeById = new Map(workflowData.nodes.map(n => [n.id, n]))
    const edges = workflowData.edges || []

    // Find nodes that connect TO the current node
    const sourceIds = edges
      .filter(e => e.target === currentNodeId)
      .map(e => e.source)

    return sourceIds
      .map(id => nodeById.get(id))
      .filter(Boolean)
      .map(node => {
        const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)

        return {
          id: node.id,
          title: node.data?.title || node.data?.label || nodeComponent?.title || 'Unnamed',
          type: node.data?.type,
          outputSchema: nodeComponent?.outputSchema || []
        }
      })
  }, [workflowData, currentNodeId])

  // Parse the current value to extract node ID and field name
  const parseVariable = (varString: string) => {
    // Convert to string if not already (handles number values from number fields)
    const stringValue = typeof varString === 'string' ? varString : String(varString || '')

    if (!stringValue || !stringValue.startsWith('{{') || !stringValue.endsWith('}}')) {
      return null
    }

    const content = stringValue.slice(2, -2) // Remove {{ and }}
    const [nodeId, fieldName] = content.split('.')
    return { nodeId, fieldName }
  }

  const parsed = parseVariable(value)

  // Format value for display
  const getDisplayValue = () => {
    if (!parsed) return ""

    const node = upstreamNodes.find(n => n.id === parsed.nodeId)
    if (!node) return value

    const field = node.outputSchema.find((f: any) => f.name === parsed.fieldName)
    return `${node.title} → ${field?.label || parsed.fieldName}`
  }

  // Check if any upstream nodes have variables
  const hasAnyVariables = upstreamNodes.some(node => node.outputSchema.length > 0)
  const hasContent = upstreamNodes.length > 0 && hasAnyVariables

  // If no variables, show message directly in the trigger
  if (upstreamNodes.length === 0 || !hasAnyVariables) {
    const emptyMessage = upstreamNodes.length === 0
      ? "No upstream nodes found. Connect nodes to this one to see available data."
      : "No variables available. The connected nodes don't output any data."

    return (
      <div className="relative">
        <div className="h-9 w-full flex items-center rounded-md border border-input bg-white dark:bg-background px-3 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    )
  }

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="h-9 bg-white dark:bg-background">
        <SelectValue placeholder={placeholder}>
          {value && getDisplayValue()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" className="w-full">
        <>
          {upstreamNodes.map((node, nodeIndex) => (
              <React.Fragment key={node.id}>
                {nodeIndex > 0 && <SelectSeparator />}
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-2">
                    {node.title}
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {node.outputSchema.length} field{node.outputSchema.length !== 1 ? 's' : ''}
                    </Badge>
                  </SelectLabel>
                  {node.outputSchema.length === 0 ? (
                    <div className="px-8 py-2 text-xs text-muted-foreground">
                      No output fields available
                    </div>
                  ) : (
                    node.outputSchema.map((field: any) => (
                      <SelectItem
                        key={`${node.id}.${field.name}`}
                        value={`{{${node.id}.${field.name}}}`}
                        className="pl-8"
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-sm">{field.label}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            {field.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectGroup>
              </React.Fragment>
            ))}
        </>
      </SelectContent>
    </Select>
  )
}
