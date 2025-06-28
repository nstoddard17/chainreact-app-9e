"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { ConfigField, NodeComponent } from "@/lib/workflows/availableNodes"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Combobox, MultiCombobox, HierarchicalCombobox } from "@/components/ui/combobox"
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
  const { loadIntegrationData, getIntegrationByProvider, checkIntegrationScopes } = useIntegrationStore()
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)
  const [meetDraft, setMeetDraft] = useState<{ eventId: string; meetUrl: string } | null>(null)
  const [meetLoading, setMeetLoading] = useState(false)
  const meetDraftRef = useRef<string | null>(null)
  const previousDependentValues = useRef<Record<string, any>>({})

  // Function to get user's timezone
  const getUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (error) {
      // Fallback to UTC if timezone detection fails
      return "UTC"
    }
  }

  // Function to check if a field should be shown based on dependencies
  const shouldShowField = (field: ConfigField): boolean => {
    if (!field.dependsOn) return true
    
    const dependentValue = config[field.dependsOn]
    return !!dependentValue
  }

  // Function to fetch dynamic data for dependent fields
  const fetchDependentData = useCallback(async (field: ConfigField, dependentValue: any) => {
    if (!field.dynamic || !field.dependsOn) return
    
    const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
    if (!integration) return

    try {
      setLoadingDynamic(true)
      const data = await loadIntegrationData(
        field.dynamic,
        integration.id,
        { [field.dependsOn]: dependentValue }
      )
      
      if (data) {
        setDynamicOptions(prev => ({
          ...prev,
          [field.name]: data.map((item: any) => ({
            value: item.value || item.id || item.name,
            label: item.name || item.label || item.title,
            ...item
          }))
        }))
      }
    } catch (error) {
      console.error(`Error fetching dependent data for ${field.name}:`, error)
    } finally {
      setLoadingDynamic(false)
    }
  }, [config, nodeInfo?.providerId, getIntegrationByProvider, loadIntegrationData])

  const fetchDynamicData = useCallback(async () => {
    if (!nodeInfo || !nodeInfo.providerId) return

    const integration = getIntegrationByProvider(nodeInfo.providerId)
    if (!integration) return

    // Check if integration needs reconnection due to missing scopes
    const scopeCheck = checkIntegrationScopes(nodeInfo.providerId)
    if (scopeCheck.needsReconnection) {
      console.warn(`Integration needs reconnection: ${scopeCheck.reason}`)
      setErrors({ integrationError: `This integration needs to be reconnected to access the required permissions. Please reconnect your ${nodeInfo.providerId} integration.` })
      return
    }

    setLoadingDynamic(true)
    const newOptions: Record<string, any[]> = {}
    let hasData = false

    for (const field of nodeInfo.configSchema || []) {
      if (field.dynamic) {
        try {
          console.log(`Fetching dynamic data for ${field.dynamic}`)
          const data = await loadIntegrationData(field.dynamic, integration.id)
          if (data) {
            hasData = true
            if (field.dynamic === "slack-channels") {
              newOptions[field.name] = data.map((channel: any) => ({
                value: channel.id,
                label: channel.name,
              }))
            } else if (field.dynamic === "google-calendars") {
              newOptions[field.name] = data.map((calendar: any) => ({
                value: calendar.id,
                label: calendar.name,
              }))
            } else if (field.dynamic === "google-drive-folders") {
              newOptions[field.name] = data.map((folder: any) => ({
                value: folder.id,
                label: folder.name,
              }))
            } else if (field.dynamic === "google-drive-files") {
              newOptions[field.name] = data.map((file: any) => ({
                value: file.id,
                label: file.name,
              }))
            } else if (field.dynamic === "gmail-recent-recipients") {
              newOptions[field.name] = data.map((recipient: any) => ({
                value: recipient.email,
                label: recipient.email,
              }))
            } else if (field.dynamic === "gmail-enhanced-recipients") {
              newOptions[field.name] = data.map((recipient: any) => ({
                value: recipient.email,
                label: recipient.email,
              }))
            } else if (field.dynamic === "gmail-contact-groups") {
              newOptions[field.name] = data.map((group: any) => ({
                value: group.id,
                label: group.name,
              }))
            } else if (field.dynamic === "gmail_messages") {
              // Handle new grouped structure: data is array of label groups
              if (Array.isArray(data) && data.length > 0 && data[0].labelId) {
                // New grouped structure - create hierarchical dropdown
                const groupedOptions: any[] = []
                data.forEach((group: any) => {
                  if (group.emails && Array.isArray(group.emails) && group.emails.length > 0) {
                    // Create a group option with the folder/label name
                    const groupOption = {
                      value: `group_${group.labelId}`,
                      label: group.labelName,
                      description: `${group.emails.length} emails`,
                      isGroup: true,
                      groupId: group.labelId,
                      groupName: group.labelName,
                      emails: group.emails.map((email: any) => ({
                        value: email.id,
                        label: email.subject || "No Subject",
                        description: email.description,
                        groupId: group.labelId,
                        groupName: group.labelName,
                      })),
                    }
                    groupedOptions.push(groupOption)
                  }
                })
                newOptions[field.name] = groupedOptions
              } else {
                // Fallback to old flat structure
                newOptions[field.name] = data.map((message: any) => ({
                  value: message.id,
                  label: message.subject || "No Subject",
                  description: message.description,
                }))
              }
            } else if (field.dynamic === "gmail_labels") {
              newOptions[field.name] = data.map((label: any) => ({
                value: label.id,
                label: label.name,
                description: `${label.messages_total} messages`,
              }))
            } else if (field.dynamic === "google-sheets_spreadsheets") {
              if (data) {
                newOptions[field.name] = data.map((spreadsheet: any) => ({
                  value: spreadsheet.id,
                  label: spreadsheet.name,
                }))
              }
            } else if (field.dynamic === "google-sheets_sheets") {
              if (data) {
                newOptions[field.name] = data.map((sheet: any) => ({
                  value: sheet.title,
                  label: sheet.title,
                }))
              }
            } else if (field.dynamic === "google-docs_documents") {
              if (data) {
                newOptions[field.name] = data.map((document: any) => ({
                  value: document.id,
                  label: document.name,
                }))
              }
            } else if (field.dynamic === "google-docs_templates") {
              if (data) {
                newOptions[field.name] = data.map((template: any) => ({
                  value: template.id,
                  label: template.name,
                }))
              }
            }
          }
        } catch (error: any) {
          console.error(`Error fetching dynamic data for ${field.dynamic}:`, error)
          // Show specific error for scope issues
          if (error.message && error.message.includes("insufficient authentication scopes")) {
            setErrors(prev => ({
              ...prev,
              [field.name]: `This integration needs to be reconnected to access ${field.dynamic}. Please reconnect your ${nodeInfo.providerId} integration.`
            }))
          } else if (error.message && error.message.includes("authentication expired")) {
            setErrors(prev => ({
              ...prev,
              [field.name]: `Authentication expired. Please reconnect your ${nodeInfo.providerId} integration.`
            }))
          } else {
            setErrors(prev => ({
              ...prev,
              [field.name]: `Failed to load ${field.label || field.name}: ${error.message}`
            }))
          }
        }
      }
    }

    if (hasData) {
      setDynamicOptions(newOptions)
    }
    setLoadingDynamic(false)
  }, [nodeInfo, loadIntegrationData, checkIntegrationScopes])

  // Fetch dynamic data when modal opens
  useEffect(() => {
    if (isOpen && nodeInfo) {
      fetchDynamicData()
    }
  }, [isOpen, nodeInfo, fetchDynamicData])

  // Watch for changes in dependent fields and fetch their data
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    const fetchDependentFields = async () => {
      for (const field of nodeInfo.configSchema || []) {
        if (field.dependsOn && field.dynamic) {
          const dependentValue = config[field.dependsOn]
          const previousValue = previousDependentValues.current[field.dependsOn]
          
          // Only update if the dependent value has actually changed
          if (dependentValue !== previousValue) {
            previousDependentValues.current[field.dependsOn] = dependentValue
            
            if (dependentValue) {
              await fetchDependentData(field, dependentValue)
            } else {
              // Clear dependent field options when dependency is cleared
              setDynamicOptions(prev => {
                const newOptions = { ...prev }
                delete newOptions[field.name]
                return newOptions
              })
              // Clear dependent field value
              setConfig(prev => {
                const newConfig = { ...prev }
                delete newConfig[field.name]
                return newConfig
              })
            }
          }
        }
      }
    }

    fetchDependentFields()
  }, [isOpen, nodeInfo, config.spreadsheetId, fetchDependentData])

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
    
    // Reset previous dependent values when modal closes
    if (!isOpen) {
      previousDependentValues.current = {}
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
      
      // Special validation for Google Drive create file
      if (nodeInfo.type === "google-drive:create_file") {
        const hasFileContent = config.fileContent && config.fileContent.trim() !== ''
        const hasUploadedFiles = config.uploadedFiles && config.uploadedFiles.length > 0
        
        if (!hasFileContent && !hasUploadedFiles) {
          newErrors.fileContent = "Either file content or uploaded files are required"
          newErrors.uploadedFiles = "Either file content or uploaded files are required"
          isValid = false
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
    const isRequired = field.required

    // Helper function to extract filename from URL
    const extractFilenameFromUrl = (url: string): string => {
      try {
        // Try to get filename from URL path
        const urlObj = new URL(url)
        const pathname = urlObj.pathname
        const filename = pathname.split('/').pop()
        
        if (filename && filename.includes('.')) {
          return filename
        }
        
        // Special handling for Google Drive URLs
        if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
          // Extract file ID from Google Drive URL
          const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
          if (fileIdMatch) {
            const fileId = fileIdMatch[1]
            // Determine file type based on URL pattern
            if (url.includes('docs.google.com/document')) {
              return `Google Doc - ${fileId}.docx`
            } else if (url.includes('docs.google.com/spreadsheets')) {
              return `Google Sheet - ${fileId}.xlsx`
            } else if (url.includes('docs.google.com/presentation')) {
              return `Google Slides - ${fileId}.pptx`
            } else if (url.includes('drive.google.com/file')) {
              return `Google Drive File - ${fileId}`
            } else {
              return `Google Drive - ${fileId}`
            }
          }
        }
        
        // If no filename in path, try to get from Content-Disposition header
        // For now, we'll use a fallback approach
        return 'downloaded-file'
      } catch (error) {
        // If URL is invalid, try to extract from the string
        const urlParts = url.split('/')
        const lastPart = urlParts[urlParts.length - 1]
        
        if (lastPart && lastPart.includes('.')) {
          return lastPart
        }
        
        // Try to extract Google Drive file ID even from invalid URLs
        const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
        if (fileIdMatch) {
          const fileId = fileIdMatch[1]
          if (url.includes('docs.google.com/document')) {
            return `Google Doc - ${fileId}.docx`
          } else if (url.includes('docs.google.com/spreadsheets')) {
            return `Google Sheet - ${fileId}.xlsx`
          } else if (url.includes('docs.google.com/presentation')) {
            return `Google Slides - ${fileId}.pptx`
          } else if (url.includes('drive.google.com/file')) {
            return `Google Drive File - ${fileId}`
          } else {
            return `Google Drive - ${fileId}`
          }
        }
        
        return 'downloaded-file'
      }
    }

    // Handle URL field changes for upload file from URL node
    const handleUrlFieldChange = (newValue: string) => {
      setConfig(prev => ({ ...prev, [field.name]: newValue }))
      
      // If this is the fileUrl field for upload file from URL node, auto-populate filename
      if (nodeInfo?.type === "google_drive_action_upload_file" && field.name === "fileUrl" && newValue) {
        const extractedFilename = extractFilenameFromUrl(newValue)
        const currentFileName = config.fileName || ""
        const hasUserEditedFileName = currentFileName.trim() !== ""
        
        // Only auto-populate if user hasn't manually set a filename
        if (!hasUserEditedFileName) {
          setConfig(prev => ({ ...prev, fileName: extractedFilename }))
        }
      }
    }

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

    const handleMultiSelectChange = (newValue: string[]) => {
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user selects values
      if (hasError && newValue.length > 0) {
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
        
        // Use Combobox for all select fields that have options (both dynamic and static)
        if (finalOptions.length > 0) {
          // Check if this field supports multiple selection
          if (field.multiple) {
            // Ensure value is an array for multi-select
            const multiValue = Array.isArray(value) ? value : value ? [value] : []
            
            return (
              <div className="space-y-1">
                <div className={hasError ? 'ring-2 ring-red-500 rounded-md' : ''}>
                  <MultiCombobox
                    options={finalOptions}
                    value={multiValue}
                    onChange={handleMultiSelectChange}
                    placeholder={field.placeholder}
                    searchPlaceholder={field.placeholder}
                    emptyPlaceholder="No options found."
                  />
                </div>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                {hasError && (
                  <div className="flex items-center gap-1 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {errors[field.name]}
                  </div>
                )}
              </div>
            )
          }
          
          // Use HierarchicalCombobox for gmail_messages, regular Combobox for others
          if (field.dynamic === "gmail_messages") {
            return (
              <div className="space-y-1">
                <div className={hasError ? 'ring-2 ring-red-500 rounded-md' : ''}>
                  <HierarchicalCombobox
                    options={finalOptions}
                    value={value}
                    onChange={handleSelectChange}
                    placeholder={field.placeholder}
                    searchPlaceholder="Search emails or folders..."
                    emptyPlaceholder={loadingDynamic ? "Loading..." : "No emails found."}
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

        // Fallback to regular Select if no options are available
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
        if ((field.name === "attendees" && nodeInfo?.type === "google_calendar_action_create_event") || field.name === "to" || (field.name === "emailAddress" && nodeInfo?.type === "gmail_action_search_email")) {
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
              
              // Special handling for Google Drive create file - auto-populate file name IMMEDIATELY
              if (nodeInfo?.type === "google-drive:create_file" && field.name === "uploadedFiles") {
                const currentFileName = config.fileName || ""
                const hasUserEditedFileName = currentFileName.trim() !== ""
                
                if (filesArray.length === 1) {
                  // Single file: use the file's name (only if user hasn't manually set a name)
                  if (!hasUserEditedFileName) {
                    const fileName = filesArray[0].name
                    setConfig(prev => ({ ...prev, fileName }))
                  }
                } else if (filesArray.length > 1) {
                  // Multiple files: use the first file's name as base (only if user hasn't manually set a name)
                  if (!hasUserEditedFileName) {
                    const firstFileName = filesArray[0].name
                    // Remove extension to create a base name
                    const baseName = firstFileName.replace(/\.[^/.]+$/, "")
                    setConfig(prev => ({ ...prev, fileName: baseName }))
                  }
                }
              }
              
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
              setConfig(prev => ({ 
                ...prev, 
                [field.name]: allFileIds,
                [`${field.name}_files`]: filesArray // Store all files for UI
              }))
            } else {
              setConfig(prev => ({ 
                ...prev, 
                [field.name]: [],
                [`${field.name}_files`]: []
              }))
              
              // Clear file name if no files are uploaded for Google Drive create file
              if (nodeInfo?.type === "google-drive:create_file" && field.name === "uploadedFiles") {
                setConfig(prev => ({ ...prev, fileName: "" }))
              }
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
      case "string":
      case "text":
      case "email":
      case "password":
        return (
          <div className="space-y-1">
            <Input
              type={field.type === "email" ? "email" : "text"}
              placeholder={field.placeholder}
              value={value || ""}
              onChange={(e) => {
                if (field.name === "fileUrl") {
                  handleUrlFieldChange(e.target.value)
                } else {
                  setConfig(prev => ({ ...prev, [field.name]: e.target.value }))
                }
              }}
              className={hasError ? 'ring-2 ring-red-500' : ''}
              disabled={loadingDynamic}
            />
            {hasError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {errors[field.name]}
              </div>
            )}
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {/* Special note for filename field in upload file from URL node */}
            {nodeInfo?.type === "google_drive_action_upload_file" && field.name === "fileName" && (
              <p className="text-xs text-blue-600 mt-1">
                💡 <strong>Filename Priority:</strong> If you enter a filename here, it will be used. If you leave this blank, the original filename from the URL will be used.
              </p>
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
        
        {nodeInfo?.type === "google-drive:create_file" && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> You can either enter text content to create a text file, or upload existing files. 
              If you upload files, the file name field will be automatically populated:
            </p>
            <ul className="text-sm text-blue-800 mt-1 ml-4 list-disc">
              <li>Single file: Uses the uploaded file's name</li>
              <li>Multiple files: Uses the first file's name (without extension) as a base name</li>
              <li>Auto-population only occurs if you haven't manually entered a file name</li>
              <li>You can always edit the file name manually if needed</li>
            </ul>
          </div>
        )}
        
        
        {nodeInfo?.type === "google_drive_action_upload_file" && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> When you enter a file URL, the file name field will be automatically populated with the filename from the URL:
            </p>
            <ul className="text-sm text-blue-800 mt-1 ml-4 list-disc">
              <li>The filename is extracted from the URL path (e.g., "document.pdf" from "https://example.com/files/document.pdf")</li>
              <li>For Google Drive URLs, it extracts the file ID and creates a descriptive name</li>
              <li>Auto-population only occurs if you haven't manually entered a file name</li>
              <li><strong>Filename Priority:</strong> If you enter a filename in the textbox, it will be used. If you leave it blank, the original filename from the URL will be used.</li>
              <li>You can always edit the file name manually if needed</li>
              <li>If no filename can be extracted, it will default to "downloaded-file"</li>
            </ul>
          </div>
        )}
        
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
                  
                  // Hide fields that depend on other fields that haven't been selected
                  if (!shouldShowField(field)) {
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
