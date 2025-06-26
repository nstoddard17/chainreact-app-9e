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
import { EmailAutocomplete } from "@/components/ui/email-autocomplete"
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen"
import { FileUpload } from "@/components/ui/file-upload"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const { loadIntegrationData, getIntegrationByProvider } = useIntegrationStore()
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)

  useEffect(() => {
    if (isOpen && nodeInfo) {
      // Initialize config with default or existing values
      const initialConfig =
        nodeInfo.configSchema?.reduce(
          (acc, field) => {
            // Use initialData first, then defaultValue, then empty string
            acc[field.name] = initialData[field.name] || field.defaultValue || ""
            // For file fields, initialize the display files as empty since we only have IDs
            if (field.type === "file") {
              acc[`${field.name}_files`] = []
            }
            return acc
          },
          {} as Record<string, any>,
        ) || {}
      
      // Set default dates for Google Calendar if not provided
      if (nodeInfo.type === "google_calendar_action_create_event") {
        const now = new Date()
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        
        if (!initialConfig.startDate) {
          initialConfig.startDate = tomorrow.toISOString().split('T')[0]
        }
        if (!initialConfig.endDate) {
          initialConfig.endDate = tomorrow.toISOString().split('T')[0]
        }
      }
      
      setConfig(initialConfig)
      
      // Restore file attachments if they exist
      const restoreFileAttachments = async () => {
        for (const field of nodeInfo.configSchema || []) {
          if (field.type === "file" && initialData[field.name] && Array.isArray(initialData[field.name]) && initialData[field.name].length > 0) {
            try {
              // Fetch file metadata from stored file IDs
              const fileIds = initialData[field.name] as string[]
              const response = await fetch(`/api/workflows/files/store?fileIds=${fileIds.join(',')}`)
              
              if (response.ok) {
                const { files } = await response.json()
                
                // Create pseudo-File objects for display purposes
                const displayFiles = files.map((fileMetadata: any) => {
                  // Create a minimal File-like object for display
                  const displayFile = {
                    name: fileMetadata.file_name,
                    size: fileMetadata.file_size,
                    type: fileMetadata.file_type,
                    lastModified: new Date(fileMetadata.created_at).getTime(),
                    webkitRelativePath: '',
                    // Mark this as a restored file so we know not to re-upload it
                    _isRestored: true,
                    _fileId: fileMetadata.id,
                    // Add minimal required methods
                    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
                    bytes: () => Promise.resolve(new Uint8Array(0)),
                    slice: () => new Blob(),
                    stream: () => new ReadableStream(),
                    text: () => Promise.resolve('')
                  }
                  
                  return displayFile as unknown as File
                })
                
                // Update config with the display files
                setConfig(prev => ({
                  ...prev,
                  [`${field.name}_files`]: displayFiles
                }))
              }
            } catch (error) {
              console.error(`Failed to restore files for ${field.name}:`, error)
            }
          }
        }
      }
      
      restoreFileAttachments()
      setErrors({}) // Clear errors when opening modal

      // Fetch dynamic data if needed
      const fetchDynamicData = async () => {
        if (!nodeInfo?.providerId) return

        const integration = getIntegrationByProvider(nodeInfo.providerId)
        if (!integration) return

        setLoadingDynamic(true)
        const newOptions: Record<string, { value: string; label: string }[]> = {}
        for (const field of nodeInfo.configSchema || []) {
          if (field.dynamic === "slack-channels") {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((ch: any) => ({
                value: ch.id,
                label: `#${ch.name}`,
              }))
            }
          } else if (field.dynamic === "google-contacts") {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((c: any) => ({
                value: c.email,
                label: `${c.name} (${c.email})`,
              }))
            }
          } else if (field.dynamic === "gmail-recent-recipients") {
            const data = await loadIntegrationData(
              "gmail-recent-recipients",
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((recipient: any) => ({
                value: recipient.email,
                label: recipient.label,
                email: recipient.email,
                name: recipient.name,
              }))
            }
          } else if (field.dynamic === "gmail-enhanced-recipients") {
            const data = await loadIntegrationData(
              "gmail-enhanced-recipients",
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((recipient: any) => ({
                value: recipient.value,
                label: recipient.label,
                email: recipient.email,
                name: recipient.name,
                type: recipient.type,
                isGroup: recipient.isGroup,
                groupId: recipient.groupId,
                members: recipient.members,
              }))
            }
          } else if (field.dynamic === "gmail-contact-groups") {
            const data = await loadIntegrationData(
              "gmail-contact-groups",
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((group: any) => ({
                value: `@${group.name}`,
                label: `📧 ${group.name} (${group.memberCount} members)`,
                email: `@${group.name}`,
                name: group.name,
                type: 'contact_group',
                isGroup: true,
                groupId: group.id,
                members: group.emails,
              }))
            }
          } else if (field.dynamic === "google-calendars") {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              newOptions[field.name] = data.map((cal: any) => ({
                value: cal.id,
                label: cal.summary,
              }))
            }
          } else if (
            field.dynamic === "google-drive-folders" ||
            field.dynamic === "google-drive-files"
          ) {
            const data = await loadIntegrationData(
              nodeInfo.providerId,
              integration.id,
            )
            if (data) {
              const items =
                field.dynamic === "google-drive-folders"
                  ? data.filter((f: any) => f.type === "folder")
                  : data
              newOptions[field.name] = items.map((item: any) => ({
                value: item.id,
                label: item.name,
              }))
            }
          }
        }
        setDynamicOptions(newOptions)
        setLoadingDynamic(false)
      }

      fetchDynamicData()
    }
  }, [isOpen, nodeInfo, loadIntegrationData, getIntegrationByProvider, initialData])

  if (!nodeInfo) {
    return null
  }

  const validateRequiredFields = (): boolean => {
    const newErrors: Record<string, string> = {}
    let isValid = true

    if (nodeInfo.configSchema) {
      for (const field of nodeInfo.configSchema) {
        if (field.required) {
          const value = config[field.name]
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            newErrors[field.name] = `${field.label} is required`
            isValid = false
          }
        }
      }
    }

    setErrors(newErrors)
    return isValid
  }

  const handleSave = () => {
    if (validateRequiredFields()) {
      onSave(config)
      onClose()
    }
  }

  const renderField = (field: ConfigField) => {
    const value = config[field.name] || ""
    const hasError = !!errors[field.name]

    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const newValue = e.target.value
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user starts typing
      if (hasError && newValue.trim() !== '') {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const handleSelectChange = (newValue: string) => {
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user selects a value
      if (hasError && newValue) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const inputClassName = `${hasError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`

    switch (field.type) {
      case "select":
        let selectOptions: { value: string; label: string }[] | undefined = dynamicOptions[field.name];

        if (!selectOptions && field.options) {
          if (field.options.every((opt): opt is string => typeof opt === 'string')) {
            // It's a string array
            selectOptions = (field.options as string[]).map(option => ({
              value: option,
              label: option.charAt(0).toUpperCase() + option.slice(1)
            }));
          } else {
            // It's already an array of { value, label }
            selectOptions = field.options as { value: string; label: string }[];
          }
        }

        const finalOptions = selectOptions || [];
        
        if (field.dynamic) {
          return (
            <div className="space-y-1">
              <div className={hasError ? 'ring-2 ring-red-500 rounded-md' : ''}>
                <Combobox
                  options={finalOptions}
                  value={value}
                  onChange={handleSelectChange}
                  placeholder={field.placeholder}
                  searchPlaceholder="Search or type..."
                  emptyPlaceholder={loadingDynamic ? "Loading..." : "No results found."}
                  disabled={loadingDynamic}
                />
              </div>
              {hasError && (
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  {errors[field.name]}
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="space-y-1">
            <Select onValueChange={handleSelectChange} value={value} disabled={loadingDynamic}>
              <SelectTrigger className={inputClassName}>
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {loadingDynamic && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                {finalOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      case "textarea":
        return (
          <div className="space-y-1">
            <Textarea
              id={field.name}
              value={value}
              onChange={handleChange}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              className={inputClassName}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      case "email-autocomplete":
        const emailOptions = dynamicOptions[field.name] || []
        const emailSuggestions = emailOptions.map((opt: any) => ({
          value: opt.value,
          label: opt.label,
          email: opt.email || opt.value,
          name: opt.name,
          type: opt.type,
          isGroup: opt.isGroup,
          groupId: opt.groupId,
          members: opt.members
        }))
        return (
          <div className="space-y-1">
            <EmailAutocomplete
              value={value}
              onChange={handleSelectChange}
              suggestions={emailSuggestions}
              placeholder={field.placeholder}
              disabled={loadingDynamic}
              isLoading={loadingDynamic}
              multiple={field.name === "to"} // Allow multiple recipients for "to" field
              className={inputClassName}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      case "file":
        const handleFileChange = async (files: FileList | File[]) => {
          try {
            if (files && files.length > 0) {
              const filesArray = Array.from(files)
              
              // Separate new files from restored files
              const newFiles = filesArray.filter(file => !(file as any)._isRestored)
              const restoredFiles = filesArray.filter(file => (file as any)._isRestored)
              
              let allFileIds: string[] = []
              
              // Get file IDs from restored files
              const restoredFileIds = restoredFiles.map(file => (file as any)._fileId)
              allFileIds.push(...restoredFileIds)
              
              // Upload new files if any
              if (newFiles.length > 0) {
                const formData = new FormData()
                newFiles.forEach(file => {
                  formData.append('files', file)
                })
                
                const response = await fetch('/api/workflows/files/store', {
                  method: 'POST',
                  body: formData
                })
                
                if (!response.ok) {
                  const errorData = await response.json()
                  throw new Error(errorData.error || 'Failed to store files')
                }
                
                const result = await response.json()
                allFileIds.push(...result.fileIds)
              }
              
              // Store both file IDs for the workflow and the actual files for the UI
              setConfig({ 
                ...config, 
                [field.name]: allFileIds,
                [`${field.name}_files`]: filesArray // Store all files for UI
              })
            } else {
              setConfig({ 
                ...config, 
                [field.name]: [],
                [`${field.name}_files`]: []
              })
            }
            
            // Clear error when user selects files
            if (hasError && files && files.length > 0) {
              setErrors(prev => {
                const newErrors = { ...prev }
                delete newErrors[field.name]
                return newErrors
              })
            }
          } catch (error: any) {
            console.error('Error storing files:', error)
            setErrors(prev => ({
              ...prev,
              [field.name]: `Failed to upload files: ${error.message}`
            }))
          }
        }
        
        // Use the stored files for the FileUpload component display
        const fileValue = config[`${field.name}_files`] || []
        
        return (
          <div className="space-y-1">
            <FileUpload
              value={fileValue as File[]}
              onChange={handleFileChange}
              accept={field.accept}
              maxSize={field.maxSize}
              maxFiles={5}
              placeholder={field.placeholder}
              disabled={loadingDynamic}
              className={hasError ? 'ring-2 ring-red-500 rounded-md' : ''}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      case "date":
        // Special handling for Google Calendar dates
        const isGoogleCalendarNode = nodeInfo?.type?.includes("google_calendar_action");
        
        const handleDateChange = (date: Date | undefined) => {
          const dateString = date ? date.toISOString().split('T')[0] : ""
          const newConfig = { ...config, [field.name]: dateString }
          
          // For Google Calendar, automatically set end date when start date changes
          if (nodeInfo?.type === "google_calendar_action_create_event" && field.name === "startDate" && date) {
            if (!config.endDate || config.endDate === config.startDate) {
              newConfig.endDate = dateString
            }
          }
          
          setConfig(newConfig)
          
          // Clear error when user selects a date
          if (hasError && date) {
            setErrors(prev => {
              const newErrors = { ...prev }
              delete newErrors[field.name]
              return newErrors
            })
          }
        }
        
        // Parse the date value safely
        let dateValue: Date | undefined;
        if (value) {
          try {
            const parsedDate = new Date(value + 'T00:00:00');
            dateValue = isNaN(parsedDate.getTime()) ? undefined : parsedDate;
          } catch (e) {
            console.error("Failed to parse date:", value);
            dateValue = undefined;
          }
        }
        
        return (
          <div className="space-y-1 relative z-50">
            <DatePicker
              value={dateValue}
              onChange={handleDateChange}
              placeholder={field.placeholder || "Select date"}
              disabled={loadingDynamic}
              className={cn(
                inputClassName,
                isGoogleCalendarNode && "google-calendar-datepicker" // Add special class for styling
              )}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      case "time":
        // Hide time fields for Google Calendar when "All Day" is enabled
        if (nodeInfo?.type === "google_calendar_action_create_event" && config.allDay) {
          return null
        }
        
        const handleTimeChange = (time: string) => {
          setConfig({ ...config, [field.name]: time })
          
          // Clear error when user selects a time
          if (hasError && time) {
            setErrors(prev => {
              const newErrors = { ...prev }
              delete newErrors[field.name]
              return newErrors
            })
          }
        }
        
        return (
          <div className="space-y-1">
            <TimePicker
              value={value}
              onChange={handleTimeChange}
              placeholder={field.placeholder || "Select time"}
              disabled={loadingDynamic}
              className={inputClassName}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
      default:
        return (
          <div className="space-y-1">
            <Input
              id={field.name}
              type={field.type}
              value={value}
              onChange={handleChange}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              className={inputClassName}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
          </div>
        )
    }
  }

  const hasRequiredFields = nodeInfo.configSchema?.some(field => field.required) || false
  const hasErrors = Object.keys(errors).length > 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Configure {nodeInfo?.title} on {integrationName}
          </DialogTitle>
          <DialogDescription>{nodeInfo?.description}</DialogDescription>
        </DialogHeader>
        
        {loadingDynamic ? (
          <ConfigurationLoadingScreen integrationName={integrationName} />
        ) : (
          // Configuration form once data is loaded
          <>
            <div className="space-y-4 py-4 max-h-96 overflow-y-auto pr-2" style={{ paddingRight: '8px' }}>
              {nodeInfo?.configSchema?.map((field) => {
                const fieldElement = renderField(field)
                if (fieldElement === null) return null
                
                return (
                  <div key={field.name} className="space-y-2" style={{ marginRight: '4px' }}>
                    <Label htmlFor={field.name}>
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <div style={{ paddingRight: '4px' }}>
                      {fieldElement}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {hasRequiredFields && (
              <div className="text-xs text-muted-foreground px-1">
                * Required fields must be filled out before saving
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={loadingDynamic || hasErrors}
                className={hasErrors ? 'opacity-50 cursor-not-allowed' : ''}
              >
                Save Configuration
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
