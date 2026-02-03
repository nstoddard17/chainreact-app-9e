/**
 * Notion Database Item Properties Field
 *
 * Renders input fields for editing database item properties.
 * Loads the database schema and shows appropriate inputs for each property type.
 * Pre-populates fields with current values from the selected Notion item.
 */

import React, { useEffect, useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { Badge } from '@/components/ui/badge'
import { useIntegrationStore } from '@/stores/integrationStore'

interface NotionDatabaseItemPropertiesFieldProps {
  value: any
  onChange: (value: any) => void
  field: any
  values: Record<string, any>
  loadOptions?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>
  dynamicOptions?: Record<string, any[]>
  loadingDynamic?: boolean
}

interface PropertySchema {
  id: string
  name: string
  type: string
  property?: any // Full property config from Notion (includes select options, etc.)
}

/**
 * Extract a simple value from a Notion property response
 */
function extractPropertyValue(propData: any, propType: string): any {
  switch (propType) {
    case 'title':
      if (propData.title && propData.title.length > 0) {
        return propData.title.map((t: any) => t.plain_text).join('')
      }
      return ''

    case 'rich_text':
      if (propData.rich_text && propData.rich_text.length > 0) {
        return propData.rich_text.map((t: any) => t.plain_text).join('')
      }
      return ''

    case 'number':
      return propData.number !== null ? propData.number : ''

    case 'checkbox':
      return propData.checkbox === true

    case 'select':
      return propData.select?.name || ''

    case 'multi_select':
      if (propData.multi_select) {
        return propData.multi_select.map((item: any) => item.name)
      }
      return []

    case 'status':
      return propData.status?.name || ''

    case 'date':
      return propData.date?.start || ''

    case 'url':
      return propData.url || ''

    case 'email':
      return propData.email || ''

    case 'phone_number':
      return propData.phone_number || ''

    case 'people':
      if (propData.people && propData.people.length > 0) {
        return propData.people.map((p: any) => p.name || p.id)
      }
      return []

    case 'relation':
      if (propData.relation && propData.relation.length > 0) {
        return propData.relation.map((r: any) => r.id)
      }
      return []

    case 'files':
      if (propData.files && propData.files.length > 0) {
        return propData.files.map((f: any) => f.name || f.external?.url || f.file?.url).join(', ')
      }
      return ''

    default:
      return ''
  }
}

export function NotionDatabaseItemPropertiesField({
  value = {},
  onChange,
  field,
  values,
  loadOptions,
  dynamicOptions,
  loadingDynamic
}: NotionDatabaseItemPropertiesFieldProps) {
  const [properties, setProperties] = useState<PropertySchema[]>([])
  const [propertyValues, setPropertyValues] = useState<Record<string, any>>(value || {})
  const [loading, setLoading] = useState(false)
  const [loadingItemValues, setLoadingItemValues] = useState(false)
  const lastFetchedDatabaseRef = useRef<string | null>(null)
  const lastFetchedItemRef = useRef<string | null>(null)

  const { getIntegrationByProvider } = useIntegrationStore()

  // Load properties when database is selected
  useEffect(() => {
    const databaseId = values?.database

    if (!databaseId) {
      setProperties([])
      return
    }

    // Avoid refetching for same database
    if (lastFetchedDatabaseRef.current === databaseId && properties.length > 0) {
      return
    }

    if (loadOptions && field.dependsOn) {
      setLoading(true)
      lastFetchedDatabaseRef.current = databaseId
      loadOptions(field.name, field.dependsOn, databaseId, true)
        .finally(() => setLoading(false))
    }
  }, [values?.database, field.dependsOn, field.name, loadOptions])

  // Fetch current property values when an item is selected
  useEffect(() => {
    const itemId = values?.item
    const workspaceId = values?.workspace

    if (!itemId || !workspaceId) {
      return
    }

    // Avoid refetching for same item
    if (lastFetchedItemRef.current === itemId) {
      return
    }

    const fetchItemValues = async () => {
      setLoadingItemValues(true)
      lastFetchedItemRef.current = itemId

      try {
        const integration = getIntegrationByProvider('notion')
        if (!integration) {
          logger.error('[NotionDatabaseItemPropertiesField] No Notion integration found')
          return
        }

        // Fetch the page/item details to get current property values
        const response = await fetch('/api/integrations/notion/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId: integration.id,
            dataType: 'page_details',
            options: {
              pageId: itemId,
              workspaceId: workspaceId
            }
          })
        })

        if (!response.ok) {
          throw new Error('Failed to fetch item details')
        }

        const result = await response.json()
        const pageData = result.data

        if (pageData?.properties) {
          logger.debug('[NotionDatabaseItemPropertiesField] Fetched item properties:', Object.keys(pageData.properties))

          // Extract values from each property
          const extractedValues: Record<string, any> = {}

          for (const [propName, propData] of Object.entries(pageData.properties) as any) {
            const propType = propData.type
            const extractedValue = extractPropertyValue(propData, propType)

            // Only set if we got a meaningful value
            if (extractedValue !== '' && extractedValue !== null && extractedValue !== undefined) {
              extractedValues[propName] = extractedValue
              logger.debug(`[NotionDatabaseItemPropertiesField] Extracted ${propName} (${propType}):`, extractedValue)
            }
          }

          // Merge with any existing saved values (saved values take precedence)
          const mergedValues = { ...extractedValues, ...(value || {}) }

          logger.debug('[NotionDatabaseItemPropertiesField] Setting initial values:', mergedValues)
          setPropertyValues(mergedValues)
          onChange(mergedValues)
        }
      } catch (error: any) {
        logger.error('[NotionDatabaseItemPropertiesField] Error fetching item values:', error)
      } finally {
        setLoadingItemValues(false)
      }
    }

    fetchItemValues()
  }, [values?.item, values?.workspace, getIntegrationByProvider])

  // Update properties when dynamicOptions change
  useEffect(() => {
    const loadedProperties = dynamicOptions?.[field.name] || []

    logger.debug('[NotionDatabaseItemPropertiesField] Properties loaded:', {
      fieldName: field.name,
      propertyCount: loadedProperties.length,
      properties: loadedProperties.slice(0, 3)
    })

    if (loadedProperties.length > 0) {
      // Filter out system properties that can't be edited
      const editableProperties = loadedProperties.filter((prop: PropertySchema) =>
        !['created_time', 'created_by', 'last_edited_time', 'last_edited_by', 'rollup', 'formula'].includes(prop.type)
      )
      setProperties(editableProperties)
    }
  }, [dynamicOptions, field.name])

  // Sync value prop to internal state (for reopening saved configs)
  useEffect(() => {
    if (value && typeof value === 'object' && Object.keys(value).length > 0) {
      setPropertyValues(prev => ({ ...prev, ...value }))
    }
  }, [value])

  // Update parent when property values change
  const updatePropertyValue = (propertyName: string, newValue: any) => {
    const updatedValues = { ...propertyValues, [propertyName]: newValue }
    setPropertyValues(updatedValues)
    onChange(updatedValues)
  }

  // Render input for a property based on its type
  const renderPropertyInput = (property: PropertySchema) => {
    const currentValue = propertyValues[property.name]
    const propertyConfig = property.property || {}

    switch (property.type) {
      case 'title':
      case 'rich_text':
        return (
          <Input
            value={currentValue || ''}
            onChange={(e) => updatePropertyValue(property.name, e.target.value)}
            placeholder={`Enter ${property.name.toLowerCase()}...`}
            className="w-full"
          />
        )

      case 'number':
        return (
          <Input
            type="number"
            value={currentValue || ''}
            onChange={(e) => updatePropertyValue(property.name, e.target.value ? Number(e.target.value) : '')}
            placeholder="Enter number..."
            className="w-full"
          />
        )

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`prop-${property.id}`}
              checked={currentValue === true || currentValue === 'true'}
              onCheckedChange={(checked) => updatePropertyValue(property.name, checked)}
            />
            <label
              htmlFor={`prop-${property.id}`}
              className="text-sm text-muted-foreground cursor-pointer"
            >
              {currentValue ? 'Checked' : 'Unchecked'}
            </label>
          </div>
        )

      case 'select':
        const selectOptions = propertyConfig.select?.options || []
        return (
          <Select
            value={currentValue || ''}
            onValueChange={(val) => updatePropertyValue(property.name, val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`Select ${property.name.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((option: any) => (
                <SelectItem key={option.id || option.name} value={option.name}>
                  <div className="flex items-center gap-2">
                    {option.color && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getNotionColor(option.color) }}
                      />
                    )}
                    {option.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'multi_select':
        const multiSelectOptions = propertyConfig.multi_select?.options || []
        const selectedValues = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : [])
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {selectedValues.map((val: string) => (
                <Badge
                  key={val}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => {
                    const newValues = selectedValues.filter((v: string) => v !== val)
                    updatePropertyValue(property.name, newValues)
                  }}
                >
                  {val} ×
                </Badge>
              ))}
            </div>
            <Select
              value=""
              onValueChange={(val) => {
                if (!selectedValues.includes(val)) {
                  updatePropertyValue(property.name, [...selectedValues, val])
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Add option..." />
              </SelectTrigger>
              <SelectContent>
                {multiSelectOptions
                  .filter((option: any) => !selectedValues.includes(option.name))
                  .map((option: any) => (
                    <SelectItem key={option.id || option.name} value={option.name}>
                      <div className="flex items-center gap-2">
                        {option.color && (
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getNotionColor(option.color) }}
                          />
                        )}
                        {option.name}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )

      case 'status':
        const statusOptions = propertyConfig.status?.options || []
        return (
          <Select
            value={currentValue || ''}
            onValueChange={(val) => updatePropertyValue(property.name, val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select status..." />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option: any) => (
                <SelectItem key={option.id || option.name} value={option.name}>
                  <div className="flex items-center gap-2">
                    {option.color && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getNotionColor(option.color) }}
                      />
                    )}
                    {option.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'date':
        return (
          <Input
            type="date"
            value={currentValue || ''}
            onChange={(e) => updatePropertyValue(property.name, e.target.value)}
            className="w-full"
          />
        )

      case 'url':
        return (
          <Input
            type="url"
            value={currentValue || ''}
            onChange={(e) => updatePropertyValue(property.name, e.target.value)}
            placeholder="https://..."
            className="w-full"
          />
        )

      case 'email':
        return (
          <Input
            type="email"
            value={currentValue || ''}
            onChange={(e) => updatePropertyValue(property.name, e.target.value)}
            placeholder="email@example.com"
            className="w-full"
          />
        )

      case 'phone_number':
        return (
          <Input
            type="tel"
            value={currentValue || ''}
            onChange={(e) => updatePropertyValue(property.name, e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="w-full"
          />
        )

      default:
        // For unsupported types, show a text input as fallback
        return (
          <Input
            value={currentValue || ''}
            onChange={(e) => updatePropertyValue(property.name, e.target.value)}
            placeholder={`Enter ${property.name.toLowerCase()}...`}
            className="w-full"
          />
        )
    }
  }

  // Show loading state
  if (loading || loadingDynamic) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading properties...</span>
      </div>
    )
  }

  // Show loading state when fetching item values
  if (loadingItemValues) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading current values...</span>
      </div>
    )
  }

  // Show empty state if no database selected
  if (!values?.database) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Select a database first to see available properties.
      </div>
    )
  }

  // Show empty state if no properties loaded
  if (properties.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No editable properties found in this database.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-2">
        Set values for the properties you want to update:
      </div>
      {properties.map((property) => (
        <div key={property.id} className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-2">
            {property.name}
            <Badge variant="outline" className="text-xs font-normal">
              {property.type.replace('_', ' ')}
            </Badge>
          </Label>
          {renderPropertyInput(property)}
        </div>
      ))}
    </div>
  )
}

// Helper to convert Notion color names to CSS colors
function getNotionColor(colorName: string): string {
  const colors: Record<string, string> = {
    default: '#37352F',
    gray: '#787774',
    brown: '#9F6B53',
    orange: '#D9730D',
    yellow: '#CB912F',
    green: '#448361',
    blue: '#337EA9',
    purple: '#9065B0',
    pink: '#C14C8A',
    red: '#D44C47',
  }
  return colors[colorName] || colors.default
}
