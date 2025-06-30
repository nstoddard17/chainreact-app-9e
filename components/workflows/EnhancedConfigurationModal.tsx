"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { NodeComponent, NodeField, ConfigField } from "@/lib/workflows/availableNodes"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { Combobox, MultiCombobox, HierarchicalCombobox } from "@/components/ui/combobox"
import { EmailAutocomplete } from "@/components/ui/email-autocomplete"
import { LocationAutocomplete } from "@/components/ui/location-autocomplete"
import { ConfigurationLoadingScreen } from "@/components/ui/loading-screen"
import { FileUpload } from "@/components/ui/file-upload"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { Play, X, Loader2, TestTube, Clock, HelpCircle, AlertCircle, Video, ChevronLeft, ChevronRight } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import GoogleMeetCard from "@/components/ui/google-meet-card"

interface EnhancedConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

export default function EnhancedConfigurationModal({
  isOpen,
  onClose,
  onSave,
  nodeInfo,
  integrationName,
  initialData = {},
  workflowData,
  currentNodeId,
}: EnhancedConfigurationModalProps) {
  const [config, setConfig] = useState<Record<string, any>>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { loadIntegrationData, getIntegrationByProvider, checkIntegrationScopes } = useIntegrationStore()
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)
  const [showRowSelected, setShowRowSelected] = useState(false)
  const [meetDraft, setMeetDraft] = useState<{ eventId: string; meetUrl: string } | null>(null)
  const [meetLoading, setMeetLoading] = useState(false)
  const meetDraftRef = useRef<string | null>(null)
  const previousDependentValues = useRef<Record<string, any>>({})
  const hasInitializedTimezone = useRef<boolean>(false)
  const hasInitializedDefaults = useRef<boolean>(false)
  
  // Create Spreadsheet specific state
  const [spreadsheetRows, setSpreadsheetRows] = useState<Record<string, string>[]>([{}])
  const [columnNames, setColumnNames] = useState<string[]>([])
  
  // Sheet data preview state  
  const [sheetData, setSheetData] = useState<any>(null)
  const [sheetPreview, setSheetPreview] = useState<any>(null)
  
  // Test functionality state
  const [testResult, setTestResult] = useState<any>(null)
  const [isTestLoading, setIsTestLoading] = useState(false)
  const [showTestOutput, setShowTestOutput] = useState(false)
  
  // Enhanced workflow segment testing state
  const [segmentTestResult, setSegmentTestResult] = useState<any>(null)
  const [isSegmentTestLoading, setIsSegmentTestLoading] = useState(false)
  const [showDataFlowPanels, setShowDataFlowPanels] = useState(false)
  
  // Global test store
  const { 
    setTestResults, 
    getNodeInputOutput, 
    isNodeInExecutionPath, 
    hasTestResults,
    getNodeTestResult,
    testTimestamp
  } = useWorkflowTestStore()

  useEffect(() => {
    setConfig(initialData)
  }, [initialData])

  // Check if this node has test data available
  const nodeTestData = currentNodeId ? getNodeInputOutput(currentNodeId) : null
  const isInExecutionPath = currentNodeId ? isNodeInExecutionPath(currentNodeId) : false
  const nodeTestResult = currentNodeId ? getNodeTestResult(currentNodeId) : null
  
  // Auto-show panels if this node has test data
  useEffect(() => {
    if (nodeTestData && isInExecutionPath) {
      setShowDataFlowPanels(true)
    }
  }, [nodeTestData, isInExecutionPath])

  // Function to get user's timezone
  const getUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (error) {
      // Fallback to UTC if timezone detection fails
      return "UTC"
    }
  }

  // Function to round time to nearest 5 minutes
  const roundToNearest5Minutes = (date: Date): Date => {
    const minutes = date.getMinutes()
    const roundedMinutes = Math.round(minutes / 5) * 5
    const newDate = new Date(date)
    newDate.setMinutes(roundedMinutes, 0, 0)
    return newDate
  }

  // Function to format time as HH:MM
  const formatTime = (date: Date): string => {
    return date.toTimeString().slice(0, 5)
  }

  // Function to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  // Function to check if a field should be shown based on dependencies
  const shouldShowField = (field: ConfigField | NodeField): boolean => {
    if (!field.dependsOn) {
      // Special logic for unified Google Sheets action
      if (nodeInfo?.type === "google_sheets_unified_action") {
        // Only show selectedRow field for update/delete actions
        if (field.name === "selectedRow" && config.action === "add") {
          return false
        }
      }
      // Special logic for read data action
      if (nodeInfo?.type === "google_sheets_action_read_data") {
        // Only show range field when readMode is "range"
        if (field.name === "range" && config.readMode !== "range") {
          return false
        }
        // Only show selectedRows field when readMode is "rows"
        if (field.name === "selectedRows" && config.readMode !== "rows") {
          return false
        }
        // Only show selectedCells field when readMode is "cells"
        if (field.name === "selectedCells" && config.readMode !== "cells") {
          return false
        }
      }
      return true
    }
    
    const dependentValue = config[field.dependsOn]
    return !!dependentValue
  }

  // Function to fetch dynamic data for dependent fields
  const fetchDependentData = useCallback(async (field: ConfigField | NodeField, dependentValue: any) => {
    if (!field.dynamic || !field.dependsOn) return
    
    const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
    if (!integration) return

    try {
      setLoadingDynamic(true)
      const data = await loadIntegrationData(
        field.dynamic as string,
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
      if (field.dynamic && !field.dependsOn) { // Skip dependent fields during initial load
        try {
          console.log(`Fetching dynamic data for ${field.dynamic}`)
          const data = await loadIntegrationData(field.dynamic as string, integration.id)
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
                label: calendar.summary,
              }))
            } else if (field.dynamic === "google-drives") {
              newOptions[field.name] = data.map((drive: any) => ({
                value: drive.id,
                label: drive.name,
              }))
            } else if (field.dynamic === "gmail-labels") {
              newOptions[field.name] = data.map((label: any) => ({
                value: label.id,
                label: label.name,
              }))
            } else if (field.dynamic === "spreadsheets") {
              newOptions[field.name] = data.map((spreadsheet: any) => ({
                value: spreadsheet.id,
                label: spreadsheet.properties.title,
                url: spreadsheet.url,
              }))
            } else if (field.dynamic === "airtable-bases") {
              newOptions[field.name] = data.map((base: any) => ({
                value: base.id,
                label: base.name,
              }))
            } else if (field.dynamic === "trello-boards") {
              newOptions[field.name] = data.map((board: any) => ({
                value: board.id,
                label: board.name,
              }))
            } else if (field.dynamic === "notion-databases") {
              newOptions[field.name] = data.map((database: any) => ({
                value: database.id,
                label: database.title[0]?.plain_text || "Untitled Database",
              }))
            } else if (field.dynamic === "youtube-channels") {
              newOptions[field.name] = data.map((channel: any) => ({
                value: channel.id,
                label: channel.snippet.title,
              }))
            } else if (field.dynamic === "github-repos") {
              newOptions[field.name] = data.map((repo: any) => ({
                value: repo.full_name,
                label: repo.name,
              }))
            } else {
              newOptions[field.name] = data.map((item: any) => ({
                value: item.value || item.id || item.name,
                label: item.name || item.label || item.title,
              }))
            }
          }
        } catch (error) {
          console.error(`Error loading dynamic data for ${field.dynamic}:`, error)
        }
      }
    }

    if (hasData) {
      setDynamicOptions(newOptions)
    }
    setLoadingDynamic(false)
  }, [nodeInfo, getIntegrationByProvider, checkIntegrationScopes, loadIntegrationData])

  useEffect(() => {
    if (isOpen && nodeInfo?.providerId) {
      fetchDynamicData()
    }
  }, [isOpen, nodeInfo?.providerId, fetchDynamicData])

  // Auto-load sheet data when action changes to update/delete (for unified Google Sheets action) or readMode is "rows" (for read data action)
  useEffect(() => {
    if (!isOpen || !nodeInfo) return
    
    // Check if we need to load sheet data
    const shouldLoadData = 
      (nodeInfo.type === "google_sheets_unified_action" && config.action && config.action !== "add") ||
      (nodeInfo.type === "google_sheets_action_read_data" && (config.readMode === "rows" || config.readMode === "cells" || config.readMode === "all"))
    
    if (!shouldLoadData) return
    if (!config.spreadsheetId || !config.sheetName) return
    
    const loadSheetData = async () => {
      try {
        setLoadingDynamic(true)
        const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
        if (!integration) return
        
        const data = await loadIntegrationData(
          "google-sheets_sheet-data",
          integration.id,
          { spreadsheetId: config.spreadsheetId, sheetName: config.sheetName }
        )
        
        if (data && data.length > 0) {
          setSheetData(data[0])
          setDynamicOptions(prev => ({
            ...prev,
            sheetData: data[0]
          }))
        }
      } catch (error) {
        console.error("Error auto-loading sheet data:", error)
      } finally {
        setLoadingDynamic(false)
      }
    }
    
    loadSheetData()
  }, [isOpen, nodeInfo, config.action, config.readMode, config.spreadsheetId, config.sheetName, getIntegrationByProvider, loadIntegrationData])

  // Fetch sheet preview when both spreadsheet and sheet are selected (for Google Sheets actions)
  useEffect(() => {
    if (!isOpen || !nodeInfo || !["google_sheets_action_append_row", "google_sheets_unified_action", "google_sheets_action_read_data"].includes(nodeInfo.type)) return
    
    const fetchSheetPreview = async () => {
      if (config.spreadsheetId && config.sheetName) {
        const integration = getIntegrationByProvider("google-sheets")
        if (!integration) return

        try {
          setLoadingDynamic(true)
          const previewData = await loadIntegrationData(
            "google-sheets_sheet-preview",
            integration.id,
            { spreadsheetId: config.spreadsheetId, sheetName: config.sheetName }
          )
          
          if (previewData && previewData.length > 0) {
            const preview = previewData[0]
            setSheetPreview(preview)
            setDynamicOptions(prev => ({
              ...prev,
              sheetPreview: preview,
              // Also populate search column options for the unified action
              ...(nodeInfo.type === "google_sheets_unified_action" && {
                searchColumn: preview.headers.map((header: any) => ({
                  value: header.column,
                  label: `${header.column} - ${header.name}`
                }))
              })
            }))
          }
        } catch (error) {
          console.error("Error fetching sheet preview:", error)
        } finally {
          setLoadingDynamic(false)
        }
      } else {
        // Clear preview when dependencies are not met
        setSheetPreview(null)
        setDynamicOptions(prev => {
          const newOptions = { ...prev }
          delete newOptions.sheetPreview
          return newOptions
        })
      }
    }

    fetchSheetPreview()
  }, [isOpen, nodeInfo, config.spreadsheetId, config.sheetName, getIntegrationByProvider, loadIntegrationData])

  // Enhanced workflow segment testing
  const handleTestWorkflowSegment = async () => {
    if (!nodeInfo?.testable || !workflowData || !currentNodeId) {
      console.warn('Test requirements not met:', { 
        testable: nodeInfo?.testable, 
        hasWorkflowData: !!workflowData, 
        currentNodeId 
      })
      return
    }
    
    // Prevent testing pending nodes
    if (currentNodeId.startsWith('pending-')) {
      console.warn('Cannot test pending node:', currentNodeId)
      return
    }
    
    // Validate that the target node exists in the workflow
    if (!workflowData.nodes?.find(n => n.id === currentNodeId)) {
      console.error('Target node not found in workflow:', currentNodeId)
      setSegmentTestResult({
        success: false,
        error: `Target node "${currentNodeId}" not found in workflow`
      })
      setShowDataFlowPanels(true)
      return
    }
    
    console.log('Starting workflow segment test:', { 
      workflowData, 
      targetNodeId: currentNodeId,
      nodeType: nodeInfo.type,
      availableNodeIds: workflowData.nodes?.map(n => n.id) || []
    })
    
    setIsSegmentTestLoading(true)
    setSegmentTestResult(null)
    
    try {
      const response = await fetch('/api/workflows/test-workflow-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowData,
          targetNodeId: currentNodeId,
          triggerData: {
            // Sample trigger data
            name: "John Doe",
            email: "john@example.com",
            status: "active",
            amount: 100,
            date: new Date().toISOString(),
            id: "test-123"
          }
        })
      })
      
      const result = await response.json()
      console.log('Test response:', result)
      
      if (result.success) {
        setSegmentTestResult(result)
        setShowDataFlowPanels(true)
        
        // Store test results globally
        setTestResults(
          result.executionResults,
          result.executionPath,
          result.dataFlow.triggerOutput,
          currentNodeId
        )
      } else {
        console.error('Test failed with error:', result.error)
        setSegmentTestResult({
          success: false,
          error: result.error || "Test failed"
        })
        setShowDataFlowPanels(true)
      }
    } catch (error: any) {
      console.error('Test request failed:', error)
      setSegmentTestResult({
        success: false,
        error: `Test failed with error: "${error.message}"`
      })
      setShowDataFlowPanels(true)
    } finally {
      setIsSegmentTestLoading(false)
    }
  }

  const validateRequiredFields = (): boolean => {
    const newErrors: Record<string, string> = {}
    let isValid = true
    
    nodeInfo?.configSchema?.forEach(field => {
      if (field.required && !config[field.name]) {
        newErrors[field.name] = `${field.label} is required`
        isValid = false
      }
    })
    
    setErrors(newErrors)
    return isValid
  }

  const handleSave = () => {
    if (validateRequiredFields()) {
      onSave(config)
      onClose()
    }
  }

  const renderField = (field: ConfigField | NodeField) => {
    const value = config[field.name] || ""
    const hasError = !!errors[field.name]

    // Extract filename from URL for display
    const extractFilenameFromUrl = (url: string): string => {
      try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname
        const filename = pathname.split('/').pop() || 'file'
        return decodeURIComponent(filename)
      } catch {
        return url.split('/').pop() || 'file'
      }
    }

    // Handle URL field changes with filename extraction
    const handleUrlFieldChange = (newValue: string) => {
      const newConfig = { ...config, [field.name]: newValue }
      
      // Auto-extract filename for text fields that look like URLs
      if (field.name.includes('url') && newValue && !config.filename) {
        const filename = extractFilenameFromUrl(newValue)
        if (filename) {
          newConfig.filename = filename
        }
      }
      
      setConfig(newConfig)
    }

    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const newValue = e.target.value
      
      if (field.name.includes('url')) {
        handleUrlFieldChange(newValue)
      } else {
        setConfig({ ...config, [field.name]: newValue })
      }
      
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
      if (hasError) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
      
      // Handle dependent field updates
      nodeInfo?.configSchema?.forEach(dependentField => {
        if (dependentField.dependsOn === field.name) {
          fetchDependentData(dependentField, newValue)
        }
      })
    }

    const handleMultiSelectChange = (newValue: string[]) => {
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear error when user selects values
      if (hasError) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    const handleCheckboxChange = (checked: boolean) => {
      setConfig(prev => ({ ...prev, [field.name]: checked }))
    }

    const handleFileChange = async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      
      if (field.multiple) {
        setConfig(prev => ({ ...prev, [field.name]: fileArray }))
      } else {
        setConfig(prev => ({ ...prev, [field.name]: fileArray[0] || null }))
      }
    }

    const handleDateChange = (date: Date | undefined) => {
      const dateString = date ? date.toISOString().split('T')[0] : ""
      const newConfig = { ...config, [field.name]: dateString }
      
      // Special handling for Google Calendar start/end date sync
      if (field.name === "startDate" && dateString && !config.endDate) {
        newConfig.endDate = dateString
      }
      
      setConfig(newConfig)
    }

    const handleTimeChange = (time: string) => {
      setConfig(prev => ({ ...prev, [field.name]: time }))
    }

    switch (field.type) {
      case "text":
      case "email":
      case "password":
        return (
          <Input
            type={field.type}
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder}
            className={cn("w-full", hasError && "border-red-500")}
          />
        )

      case "number":
        return (
          <Input
            type="number"
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder}
            className={cn("w-full", hasError && "border-red-500")}
          />
        )

      case "textarea":
        return (
          <Textarea
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder}
            className={cn("w-full min-h-[100px] resize-y", hasError && "border-red-500")}
          />
        )

      case "select":
        const options = field.dynamic ? dynamicOptions[field.name] || [] : field.options || []
        return (
          <Select
            value={value}
            onValueChange={handleSelectChange}
            disabled={loadingDynamic}
          >
            <SelectTrigger className={cn("w-full", hasError && "border-red-500")}>
              <SelectValue placeholder={loadingDynamic ? "Loading..." : field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => {
                const optionValue = typeof option === 'string' ? option : option.value
                const optionLabel = typeof option === 'string' ? option : option.label
                return (
                  <SelectItem key={optionValue} value={optionValue}>
                    {optionLabel}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        )

      case "boolean":
        return (
          <div className="flex items-center space-x-3">
            <Checkbox
              checked={!!value}
              onCheckedChange={handleCheckboxChange}
              className={cn(hasError && "border-red-500")}
            />
            <Label className="text-sm font-medium cursor-pointer" onClick={() => handleCheckboxChange(!value)}>
              {field.label}
            </Label>
          </div>
        )

      case "file":
        return (
          <FileUpload
            value={value}
            onChange={handleFileChange}
            accept={field.accept}
            maxFiles={field.multiple ? 10 : 1}
            maxSize={typeof field.maxSize === 'number' ? field.maxSize : undefined}
            placeholder={field.placeholder}
            className={cn(hasError && "border-red-500")}
          />
        )

      case "date":
        return (
          <DatePicker
            value={value ? new Date(value) : undefined}
            onChange={handleDateChange}
            placeholder={field.placeholder}
            className={cn(hasError && "border-red-500")}
          />
        )

      case "time":
        return (
          <TimePicker
            value={value}
            onChange={handleTimeChange}
            placeholder={field.placeholder}
            className={cn(hasError && "border-red-500")}
          />
        )

      case "datetime":
        return (
          <div className="flex gap-2">
            <DatePicker
              value={value ? new Date(value) : undefined}
              onChange={(date) => {
                if (date) {
                  const existingTime = value ? new Date(value).toTimeString().slice(0, 8) : "09:00:00"
                  const newDateTime = new Date(`${date.toISOString().split('T')[0]}T${existingTime}`)
                  setConfig(prev => ({ ...prev, [field.name]: newDateTime.toISOString() }))
                }
              }}
              placeholder="Select date"
              className={cn("flex-1", hasError && "border-red-500")}
            />
            <TimePicker
              value={value ? new Date(value).toTimeString().slice(0, 5) : ""}
              onChange={(time) => {
                if (time && value) {
                  const existingDate = new Date(value).toISOString().split('T')[0]
                  const newDateTime = new Date(`${existingDate}T${time}:00`)
                  setConfig(prev => ({ ...prev, [field.name]: newDateTime.toISOString() }))
                }
              }}
              placeholder="Select time"
              className={cn("w-32", hasError && "border-red-500")}
            />
          </div>
        )

      case "email-autocomplete":
        return (
          <EmailAutocomplete
            value={value}
            onChange={(newValue) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
            suggestions={[]} // TODO: Load from Gmail contacts
            placeholder={field.placeholder}
            multiple={field.multiple}
            className={cn(hasError && "border-red-500")}
          />
        )

      case "location-autocomplete":
        return (
          <LocationAutocomplete
            value={value}
            onChange={(newValue) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
            placeholder={field.placeholder}
            className={cn(hasError && "border-red-500")}
          />
        )

      default:
        return (
          <Input
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder}
            className={cn("w-full", hasError && "border-red-500")}
          />
        )
    }
  }

  const renderDataFlowPanel = (title: string, data: any, type: 'input' | 'output', isStoredData = false) => {
    if (!data) return null

    return (
      <div className={cn(
        "flex-1 bg-background border-l border-border overflow-hidden",
        type === 'input' ? "border-r-0" : "border-l-0"
      )}>
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <h3 className="text-sm font-semibold text-foreground">
              {title}
            </h3>
            <div className="flex items-center gap-2">
              {isStoredData && (
                <div className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700">
                  <Clock className="w-3 h-3" />
                  Cached
                </div>
              )}
              <div className={cn(
                "px-2 py-1 text-xs rounded-full",
                type === 'input' 
                  ? "bg-blue-100 text-blue-700" 
                  : "bg-green-100 text-green-700"
              )}>
                {type === 'input' ? 'Input' : 'Output'}
              </div>
            </div>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <pre className="text-xs text-foreground whitespace-pre-wrap break-words">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
              
              {/* Show execution status for stored data */}
              {isStoredData && nodeTestResult && (
                <div className={cn(
                  "text-xs px-2 py-1 rounded",
                  nodeTestResult.success 
                    ? "bg-green-100 text-green-800" 
                    : "bg-red-100 text-red-800"
                )}>
                  {nodeTestResult.success 
                    ? `✓ Executed successfully (Step ${nodeTestResult.executionOrder})`
                    : `✗ Failed: ${nodeTestResult.error}`}
                </div>
              )}
              
              {type === 'output' && nodeInfo?.outputSchema && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Available Fields:
                  </div>
                  <div className="space-y-1">
                    {nodeInfo.outputSchema.map((field) => (
                      <div key={field.name} className="text-xs border rounded p-2 bg-background">
                        <div className="font-medium text-foreground">
                          {field.label} ({field.type})
                        </div>
                        <div className="text-muted-foreground">
                          {field.description}
                        </div>
                        {field.example && (
                          <div className="text-blue-600 font-mono mt-1">
                            Example: {typeof field.example === 'object' 
                              ? JSON.stringify(field.example) 
                              : field.example}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    )
  }

  if (!nodeInfo) return null

  // Show loading screen while fetching dynamic data
  if (loadingDynamic && Object.keys(dynamicOptions).length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl w-full h-[90vh] p-0 gap-0 overflow-hidden">
          <ConfigurationLoadingScreen 
            integrationName={nodeInfo.title || nodeInfo.type || integrationName}
          />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent 
          className={cn(
            "max-w-4xl w-full h-[90vh] p-0 gap-0 overflow-hidden",
            showDataFlowPanels && "max-w-[95vw]"
          )}
        >
          <div className="flex h-full">
            {/* Left Data Flow Panel - Input */}
            {showDataFlowPanels && (
              <div className="w-80 bg-muted/30 border-r border-border">
                {/* Show live test results if available, otherwise show stored data */}
                {segmentTestResult ? (
                  renderDataFlowPanel(
                    "Workflow Input", 
                    segmentTestResult.targetNodeInput,
                    'input',
                    false
                  )
                ) : nodeTestData ? (
                  renderDataFlowPanel(
                    "Node Input", 
                    nodeTestData.input,
                    'input',
                    true
                  )
                ) : null}
              </div>
            )}

            {/* Main Configuration Content */}
            <div className="flex-1 flex flex-col">
              <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-lg font-semibold">
                    Configure {nodeInfo.title || nodeInfo.type}
                  </DialogTitle>
                  
                  {/* Test Button in Top Right */}
                  <div className="flex items-center gap-2">
                    {nodeInfo?.testable && workflowData && currentNodeId && !currentNodeId.startsWith('pending-') && (
                      <Button 
                        variant="secondary"
                        size="sm"
                        onClick={handleTestWorkflowSegment}
                        disabled={isSegmentTestLoading}
                        className="gap-2"
                      >
                        {isSegmentTestLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Test
                          </>
                        )}
                      </Button>
                    )}
                    
                    {/* Show data panels button for nodes with cached test data */}
                    {!showDataFlowPanels && nodeTestData && isInExecutionPath && (
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDataFlowPanels(true)}
                        className="gap-2"
                      >
                        <TestTube className="w-4 h-4" />
                        Show Data
                      </Button>
                    )}
                    
                    {showDataFlowPanels && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDataFlowPanels(false)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Test Status */}
                {showDataFlowPanels && (
                  <div className="space-y-2 mt-3">
                    {segmentTestResult && (
                      <div className={cn(
                        "text-sm px-3 py-2 rounded-md",
                        segmentTestResult.success 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      )}>
                        {segmentTestResult.success 
                          ? `✓ Test successful - Executed ${segmentTestResult.executionPath?.length || 0} nodes`
                          : `✗ Test failed: ${segmentTestResult.error}`}
                      </div>
                    )}
                    
                    {!segmentTestResult && nodeTestData && (
                      <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-blue-100 text-blue-800">
                        <TestTube className="w-4 h-4" />
                        <span>Showing cached test data from previous workflow execution</span>
                        {testTimestamp && (
                          <span className="text-xs opacity-75">
                            • {new Date(testTimestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </DialogHeader>

              {/* Configuration Form */}
              <ScrollArea className="flex-1 max-h-[60vh]">
                <div className="px-6 py-4 space-y-6">
                  {/* Integration Error */}
                  {errors.integrationError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-red-700">{errors.integrationError}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Configuration Fields */}
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
                    
                    // For all other fields, use a dynamic layout
                    return (
                      <div key={field.name} className="flex flex-col space-y-3 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Label htmlFor={field.name} className="text-sm font-medium text-foreground min-w-0 flex-shrink-0 pr-4">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {field.description && (
                              <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                  <button type="button" className="inline-flex items-center">
                                    <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-primary cursor-pointer transition-colors" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs p-3" sideOffset={8}>
                                  <p className="text-sm">{field.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
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
                  
                  {/* Google Sheets Data Preview Table */}
                  {((nodeInfo?.type === "google_sheets_unified_action" && config.action !== "add") || 
                    (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode && config.spreadsheetId && config.sheetName)) && 
                   sheetData && sheetData.headers && Array.isArray(sheetData.headers) && sheetData.data && Array.isArray(sheetData.data) && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="text-sm font-medium">
                      {nodeInfo?.type === "google_sheets_action_read_data" 
                        ? config.readMode === "all" 
                          ? "Data Preview (all data will be read):"
                          : config.readMode === "range"
                            ? "Data Preview (select range above):"
                            : config.readMode === "rows"
                              ? "Select rows to read:"
                              : config.readMode === "cells"
                                ? "Select individual cells to read:"
                                : "Data Preview:"
                        : `Select row to ${config.action}:`}
                      {loadingDynamic && <span className="text-muted-foreground ml-2">(Loading...)</span>}
                    </div>
                  
                    <div className="border rounded-lg">
                      <div className="bg-muted/50 p-2 border-b">
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sheetData.headers.length}, minmax(120px, 1fr))` }}>
                          {sheetData.headers.map((header: any, index: number) => (
                            <div key={index} className="text-xs font-medium text-muted-foreground p-1">
                              {header.column} - {header.name}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
                        {sheetData.data.map((row: any, index: number) => (
                          <div
                            key={index}
                            className={`grid gap-2 p-2 rounded ${
                              // Only make clickable and highlight if in row selection mode
                              nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows"
                                ? `cursor-pointer hover:bg-muted/50 ${
                                    (config.selectedRows || []).some((r: any) => r.rowIndex === row.rowIndex) 
                                      ? "bg-primary/10 border border-primary" 
                                      : "border border-transparent"
                                  }`
                                : nodeInfo?.type === "google_sheets_action_read_data"
                                  ? "border border-transparent" // Preview only, no interaction
                                  : `cursor-pointer hover:bg-muted/50 ${
                                      config.selectedRow?.rowIndex === row.rowIndex 
                                        ? "bg-primary/10 border border-primary" 
                                        : "border border-transparent"
                                    }`
                            }`}
                            style={{ gridTemplateColumns: `repeat(${sheetData.headers.length}, minmax(120px, 1fr))` }}
                            onClick={() => {
                              if (nodeInfo?.type === "google_sheets_action_read_data") {
                                // For read data action, support different selection modes
                                if (config.readMode === "rows") {
                                  const currentSelectedRows = config.selectedRows || []
                                  const isSelected = currentSelectedRows.some((r: any) => r.rowIndex === row.rowIndex)
                                  
                                  const newSelectedRows = isSelected
                                    ? currentSelectedRows.filter((r: any) => r.rowIndex !== row.rowIndex)
                                    : [...currentSelectedRows, row]
                                  
                                  setConfig(prev => ({
                                    ...prev,
                                    selectedRows: newSelectedRows
                                  }))
                                }
                                // For "all" and "range" modes, clicking does nothing (just preview)
                                // For "cells" mode, we'll handle individual cell clicks separately
                              } else {
                                // For unified action (update/delete), select the row
                                setConfig(prev => ({
                                  ...prev,
                                  selectedRow: row
                                }))
                                
                                // Show the "Row Selected!" message
                                setShowRowSelected(true)
                                setTimeout(() => setShowRowSelected(false), 2000)
                              }
                            }}
                          >
                            {row.values.map((cell: string, cellIndex: number) => {
                              const cellKey = `${row.rowIndex}-${cellIndex}`
                              
                              return (
                                <div
                                  key={cellIndex}
                                  className={`text-xs p-1 truncate ${
                                    nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells"
                                      ? `cursor-pointer hover:bg-blue-100 ${
                                          (config.selectedCells || []).some((cell: any) => cell.key === cellKey)
                                            ? "bg-blue-200 border border-blue-400"
                                            : "border border-transparent"
                                        }`
                                      : ""
                                  }`}
                                  onClick={(e) => {
                                    if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells") {
                                      e.stopPropagation() // Prevent row click
                                      const currentSelectedCells = config.selectedCells || []
                                      const isSelected = currentSelectedCells.some((cell: any) => cell.key === cellKey)
                                      
                                      const newSelectedCells = isSelected
                                        ? currentSelectedCells.filter((cell: any) => cell.key !== cellKey)
                                        : [...currentSelectedCells, {
                                            key: cellKey,
                                            rowIndex: row.rowIndex,
                                            columnIndex: cellIndex,
                                            columnName: sheetData.headers[cellIndex]?.name || `Column ${cellIndex + 1}`,
                                            columnLetter: sheetData.headers[cellIndex]?.column || String.fromCharCode(65 + cellIndex),
                                            value: cell || "",
                                            cellReference: `${sheetData.headers[cellIndex]?.column || String.fromCharCode(65 + cellIndex)}${row.rowIndex + 1}` // A1, B1, etc.
                                          }]
                                      
                                      setConfig(prev => ({
                                        ...prev,
                                        selectedCells: newSelectedCells
                                      }))
                                      
                                      // Show the "Cell Selected!" message
                                      setShowRowSelected(true)
                                      setTimeout(() => setShowRowSelected(false), 2000)
                                    }
                                  }}
                                >
                                  {cell || ""}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Show selection status */}
                    {config.selectedRows && config.selectedRows.length > 0 && (
                      <div className="text-xs text-green-600 bg-green-50 p-2 rounded border border-green-200">
                        {config.selectedRows.length} row(s) selected
                      </div>
                    )}
                    
                    {config.selectedCells && config.selectedCells.length > 0 && (
                      <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
                        {config.selectedCells.length} cell(s) selected
                      </div>
                    )}
                    
                    {config.selectedRow && nodeInfo?.type === "google_sheets_unified_action" && (
                      <div className="text-xs text-green-600 bg-green-50 p-2 rounded border border-green-200">
                        Row {config.selectedRow.rowIndex} selected for {config.action}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Google Sheets Column Mapping for Unified Actions */}
                  {nodeInfo?.type === "google_sheets_unified_action" && (config.action === "add" || config.action === "update") && sheetPreview && sheetPreview.headers && Array.isArray(sheetPreview.headers) && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="text-sm font-medium">Map your data to sheet columns:</div>
                      
                      {/* Header Row */}
                      <div className="grid gap-2 p-2 bg-muted/50 rounded-t-lg" style={{ gridTemplateColumns: `repeat(${sheetPreview.headers.length}, minmax(120px, 1fr))` }}>
                        {sheetPreview.headers.map((header: any, index: number) => (
                          <div key={index} className="text-xs font-medium text-center p-1">
                            <div className="font-mono bg-background px-2 py-1 rounded mb-1">
                              {header.column}
                            </div>
                            <div className="truncate">{header.name}</div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Input Row */}
                      <div className="grid gap-2 p-2 bg-background rounded-b-lg border border-t-0" style={{ gridTemplateColumns: `repeat(${sheetPreview.headers.length}, minmax(120px, 1fr))` }}>
                        {sheetPreview.headers.map((header: any, index: number) => (
                          <div key={index}>
                            <Input
                              placeholder={`Value for ${header.name}`}
                              value={config.columnMappings?.[header.column] || ""}
                              onChange={(e) => {
                                setConfig(prev => ({
                                  ...prev,
                                  columnMappings: {
                                    ...prev.columnMappings,
                                    [header.column]: e.target.value
                                  }
                                }))
                              }}
                              className="text-xs h-8"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Selection Status Toast */}
                  {showRowSelected && (
                    <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50">
                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells" 
                        ? "Cell Selected!" 
                        : nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows"
                          ? "Row Selection Updated!"
                          : "Row Selected!"}
                    </div>
                  )}
                  
                  {/* Required Fields Notice */}
                  {nodeInfo.configSchema?.some(field => field.required) && (
                    <div className="text-xs text-muted-foreground px-1 pt-2 border-t border-border/50">
                      * Required fields must be filled out before saving
                    </div>
                  )}
                  
                  {/* Test Output Display */}
                  {showTestOutput && testResult && (
                    <div className="border-t pt-4 mt-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">Test Output</h4>
                          <Button variant="ghost" size="sm" onClick={() => setShowTestOutput(false)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        {testResult.success ? (
                          <div className="space-y-3">
                            <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                              <div className="flex items-start gap-2">
                                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5">
                                  <div className="w-2 h-2 rounded-full bg-green-600"></div>
                                </div>
                                <span>{testResult.message}</span>
                              </div>
                            </div>
                            
                            {testResult.output && (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">Sample Output Data:</div>
                                <ScrollArea className="h-32 border rounded-lg">
                                  <div className="bg-muted/50 p-3 text-xs font-mono">
                                    <pre className="whitespace-pre-wrap">{JSON.stringify(testResult.output, null, 2)}</pre>
                                  </div>
                                </ScrollArea>
                              </div>
                            )}
                            
                            {nodeInfo?.outputSchema && (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">Available Output Fields:</div>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                  {nodeInfo.outputSchema.map((field) => (
                                    <div key={field.name} className="text-xs border rounded p-2 bg-background">
                                      <div className="font-medium">{field.label} ({field.type})</div>
                                      <div className="text-muted-foreground">{field.description}</div>
                                      {field.example && (
                                        <div className="text-blue-600 font-mono mt-1">
                                          Example: {typeof field.example === 'object' ? JSON.stringify(field.example) : field.example}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span>{testResult.message}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Dialog Footer */}
              <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
                <div className="flex items-center justify-between w-full">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSave}
                    disabled={loadingDynamic}
                  >
                    {loadingDynamic ? "Loading..." : "Save Configuration"}
                  </Button>
                </div>
              </DialogFooter>
            </div>

            {/* Right Data Flow Panel - Output */}
            {showDataFlowPanels && (
              <div className="w-80 bg-muted/30 border-l border-border">
                {/* Show live test results if available, otherwise show stored data */}
                {segmentTestResult ? (
                  renderDataFlowPanel(
                    "Node Output", 
                    segmentTestResult.targetNodeOutput,
                    'output',
                    false
                  )
                ) : nodeTestData ? (
                  renderDataFlowPanel(
                    "Node Output", 
                    nodeTestData.output,
                    'output',
                    true
                  )
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
} 