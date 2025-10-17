/**
 * Notion Database Property Builder
 *
 * User-friendly visual interface for building Notion database properties
 * No JSON required - just click and configure
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Trash2, Plus, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import {
  PROPERTY_TYPE_METADATA,
  SELECT_COLORS,
  NUMBER_FORMATS,
  type NotionPropertyType,
  type DatabaseProperty,
  type SelectOption
} from '@/lib/workflows/actions/notion/databasePropertyTypes'

interface NotionDatabasePropertyBuilderProps {
  value?: DatabaseProperty[]
  onChange: (properties: DatabaseProperty[]) => void
  disabled?: boolean
}

export function NotionDatabasePropertyBuilder({
  value = [],
  onChange,
  disabled = false
}: NotionDatabasePropertyBuilderProps) {
  const [expandedProperty, setExpandedProperty] = useState<number | null>(null)

  // Initialize with default Name property if empty
  const properties = value.length === 0 ? [{ name: 'Name', type: 'title' as NotionPropertyType }] : value

  const updateProperty = (index: number, updates: Partial<DatabaseProperty>) => {
    const newProperties = [...properties]
    newProperties[index] = { ...newProperties[index], ...updates }
    onChange(newProperties)
  }

  const addProperty = () => {
    const newProperties = [...properties, { name: '', type: 'rich_text' as NotionPropertyType }]
    onChange(newProperties)
    setExpandedProperty(newProperties.length - 1)
  }

  const removeProperty = (index: number) => {
    // Don't allow removing the last property
    if (properties.length === 1) return

    const newProperties = properties.filter((_, i) => i !== index)
    onChange(newProperties)

    // Adjust expanded property index
    if (expandedProperty === index) {
      setExpandedProperty(null)
    } else if (expandedProperty !== null && expandedProperty > index) {
      setExpandedProperty(expandedProperty - 1)
    }
  }

  const addOption = (propertyIndex: number) => {
    const property = properties[propertyIndex]
    const newOptions = [...(property.options || []), { name: '', color: 'default' }]
    updateProperty(propertyIndex, { options: newOptions })
  }

  const updateOption = (propertyIndex: number, optionIndex: number, updates: Partial<SelectOption>) => {
    const property = properties[propertyIndex]
    const newOptions = [...(property.options || [])]
    newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates }
    updateProperty(propertyIndex, { options: newOptions })
  }

  const removeOption = (propertyIndex: number, optionIndex: number) => {
    const property = properties[propertyIndex]
    const currentOptions = property.options || []

    // Don't allow removing the last option for select/multi_select/status
    if (currentOptions.length <= 1) return

    const newOptions = currentOptions.filter((_, i) => i !== optionIndex)
    updateProperty(propertyIndex, { options: newOptions })
  }

  // Get basic property types only (filter out advanced/system for now)
  const basicPropertyTypes = Object.entries(PROPERTY_TYPE_METADATA)
    .filter(([_, meta]) => meta.category === 'basic')
    .sort((a, b) => a[1].label.localeCompare(b[1].label))

  const isTitleProperty = (property: DatabaseProperty) => property.type === 'title'
  const hasTitleProperty = properties.some(p => p.type === 'title')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Database Properties</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addProperty}
          disabled={disabled}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Property
        </Button>
      </div>

      <div className="space-y-2">
        {properties.map((property, index) => {
          const isExpanded = expandedProperty === index
          const metadata = PROPERTY_TYPE_METADATA[property.type]
          const canDelete = properties.length > 1 && !isTitleProperty(property)

          return (
            <Card key={index} className="p-3">
              {/* Property Header */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                  <span className="text-lg">{metadata.icon}</span>
                  <Input
                    value={property.name}
                    onChange={(e) => updateProperty(index, { name: e.target.value })}
                    placeholder="Property name"
                    disabled={disabled || isTitleProperty(property)}
                    className="flex-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedProperty(isExpanded ? null : index)}
                  disabled={disabled}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeProperty(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>

              {/* Property Details (Expandable) */}
              {isExpanded && (
                <div className="space-y-3 pt-3 border-t">
                  {/* Property Type Selector */}
                  <div className="space-y-2">
                    <Label>Property Type</Label>
                    <Select
                      value={property.type}
                      onValueChange={(value) => {
                        const newType = value as NotionPropertyType
                        const newTypeMeta = PROPERTY_TYPE_METADATA[newType]

                        // Build updates object
                        const updates: Partial<DatabaseProperty> = { type: newType }

                        // If changing TO a type that needs options, add a default option
                        if (newTypeMeta.supportsOptions && (!property.options || property.options.length === 0)) {
                          updates.options = [{ name: 'Option 1', color: 'default' }]
                        }

                        // Clear options when changing away from select types
                        if (!newTypeMeta.supportsOptions) {
                          updates.options = undefined
                        }

                        // Clear format when changing away from number
                        if (!newTypeMeta.supportsFormat) {
                          updates.format = undefined
                        }

                        updateProperty(index, updates)
                      }}
                      disabled={disabled || (isTitleProperty(property) || (property.type !== 'title' && hasTitleProperty && value === 'title'))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {basicPropertyTypes.map(([type, meta]) => {
                          const isDisabled = type === 'title' && hasTitleProperty && property.type !== 'title'
                          return (
                            <SelectItem key={type} value={type} disabled={isDisabled}>
                              <div className="flex items-center gap-2">
                                <span>{meta.icon}</span>
                                <span>{meta.label}</span>
                                {isDisabled && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    Only one allowed
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{metadata.description}</p>
                  </div>

                  {/* Number Format Selector */}
                  {metadata.supportsFormat && (
                    <div className="space-y-2">
                      <Label>Number Format</Label>
                      <Select
                        value={property.format || 'number'}
                        onValueChange={(value) => updateProperty(index, { format: value })}
                        disabled={disabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NUMBER_FORMATS.map((format) => (
                            <SelectItem key={format.value} value={format.value}>
                              {format.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Options Editor for Select/Multi-select */}
                  {metadata.supportsOptions && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Options</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addOption(index)}
                          disabled={disabled}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Option
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {(property.options || []).map((option, optionIndex) => {
                          const canDeleteOption = (property.options || []).length > 1
                          return (
                          <div key={optionIndex} className="flex items-center gap-2">
                            <Input
                              value={option.name}
                              onChange={(e) => updateOption(index, optionIndex, { name: e.target.value })}
                              placeholder="Option name"
                              disabled={disabled}
                              className="flex-1"
                            />
                            <Select
                              value={option.color || 'default'}
                              onValueChange={(value) => updateOption(index, optionIndex, { color: value })}
                              disabled={disabled}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SELECT_COLORS.map((color) => (
                                  <SelectItem key={color} value={color}>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-3 h-3 rounded-full"
                                        style={{
                                          backgroundColor: color === 'default' ? '#666' :
                                            color === 'gray' ? '#999' :
                                            color === 'brown' ? '#8B4513' :
                                            color === 'orange' ? '#FFA500' :
                                            color === 'yellow' ? '#FFD700' :
                                            color === 'green' ? '#00A000' :
                                            color === 'blue' ? '#0066CC' :
                                            color === 'purple' ? '#9B59B6' :
                                            color === 'pink' ? '#FF69B4' :
                                            color === 'red' ? '#DC143C' : '#666'
                                        }}
                                      />
                                      <span className="capitalize">{color}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOption(index, optionIndex)}
                              disabled={disabled || !canDeleteOption}
                              title={!canDeleteOption ? "At least one option is required" : "Remove option"}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                          )
                        })}
                        {(!property.options || property.options.length === 0) && (
                          <p className="text-sm text-muted-foreground italic">
                            No options yet. Add at least one option.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Compact view when collapsed */}
              {!isExpanded && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{metadata.label}</Badge>
                  {metadata.supportsOptions && property.options && property.options.length > 0 && (
                    <span className="text-xs">
                      {property.options.length} option{property.options.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        💡 Tip: Every database needs at least one Title property. You can add Text, Number, Select, Date, and more.
      </p>
    </div>
  )
}
