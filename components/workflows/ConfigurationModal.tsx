"use client"

import { useState, useEffect, useRef } from "react"
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
import { AlertCircle, Video } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { LocationAutocomplete } from "@/components/ui/location-autocomplete"
import GoogleMeetCard from "@/components/ui/google-meet-card"

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
  const [meetDraft, setMeetDraft] = useState<{ eventId: string; meetUrl: string } | null>(null)
  const [meetLoading, setMeetLoading] = useState(false)
  const meetDraftRef = useRef<string | null>(null)

  // Function to get user's timezone
  const getUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (error) {
      // Fallback to UTC if timezone detection fails
      return "UTC"
    }
  }

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
        // Round to next 5 minutes
        const rounded = new Date(Math.ceil(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000))
        const todayStr = rounded.toISOString().split('T')[0]
        const timeStr = rounded.toTimeString().slice(0,5)
        if (!initialConfig.startDate) {
          initialConfig.startDate = todayStr
        }
        if (!initialConfig.startTime) {
          initialConfig.startTime = timeStr
        }
        if (!initialConfig.endDate) {
          initialConfig.endDate = todayStr
        }
        // Default end time to 1 hour after start
        if (!initialConfig.endTime) {
          const end = new Date(rounded.getTime() + 60 * 60 * 1000)
          initialConfig.endTime = end.toTimeString().slice(0,5)
        }
        // Always set user's timezone for Google Calendar events
        const userTimezone = getUserTimezone()
        initialConfig.timeZone = userTimezone
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
            // For gmail-enhanced-recipients, always use the Gmail integration
            const gmailIntegration = getIntegrationByProvider("gmail")
            if (gmailIntegration) {
              const data = await loadIntegrationData(
                "gmail-enhanced-recipients",
                gmailIntegration.id,
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

  // Force timezone update for Google Calendar events
  useEffect(() => {
    if (isOpen && nodeInfo?.type === "google_calendar_action_create_event" && !config.timeZone) {
      const userTimezone = getUserTimezone()
      setConfig(prev => ({ ...prev, timeZone: userTimezone }))
    }
  }, [isOpen, nodeInfo?.type, config.timeZone])

  // Clean up draft event if modal closes with a draft present
  useEffect(() => {
    if (!isOpen && meetDraftRef.current) {
      fetch("/api/integrations/google-calendar/meet-draft", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: meetDraftRef.current }),
      })
      setMeetDraft(null)
      meetDraftRef.current = null
    }
  }, [isOpen])

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
      const configToSave = { ...config }
      if (nodeInfo?.type === "google_calendar_action_create_event" && Array.isArray(configToSave.attendees)) {
        configToSave.attendees = configToSave.attendees.join(',')
      }
      onSave(configToSave)
      onClose()
    }
  }

  const handleCheckboxChange = async (name: string, checked: boolean) => {
    setConfig((prev) => ({ ...prev, [name]: checked }))
    if (name === "createMeetLink") {
      if (checked) {
        setMeetLoading(true)
        // Create draft event
        try {
          const res = await fetch("/api/integrations/google-calendar/meet-draft", { method: "POST" })
          const data = await res.json()
          if (data.eventId && data.meetUrl) {
            setMeetDraft({ eventId: data.eventId, meetUrl: data.meetUrl })
            meetDraftRef.current = data.eventId
          } else {
            setMeetDraft(null)
            meetDraftRef.current = null
          }
        } catch {
          setMeetDraft(null)
          meetDraftRef.current = null
        } finally {
          setMeetLoading(false)
        }
      } else {
        // Delete draft event if exists
        if (meetDraftRef.current) {
          setMeetLoading(true)
          await fetch("/api/integrations/google-calendar/meet-draft", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: meetDraftRef.current }),
          })
          setMeetDraft(null)
          meetDraftRef.current = null
          setMeetLoading(false)
        }
      }
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
        if (field.name === "attendees" && nodeInfo?.type === "google_calendar_action_create_event") {
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
          // Always use a string value for EmailAutocomplete
          const attendeesValue = typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : ""
          return (
            <div className="space-y-1">
              <EmailAutocomplete
                value={attendeesValue}
                onChange={(newValue) => setConfig({ ...config, [field.name]: newValue })}
                suggestions={emailSuggestions}
                placeholder={field.placeholder}
                disabled={loadingDynamic}
                isLoading={loadingDynamic}
                multiple={true}
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
        
        // Regular email-autocomplete for other fields
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
        if ((field.name === "attendees" && nodeInfo?.type === "google_calendar_action_create_event") || field.name === "to") {
          const multiValue = typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : ''
          return (
            <div className="space-y-1">
              <EmailAutocomplete
                value={multiValue}
                onChange={(newValue) => setConfig({ ...config, [field.name]: newValue })}
                suggestions={emailSuggestions}
                placeholder={field.placeholder}
                disabled={loadingDynamic}
                isLoading={loadingDynamic}
                multiple={true}
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
        } else {
          return (
            <div className="space-y-1">
              <EmailAutocomplete
                value={typeof value === 'string' ? value : ''}
                onChange={handleSelectChange}
                suggestions={emailSuggestions}
                placeholder={field.placeholder}
                disabled={loadingDynamic}
                isLoading={loadingDynamic}
                multiple={false}
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
        
        const dateValue = value ? new Date(value + 'T00:00:00') : undefined
        
        return (
          <div className="space-y-1">
            <DatePicker
              value={dateValue}
              onChange={handleDateChange}
              placeholder={field.placeholder || "Select date"}
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
      case "boolean":
        const isGoogleMeet = field.name === "createMeetLink"
        if (isGoogleMeet && config.createMeetLink) {
          return (
            <GoogleMeetCard
              meetUrl={meetDraft?.meetUrl}
              guestLimit={100}
              onRemove={() => handleCheckboxChange("createMeetLink", false)}
              onCopy={() => {
                if (meetDraft?.meetUrl) navigator.clipboard.writeText(meetDraft.meetUrl)
              }}
              onSettings={() => {}}
            />
          )
        }
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-start space-x-2">
              <Checkbox
                id={field.name}
                checked={config[field.name] || false}
                onCheckedChange={(checked) => handleCheckboxChange(field.name, checked as boolean)}
                className="h-4 w-4"
              />
              <Label htmlFor={field.name} className="text-sm font-medium cursor-pointer">
                {isGoogleMeet && <Video className="inline w-4 h-4 mr-2 text-blue-600" />}
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
            </div>
            {field.description && (
              <p className="text-xs text-muted-foreground ml-6">
                {field.description}
              </p>
            )}
          </div>
        )
      case "location-autocomplete":
        return (
          <div className="space-y-1">
            <LocationAutocomplete
              value={value}
              onChange={handleSelectChange}
              placeholder={field.placeholder}
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
            <div className="space-y-6 py-4 max-h-96 overflow-y-auto pr-2" style={{ paddingRight: '8px' }}>
              <div className="space-y-6">
                {nodeInfo.configSchema?.map((field) => {
                  // Hide time fields and their labels for Google Calendar when "All Day" is enabled
                  if (nodeInfo?.type === "google_calendar_action_create_event" && field.type === "time" && config.allDay) {
                    return null
                  }
                  // Hide time zone field and label for Google Calendar when "All Day" is enabled
                  if (nodeInfo?.type === "google_calendar_action_create_event" && field.name === "timeZone" && config.allDay) {
                    return null
                  }
                  
                  // Special handling for boolean fields (checkboxes)
                  if (field.type === "boolean") {
                    return (
                      <div key={field.name} className="flex flex-col space-y-2 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                        {renderField(field)}
                        {errors[field.name] && (
                          <p className="text-red-500 text-sm mt-1">{errors[field.name]}</p>
                        )}
                      </div>
                    )
                  }
                  
                  // For all other fields, use a more dynamic layout
                  return (
                    <div key={field.name} className="flex flex-col space-y-3 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={field.name} className="text-sm font-medium text-foreground min-w-0 flex-shrink-0 pr-4">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                      </div>
                      <div className="w-full">
                        {renderField(field)}
                      </div>
                      {errors[field.name] && (
                        <p className="text-red-500 text-sm mt-1">{errors[field.name]}</p>
                      )}
                    </div>
                  )
                })}
              </div>
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
