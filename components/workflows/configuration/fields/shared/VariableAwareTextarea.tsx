"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { FullscreenTextArea } from '../FullscreenTextEditor'
import { VariablePickerDropdown } from '../../VariablePickerDropdown'
import { useUpstreamVariables } from '../../hooks/useUpstreamVariables'

interface VariableAwareTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: boolean
  rows?: number
  fieldLabel?: string
  disabled?: boolean
  workflowData?: { nodes: any[]; edges: any[] }
  currentNodeId?: string
  className?: string
}

interface VariableMapping {
  actual: string      // {{node_id.field_name}}
  display: string     // {{Provider.NodeTitle.FieldLabel}}
  nodeId: string
  fieldName: string
}

/**
 * VariableAwareTextarea
 *
 * A textarea that displays variables in a user-friendly format while
 * storing the actual node ID references for backend processing.
 *
 * Display: "Meet at {{Google_Calendar.List_Events.eventId}}"
 * Actual:  "Meet at {{google_calendar_action_list_events-abc123.eventId}}"
 */
export function VariableAwareTextarea({
  value,
  onChange,
  placeholder,
  error,
  rows = 6,
  fieldLabel,
  disabled,
  workflowData,
  currentNodeId,
  className
}: VariableAwareTextareaProps) {
  const [variablePickerOpen, setVariablePickerOpen] = useState(false)

  // Store the mapping of actual->display for variables currently in the value
  const [variableMappings, setVariableMappings] = useState<Map<string, VariableMapping>>(new Map())

  // Get upstream nodes for variable information
  const { upstreamNodes } = useUpstreamVariables({
    workflowData,
    currentNodeId
  })

  // Build node lookup map for efficient access
  const nodeMap = useMemo(() => {
    const map = new Map<string, any>()
    upstreamNodes.forEach(node => {
      map.set(node.id, node)
    })
    return map
  }, [upstreamNodes])

  // Format a provider ID to human-readable name
  const formatProviderName = useCallback((providerId: string): string => {
    if (!providerId) return ''
    return providerId
      .replace(/[_-]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('_')
  }, [])

  // Sanitize a string for display (replace spaces with underscores)
  const sanitizeForDisplay = useCallback((str: string): string => {
    if (!str) return ''
    return str
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
  }, [])

  // Create a display format for a variable
  const createDisplayFormat = useCallback((nodeId: string, fieldName: string): string => {
    const node = nodeMap.get(nodeId)
    if (!node) return `{{${nodeId}.${fieldName}}}`

    const providerName = node.providerId
      ? formatProviderName(node.providerId)
      : ''

    const nodeTitle = sanitizeForDisplay(node.title || 'Node')

    const fieldPath = fieldName

    return providerName
      ? `{{${providerName}.${nodeTitle}.${fieldPath}}}`
      : `{{${nodeTitle}.${fieldPath}}}`
  }, [nodeMap, formatProviderName, sanitizeForDisplay])

  // Parse actual value and build variable mappings
  useEffect(() => {
    if (!value || typeof value !== 'string') {
      setVariableMappings(new Map())
      return
    }

    const newMappings = new Map<string, VariableMapping>()
    const variablePattern = /\{\{([^}]+)\}\}/g
    let match

    while ((match = variablePattern.exec(value)) !== null) {
      const fullMatch = match[0]  // {{node_id.field}}
      const content = match[1]    // node_id.field

      // Parse the variable reference
      const firstDotIndex = content.indexOf('.')
      if (firstDotIndex === -1) continue

      const nodeId = content.substring(0, firstDotIndex)
      const fieldName = content.substring(firstDotIndex + 1)

      // Check if this looks like an actual node ID (has UUID-like pattern)
      // Skip if it already looks like a display format (no hyphens/underscores with UUIDs)
      if (!nodeId.includes('-') && !nodeMap.has(nodeId)) continue

      // Only process if we know this node
      if (!nodeMap.has(nodeId)) continue

      const displayFormat = createDisplayFormat(nodeId, fieldName)

      newMappings.set(fullMatch, {
        actual: fullMatch,
        display: displayFormat,
        nodeId,
        fieldName
      })
    }

    setVariableMappings(newMappings)
  }, [value, nodeMap, createDisplayFormat])

  // Transform actual value to display value
  const displayValue = useMemo(() => {
    if (!value || typeof value !== 'string') return ''

    let result = value
    variableMappings.forEach((mapping) => {
      result = result.replace(mapping.actual, mapping.display)
    })

    return result
  }, [value, variableMappings])

  // Transform display value back to actual value
  const transformToActual = useCallback((displayText: string): string => {
    if (!displayText) return ''

    let result = displayText

    // Replace display formats with actual formats
    variableMappings.forEach((mapping) => {
      // Use split/join for compatibility instead of replaceAll
      result = result.split(mapping.display).join(mapping.actual)
    })

    return result
  }, [variableMappings])

  // Handle text changes from the textarea
  const handleChange = useCallback((newDisplayValue: string) => {
    // Transform any known display formats back to actual formats
    const actualValue = transformToActual(newDisplayValue)
    onChange(actualValue)
  }, [transformToActual, onChange])

  // Handle variable selection from picker
  const handleVariableSelect = useCallback((variableRef: string) => {
    // variableRef is in actual format: {{node_id.field}}
    // Parse it to create display format
    const content = variableRef.slice(2, -2)  // Remove {{ and }}
    const firstDotIndex = content.indexOf('.')
    if (firstDotIndex === -1) {
      // No field, just append as-is
      const currentValue = value || ''
      const newValue = currentValue + (currentValue ? ' ' : '') + variableRef
      onChange(newValue)
      return
    }

    const nodeId = content.substring(0, firstDotIndex)
    const fieldName = content.substring(firstDotIndex + 1)

    // Create display format for the new variable
    const displayFormat = createDisplayFormat(nodeId, fieldName)

    // Add to mappings
    const newMapping: VariableMapping = {
      actual: variableRef,
      display: displayFormat,
      nodeId,
      fieldName
    }

    setVariableMappings(prev => {
      const newMap = new Map(prev)
      newMap.set(variableRef, newMapping)
      return newMap
    })

    // Append the actual variable to the value (it will be transformed to display)
    const currentValue = value || ''
    const newValue = currentValue + (currentValue ? ' ' : '') + variableRef
    onChange(newValue)

    setVariablePickerOpen(false)
  }, [value, onChange, createDisplayFormat])

  return (
    <div className="relative">
      <FullscreenTextArea
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder || `Enter ${fieldLabel || 'text'}...`}
        className={cn(
          error && "border-red-500",
          // Add extra padding on the right for the variable picker button
          workflowData && currentNodeId && "pr-16",
          className
        )}
        error={error}
        rows={rows}
        fieldLabel={fieldLabel}
        disabled={disabled}
        showPlaceholderOverlay={false}
        placeholderOverlayLabel=""
        onClearPlaceholder={() => {}}
      />
      {/* Variable Picker Button - positioned next to the expand button */}
      {workflowData && currentNodeId && (
        <div className="absolute top-2 right-12">
          <VariablePickerDropdown
            workflowData={workflowData}
            currentNodeId={currentNodeId}
            open={variablePickerOpen}
            onOpenChange={setVariablePickerOpen}
            onSelect={handleVariableSelect}
          />
        </div>
      )}
    </div>
  )
}
