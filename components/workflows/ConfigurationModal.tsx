"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { ConfigField, NodeComponent } from "@/lib/workflows/availableNodes"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Combobox } from "@/components/ui/combobox"
import { FileUpload } from "@/components/ui/file-upload"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { Checkbox } from "@/components/ui/checkbox"

interface ConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
  initialData?: Record<string, any>
}

export default function ConfigurationModal({
  isOpen,
  onClose,
  onSave,
  nodeInfo,
  integrationName,
  initialData = {},
}: ConfigurationModalProps) {
  const [config, setConfig] = useState<Record<string, any>>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { value: string; label: string; fields?: any[] }[]>>({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)
  
  const { loadIntegrationData } = useIntegrationStore()

  useEffect(() => {
    setConfig(initialData)
  }, [initialData])

  // Function to check if a field should be shown based on dependencies
  const shouldShowField = (field: ConfigField): boolean => {
    if (!field.dependsOn) {
      return true
    }
    const dependentValue = config[field.dependsOn]
    return !!dependentValue
  }

  // Function to fetch dynamic data for dependent fields
  const fetchDependentData = async (field: ConfigField, dependentValue: string) => {
    if (!field.dynamic) return

    try {
      setLoadingDynamic(true)
      const data = await loadIntegrationData(field.dynamic, nodeInfo?.providerId || '', { 
        baseId: dependentValue 
      })
      
      if (data) {
        setDynamicOptions(prev => ({
          ...prev,
          [field.name]: data.map((item: any) => ({
            value: item.value || item.name,
            label: item.label || item.name,
            fields: item.fields || []
          }))
        }))
      }
    } catch (error) {
      console.error(`Error loading ${field.dynamic}:`, error)
    } finally {
      setLoadingDynamic(false)
    }
  }

  // Handle dependent field changes
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    nodeInfo.configSchema?.forEach(field => {
      if (field.dependsOn && field.dynamic) {
        const dependentValue = config[field.dependsOn]
        if (dependentValue) {
          fetchDependentData(field, dependentValue)
        }
      }
    })
  }, [isOpen, nodeInfo, config.baseId])

  // Load initial dynamic data
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    const loadInitialData = async () => {
      for (const field of nodeInfo.configSchema || []) {
        if (field.dynamic && !field.dependsOn) {
          try {
            setLoadingDynamic(true)
            const data = await loadIntegrationData(field.dynamic, nodeInfo.providerId || '')
            
            if (data) {
              setDynamicOptions(prev => ({
                ...prev,
                [field.name]: data.map((item: any) => ({
                  value: item.value,
                  label: item.label,
                  description: item.description
                }))
              }))
            }
          } catch (error) {
            console.error(`Error loading ${field.dynamic}:`, error)
          } finally {
            setLoadingDynamic(false)
          }
        }
      }
    }

    loadInitialData()
  }, [isOpen, nodeInfo])

  const handleSave = () => {
    const newErrors: Record<string, string> = {}
    
    nodeInfo?.configSchema?.forEach((field) => {
      if (field.required && !config[field.name]) {
        newErrors[field.name] = `${field.label} is required`
      }
    })

    setErrors(newErrors)
    
    if (Object.keys(newErrors).length === 0) {
      onSave(config)
      onClose()
    }
  }

  const renderField = (field: ConfigField) => {
    const value = config[field.name]
    const hasError = !!errors[field.name]

    // Handle Airtable create record custom fields layout
    if (nodeInfo?.type === "airtable_action_create_record" && field.name === "fields") {
      const selectedTable = dynamicOptions["tableName"]?.find((table: any) => table.value === config.tableName)
      const tableFields = selectedTable?.fields || []
      
      if (!config.tableName) {
        return (
          <div className="space-y-2">
            <div className="p-6 border border-dashed border-muted-foreground/25 rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                Please select a table first to configure record fields
              </p>
            </div>
          </div>
        )
      }

      if (tableFields.length === 0) {
        return (
          <div className="space-y-2">
            <div className="p-6 border border-dashed border-muted-foreground/25 rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                Loading table fields...
              </p>
            </div>
          </div>
        )
      }
      
      return (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Map your data to table columns from "{config.tableName}":
          </div>
          
          {/* Column Headers */}
          <div 
            className="grid gap-3 p-3 bg-muted/50 rounded-t-lg border"
            style={{ gridTemplateColumns: `repeat(${Math.min(tableFields.length, 4)}, 1fr)` }}
          >
            {tableFields.slice(0, 4).map((fieldDef: any) => (
              <div key={fieldDef.name} className="text-center">
                <div className="font-medium text-sm mb-1">{fieldDef.name}</div>
                <div className="text-xs text-muted-foreground capitalize bg-background px-2 py-1 rounded">
                  {fieldDef.type}
                  {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                </div>
              </div>
            ))}
          </div>
          
          {/* Input Fields */}
          <div 
            className="grid gap-3 p-3 border border-t-0 rounded-b-lg"
            style={{ gridTemplateColumns: `repeat(${Math.min(tableFields.length, 4)}, 1fr)` }}
          >
            {tableFields.slice(0, 4).map((fieldDef: any) => {
              const fieldValue = config.fields?.[fieldDef.name] || ""
              
              return (
                <div key={fieldDef.name} className="space-y-1">
                  {fieldDef.type === "multilineText" ? (
                    <Textarea
                      value={fieldValue}
                      placeholder={`Enter ${fieldDef.name.toLowerCase()}`}
                      onChange={(e) => {
                        const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                        setConfig(prev => ({ ...prev, fields: newFields }))
                      }}
                      className="text-sm min-h-[80px]"
                      rows={3}
                    />
                  ) : fieldDef.type === "singleSelect" && fieldDef.options ? (
                    <Select
                      value={fieldValue}
                      onValueChange={(value) => {
                        const newFields = { ...config.fields, [fieldDef.name]: value }
                        setConfig(prev => ({ ...prev, fields: newFields }))
                      }}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder={`Select ${fieldDef.name.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldDef.options.choices.map((choice: any) => (
                          <SelectItem key={choice.name} value={choice.name}>
                            {choice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : fieldDef.type === "checkbox" ? (
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        checked={fieldValue || false}
                        onCheckedChange={(checked) => {
                          const newFields = { ...config.fields, [fieldDef.name]: checked }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                      />
                      <Label className="text-sm">Enable</Label>
                    </div>
                  ) : (
                    <Input
                      type={fieldDef.type === "email" ? "email" : fieldDef.type === "number" ? "number" : fieldDef.type === "date" ? "date" : "text"}
                      value={fieldValue}
                      placeholder={`Enter ${fieldDef.name.toLowerCase()}`}
                      onChange={(e) => {
                        const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                        setConfig(prev => ({ ...prev, fields: newFields }))
                      }}
                      className="text-sm"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Show remaining fields if there are more than 4 */}
          {tableFields.length > 4 && (
            <div className="space-y-3 pt-4 border-t">
              <div className="text-sm font-medium text-muted-foreground">
                Additional Fields:
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {tableFields.slice(4).map((fieldDef: any) => {
                  const fieldValue = config.fields?.[fieldDef.name] || ""
                  
                  return (
                    <div key={fieldDef.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          {fieldDef.name}
                          {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <span className="text-xs text-muted-foreground capitalize">
                          {fieldDef.type}
                        </span>
                      </div>
                      
                      {fieldDef.type === "multilineText" ? (
                        <Textarea
                          value={fieldValue}
                          placeholder={`Enter ${fieldDef.name.toLowerCase()}`}
                          onChange={(e) => {
                            const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          className="text-sm"
                          rows={3}
                        />
                      ) : fieldDef.type === "singleSelect" && fieldDef.options ? (
                        <Select
                          value={fieldValue}
                          onValueChange={(value) => {
                            const newFields = { ...config.fields, [fieldDef.name]: value }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder={`Select ${fieldDef.name.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {fieldDef.options.choices.map((choice: any) => (
                              <SelectItem key={choice.name} value={choice.name}>
                                {choice.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : fieldDef.type === "checkbox" ? (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={fieldValue || false}
                            onCheckedChange={(checked) => {
                              const newFields = { ...config.fields, [fieldDef.name]: checked }
                              setConfig(prev => ({ ...prev, fields: newFields }))
                            }}
                          />
                          <Label className="text-sm">Enable {fieldDef.name}</Label>
                        </div>
                      ) : (
                        <Input
                          type={fieldDef.type === "email" ? "email" : fieldDef.type === "number" ? "number" : fieldDef.type === "date" ? "date" : "text"}
                          value={fieldValue}
                          placeholder={`Enter ${fieldDef.name.toLowerCase()}`}
                          onChange={(e) => {
                            const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          className="text-sm"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-lg border border-blue-200">
            💡 <strong>Tip:</strong> Use template variables like <code>{"{{data.fieldName}}"}</code> to make your data dynamic and pull values from previous workflow steps.
          </div>
        </div>
      )
    }

    // Handle combobox/select fields with dynamic options
    if (field.type === "select" || field.type === "combobox") {
      const options = dynamicOptions[field.name] || field.options || []
      
      return (
        <Select 
          value={value || ""} 
          onValueChange={(newValue) => {
            // Clear dependent fields when base changes for Airtable
            if (nodeInfo?.type === "airtable_action_create_record" && field.name === "baseId") {
              setConfig(prev => ({ 
                ...prev, 
                [field.name]: newValue,
                tableName: undefined,
                fields: undefined
              }))
            } else {
              setConfig(prev => ({ ...prev, [field.name]: newValue }))
            }
          }}
          disabled={loadingDynamic}
        >
          <SelectTrigger className={hasError ? 'ring-2 ring-red-500' : ''}>
            <SelectValue placeholder={loadingDynamic ? "Loading..." : field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div>
                  <div>{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    // Handle regular field types
    switch (field.type) {
      case "string":
      case "text":
        return (
          <Input
            placeholder={field.placeholder}
            value={value || ""}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
            className={hasError ? 'ring-2 ring-red-500' : ''}
          />
        )

      case "textarea":
        return (
          <Textarea
            placeholder={field.placeholder}
            value={value || ""}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
            className={hasError ? 'ring-2 ring-red-500' : ''}
          />
        )

      case "checkbox":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.name}
              checked={value || false}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, [field.name]: checked }))}
            />
            <Label htmlFor={field.name} className="text-sm font-normal">
              {field.placeholder}
            </Label>
          </div>
        )

      case "number":
        return (
          <Input
            type="number"
            placeholder={field.placeholder}
            value={value || ""}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
            className={hasError ? 'ring-2 ring-red-500' : ''}
          />
        )

      default:
        return (
          <Input
            placeholder={field.placeholder}
            value={value || ""}
            onChange={(e) => setConfig(prev => ({ ...prev, [field.name]: e.target.value }))}
            className={hasError ? 'ring-2 ring-red-500' : ''}
          />
        )
    }
  }

  const hasRequiredFields = nodeInfo?.configSchema?.some(field => field.required) || false
  const hasErrors = Object.keys(errors).length > 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>
            Configure {nodeInfo?.title} on {integrationName}
          </DialogTitle>
          <DialogDescription>
            {nodeInfo?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 px-6 py-4 overflow-auto">
          <div className="space-y-6">
            {nodeInfo?.configSchema?.map((field) => {
              if (!shouldShowField(field)) {
                return null
              }

              // Skip the custom fields rendering in the main loop for Airtable
              if (nodeInfo?.type === "airtable_action_create_record" && field.name === "fields") {
                return (
                  <div key={field.name} className="space-y-3">
                    <Label className="text-sm font-medium">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {renderField(field)}
                    {errors[field.name] && (
                      <p className="text-red-500 text-sm">{errors[field.name]}</p>
                    )}
                  </div>
                )
              }

              return (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name} className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {renderField(field)}
                  {errors[field.name] && (
                    <p className="text-red-500 text-sm">{errors[field.name]}</p>
                  )}
                  {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}
                </div>
              )
            })}
          </div>

          {hasRequiredFields && (
            <div className="text-xs text-muted-foreground mt-6 pt-4 border-t">
              * Required fields must be filled out before saving
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-2 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={hasErrors || loadingDynamic}
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
