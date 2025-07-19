import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface HubSpotProperty {
  name: string
  label: string
  type: string
  fieldType: string
  groupName: string
  description: string
  required: boolean
  formField: boolean
  options: Array<{ value: string; label: string }>
  min?: number
  max?: number
  placeholder?: string
  defaultValue?: any
  isCustom?: boolean
}

interface HubSpotDynamicFormProps {
  value: any
  onChange: (value: any) => void
  dynamicData: HubSpotProperty[]
  isLoading: boolean
  error?: string
}

export default function HubSpotDynamicForm({
  value,
  onChange,
  dynamicData,
  isLoading,
  error
}: HubSpotDynamicFormProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddField, setShowAddField] = useState(false)
  const [newField, setNewField] = useState({
    name: '',
    label: '',
    type: 'text',
    required: false
  })
  const initializedRef = useRef(false)

  // Initialize form data if empty
  useEffect(() => {
    if (!initializedRef.current && dynamicData.length > 0 && (!value || Object.keys(value).length === 0)) {
      const initialData: any = {}
      dynamicData.forEach(prop => {
        initialData[prop.name] = {
          value: '',
          useVariable: false,
          variableName: ''
        }
      })
      onChange(initialData)
      initializedRef.current = true
    }
  }, [dynamicData, value, onChange])

  const filteredProperties = dynamicData.filter(prop =>
    prop.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prop.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleFieldChange = (fieldName: string, fieldValue: any) => {
    const updatedValue = {
      ...value,
      [fieldName]: fieldValue
    }
    onChange(updatedValue)
  }

  const handleAddField = () => {
    if (newField.name && newField.label) {
      const fieldName = newField.name.toLowerCase().replace(/\s+/g, '_')
      const updatedValue = {
        ...value,
        [fieldName]: {
          value: '',
          useVariable: false,
          variableName: '',
          isCustom: true,
          label: newField.label,
          type: newField.type,
          required: newField.required
        }
      }
      onChange(updatedValue)
      setNewField({ name: '', label: '', type: 'text', required: false })
      setShowAddField(false)
    }
  }

  const handleRemoveField = (fieldName: string) => {
    const updatedValue = { ...value }
    delete updatedValue[fieldName]
    onChange(updatedValue)
  }

  const renderFieldInput = (prop: HubSpotProperty, fieldName: string, fieldData: any) => {
    const fieldType = prop.fieldType || prop.type || 'text'
    
    switch (fieldType) {
      case 'text':
      case 'string':
        return (
          <Input
            placeholder={prop.placeholder || `Enter ${prop.label.toLowerCase()}`}
            value={fieldData.value || ''}
            onChange={(e) => handleFieldChange(fieldName, { ...fieldData, value: e.target.value })}
          />
        )
      
      case 'textarea':
      case 'text_area':
        return (
          <Textarea
            placeholder={prop.placeholder || `Enter ${prop.label.toLowerCase()}`}
            value={fieldData.value || ''}
            onChange={(e) => handleFieldChange(fieldName, { ...fieldData, value: e.target.value })}
          />
        )
      
      case 'number':
      case 'numeric':
        return (
          <Input
            type="number"
            min={prop.min}
            max={prop.max}
            placeholder={prop.placeholder || `Enter ${prop.label.toLowerCase()}`}
            value={fieldData.value || ''}
            onChange={(e) => handleFieldChange(fieldName, { ...fieldData, value: e.target.value })}
          />
        )
      
      case 'date':
      case 'date_picker':
        return (
          <Input
            type="date"
            value={fieldData.value || ''}
            onChange={(e) => handleFieldChange(fieldName, { ...fieldData, value: e.target.value })}
          />
        )
      
      case 'enumeration':
      case 'select':
        return (
          <Select
            value={fieldData.value || ''}
            onValueChange={(val) => handleFieldChange(fieldName, { ...fieldData, value: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${prop.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {prop.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      
      case 'multiselect':
        return (
          <div className="space-y-2">
            {prop.options?.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={`${fieldName}-${option.value}`}
                  checked={fieldData.value?.includes(option.value) || false}
                  onChange={(e) => {
                    const currentValues = fieldData.value || []
                    const newValues = e.target.checked
                      ? [...currentValues, option.value]
                      : currentValues.filter((v: string) => v !== option.value)
                    handleFieldChange(fieldName, { ...fieldData, value: newValues })
                  }}
                />
                <Label htmlFor={`${fieldName}-${option.value}`}>{option.label}</Label>
              </div>
            ))}
          </div>
        )
      
      case 'boolean':
      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              checked={fieldData.value || false}
              onCheckedChange={(checked) => handleFieldChange(fieldName, { ...fieldData, value: checked })}
            />
            <Label>{fieldData.value ? 'Yes' : 'No'}</Label>
          </div>
        )
      
      default:
        return (
          <Input
            placeholder={prop.placeholder || `Enter ${prop.label.toLowerCase()}`}
            value={fieldData.value || ''}
            onChange={(e) => handleFieldChange(fieldName, { ...fieldData, value: e.target.value })}
          />
        )
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Loading HubSpot contact properties...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!dynamicData || dynamicData.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <div className="text-sm text-muted-foreground mb-4">
              No contact properties found in your HubSpot account.
            </div>
            <Button onClick={() => setShowAddField(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Custom Field
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Contact Properties</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddField(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Field
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Debug Information */}
        <details className="text-xs border rounded p-2 bg-slate-50">
          <summary className="font-medium cursor-pointer">Debug Info (click to expand)</summary>
          <div className="mt-2 overflow-auto max-h-96">
            <div className="flex justify-between mb-2">
              <p><strong>Contact fields from API:</strong> {dynamicData?.length || 0}</p>
              <p><strong>Filtered by search:</strong> {filteredProperties?.length || 0}</p>
              <p><strong>Search term:</strong> "{searchTerm}"</p>
            </div>
            
            <div className="border-t pt-2 mt-2">
              <strong>Contact Fields Data (first 3 fields):</strong>
              <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded text-xs mt-1">
                {JSON.stringify(dynamicData?.slice(0, 3), null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground mt-1">
                These fields are filtered from the HubSpot API to only include contact table fields.
              </p>
            </div>
            
            <div className="border-t pt-2 mt-2">
              <strong>Field Names from API:</strong>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {dynamicData?.slice(0, 20).map((prop, i) => (
                  <div key={`debug-field-${i}`} className="text-xs bg-gray-100 p-1 rounded">
                    {prop.name}: <span className="font-medium">{prop.label}</span>
                  </div>
                ))}
              </div>
              {dynamicData && dynamicData.length > 20 && (
                <p className="mt-1 text-gray-500">...and {dynamicData.length - 20} more fields</p>
              )}
            </div>
            
            <div className="border-t pt-2 mt-2">
              <strong>Current Form Data:</strong>
              <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded text-xs mt-1">
                {JSON.stringify(Object.keys(value || {}).slice(0, 5).map(key => ({
                  key,
                  value: value[key]
                })), null, 2)}
              </pre>
            </div>
          </div>
        </details>
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

        {/* Add Custom Field */}
        {showAddField && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Add Custom Field</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddField(false)}
                >
                  Cancel
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new-field-name">Field Name</Label>
                  <Input
                    id="new-field-name"
                    placeholder="e.g., custom_field"
                    value={newField.name}
                    onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="new-field-label">Display Label</Label>
                  <Input
                    id="new-field-label"
                    placeholder="e.g., Custom Field"
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="new-field-type">Field Type</Label>
                  <Select
                    value={newField.type}
                    onValueChange={(val) => setNewField({ ...newField, type: val })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="textarea">Text Area</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    checked={newField.required}
                    onCheckedChange={(checked) => setNewField({ ...newField, required: checked })}
                  />
                  <Label>Required</Label>
                </div>
              </div>
              <Button onClick={handleAddField} disabled={!newField.name || !newField.label}>
                Add Field
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Fields */}
        <div className="space-y-4">
          {filteredProperties.map((prop, index) => {
            const fieldName = prop.name || `field_${index}`
            const fieldData = value?.[fieldName] || { value: '', useVariable: false, variableName: '' }
            
            return (
              <div key={`${fieldName}_${index}`} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Label className="font-medium">
                      {prop.label}
                      {prop.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {prop.isCustom && <Badge variant="secondary">Custom</Badge>}
                  </div>
                  {prop.isCustom && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveField(fieldName)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                {prop.description && (
                  <p className="text-sm text-muted-foreground">{prop.description}</p>
                )}

                <div className="space-y-2">
                  {/* Variable Toggle */}
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={fieldData.useVariable || false}
                      onCheckedChange={(checked) => 
                        handleFieldChange(fieldName, { ...fieldData, useVariable: checked })
                      }
                    />
                    <Label className="text-sm">Use workflow variable</Label>
                  </div>

                  {/* Input Field */}
                  {fieldData.useVariable ? (
                    <Input
                      placeholder="Enter variable name (e.g., {{user.email}})"
                      value={fieldData.variableName || ''}
                      onChange={(e) => 
                        handleFieldChange(fieldName, { ...fieldData, variableName: e.target.value })
                      }
                    />
                  ) : (
                    renderFieldInput(prop, fieldName, fieldData)
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {filteredProperties.length === 0 && searchTerm && (
          <div className="text-center py-8">
            <div className="text-sm text-muted-foreground">
              No fields match "{searchTerm}"
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 