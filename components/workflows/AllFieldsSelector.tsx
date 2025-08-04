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
import { Loader2, Search, Eye, EyeOff, Info, Plus, X, Database, Variable } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIntegrationStore } from '@/stores/integrationStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import VariablePicker from './VariablePicker'

interface FieldProperty {
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

interface AllFieldsSelectorProps {
  integrationId: string
  selectedFields: string[]
  onFieldsChange: (fields: string[]) => void
  fieldValues: Record<string, any>
  onFieldValueChange: (fieldName: string, value: any) => void
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

export default function AllFieldsSelector({
  integrationId,
  selectedFields,
  onFieldsChange,
  fieldValues,
  onFieldValueChange,
  workflowData,
  currentNodeId
}: AllFieldsSelectorProps) {
  const [properties, setProperties] = useState<FieldProperty[]>([])
  const [groupedProperties, setGroupedProperties] = useState<Record<string, FieldProperty[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<string>('contactinformation')
  
  const { loadIntegrationData } = useIntegrationStore()

  // Function to get compact group names for tabs
  const getCompactGroupName = (groupName: string): string => {
    const nameMap: Record<string, string> = {
      'contactinformation': 'Contact Info',
      'contactactivity': 'Contact Activity',
      'salesproperties': 'Sales Properties',
      'socialmedia': 'Social Media',
      'socialmediainformation': 'Social Media',
      'marketingproperties': 'Marketing',
      'companyinformation': 'Company',
      'lifecyclestage': 'Lifecycle',
      'leadmanagement': 'Lead Mgmt',
      'communicationpreferences': 'Comm Prefs',
      'contentpreferences': 'Content',
      'subscriptiontypes': 'Subscriptions',
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
      const result = await loadIntegrationData('hubspot_all_contact_properties', integrationId)
      
      console.log('🔍 AllFieldsSelector received result:', result)
      
      console.log('🔍 AllFieldsSelector received result:', result)
      console.log('🔍 Result type:', typeof result)
      console.log('🔍 Result keys:', result ? Object.keys(result) : 'null')
      
      if (result && result.properties) {
        console.log('✅ Found properties:', result.properties.length)
        console.log('✅ Found grouped properties:', Object.keys(result.groupedProperties))
        setProperties(result.properties)
        setGroupedProperties(result.groupedProperties)
        
        // Set first group as active tab
        const firstGroup = Object.keys(result.groupedProperties)[0]
        if (firstGroup) {
          setActiveTab(firstGroup)
        }
      } else if (result && result.data && result.data.properties) {
        // Handle case where data is nested
        console.log('✅ Found nested properties:', result.data.properties.length)
        console.log('✅ Found nested grouped properties:', Object.keys(result.data.groupedProperties))
        setProperties(result.data.properties)
        setGroupedProperties(result.data.groupedProperties)
        
        // Set first group as active tab
        const firstGroup = Object.keys(result.data.groupedProperties)[0]
        if (firstGroup) {
          setActiveTab(firstGroup)
        }
      } else {
        console.error('❌ No valid data structure found:', result)
        throw new Error('No data received from HubSpot API')
      }
    } catch (err: any) {
      console.error('❌ AllFieldsSelector error:', err)
      setError(err.message)
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

  const renderFieldInput = (field: FieldProperty) => {
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
            <Button 
              size="sm" 
              className="flex-shrink-0 h-10 w-10 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 rounded-md" 
              title="Insert variable"
            >
              <span className="text-sm font-mono font-semibold">{`{}`}</span>
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
                <Button 
                  size="sm" 
                  className="flex-shrink-0 h-10 w-10 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 rounded-md" 
                  title="Insert variable"
                >
                  <span className="text-sm font-mono font-semibold">{`{}`}</span>
                </Button>
              }
            />
          </div>
        )

      case 'date':
        return renderInputWithVariablePicker(
          <Input
            type="date"
            value={currentValue}
            onChange={(e) => onFieldValueChange(field.name, e.target.value)}
          />
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

  const filteredGroups = Object.entries(groupedProperties).filter(([groupName, fields]) => {
    if (searchTerm) {
      return fields.some(field => 
        field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        field.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading HubSpot fields...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Error loading fields: {error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {/* Section Label */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          All Available HubSpot Fields
        </Label>
      </div>

      {/* Note about field visibility */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Note:</strong> All selected fields will be sent to HubSpot when the workflow runs. 
          Some fields may not be visible in your contacts table unless you manually add them as columns 
          in HubSpot (Settings → Edit columns).
        </AlertDescription>
      </Alert>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Field Groups */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full justify-between p-1 bg-gray-800 rounded-lg gap-1">
          {filteredGroups.map(([groupName]) => (
            <TooltipProvider key={groupName}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value={groupName}
                    className={`flex-1 text-xs px-2 py-2 rounded-md transition-all duration-200 hover:bg-gray-600 ${
                      activeTab === groupName 
                        ? 'bg-gray-700 text-white font-medium shadow-none' 
                        : 'text-gray-300'
                    }`}
                  >
                    {getCompactGroupName(groupName)}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{groupName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </TabsList>

        {filteredGroups.map(([groupName, fields]) => (
          <TabsContent key={groupName} value={groupName} className="space-y-4">
            <div className="space-y-4">
              {fields
                .filter(field => 
                  !searchTerm || 
                  field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  field.name.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((field) => (
                  <Card key={field.name} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedFields.includes(field.name)}
                            onCheckedChange={() => handleFieldToggle(field.name)}
                          />
                          <CardTitle className="text-sm font-medium">
                            {field.label}
                          </CardTitle>
                          {field.hidden && <EyeOff className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {field.fieldType}
                          </Badge>
                          {field.existingValues.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {field.existingValues.length} existing values
                            </Badge>
                          )}
                        </div>
                      </div>
                      {field.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {field.description}
                        </p>
                      )}
                    </CardHeader>
                    
                    {selectedFields.includes(field.name) && (
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">
                            Value for {field.label}
                          </Label>
                          {renderFieldInput(field)}
                          {field.existingValues.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {field.existingValues.length} existing values available
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {selectedFields.length} of {properties.length} fields selected
        </span>
        {selectedFields.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFieldsChange([])}
            className="text-red-600 hover:text-red-700"
          >
            <X className="w-4 h-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>
    </div>
  )
} 