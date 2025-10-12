'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Search, Eye, EyeOff, Info, Plus, X, Building } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIntegrationStore } from '@/stores/integrationStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import VariablePicker from './VariablePicker'

import { logger } from '@/lib/utils/logger'

interface CompanyFieldProperty {
  name: string
  label: string
  type: string
  fieldType: string
  groupName: string
  description?: string
  hidden: boolean
  options: { value: string; label: string }[]
  existingValues: string[]
}

interface CompanyFieldsSelectorProps {
  integrationId: string
  selectedFields: string[]
  onFieldsChange: (fields: string[]) => void
  fieldValues: Record<string, any>
  onFieldValueChange: (fieldName: string, value: any) => void
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

export default function CompanyFieldsSelector({
  integrationId,
  selectedFields,
  onFieldsChange,
  fieldValues,
  onFieldValueChange,
  workflowData,
  currentNodeId
}: CompanyFieldsSelectorProps) {
  const [properties, setProperties] = useState<CompanyFieldProperty[]>([])
  const [groupedProperties, setGroupedProperties] = useState<Record<string, CompanyFieldProperty[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<string>('companyinformation')
  
  const { loadIntegrationData } = useIntegrationStore()

  // Function to get compact group names for tabs
  const getCompactGroupName = (groupName: string): string => {
    const nameMap: Record<string, string> = {
      'companyinformation': 'Company Info',
      'companyactivity': 'Company Activity',
      'salesproperties': 'Sales Properties',
      'marketingproperties': 'Marketing',
      'socialmedia': 'Social Media',
      'socialmediainformation': 'Social Media',
      'lifecyclestage': 'Lifecycle',
      'dealinformation': 'Deal Info',
      'facebookadsproperties': 'Facebook Ads',
      'other': 'Other'
    }
    
    return nameMap[groupName.toLowerCase()] || groupName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  useEffect(() => {
    loadAllProperties()
  }, [integrationId, loadIntegrationData])

  const loadAllProperties = async () => {
    try {
      setLoading(true)
      const result = await loadIntegrationData('hubspot_all_company_properties', integrationId)
      
      logger.debug('🔍 CompanyFieldsSelector received result:', result)
      
      if (result && result.properties) {
        logger.debug('✅ Found company properties:', result.properties.length)
        logger.debug('✅ Found grouped company properties:', Object.keys(result.groupedProperties))
        
        setProperties(result.properties)
        setGroupedProperties(result.groupedProperties)
        setError(null)
      } else {
        setError('No company properties found')
      }
    } catch (err: any) {
      logger.error('Error loading company properties:', err)
      setError(err.message || 'Failed to load company properties')
    } finally {
      setLoading(false)
    }
  }

  const handleFieldToggle = (fieldName: string) => {
    const newSelectedFields = selectedFields.includes(fieldName)
      ? selectedFields.filter(f => f !== fieldName)
      : [...selectedFields, fieldName]
    
    onFieldsChange(newSelectedFields)
  }

  const renderFieldInput = (field: CompanyFieldProperty) => {
    const currentValue = fieldValues[field.name] || ''

    // Helper function to render input with VariablePicker
    const renderInputWithVariablePicker = (inputElement: React.ReactNode) => (
      <div className="flex gap-2">
        <div className="flex-1">
          {inputElement}
        </div>
        <VariablePicker
          workflowData={workflowData}
          currentNodeId={currentNodeId}
          onVariableSelect={(variable) => onFieldValueChange(field.name, variable)}
          fieldType={field.type}
          trigger={
            <Button variant="outline" size="sm" className="flex-shrink-0 px-3">
              <Building className="w-4 h-4" />
            </Button>
          }
        />
      </div>
    )

    switch (field.type) {
      case 'select':
        return renderInputWithVariablePicker(
          <Select value={currentValue} onValueChange={(value) => onFieldValueChange(field.name, value)}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'text':
        // Show dropdown with existing values if available
        if (field.existingValues && field.existingValues.length > 0) {
          return renderInputWithVariablePicker(
            <Select value={currentValue} onValueChange={(value) => onFieldValueChange(field.name, value)}>
              <SelectTrigger>
                <SelectValue placeholder={`Select or type ${field.label}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  <span className="text-muted-foreground">Type a new value...</span>
                </SelectItem>
                {field.existingValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        return renderInputWithVariablePicker(
          <Input
            value={currentValue}
            onChange={(e) => onFieldValueChange(field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
          />
        )

      case 'textarea':
        return renderInputWithVariablePicker(
          <Textarea
            value={currentValue}
            onChange={(e) => onFieldValueChange(field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
            rows={3}
          />
        )

      case 'number':
        return renderInputWithVariablePicker(
          <Input
            type="number"
            value={currentValue}
            onChange={(e) => onFieldValueChange(field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
          />
        )

      case 'boolean':
        return (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={currentValue === 'true' || currentValue === true}
                onCheckedChange={(checked) => onFieldValueChange(field.name, checked)}
              />
              <Label>Yes</Label>
            </div>
            <VariablePicker
              workflowData={workflowData}
              currentNodeId={currentNodeId}
              onVariableSelect={(variable) => onFieldValueChange(field.name, variable)}
              fieldType={field.type}
              trigger={
                <Button variant="outline" size="sm" className="flex-shrink-0 px-3">
                  <Building className="w-4 h-4" />
                </Button>
              }
            />
          </div>
        )

      default:
        return renderInputWithVariablePicker(
          <Input
            value={currentValue}
            onChange={(e) => onFieldValueChange(field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
          />
        )
    }
  }

  const filteredProperties = properties.filter(prop =>
    prop.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prop.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredGroupedProperties = Object.keys(groupedProperties).reduce((acc, groupName) => {
    const groupProps = groupedProperties[groupName].filter(prop =>
      prop.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prop.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    if (groupProps.length > 0) {
      acc[groupName] = groupProps
    }
    return acc
  }, {} as Record<string, CompanyFieldProperty[]>)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading company properties...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Company Fields</h3>
          <p className="text-sm text-muted-foreground">
            Select company-specific fields to populate when creating a company record
          </p>
        </div>
        <Badge variant="secondary">
          {selectedFields.length} selected
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search company fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-auto-fit">
          {Object.keys(filteredGroupedProperties).map((groupName) => (
            <TabsTrigger key={groupName} value={groupName} className="text-xs">
              {getCompactGroupName(groupName)}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.keys(filteredGroupedProperties).map((groupName) => (
          <TabsContent key={groupName} value={groupName} className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {filteredGroupedProperties[groupName].map((field) => (
                  <Card key={field.name} className="border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={selectedFields.includes(field.name)}
                            onCheckedChange={() => handleFieldToggle(field.name)}
                          />
                          <CardTitle className="text-sm font-medium">
                            {field.label}
                          </CardTitle>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {field.type}
                          </Badge>
                          {field.description && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">{field.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    
                    {selectedFields.includes(field.name) && (
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">
                            {field.description || field.label}
                          </Label>
                          {renderFieldInput(field)}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
} 