"use client"

import React from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Mail, Zap, Box, FileText, Hash, ToggleLeft, List, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldOption {
  name: string
  label: string
  type: string
  nodeId?: string
  nodeLabel?: string
  isTrigger?: boolean
}

interface GroupedFieldSelectorProps {
  value: string
  onChange: (value: string) => void
  fields: FieldOption[]
  placeholder?: string
  className?: string
}

// Group fields by their source
function groupFields(fields: FieldOption[]) {
  const triggerFields: FieldOption[] = []
  const nodeFields: Record<string, FieldOption[]> = {}

  fields.forEach(field => {
    if (field.isTrigger) {
      triggerFields.push(field)
    } else if (field.nodeId) {
      if (!nodeFields[field.nodeId]) {
        nodeFields[field.nodeId] = []
      }
      nodeFields[field.nodeId].push(field)
    }
  })

  return { triggerFields, nodeFields }
}

// Get icon for field type
function getFieldTypeIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'string':
    case 'text':
      return <FileText className="w-3.5 h-3.5" />
    case 'number':
      return <Hash className="w-3.5 h-3.5" />
    case 'boolean':
      return <ToggleLeft className="w-3.5 h-3.5" />
    case 'array':
      return <List className="w-3.5 h-3.5" />
    case 'date':
    case 'datetime':
      return <Calendar className="w-3.5 h-3.5" />
    case 'email':
      return <Mail className="w-3.5 h-3.5" />
    default:
      return <Box className="w-3.5 h-3.5" />
  }
}

// Get color for field type
function getFieldTypeColor(type: string) {
  switch (type.toLowerCase()) {
    case 'string':
    case 'text':
      return 'text-blue-600 dark:text-blue-400'
    case 'number':
      return 'text-green-600 dark:text-green-400'
    case 'boolean':
      return 'text-purple-600 dark:text-purple-400'
    case 'array':
      return 'text-orange-600 dark:text-orange-400'
    case 'email':
      return 'text-pink-600 dark:text-pink-400'
    default:
      return 'text-gray-600 dark:text-gray-400'
  }
}

export function GroupedFieldSelector({
  value,
  onChange,
  fields,
  placeholder = "Select field",
  className
}: GroupedFieldSelectorProps) {
  const { triggerFields, nodeFields } = groupFields(fields)

  // Find selected field to display its label and icon
  const selectedField = fields.find(f => f.name === value)

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("min-w-[200px]", className)}>
        <SelectValue placeholder={placeholder}>
          {selectedField && (
            <div className="flex items-center gap-2">
              <span className={cn("flex-shrink-0", getFieldTypeColor(selectedField.type))}>
                {getFieldTypeIcon(selectedField.type)}
              </span>
              <span className="truncate">{selectedField.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {/* Trigger Data Group */}
        {triggerFields.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2 text-foreground">
              <Zap className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              Trigger Data
            </SelectLabel>
            {triggerFields.map((field) => (
              <SelectItem key={field.name} value={field.name}>
                <div className="flex items-center gap-2">
                  <span className={cn("flex-shrink-0", getFieldTypeColor(field.type))}>
                    {getFieldTypeIcon(field.type)}
                  </span>
                  <span className="flex-1 truncate">{field.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {field.type}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {/* Previous Nodes Groups */}
        {Object.entries(nodeFields).map(([nodeId, nodeFieldsList], groupIndex) => {
          const firstField = nodeFieldsList[0]
          const nodeLabel = firstField.nodeLabel || nodeId

          return (
            <SelectGroup key={nodeId}>
              {groupIndex > 0 || triggerFields.length > 0 ? (
                <div className="h-px bg-border my-1" />
              ) : null}
              <SelectLabel className="flex items-center gap-2 text-foreground">
                <Box className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                {nodeLabel}
              </SelectLabel>
              {nodeFieldsList.map((field) => (
                <SelectItem key={field.name} value={field.name}>
                  <div className="flex items-center gap-2">
                    <span className={cn("flex-shrink-0", getFieldTypeColor(field.type))}>
                      {getFieldTypeIcon(field.type)}
                    </span>
                    <span className="flex-1 truncate">{field.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {field.type}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )
        })}

        {/* Empty state */}
        {fields.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No fields available. Add nodes before this step to access their data.
          </div>
        )}
      </SelectContent>
    </Select>
  )
}
