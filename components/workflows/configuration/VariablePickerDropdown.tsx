"use client"

/**
 * VariablePickerDropdown
 *
 * Inline variable picker that appears next to input fields.
 * Shows available variables from previous nodes with search and keyboard navigation.
 *
 * Features:
 * - Triggered by 🔗 icon button or typing {{
 * - Searchable list of variables
 * - Organized by node
 * - Keyboard navigation (arrows, Enter, Escape)
 * - Click to insert variable reference
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ProfessionalSearch } from '@/components/ui/professional-search'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Link2, Search, ChevronRight } from 'lucide-react'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { getActionOutputSchema } from '@/lib/workflows/actions/outputSchemaRegistry'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { cn } from '@/lib/utils'

interface Variable {
  nodeId: string
  nodeTitle: string
  nodeProviderName?: string
  providerId?: string
  fieldName: string
  fieldLabel: string
  fieldType?: string
  fullReference: string // e.g., {{node_id.field_name}}
}

interface VariableGroup {
  nodeId: string
  nodeTitle: string
  providerId?: string
  providerName?: string
  variables: Variable[]
}

interface VariablePickerDropdownProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onSelect: (variableReference: string) => void
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const formatProviderName = (providerId?: string): string => {
  if (!providerId) return ''
  return providerId
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
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
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Use controlled or internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = controlledOnOpenChange || setInternalOpen

  // Get previous nodes based on edges
  const getPreviousNodes = useCallback((nodeId: string): string[] => {
    if (!workflowData?.edges) return []

    const findPreviousNodes = (id: string, visited = new Set<string>()): string[] => {
      if (visited.has(id)) return []
      visited.add(id)

      const incomingEdges = workflowData.edges.filter((edge: any) => edge.target === id)
      const directParents = incomingEdges.map((edge: any) => edge.source)

      const allPreviousNodes = [...directParents]
      directParents.forEach(parent => {
        allPreviousNodes.push(...findPreviousNodes(parent, visited))
      })

      return allPreviousNodes
    }

    return findPreviousNodes(nodeId)
  }, [workflowData])

  // Get all available variables grouped by node
  const variableGroups = useMemo((): VariableGroup[] => {
    if (!workflowData?.nodes || !currentNodeId) return []

    // Get previous node IDs
    const previousNodeIds = new Set(getPreviousNodes(currentNodeId))

    // Filter to previous nodes only and sort by Y position (workflow order)
    const previousNodes = workflowData.nodes
      .filter((node: any) =>
        previousNodeIds.has(node.id) &&
        node.id !== 'add-action-button' &&
        !node.data?.title?.toLowerCase().includes('add action')
      )
      .sort((a: any, b: any) => {
        const posA = a.position || { x: 0, y: 0 }
        const posB = b.position || { x: 0, y: 0 }
        return posA.y - posB.y
      })

    // Build variable groups
    const groups: VariableGroup[] = previousNodes.map((node: any) => {
      const nodeComponent = ALL_NODE_COMPONENTS.find(comp => comp.type === node.data?.type)
      let outputSchema = getActionOutputSchema(node.data?.type || '', node.data?.config)

      // Flatten array properties - if an output has 'properties', include those as individual outputs
      const flattenedOutputs: any[] = []
      outputSchema.forEach((output: any) => {
        // Always include the top-level field
        flattenedOutputs.push(output)

        // If this is an array with properties, also include the properties as separate fields
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

      const providerId = node.data?.providerId || nodeComponent?.providerId || ''
      const providerName = formatProviderName(providerId)
      const nodeTitle = node.data?.title?.trim() || nodeComponent?.title || 'Step'

      const variables: Variable[] = flattenedOutputs.map(output => ({
        nodeId: node.id,
        nodeTitle,
        nodeProviderName: providerName,
        providerId,
        fieldName: output.name,
        fieldLabel: output.label || output.name,
        fieldType: output.type,
        fullReference: `{{${node.id}.${output.name}}}`
      }))

      return {
        nodeId: node.id,
        nodeTitle,
        providerId,
        providerName,
        variables
      }
    })

    // Filter out groups with no variables
    return groups.filter(g => g.variables.length > 0)
  }, [workflowData, currentNodeId, getPreviousNodes])

  // Flatten and filter variables based on search
  const filteredVariables = useMemo(() => {
    const allVariables = variableGroups.flatMap(group => group.variables)

    if (!searchTerm.trim()) return allVariables

    const term = searchTerm.toLowerCase()
    return allVariables.filter(v =>
      v.fieldLabel.toLowerCase().includes(term) ||
      v.fieldName.toLowerCase().includes(term) ||
      v.nodeTitle.toLowerCase().includes(term) ||
      v.nodeProviderName?.toLowerCase().includes(term)
    )
  }, [variableGroups, searchTerm])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredVariables.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredVariables[selectedIndex]) {
          handleSelect(filteredVariables[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
    }
  }, [isOpen, filteredVariables, selectedIndex])

  // Handle variable selection
  const handleSelect = useCallback((variable: Variable) => {
    onSelect(variable.fullReference)
    setIsOpen(false)
    setSearchTerm('')
    setSelectedIndex(0)
  }, [onSelect, setIsOpen])

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      selectedElement?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, isOpen])

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchTerm])

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
        className="w-80 p-0"
        align="start"
        onKeyDown={handleKeyDown}
      >
        <div className="flex flex-col h-full max-h-96">
          {/* Search Header */}
          <div className="p-3 border-b">
            <ProfessionalSearch
              ref={searchInputRef}
              placeholder="Search variables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClear={() => setSearchTerm('')}
            />
            <p className="text-xs text-muted-foreground mt-2">
              {filteredVariables.length} variable{filteredVariables.length !== 1 ? 's' : ''} available
            </p>
          </div>

          {/* Variables List */}
          <ScrollArea className="flex-1">
            <div ref={listRef} className="p-2">
              {filteredVariables.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {searchTerm ? 'No variables match your search' : 'No variables available'}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredVariables.map((variable, index) => (
                    <button
                      key={`${variable.nodeId}-${variable.fieldName}`}
                      data-index={index}
                      onClick={() => handleSelect(variable)}
                      className={cn(
                        "w-full flex items-start gap-3 p-2 rounded-md text-left transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        selectedIndex === index && "bg-accent text-accent-foreground"
                      )}
                    >
                      {/* Node Icon */}
                      {variable.providerId ? (
                        <div className="flex-shrink-0 mt-0.5">
                          <StaticIntegrationLogo
                            providerId={variable.providerId}
                            providerName={variable.nodeProviderName || variable.providerId}
                          />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}

                      {/* Variable Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {variable.fieldLabel}
                          </span>
                          {variable.fieldType && (
                            <Badge variant="secondary" className="text-xs">
                              {variable.fieldType}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          From: {variable.nodeTitle}
                        </div>
                        <code className="text-xs text-muted-foreground font-mono">
                          {variable.fullReference}
                        </code>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer Hint */}
          <div className="p-2 border-t bg-muted/50">
            <p className="text-xs text-muted-foreground text-center">
              <kbd className="px-1.5 py-0.5 bg-background rounded border text-xs">↑↓</kbd> navigate
              <kbd className="ml-2 px-1.5 py-0.5 bg-background rounded border text-xs">Enter</kbd> select
              <kbd className="ml-2 px-1.5 py-0.5 bg-background rounded border text-xs">Esc</kbd> close
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
