'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ProfessionalSearch } from '@/components/ui/professional-search'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, X, Info } from 'lucide-react'
import { useIntegrationStore } from '@/stores/integrationStore'

import { logger } from '@/lib/utils/logger'

interface DynamicFieldSelectorProps {
  value?: string[]
  onChange?: (value: string[]) => void
  description?: string
  integrationId?: string
}

interface HubSpotProperty {
  value: string
  label: string
  description: string
  type: string
  fieldType?: string
  groupName?: string
}

export default function DynamicFieldSelector({ 
  value = [], 
  onChange, 
  description,
  integrationId 
}: DynamicFieldSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [availableProperties, setAvailableProperties] = useState<HubSpotProperty[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedProperties, setSelectedProperties] = useState<string[]>(value || [])
  const [lastValue, setLastValue] = useState<string[]>(value || [])
  
  const { loadIntegrationData } = useIntegrationStore()

  // Load available properties on mount
  useEffect(() => {
    loadAvailableProperties()
  }, [integrationId])

  // Sync selectedProperties when value prop changes
  useEffect(() => {
    if (value && JSON.stringify(value) !== JSON.stringify(lastValue)) {
      setSelectedProperties(value)
      setLastValue(value)
    }
  }, [value, lastValue])

  // Update parent when selected properties change
  useEffect(() => {
    if (onChange && JSON.stringify(selectedProperties) !== JSON.stringify(lastValue)) {
      onChange(selectedProperties)
      setLastValue(selectedProperties)
    }
  }, [selectedProperties, onChange, lastValue])

  const loadAvailableProperties = async () => {
    if (!integrationId) return
    
    setLoading(true)
    try {
      const properties = await loadIntegrationData('hubspot_contact_properties', integrationId)
      setAvailableProperties(properties || [])
    } catch (error) {
      logger.error('Failed to load HubSpot properties:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredProperties = availableProperties.filter(prop => 
    prop.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prop.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prop.value.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const addProperty = (propertyValue: string) => {
    if (!selectedProperties.includes(propertyValue)) {
      const newSelected = [...selectedProperties, propertyValue]
      setSelectedProperties(newSelected)
    }
  }

  const removeProperty = (propertyValue: string) => {
    const newSelected = selectedProperties.filter(p => p !== propertyValue)
    setSelectedProperties(newSelected)
  }

  const getPropertyInfo = (propertyValue: string) => {
    return availableProperties.find(p => p.value === propertyValue)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Selected Properties</Label>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      {/* Selected Properties */}
      {selectedProperties.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Currently Selected:</Label>
          <div className="flex flex-wrap gap-2">
            {selectedProperties.map(propValue => {
              const propInfo = getPropertyInfo(propValue)
              return (
                <Badge 
                  key={propValue} 
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  <span>{propInfo?.label || propValue}</span>
                  <button
                    onClick={() => removeProperty(propValue)}
                    className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Property Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Add Additional Properties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search Input */}
          <ProfessionalSearch
            placeholder="Search for properties..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClear={() => setSearchTerm('')}
          />

          {/* Properties List */}
          <ScrollArea className="h-64">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Loading properties...</div>
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">
                  {searchTerm ? 'No properties found matching your search.' : 'No properties available.'}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProperties.map(property => {
                  const isSelected = selectedProperties.includes(property.value)
                  return (
                    <div
                      key={property.value}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isSelected 
                          ? 'bg-muted border-primary' 
                          : 'bg-background border-border hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {property.label}
                          </span>
                          {property.groupName && (
                            <Badge variant="outline" className="text-xs">
                              {property.groupName}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {property.description}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {property.value}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={isSelected ? "outline" : "default"}
                        onClick={() => isSelected ? removeProperty(property.value) : addProperty(property.value)}
                        className="ml-2"
                      >
                        {isSelected ? (
                          <>
                            <X className="w-3 h-3 mr-1" />
                            Remove
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
        <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="text-sm text-muted-foreground">
          <p>Selected properties will be included when creating the contact. Only writable properties are shown.</p>
        </div>
      </div>
    </div>
  )
} 