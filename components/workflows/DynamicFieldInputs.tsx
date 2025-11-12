'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

import { logger } from '@/lib/utils/logger'

interface DynamicFieldInputsProps {
  selectedProperties: string[]
  values: Record<string, any>
  onChange: (values: Record<string, any>) => void
  integrationId?: string
}

interface PropertyDetails {
  name: string
  label: string
  type: string
  fieldType: string
  options?: { value: string; label: string }[]
  existingValues?: string[]
}

const CUSTOM_VALUE_OPTION = "__chainreact_internal__custom_property_value__"

export default function DynamicFieldInputs({
  selectedProperties,
  values,
  onChange,
  integrationId
}: DynamicFieldInputsProps) {
  const [propertyDetails, setPropertyDetails] = useState<Record<string, PropertyDetails>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [existingValuesLoading, setExistingValuesLoading] = useState<Record<string, boolean>>({})
  const loadingRef = useRef<Set<string>>(new Set())
  const lastRequestRef = useRef<Record<string, number>>({})

  // Load property details for selected properties
  useEffect(() => {
    if (!integrationId) return
    
    // Only load properties that we haven't loaded yet and aren't currently loading
    const propertiesToLoad = selectedProperties.filter(propertyName => 
      !propertyDetails[propertyName] && !loadingRef.current.has(propertyName)
    )
    
    propertiesToLoad.forEach(propertyName => {
      loadPropertyDetails(propertyName)
    })
  }, [selectedProperties, integrationId]) // Remove propertyDetails to prevent infinite loop

  const loadPropertyDetails = async (propertyName: string) => {
    if (!integrationId) return
    
    // Prevent duplicate requests and add debounce
    if (loadingRef.current.has(propertyName)) return
    
    const now = Date.now()
    const lastRequest = lastRequestRef.current[propertyName] || 0
    if (now - lastRequest < 1000) return // Debounce for 1 second
    
    lastRequestRef.current[propertyName] = now
    loadingRef.current.add(propertyName)
    setLoading(prev => ({ ...prev, [propertyName]: true }))
    
    try {
      const response = await fetch(
        `/api/integrations/hubspot/property-options?property=${encodeURIComponent(propertyName)}&integrationId=${integrationId}`
      )
      
      if (response.ok) {
        const data = await response.json()
        setPropertyDetails(prev => ({
          ...prev,
          [propertyName]: data.property
        }))
        
        // After loading property details, fetch existing values for text fields
        if (data.property.fieldType === 'text' || data.property.fieldType === 'string') {
          loadExistingValues(propertyName)
        }
      } else if (response.status === 401) {
        logger.warn(`Unauthorized access for property ${propertyName}. Please check your HubSpot integration.`)
      } else {
        logger.error(`Failed to load property details for ${propertyName}: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      logger.error(`Failed to load property details for ${propertyName}:`, error)
    } finally {
      loadingRef.current.delete(propertyName)
      setLoading(prev => ({ ...prev, [propertyName]: false }))
    }
  }

  const loadExistingValues = async (propertyName: string) => {
    if (!integrationId) return
    
    setExistingValuesLoading(prev => ({ ...prev, [propertyName]: true }))
    
    try {
      const response = await fetch(
        `/api/integrations/hubspot/property-values?property=${encodeURIComponent(propertyName)}`
      )
      
      if (response.ok) {
        const data = await response.json()
        setPropertyDetails(prev => ({
          ...prev,
          [propertyName]: {
            ...prev[propertyName],
            existingValues: data.data
          }
        }))
      } else {
        logger.error(`Failed to load existing values for ${propertyName}: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      logger.error(`Failed to load existing values for ${propertyName}:`, error)
    } finally {
      setExistingValuesLoading(prev => ({ ...prev, [propertyName]: false }))
    }
  }

  const handleValueChange = (propertyName: string, value: any) => {
    const newValues = { ...values, [propertyName]: value }
    onChange(newValues)
  }

  const getInputType = (property: PropertyDetails) => {
    switch (property.fieldType) {
      case 'text':
      case 'string':
        return 'text'
      case 'number':
        return 'number'
      case 'textarea':
        return 'textarea'
      case 'select':
      case 'enumeration':
        return 'select'
      case 'boolean':
        return 'boolean'
      case 'date':
        return 'date'
      case 'datetime':
        return 'datetime-local'
      default:
        return 'text'
    }
  }

  const renderInput = (propertyName: string, property: PropertyDetails) => {
    const inputType = getInputType(property)
    const currentValue = values[propertyName] || ''

    switch (inputType) {
      case 'select':
        return (
          <Select value={currentValue} onValueChange={(value) => handleValueChange(propertyName, value)}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${property.label}`} />
            </SelectTrigger>
            <SelectContent>
              {property.options?.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'textarea':
        return (
          <Textarea
            value={currentValue}
            onChange={(e) => handleValueChange(propertyName, e.target.value)}
            placeholder={`Enter ${property.label}`}
          />
        )

      case 'boolean':
        return (
          <Select value={currentValue.toString()} onValueChange={(value) => handleValueChange(propertyName, value === 'true')}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${property.label}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        )

      case 'date':
      case 'datetime-local':
        return (
          <Input
            type={inputType}
            value={currentValue}
            onChange={(e) => handleValueChange(propertyName, e.target.value)}
            placeholder={`Select ${property.label}`}
          />
        )

      default:
        // For text fields, show dropdown with existing values if available
        if (property.existingValues && property.existingValues.length > 0) {
          return (
            <Select
              value={currentValue === '' ? CUSTOM_VALUE_OPTION : currentValue}
              onValueChange={(value) =>
                handleValueChange(propertyName, value === CUSTOM_VALUE_OPTION ? '' : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select or type ${property.label}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CUSTOM_VALUE_OPTION}>
                  <span className="text-muted-foreground">Type a new value...</span>
                </SelectItem>
                {property.existingValues.map(value => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        
        return (
          <Input
            type={inputType}
            value={currentValue}
            onChange={(e) => handleValueChange(propertyName, e.target.value)}
            placeholder={`Enter ${property.label}`}
          />
        )
    }
  }

  if (selectedProperties.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Additional Field Values</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedProperties.map(propertyName => {
          const property = propertyDetails[propertyName]
          const isLoading = loading[propertyName]
          const isExistingValuesLoading = existingValuesLoading[propertyName]

          return (
            <div key={propertyName} className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">
                  {property?.label || propertyName}
                </Label>
                {(isLoading || isExistingValuesLoading) && <Loader2 className="w-4 h-4 animate-spin" />}
                <Badge variant="outline" className="text-xs">
                  {property?.fieldType || 'text'}
                </Badge>
                {property?.existingValues && property.existingValues.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {property.existingValues.length} existing values
                  </Badge>
                )}
              </div>
              
              {isLoading ? (
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              ) : property ? (
                <div className="space-y-2">
                  {renderInput(propertyName, property)}
                  {isExistingValuesLoading && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading existing values...
                    </div>
                  )}
                </div>
              ) : (
                <Input
                  value={values[propertyName] || ''}
                  onChange={(e) => handleValueChange(propertyName, e.target.value)}
                  placeholder={`Enter ${propertyName}`}
                />
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
} 
