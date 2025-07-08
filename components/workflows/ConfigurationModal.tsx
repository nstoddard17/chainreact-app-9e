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
import { Play, X, Loader2, TestTube, Clock, HelpCircle, AlertCircle, Video, ChevronLeft, ChevronRight, Database, Calendar } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EnhancedTooltip } from "@/components/ui/enhanced-tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import GoogleMeetCard from "@/components/ui/google-meet-card"
import VariablePicker from "./VariablePicker"

interface ConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  nodeInfo: NodeComponent | null
  integrationName: string
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

export default function ConfigurationModal({
  isOpen,
  onClose,
  onSave,
  nodeInfo,
  integrationName,
  initialData = {},
  workflowData,
  currentNodeId,
}: ConfigurationModalProps) {
  const [config, setConfig] = useState<Record<string, any>>(initialData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { loadIntegrationData, getIntegrationByProvider, checkIntegrationScopes } = useIntegrationStore()
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string; fields?: any[]; isExisting?: boolean }[]>
  >({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [createNewTables, setCreateNewTables] = useState<Record<string, boolean>>({})
  const [dynamicTableFields, setDynamicTableFields] = useState<Record<string, any[]>>({})
  const [showRowSelected, setShowRowSelected] = useState(false)
  const [meetDraft, setMeetDraft] = useState<{ eventId: string; meetUrl: string } | null>(null)
  const [meetLoading, setMeetLoading] = useState(false)
  const meetDraftRef = useRef<string | null>(null)
  const previousDependentValues = useRef<Record<string, any>>({})
  const hasInitializedTimezone = useRef<boolean>(false)
  const hasInitializedDefaults = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Create Spreadsheet specific state
  const [spreadsheetRows, setSpreadsheetRows] = useState<Record<string, string>[]>([{}])
  const [columnNames, setColumnNames] = useState<string[]>([])
  
  // Sheet data preview state  
  const [sheetData, setSheetData] = useState<any>(null)
  const [sheetPreview, setSheetPreview] = useState<any>(null)
  
  // Range selection state for Google Sheets
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null)
  const [selectedRange, setSelectedRange] = useState<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null)
  
  // Test functionality state
  const [testResult, setTestResult] = useState<any>(null)
  const [isTestLoading, setIsTestLoading] = useState(false)
  const [showTestOutput, setShowTestOutput] = useState(false)
  
  // Enhanced workflow segment testing state
  const [segmentTestResult, setSegmentTestResult] = useState<any>(null)
  const [isSegmentTestLoading, setIsSegmentTestLoading] = useState(false)
  const [showDataFlowPanels, setShowDataFlowPanels] = useState(false)
  
  // Discord bot detection state
  const [botStatus, setBotStatus] = useState<Record<string, boolean>>({})
  const [checkingBot, setCheckingBot] = useState(false)
  
  // Global test store
  const { 
    setTestResults, 
    getNodeInputOutput, 
    isNodeInExecutionPath, 
    hasTestResults,
    getNodeTestResult,
    testTimestamp
  } = useWorkflowTestStore()

  // Helper functions for range selection
  const getCellCoordinate = (rowIndex: number, colIndex: number): string => {
    const colLetter = String.fromCharCode(65 + colIndex) // A, B, C, etc.
    const rowNumber = rowIndex + 1 // Convert to 1-based indexing
    return `${colLetter}${rowNumber}`
  }

  const getRangeString = (start: { row: number; col: number }, end: { row: number; col: number }): string => {
    const startCoord = getCellCoordinate(start.row, start.col)
    const endCoord = getCellCoordinate(end.row, end.col)
    return `${startCoord}:${endCoord}`
  }

  const isCellInRange = (rowIndex: number, colIndex: number, range: { start: { row: number; col: number }; end: { row: number; col: number } }): boolean => {
    const minRow = Math.min(range.start.row, range.end.row)
    const maxRow = Math.max(range.start.row, range.end.row)
    const minCol = Math.min(range.start.col, range.end.col)
    const maxCol = Math.max(range.start.col, range.end.col)
    
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol
  }

  const isCellSelected = (rowIndex: number, colIndex: number): boolean => {
    if (!config.selectedCells || !Array.isArray(config.selectedCells)) return false
    return config.selectedCells.some((cell: any) => cell.rowIndex === rowIndex && cell.colIndex === colIndex)
  }

  // Mouse event handlers for range selection
  const handleMouseDown = (rowIndex: number, colIndex: number) => {
    if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range") {
      // Prevent text selection during drag
      document.body.style.userSelect = 'none'
      ;(document.body.style as any).webkitUserSelect = 'none'
      ;(document.body.style as any).mozUserSelect = 'none'
      ;(document.body.style as any).msUserSelect = 'none'
      
      setIsDragging(true)
      setDragStart({ row: rowIndex, col: colIndex })
      setDragEnd({ row: rowIndex, col: colIndex })
      setSelectedRange({ start: { row: rowIndex, col: colIndex }, end: { row: rowIndex, col: colIndex } })
    }
  }

  const handleMouseEnter = (rowIndex: number, colIndex: number) => {
    if (isDragging && nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range") {
      setDragEnd({ row: rowIndex, col: colIndex })
      setSelectedRange({ start: dragStart!, end: { row: rowIndex, col: colIndex } })
    }
  }

  const handleMouseUp = () => {
    if (isDragging && nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range") {
      setIsDragging(false)
      if (selectedRange) {
        const rangeString = getRangeString(selectedRange.start, selectedRange.end)
        setConfig(prev => ({
          ...prev,
          range: rangeString
        }))
      }
    }
    
    // Restore text selection
    document.body.style.userSelect = ''
    ;(document.body.style as any).webkitUserSelect = ''
    ;(document.body.style as any).mozUserSelect = ''
    ;(document.body.style as any).msUserSelect = ''
  }

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells") {
      const currentSelectedCells = config.selectedCells || []
      const cellKey = `${rowIndex}-${colIndex}`
      const isSelected = currentSelectedCells.some((cell: any) => cell.rowIndex === rowIndex && cell.colIndex === colIndex)
      
      const newSelectedCells = isSelected
        ? currentSelectedCells.filter((cell: any) => !(cell.rowIndex === rowIndex && cell.colIndex === colIndex))
        : [...currentSelectedCells, { rowIndex, colIndex, coordinate: getCellCoordinate(rowIndex, colIndex) }]
      
      setConfig(prev => ({
        ...prev,
        selectedCells: newSelectedCells
      }))
    }
  }

  useEffect(() => {
    setConfig(initialData)
    // Reset the initialization flag when initialData changes
    hasInitializedDefaults.current = false
  }, [initialData])

  // Cleanup effect to abort in-flight requests when modal closes or node changes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [isOpen, nodeInfo?.providerId])

  // Global mouse up handler for range selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp()
      }
    }

    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, selectedRange])

  // Reset range selection when readMode changes
  useEffect(() => {
    if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode !== "range") {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      setSelectedRange(null)
    }
  }, [config.readMode, nodeInfo?.type])

  // Reset loading state when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setLoadingDynamic(false)
      setRetryCount(0)
      // Reset previous dependent values when modal closes
      previousDependentValues.current = {}
      hasInitializedTimezone.current = false
      hasInitializedDefaults.current = false
      // Clear errors when modal closes
      setErrors({})
      // Reset range selection state
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      setSelectedRange(null)
    }
  }, [isOpen])

  // Clear integration error when integration status changes
  useEffect(() => {
    if (nodeInfo?.providerId) {
      const integration = getIntegrationByProvider(nodeInfo.providerId)
      if (integration && integration.status === 'connected' && errors.integrationError) {
        // Clear the error if the integration is now connected
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors.integrationError
          return newErrors
        })
      }
    }
  }, [nodeInfo?.providerId, getIntegrationByProvider, errors.integrationError])

  // Check Discord bot status when guild is selected
  const checkBotInGuild = async (guildId: string) => {
    if (!guildId || checkingBot) return
    
    setCheckingBot(true)
    try {
      const response = await fetch('/api/integrations/discord/check-bot-in-guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId })
      })
      
      if (response.ok) {
        const data = await response.json()
        const isBotPresent = data.present
        setBotStatus(prev => ({ ...prev, [guildId]: isBotPresent }))
        
        // If bot is connected, fetch channels for this guild
        if (isBotPresent && nodeInfo?.type === "discord_action_send_message") {
          console.log('✅ Bot is connected, fetching channels for guild:', guildId)
          const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
          if (integration) {
            try {
              // Use a direct API call to avoid triggering the loading modal
              const response = await fetch('/api/integrations/fetch-user-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  integrationId: integration.id,
                  providerId: 'discord',
                  dataType: 'discord_channels',
                  guildId: guildId
                })
              })
              
              if (response.ok) {
                const result = await response.json()
                if (result.success && result.data) {
                  const mappedChannels = result.data.map((channel: any) => ({
                    value: channel.value,
                    label: channel.name || channel.label,
                  }))
                  setDynamicOptions(prev => ({
                    ...prev,
                    "channelId": mappedChannels,
                  }))
                  console.log('✅ Channels loaded:', mappedChannels.length)
                } else {
                  console.log('⚠️ No channels found for guild:', guildId)
                }
              } else {
                console.error("Error fetching channels:", response.statusText)
              }
            } catch (error) {
              console.error("Error fetching channels:", error)
            }
          }
        }
      } else {
        console.error('Failed to check bot status')
        setBotStatus(prev => ({ ...prev, [guildId]: false }))
      }
    } catch (error) {
      console.error('Error checking bot status:', error)
      setBotStatus(prev => ({ ...prev, [guildId]: false }))
    } finally {
      setCheckingBot(false)
    }
  }

  // Initialize default values from schema
  useEffect(() => {
    if (!nodeInfo || hasInitializedDefaults.current) return

    const defaultValues: Record<string, any> = {}
    
    // Apply default values from configSchema
    nodeInfo.configSchema?.forEach((field: any) => {
      if (field.defaultValue !== undefined && (config[field.name] === undefined || config[field.name] === '')) {
        defaultValues[field.name] = field.defaultValue
      }
    })

    // Initialize Google Calendar defaults
    if (nodeInfo?.type === "google_calendar_action_create_event") {
      const now = new Date()
      const nextHour = new Date(now)
      nextHour.setHours(now.getHours() + 1, 0, 0, 0) // Round to next hour
      const endTime = new Date(nextHour)
      endTime.setHours(endTime.getHours() + 1) // 1 hour duration
      
      // Set default dates and times if not already set
      if (config.startDate === undefined) {
        defaultValues.startDate = formatDate(now)
      }
      if (config.startTime === undefined) {
        defaultValues.startTime = formatTime(nextHour)
      }
      if (config.endDate === undefined) {
        defaultValues.endDate = formatDate(now)
      }
      if (config.endTime === undefined) {
        defaultValues.endTime = formatTime(endTime)
      }
      if (config.timeZone === undefined || config.timeZone === "user-timezone") {
        defaultValues.timeZone = getUserTimezone()
      }
    }

    // Initialize Google Sheets create spreadsheet defaults
    if (nodeInfo?.type === "google_sheets_action_create_spreadsheet") {
      // Set default timezone to user's current timezone if not specified
      if (config.timeZone === undefined) {
        defaultValues.timeZone = getUserTimezone()
      }
    }

    // Auto-populate Gmail action fields from Gmail trigger
    if (nodeInfo.providerId === 'gmail' && nodeInfo.type?.includes('action') && workflowData) {
      // Find the Gmail trigger node
      const gmailTrigger = workflowData.nodes?.find(node => {
        const isGmailTrigger = (
          node.data?.isTrigger === true && node.data?.providerId === 'gmail'
        ) || (
          node.data?.type?.startsWith('gmail_trigger')
        )
        
        if (isGmailTrigger) {
          
        }
        
        return isGmailTrigger
      })
      
      if (gmailTrigger) {
        const messageIdField = nodeInfo.configSchema?.find(field => field.name === 'messageId')
        if (messageIdField && config[messageIdField.name] === undefined) {
          let fromEmail = ''
          
          // METHOD 1: Try to get email from trigger's EXECUTION OUTPUT (if it has been tested/run)
          const triggerTestData = getNodeInputOutput(gmailTrigger.id)
          if (triggerTestData?.output) {
            fromEmail = triggerTestData.output.from || triggerTestData.output.sender || ''
          }
          
          // METHOD 2: Fallback to trigger's CONFIGURATION (static filter)
          if (!fromEmail) {
            const triggerConfig = gmailTrigger.data?.config || {}
            fromEmail = triggerConfig.from || ''
          }
          
          // METHOD 3: If no email found anywhere, try trigger output for other email fields
          if (!fromEmail && triggerTestData?.output) {
            fromEmail = triggerTestData.output.fromEmail || triggerTestData.output.email || ''
          }
          
          if (fromEmail && fromEmail.trim() !== '') {
            defaultValues[messageIdField.name] = fromEmail

          } else {
            defaultValues[messageIdField.name] = ''
            console.log('ℹ️ No email found in trigger config OR execution output')
          }
        }
      } else {

      }
    }

    if (Object.keys(defaultValues).length > 0) {
      setConfig(prev => ({ ...defaultValues, ...prev }))
      hasInitializedDefaults.current = true
    }
  }, [nodeInfo, workflowData])

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

  // Function to fetch dynamic table fields from database
  const fetchTableFields = useCallback(async (tableName: string) => {
    if (!nodeInfo || !nodeInfo.providerId) return

    const integration = getIntegrationByProvider(nodeInfo.providerId)
    if (!integration) return

    // For now, use the existing table fields from dynamicOptions since the API doesn't support dynamic field fetching
    // In the future, this could be enhanced to make actual API calls when the backend supports it
    try {
      setLoadingDynamic(true)
      
      // Look for table fields in the existing dynamicOptions
      const selectedTable = dynamicOptions["tableName"]?.find((table: any) => table.value === tableName)
      if (selectedTable?.fields && Array.isArray(selectedTable.fields)) {
        setDynamicTableFields(prev => ({
          ...prev,
          [tableName]: selectedTable.fields as any[]
        }))
        
        // Fetch records for linked table fields
        for (const fieldDef of selectedTable.fields) {
          const isLinkedField = fieldDef.type === "linkedRecord" || 
                               fieldDef.type === "link" || 
                               fieldDef.type === "multipleRecordLinks" ||
                               fieldDef.type === "recordLink" ||
                               fieldDef.type === "lookup" ||
                               fieldDef.linkedTableName ||
                               fieldDef.foreignTable
          
          if (isLinkedField && fieldDef.linkedTableName) {
            try {

              
              // Determine the appropriate data type for priority linked fields
              let dataType = "airtable_records"
              if (fieldDef.name.toLowerCase().includes('project')) {
                dataType = "airtable_project_records"
              } else if (fieldDef.name.toLowerCase().includes('task')) {
                dataType = "airtable_task_records"
              } else if (fieldDef.name.toLowerCase().includes('feedback')) {
                dataType = "airtable_feedback_records"
              }
              
              const linkedTableData = await loadIntegrationData(
                dataType,
                integration.id,
                { baseId: config.baseId, tableName: fieldDef.linkedTableName }
              )
              

              
              if (linkedTableData) {
                // The API already returns data with value, label, description, and fields properties
                // So we don't need to remap it, just use it directly
                const mappedRecords = linkedTableData.map((record: any) => ({
                  value: record.value || record.id,
                  label: record.label || record.name || 'Untitled',
                  description: record.description || '',
                  fields: record.fields || {}
                }))
                

                
                setDynamicOptions(prev => {
                  const newOptions = {
                    ...prev,
                    [`${fieldDef.name}_records`]: mappedRecords
                  }
                  
                  // Also store with generic priority keys for consistency
                  if (fieldDef.name.toLowerCase().includes('project')) {
                    newOptions["project_records"] = mappedRecords
                  } else if (fieldDef.name.toLowerCase().includes('task')) {
                    newOptions["task_records"] = mappedRecords
                  } else if (fieldDef.name.toLowerCase().includes('feedback')) {
                    newOptions["feedback_records"] = mappedRecords
                  }
                  
                  return newOptions
                })
              } else {
                console.warn(`⚠️ No linked records found for ${fieldDef.name}`)
              }
            } catch (error) {
              console.error(`❌ Error fetching records for linked table ${fieldDef.linkedTableName}:`, error)
            }
          }
        }
      } else {
        // If no fields found for the specific table, try to find any table with the same name
        // or use a generic field structure
        console.warn(`No fields found for table ${tableName}, using generic field structure`)
        setDynamicTableFields(prev => ({
          ...prev,
          [tableName]: [
            { name: 'Name', type: 'singleLineText', required: true },
            { name: 'Notes', type: 'multilineText', required: false },
            { name: 'Status', type: 'singleSelect', required: false, options: { choices: [{ name: 'Active' }, { name: 'Inactive' }] } },
            { name: 'Created Date', type: 'date', required: false }
          ]
        }))
      }
    } catch (error) {
      console.error(`Error setting up fields for table ${tableName}:`, error)
    } finally {
      setLoadingDynamic(false)
    }
  }, [nodeInfo?.providerId, getIntegrationByProvider, dynamicOptions, config.baseId])

  // Function to toggle create new mode for a table
  const toggleCreateNew = useCallback(async (tableName: string) => {
    const isCurrentlyCreating = createNewTables[tableName]
    
    setCreateNewTables(prev => ({
      ...prev,
      [tableName]: !isCurrentlyCreating
    }))

    // Clear the fields when switching modes
    if (isCurrentlyCreating) {
      setConfig(prev => {
        const newConfig = { ...prev }
        delete newConfig[`${tableName}_newFields`]
        return newConfig
      })
    } else {
      setConfig(prev => ({
        ...prev,
        [`${tableName}_newFields`]: {}
      }))
    }

    // Fetch fresh table fields when entering create mode
    if (!isCurrentlyCreating) {
      await fetchTableFields(tableName)
    }
  }, [createNewTables, fetchTableFields])

  // Function to check if a field should be shown based on dependencies
  const shouldShowField = (field: ConfigField | NodeField): boolean => {
    // Don't show hidden fields
    if (field.hidden) {
      return false
    }
    

    
    // Special logic for Discord send message action
    if (nodeInfo?.type === "discord_action_send_message") {
      // Always show guildId (server selection)
      if (field.name === "guildId") {
        return true
      }
      
      // Only show other fields if bot is connected to the selected server
      if (config.guildId && botStatus[config.guildId]) {
        return true
      }
      
      // Hide all other fields until bot is connected
      return false
    }
    
    // Special logic for read data action (applies to all fields, including those with dependencies)
    if (nodeInfo?.type === "google_sheets_action_read_data") {
      // Hide range field entirely since users can select visually
      if (field.name === "range") {
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
      // Only show maxRows field when readMode is "all"
      if (field.name === "maxRows" && config.readMode !== "all") {
        return false
      }
    }

    if (!field.dependsOn) {
      // Special logic for unified Google Sheets action
      if (nodeInfo?.type === "google_sheets_unified_action") {
        // Only show selectedRow field for update/delete actions
        if (field.name === "selectedRow" && config.action === "add") {
          return false
        }
      }
      // Special logic for Airtable create record action
      if (nodeInfo?.type === "airtable_action_create_record") {
        // Hide status field until table is selected
        if (field.name === "status" && !config.tableName) {
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

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      setLoadingDynamic(true)
      const data = await loadIntegrationData(
        field.dynamic as string,
        integration.id,
        { [field.dependsOn]: dependentValue }
      )
      
      // Only update state if the request wasn't aborted
      if (!controller.signal.aborted && data) {

        setDynamicOptions(prev => ({
          ...prev,
          [field.name]: data.map((item: any) => ({
            value: item.value || item.id || item.name,
            label: item.name || item.label || item.title,
            description: item.description,
            fields: item.fields || [],
            ...item
          }))
        }))
      } else if (!controller.signal.aborted) {
        console.log(`⚠️ No data received for ${field.name}`)
      }
    } catch (error) {
      // Don't log errors for aborted requests
      if (!controller.signal.aborted) {
        console.error(`Error fetching dependent data for ${field.name}:`, error)
        
        // Handle authentication errors specifically
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('authentication expired') || errorMessage.includes('401')) {
          setErrors(prev => ({
            ...prev,
            integrationError: `Your ${nodeInfo?.providerId || 'integration'} connection has expired. Please reconnect your account to continue.`
          }))
        } else {
          setErrors(prev => ({
            ...prev,
            integrationError: `Failed to load ${field.label || field.name} data. Please try again.`
          }))
        }
      }
    } finally {
      // Only update loading state if the request wasn't aborted
      if (!controller.signal.aborted) {
        setLoadingDynamic(false)
      }
    }
  }, [config, nodeInfo?.providerId, getIntegrationByProvider, loadIntegrationData])

  const fetchDynamicData = useCallback(async () => {
    if (!nodeInfo || !nodeInfo.providerId) return

    const integration = getIntegrationByProvider(nodeInfo.providerId)
    if (!integration) {
      console.warn('⚠️ No integration found for provider:', nodeInfo.providerId)
      return
    }

    // Check if integration needs reconnection due to missing scopes
    const scopeCheck = checkIntegrationScopes(nodeInfo.providerId)
    if (scopeCheck.needsReconnection) {
      console.warn(`Integration needs reconnection: ${scopeCheck.reason}`)
      setErrors({ integrationError: `This integration needs to be reconnected to access the required permissions. Please reconnect your ${nodeInfo.providerId} integration.` })
      return
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoadingDynamic(true)
    const newOptions: Record<string, any[]> = {}
    let hasData = false

    // Fetch standard dynamic fields from configSchema
    for (const field of nodeInfo.configSchema || []) {
      if (field.dynamic && !field.dependsOn) { // Skip dependent fields during initial load
        try {
          console.log(`🔍 Fetching dynamic data for field:`, {
            fieldName: field.name,
            fieldType: field.type,
            dynamic: field.dynamic,
            integrationId: integration.id
          })
          
          const data = await loadIntegrationData(field.dynamic as string, integration.id)
          
          console.log(`✅ Received data for ${field.name}:`, {
            dataReceived: !!data,
            recordCount: data?.length || 0,
            sampleData: data?.[0]
          })
          
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
            } else if (field.dynamic === "google-drives") {
              newOptions[field.name] = data.map((drive: any) => ({
                value: drive.id,
                label: drive.name,
              }))
            } else if (field.dynamic === "gmail-labels") {
              newOptions[field.name] = data.map((label: any) => ({
                value: label.id,
                label: label.name,
                isExisting: true
              }))
            } else if (field.dynamic === "gmail-recent-recipients") {
              const mappedData = data.map((recipient: any) => ({
                value: recipient.email || recipient.value,
                label: recipient.label || (recipient.name ? recipient.name + " <" + recipient.email + ">" : recipient.email),
                email: recipient.email || recipient.value,
                name: recipient.name,
                type: recipient.type || "contact"
              }))
              newOptions[field.name] = mappedData
            } else if (field.dynamic === "gmail-enhanced-recipients") {
              if (Array.isArray(data) && data.length > 0) {
                const mappedData = data.map((recipient: any) => ({
                  value: recipient.email || recipient.value,
                  label: recipient.label || (recipient.name ? recipient.name + " <" + recipient.email + ">" : recipient.email),
                  email: recipient.email || recipient.value,
                  name: recipient.name,
                  type: recipient.type,
                  isGroup: recipient.isGroup,
                  groupId: recipient.groupId,
                  members: recipient.members
                }))
                newOptions[field.name] = mappedData
              } else {
                newOptions[field.name] = []
              }
            } else if (field.dynamic === "spreadsheets") {
              newOptions[field.name] = data.map((spreadsheet: any) => ({
                value: spreadsheet.id,
                label: spreadsheet.properties.title,
                url: spreadsheet.url,
              }))
            } else if (field.dynamic === "airtable_tables") {
              
              newOptions[field.name] = data.map((table: any) => ({
                value: table.value,
                label: table.label,
                description: table.description,
                fields: table.fields || []
              }))
            } else if (field.dynamic === "airtable_bases") {
              
              newOptions[field.name] = data.map((base: any) => ({
                value: base.value,
                label: base.label,
                description: base.description,
              }))
            } else if (field.dynamic === "airtable_records") {
              newOptions[field.name] = data.map((record: any) => ({
                value: record.value,
                label: record.label,
                description: record.description,
                fields: record.fields || {}
              }))
            } else if (field.dynamic === "airtable_project_records") {
              newOptions[field.name] = data.map((record: any) => ({
                value: record.value,
                label: record.label,
                description: record.description,
                fields: record.fields || {}
              }))
            } else if (field.dynamic === "airtable_task_records") {
              newOptions[field.name] = data.map((record: any) => ({
                value: record.value,
                label: record.label,
                description: record.description,
                fields: record.fields || {}
              }))
            } else if (field.dynamic === "airtable_feedback_records") {
              newOptions[field.name] = data.map((record: any) => ({
                value: record.value,
                label: record.label,
                description: record.description,
                fields: record.fields || {}
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
            } else if (field.dynamic === "discord_guilds") {
              newOptions[field.name] = data.map((guild: any) => ({
                value: guild.id,
                label: guild.name,
              }))
            } else if (field.dynamic === "discord_channels") {
              newOptions[field.name] = data.map((channel: any) => ({
                value: channel.id,
                label: channel.name,
              }))
            } else if (field.dynamic === "facebook_pages") {
              console.log("🔍 Processing Facebook pages data:", data)
              newOptions[field.name] = data.map((page: any) => ({
                value: page.id,
                label: page.name,
              }))
              console.log("🔍 Mapped Facebook pages options:", newOptions[field.name])
            } else {
              newOptions[field.name] = data.map((item: any) => ({
                value: item.value || item.id || item.name,
                label: item.name || item.label || item.title,
              }))
            }
          }
        } catch (error) {
          // Don't log errors for aborted requests
          if (!controller.signal.aborted) {
            console.error(`❌ Error loading dynamic data for ${field.dynamic}:`, error)
            
            // Handle authentication errors specifically
            const errorMessage = error instanceof Error ? error.message : String(error)
            if (errorMessage.includes('authentication expired') || errorMessage.includes('401')) {
              setErrors(prev => ({
                ...prev,
                integrationError: `Your ${nodeInfo?.providerId || 'integration'} connection has expired. Please reconnect your account to continue.`
              }))
              break // Stop processing other fields if authentication failed
            } else {
              setErrors(prev => ({
                ...prev,
                integrationError: `Failed to load ${field.label || field.name} data. Please try again.`
              }))
            }
          }
        }
      }
    }



    // Only update state if the request wasn't aborted
    if (!controller.signal.aborted) {
      if (hasData) {
        console.log('💾 Updating dynamic options:', {
          optionKeys: Object.keys(newOptions),
          sampleData: Object.entries(newOptions).map(([key, value]) => ({
            field: key,
            count: value.length,
            sample: value[0]
          }))
        })
        setDynamicOptions(newOptions)
      }
      setLoadingDynamic(false)
    }
  }, [nodeInfo, getIntegrationByProvider, checkIntegrationScopes, loadIntegrationData])

  useEffect(() => {
    if (isOpen && nodeInfo?.providerId) {
      fetchDynamicData()
    }
  }, [isOpen, nodeInfo?.providerId, fetchDynamicData])

  // Handle dependent field updates when their dependencies change
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    console.log('🔄 Checking dependent fields:', {
      nodeType: nodeInfo.type,
      config,
      configSchema: nodeInfo.configSchema
    })

    const fetchDependentFields = async () => {
      for (const field of nodeInfo.configSchema || []) {
        if (field.dependsOn && field.dynamic) {
          const dependentValue = config[field.dependsOn]
          const previousValue = previousDependentValues.current[field.dependsOn]
          
          console.log(`🔍 Checking field dependency:`, {
            fieldName: field.name,
            dependsOn: field.dependsOn,
            currentValue: dependentValue,
            previousValue,
            dynamic: field.dynamic
          })
          
          // Only update if the dependent value has actually changed
          if (dependentValue !== previousValue) {
            console.log(`🔄 Dependent value changed for ${field.name}, fetching new data`)
            previousDependentValues.current[field.dependsOn] = dependentValue
            
            if (dependentValue) {
              await fetchDependentData(field, dependentValue)
            } else {
              console.log(`❌ No dependent value for ${field.name}, clearing options`)
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

      // Fetch project, task, and feedback records when base is selected for Airtable actions
      if (nodeInfo?.type === "airtable_action_create_record" && config.baseId) {
        const previousBaseId = previousDependentValues.current["baseId"]
        if (config.baseId !== previousBaseId) {
          console.log(`🔄 Base changed to ${config.baseId}, fetching project/task/feedback records`)
          previousDependentValues.current["baseId"] = config.baseId
          
          const integration = getIntegrationByProvider(nodeInfo.providerId || "")
          if (integration) {
            try {
              // Fetch project records
              const projectData = await loadIntegrationData("airtable_project_records", integration.id, { baseId: config.baseId })
              if (projectData && projectData.length > 0) {
                console.log(`📊 Processing Airtable project records:`, {
                  recordCount: projectData.length,
                  records: projectData.map((r: any) => ({
                    value: r.value,
                    label: r.label
                  }))
                })
                const mappedProjectRecords = projectData.map((record: any) => ({
                  value: record.value,
                  label: record.label,
                  description: record.description,
                  fields: record.fields || {}
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "project_records": mappedProjectRecords,
                  // Also store with common field name variations
                  "Project_records": mappedProjectRecords,
                  "Projects_records": mappedProjectRecords,
                  "Associated Project_records": mappedProjectRecords,
                  "Related Project_records": mappedProjectRecords
                }))
              }

              // Fetch task records
              const taskData = await loadIntegrationData("airtable_task_records", integration.id, { baseId: config.baseId })
              if (taskData && taskData.length > 0) {
                console.log(`📋 Processing Airtable task records:`, {
                  recordCount: taskData.length,
                  records: taskData.map((r: any) => ({
                    value: r.value,
                    label: r.label
                  }))
                })
                const mappedTaskRecords = taskData.map((record: any) => ({
                  value: record.value,
                  label: record.label,
                  description: record.description,
                  fields: record.fields || {}
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "task_records": mappedTaskRecords,
                  // Also store with common field name variations
                  "Task_records": mappedTaskRecords,
                  "Tasks_records": mappedTaskRecords,
                  "Associated Task_records": mappedTaskRecords,
                  "Related Task_records": mappedTaskRecords
                }))
              }

              // Fetch feedback records
              const feedbackData = await loadIntegrationData("airtable_feedback_records", integration.id, { baseId: config.baseId })
              if (feedbackData && feedbackData.length > 0) {
                const mappedFeedbackRecords = feedbackData.map((record: any) => ({
                  value: record.value,
                  label: record.label,
                  description: record.description,
                  fields: record.fields || {}
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "feedback_records": mappedFeedbackRecords,
                  // Also store with common field name variations
                  "Feedback_records": mappedFeedbackRecords,
                  "Feedbacks_records": mappedFeedbackRecords,
                  "Associated Feedback_records": mappedFeedbackRecords,
                  "Related Feedback_records": mappedFeedbackRecords
                }))
              }
            } catch (error) {
              console.error(`❌ Error fetching project/task/feedback records:`, error)
            }
          }
        }
      }

      // Fetch Discord channels when guild is selected
      if (nodeInfo?.type === "discord_action_send_message" && config.guildId) {
        const previousGuildId = previousDependentValues.current["guildId"]
        if (config.guildId !== previousGuildId) {
          console.log(`🔄 Guild changed to ${config.guildId}, fetching Discord channels`)
          previousDependentValues.current["guildId"] = config.guildId
          
          const integration = getIntegrationByProvider(nodeInfo.providerId || "")
          if (integration) {
            try {
              const channelData = await loadIntegrationData("discord_channels", integration.id, { guildId: config.guildId })
              if (channelData && channelData.length > 0) {
                console.log(`📺 Processing Discord channels:`, {
                  channelCount: channelData.length,
                  channels: channelData.map((c: any) => ({
                    value: c.value,
                    label: c.label
                  }))
                })
                const mappedChannels = channelData.map((channel: any) => ({
                  value: channel.value,
                  label: channel.label,
                }))
                setDynamicOptions(prev => ({
                  ...prev,
                  "channelId": mappedChannels,
                }))
              }
            } catch (error) {
              console.error(`❌ Error fetching Discord channels:`, error)
              // Set an error state to show to the user
              setErrors(prev => ({
                ...prev,
                channelId: "Failed to load channels. The bot may not have permission to view channels in this server. Please ensure the bot has the 'View Channels' permission."
              }))
            }
          }
        }
      }
    }

    fetchDependentFields()
  }, [isOpen, nodeInfo, config, fetchDependentData])

  // Auto-fetch table fields when table is selected (for Airtable)
  useEffect(() => {
    if (!isOpen || !nodeInfo || nodeInfo.type !== "airtable_action_create_record") return
    

    
    if (config.tableName && config.baseId) {

      fetchTableFields(config.tableName)
      
      // Also ensure project/task/feedback records are loaded for this base
      const integration = getIntegrationByProvider(nodeInfo.providerId || "")
      if (integration) {
        // Load project, task, and feedback records if not already loaded
        const loadPriorityRecords = async () => {
          try {
            if (!dynamicOptions["project_records"] || dynamicOptions["project_records"].length === 0) {
              const projectData = await loadIntegrationData("airtable_project_records", integration.id, { baseId: config.baseId })
              if (projectData && projectData.length > 0) {
                setDynamicOptions(prev => ({
                  ...prev,
                  "project_records": projectData
                }))
              }
            }
            
            if (!dynamicOptions["task_records"] || dynamicOptions["task_records"].length === 0) {
              const taskData = await loadIntegrationData("airtable_task_records", integration.id, { baseId: config.baseId })
              if (taskData && taskData.length > 0) {
                setDynamicOptions(prev => ({
                  ...prev,
                  "task_records": taskData
                }))
              }
            }
            
            if (!dynamicOptions["feedback_records"] || dynamicOptions["feedback_records"].length === 0) {
              const feedbackData = await loadIntegrationData("airtable_feedback_records", integration.id, { baseId: config.baseId })
              if (feedbackData && feedbackData.length > 0) {
                setDynamicOptions(prev => ({
                  ...prev,
                  "feedback_records": feedbackData
                }))
              }
            }
          } catch (error) {
            console.error("Error loading priority records:", error)
          }
        }
        
        loadPriorityRecords()
      }
    }
  }, [isOpen, nodeInfo, config.tableName, config.baseId, fetchTableFields, getIntegrationByProvider, loadIntegrationData, dynamicOptions])

  // Retry mechanism for stuck loading states
  useEffect(() => {
    if (!loadingDynamic) {
      setRetryCount(0)
      return
    }
    
    const retryTimeout = setTimeout(() => {
      if (loadingDynamic && isOpen && nodeInfo?.providerId) {
        setRetryCount((c) => c + 1)
        fetchDynamicData()
      }
    }, 5000)
    
    return () => clearTimeout(retryTimeout)
  }, [loadingDynamic, isOpen, nodeInfo?.providerId, fetchDynamicData])

  // Auto-load sheet data when spreadsheet and sheet are selected
  useEffect(() => {
    if (!isOpen || !nodeInfo) return

    // For unified action, only load after action is selected (any action)
    if (nodeInfo.type === "google_sheets_unified_action") {
      if (!config.action) return
      if (!config.spreadsheetId || !config.sheetName) return
    } else if (nodeInfo.type === "google_sheets_action_read_data") {
      // For read data action, load after readMode is selected
      if (!config.readMode) return
      if (!config.spreadsheetId || !config.sheetName) return
    } else if (nodeInfo.providerId === "google-sheets") {
      // For all other Google Sheets actions, load as soon as spreadsheet and sheet are selected
      if (!config.spreadsheetId || !config.sheetName) return
    } else {
      return
    }

    const loadSheetData = async () => {
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller
      try {
        setLoadingDynamic(true)
        const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
        if (!integration) return
        const data = await loadIntegrationData(
          "google-sheets_sheet-data",
          integration.id,
          { spreadsheetId: config.spreadsheetId, sheetName: config.sheetName }
        )
        if (!controller.signal.aborted && data && data.length > 0) {
          setSheetData(data[0])
          setDynamicOptions(prev => ({
            ...prev,
            sheetData: data[0]
          }))
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Error auto-loading sheet data:", error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDynamic(false)
        }
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

        // Abort any existing request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        // Create new AbortController for this request
        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
          setLoadingDynamic(true)
          const previewData = await loadIntegrationData(
            "google-sheets_sheet-preview",
            integration.id,
            { spreadsheetId: config.spreadsheetId, sheetName: config.sheetName }
          )
          
          // Only update state if the request wasn't aborted
          if (!controller.signal.aborted && previewData && previewData.length > 0) {
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
          // Don't log errors for aborted requests
          if (!controller.signal.aborted) {
            console.error("Error fetching sheet preview:", error)
          }
        } finally {
          // Only update loading state if the request wasn't aborted
          if (!controller.signal.aborted) {
            setLoadingDynamic(false)
          }
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
    // Custom Google Meet button/card rendering for Google Calendar create event
    if (nodeInfo?.type === "google_calendar_action_create_event" && field.name === "createMeetLink") {
      const handleAddMeet = async () => {
        setMeetLoading(true)
        try {
          const res = await fetch("/api/integrations/google-calendar/meet-draft", { method: "POST" })
          const data = await res.json()
          if (data.meetUrl && data.eventId) {
            setConfig(prev => ({ ...prev, createMeetLink: true, meetUrl: data.meetUrl, meetEventId: data.eventId }))
          } else {
            throw new Error(data.error || "Failed to create Google Meet link")
          }
        } catch (err) {
          alert("Failed to create Google Meet link. Please try again.")
        } finally {
          setMeetLoading(false)
        }
      }
      const handleRemoveMeet = async () => {
        setMeetLoading(true)
        try {
          if (config.meetEventId) {
            await fetch("/api/integrations/google-calendar/meet-draft", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eventId: config.meetEventId })
            })
          }
        } catch {}
        setConfig(prev => ({ ...prev, createMeetLink: false, meetUrl: undefined, meetEventId: undefined }))
        setMeetLoading(false)
      }
      if (!config.createMeetLink || !config.meetUrl) {
        return (
          <Button
            className="w-full bg-[#c7d6f7] text-[#174ea6] hover:bg-[#b3c6f7] font-medium rounded-2xl py-2 text-base flex items-center justify-center gap-2"
            style={{ minWidth: 260 }}
            onClick={handleAddMeet}
            type="button"
            disabled={meetLoading}
          >
            <Video className="w-5 h-5 mr-2 -ml-1" />
            {meetLoading ? "Creating Google Meet Link..." : "Add Google Meet Video Conference"}
          </Button>
        )
      }
      return (
        <GoogleMeetCard
          meetUrl={config.meetUrl}
          guestLimit={100}
          onRemove={handleRemoveMeet}
          onCopy={() => {}}
          onSettings={() => {}}
        />
      )
    }
    // For select fields, use defaultValue if the config value is empty or undefined
    let value = config[field.name]
    if (field.type === "select" && (value === "" || value === undefined) && field.defaultValue !== undefined) {
      value = field.defaultValue
    } else {
      value = value || ""
    }
    const hasError = !!errors[field.name]
    
    // Debug logging for select fields with default values
    if (field.type === "select" && field.defaultValue && (config[field.name] === "" || config[field.name] === undefined)) {
      console.log('🔍 Select field debug:', {
        fieldName: field.name,
        defaultValue: field.defaultValue,
        currentValue: value,
        configValue: config[field.name]
      })
    }

    // Dynamic label for facebook_action_get_page_insights periodCount
    let dynamicLabel = field.label
    if (
      nodeInfo?.type === "facebook_action_get_page_insights" &&
      field.name === "periodCount"
    ) {
      const period = config["period"] || "day"
      if (period === "day") dynamicLabel = "Number of Days"
      else if (period === "week") dynamicLabel = "Number of Weeks"
      else if (period === "month") dynamicLabel = "Number of Months"
    }

    // Add label rendering
    const renderLabel = () => (
      <div className="flex items-center gap-2 mb-2">
        <Label className="text-sm font-medium">
          {dynamicLabel || field.label || field.name}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {field.description && (
          <EnhancedTooltip 
            description={field.description}
            title={`${field.label || field.name} Information`}
            showExpandButton={field.description.length > 150}
          />
        )}
      </div>
    )

    // Handle Google Sheets create spreadsheet sheets configuration
    if (nodeInfo?.type === "google_sheets_action_create_spreadsheet" && field.name === "sheets") {
      const [sheets, setSheets] = useState<Array<{ 
        name: string; 
        columns: number; 
        columnNames: string[] 
      }>>(
        config.sheets || [{ name: "Sheet1", columns: 5, columnNames: ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"] }]
      )

      const addSheet = () => {
        const defaultColumnNames = Array.from({ length: 5 }, (_, i) => `Column ${i + 1}`)
        const newSheets = [...sheets, { name: `Sheet${sheets.length + 1}`, columns: 5, columnNames: defaultColumnNames }]
        setSheets(newSheets)
        setConfig(prev => ({ ...prev, sheets: newSheets }))
      }

      const removeSheet = (index: number) => {
        if (sheets.length > 1) {
          const newSheets = sheets.filter((_, i) => i !== index)
          setSheets(newSheets)
          setConfig(prev => ({ ...prev, sheets: newSheets }))
        }
      }

      const updateSheet = (index: number, field: 'name' | 'columns', value: string | number) => {
        const newSheets = [...sheets]
        if (field === 'columns') {
          const currentColumnNames = newSheets[index].columnNames || []
          const newColumnCount = Math.max(1, Math.min(26, value as number))
          
          // Adjust column names array to match new column count
          let newColumnNames = [...currentColumnNames]
          if (newColumnCount > currentColumnNames.length) {
            // Add new column names
            for (let i = currentColumnNames.length; i < newColumnCount; i++) {
              newColumnNames.push(`Column ${i + 1}`)
            }
          } else if (newColumnCount < currentColumnNames.length) {
            // Remove excess column names
            newColumnNames = newColumnNames.slice(0, newColumnCount)
          }
          
          newSheets[index] = { 
            ...newSheets[index], 
            columns: newColumnCount,
            columnNames: newColumnNames
          }
        } else if (field === 'name') {
          newSheets[index] = { ...newSheets[index], name: value as string }
        }
        setSheets(newSheets)
        setConfig(prev => ({ ...prev, sheets: newSheets }))
      }

      const updateColumnName = (sheetIndex: number, columnIndex: number, value: string) => {
        const newSheets = [...sheets]
        newSheets[sheetIndex].columnNames[columnIndex] = value
        setSheets(newSheets)
        setConfig(prev => ({ ...prev, sheets: newSheets }))
      }

      return (
        <div className="space-y-4">
          {renderLabel()}
          <div className="space-y-3">
            {sheets.map((sheet, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Sheet {index + 1}</h4>
                  {sheets.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeSheet(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Sheet Name</Label>
                    <Input
                      value={sheet.name}
                      onChange={(e) => updateSheet(index, 'name', e.target.value)}
                      placeholder="e.g., Sales Data, Inventory"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Number of Columns</Label>
                    <Input
                      type="number"
                      value={sheet.columns}
                      onChange={(e) => updateSheet(index, 'columns', parseInt(e.target.value) || 1)}
                      min="1"
                      max="26"
                      className="text-sm"
                    />
                  </div>
                </div>
                
                {/* Column Names */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Column Names</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: sheet.columns }, (_, colIndex) => (
                      <div key={colIndex} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Column {colIndex + 1}
                        </Label>
                        <Input
                          value={sheet.columnNames?.[colIndex] || `Column ${colIndex + 1}`}
                          onChange={(e) => updateColumnName(index, colIndex, e.target.value)}
                          placeholder={`Column ${colIndex + 1}`}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={addSheet}
              className="w-full"
            >
              + Add Another Sheet
            </Button>
          </div>
        </div>
      )
    }

    // Handle Airtable record actions custom fields layout
    if ((nodeInfo?.type === "airtable_action_create_record" || 
         nodeInfo?.type === "airtable_action_update_record") && 
        field.name === "fields") {
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
      
      // Sort fields to prioritize status fields and linked records
      const sortedFields = [...tableFields].sort((a, b) => {
        // Helper function to check if a field is a priority field
        const isPriorityField = (field: any) => {
          // Check for status fields
          const isStatus = field.type === "singleSelect" && 
                         (field.name.toLowerCase().includes('status') || 
                          field.name.toLowerCase().includes('state'))
          
          // Check for linked record fields we want to prioritize
          const isPriorityLinkedRecord = field.type === "linkedRecord" && 
                         (field.name.toLowerCase().includes('project') || 
                          field.name.toLowerCase().includes('task') ||
                          field.name.toLowerCase().includes('feedback'))
          
          return isStatus || isPriorityLinkedRecord
        }
        
        const aIsPriority = isPriorityField(a)
        const bIsPriority = isPriorityField(b)
        
        if (aIsPriority && !bIsPriority) return -1
        if (!aIsPriority && bIsPriority) return 1
        
        // If both are priority fields, sort by type (status first, then linked records)
        if (aIsPriority && bIsPriority) {
          const aIsStatus = a.type === "singleSelect"
          const bIsStatus = b.type === "singleSelect"
          if (aIsStatus && !bIsStatus) return -1
          if (!aIsStatus && bIsStatus) return 1
        }
        
        return 0
      })
      
      return (
        <div className="space-y-4">
          {renderLabel()}
          <div className="text-sm text-muted-foreground">
            Map your data to table columns from "{config.tableName}":
          </div>
          

          
          {/* Priority Record Selection */}
          {(dynamicOptions["task_records"]?.length > 0 || dynamicOptions["project_records"]?.length > 0 || dynamicOptions["feedback_records"]?.length > 0) && (
            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">
                Link to Existing Records
              </div>
              
              {/* Task Selection */}
              {dynamicOptions["task_records"]?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Related Task</Label>
                  <Combobox
                    value={config.fields?.RelatedTask || ""}
                    onChange={(value) => {
                      const newFields = { ...config.fields, RelatedTask: value }
                      setConfig(prev => ({ ...prev, fields: newFields }))
                    }}
                    placeholder="Search and select a task"
                    options={dynamicOptions["task_records"]}
                    searchPlaceholder="Search tasks..."
                    emptyPlaceholder="No tasks found."
                  />
                </div>
              )}
              
              {/* Project Selection */}
              {dynamicOptions["project_records"]?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Related Project</Label>
                  <Combobox
                    value={config.fields?.RelatedProject || ""}
                    onChange={(value) => {
                      const newFields = { ...config.fields, RelatedProject: value }
                      setConfig(prev => ({ ...prev, fields: newFields }))
                    }}
                    placeholder="Search and select a project"
                    options={dynamicOptions["project_records"]}
                    searchPlaceholder="Search projects..."
                    emptyPlaceholder="No projects found."
                  />
                </div>
              )}
              
              {/* Feedback Selection */}
              {dynamicOptions["feedback_records"]?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Related Feedback</Label>
                  <Combobox
                    value={config.fields?.RelatedFeedback || ""}
                    onChange={(value) => {
                      const newFields = { ...config.fields, RelatedFeedback: value }
                      setConfig(prev => ({ ...prev, fields: newFields }))
                    }}
                    placeholder="Search and select feedback"
                    options={dynamicOptions["feedback_records"]}
                    searchPlaceholder="Search feedback..."
                    emptyPlaceholder="No feedback found."
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Main Fields Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedFields.map((fieldDef: any) => {
              const fieldValue = config.fields?.[fieldDef.name] || ""
              
              // Check if this field represents a linked table (foreign key relationship)
              const isLinkedField = fieldDef.type === "linkedRecord" || 
                                   fieldDef.type === "link" || 
                                   fieldDef.type === "multipleRecordLinks" ||
                                   fieldDef.type === "recordLink" ||
                                   fieldDef.type === "lookup" ||
                                   fieldDef.linkedTableName ||
                                   fieldDef.foreignTable
              
              // Check if this is a priority linked field (projects, tasks, feedback)
              const isPriorityLinkedField = isLinkedField && 
                                   (fieldDef.name.toLowerCase().includes('project') || 
                                    fieldDef.name.toLowerCase().includes('task') ||
                                    fieldDef.name.toLowerCase().includes('feedback'))
              


              return (
                <div key={fieldDef.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">
                        {fieldDef.name}
                        {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      {isLinkedField && !isPriorityLinkedField && fieldDef.linkedTableName && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCreateNew(fieldDef.linkedTableName)}
                          className="text-xs h-6 px-2"
                        >
                          {createNewTables[fieldDef.linkedTableName] ? "Use Existing" : "Create New"}
                        </Button>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {isPriorityLinkedField ? "Linked Record" : fieldDef.type}
                    </span>
                  </div>
                  
                  {/* Field Input */}
                  {fieldDef.type === "singleSelect" && fieldDef.options ? (
                    <div className="flex gap-2">
                      <Select
                        value={fieldValue}
                        onValueChange={(value) => {
                          const newFields = { ...config.fields, [fieldDef.name]: value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                      >
                        <SelectTrigger className="text-sm h-auto min-h-[2.5rem]">
                          <SelectValue placeholder={`Select ${fieldDef.name.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent className="max-h-96">
                          {fieldDef.options.choices.map((choice: any) => (
                            <SelectItem key={choice.name} value={choice.name} className="whitespace-nowrap">
                              {choice.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const newFields = { ...config.fields, [fieldDef.name]: variable }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType="text"
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <Database className="w-4 h-4" />
                          </Button>
                        }
                      />
                    </div>
                  ) : isPriorityLinkedField ? (
                    <div className="flex gap-2">
                      <Combobox
                        value={fieldValue}
                        onChange={(value) => {
                          const newFields = { ...config.fields, [fieldDef.name]: value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        placeholder={`Search and select ${fieldDef.name.toLowerCase()}`}
                        options={
                          // Try multiple possible keys for the dropdown options
                          (() => {
                            const options = dynamicOptions[`${fieldDef.name}_records`] || 
                              dynamicOptions[`${fieldDef.name.toLowerCase()}_records`] ||
                              dynamicOptions[`${fieldDef.name.replace(/\s+/g, '_').toLowerCase()}_records`] ||
                              // Fallback to generic keys for priority fields
                              (fieldDef.name.toLowerCase().includes('project') ? dynamicOptions["project_records"] : []) ||
                              (fieldDef.name.toLowerCase().includes('task') ? dynamicOptions["task_records"] : []) ||
                              (fieldDef.name.toLowerCase().includes('feedback') ? dynamicOptions["feedback_records"] : []) ||
                              []
                            

                            
                            return options
                          })()
                        }
                        searchPlaceholder="Search records..."
                        emptyPlaceholder="No records found."
                      />
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const newFields = { ...config.fields, [fieldDef.name]: variable }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType="text"
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <Database className="w-4 h-4" />
                          </Button>
                        }
                      />
                    </div>
                  ) : isLinkedField && fieldDef.linkedTableName ? (
                    <div className="flex gap-2">
                      <Combobox
                        value={fieldValue}
                        onChange={(value) => {
                          const newFields = { ...config.fields, [fieldDef.name]: value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        placeholder={`Search and select ${fieldDef.name.toLowerCase()}`}
                        options={
                          // Try multiple possible keys for the dropdown options
                          dynamicOptions[`${fieldDef.name}_records`] || 
                          dynamicOptions[`${fieldDef.name.toLowerCase()}_records`] ||
                          dynamicOptions[`${fieldDef.name.replace(/\s+/g, '_').toLowerCase()}_records`] ||
                          []
                        }
                        searchPlaceholder="Search records..."
                        emptyPlaceholder="No records found."
                      />
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const newFields = { ...config.fields, [fieldDef.name]: variable }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType="text"
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <Database className="w-4 h-4" />
                          </Button>
                        }
                      />
                    </div>
                  ) : fieldDef.type === "checkbox" ? (
                    <div className="flex items-center justify-center space-x-2 min-h-[2.5rem] border rounded-md p-2">
                      <Checkbox
                        checked={fieldValue || false}
                        onCheckedChange={(checked) => {
                          const newFields = { ...config.fields, [fieldDef.name]: checked }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                      />
                      <Label className="text-sm">Enable</Label>
                    </div>
                  ) : fieldDef.type === "date" ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Input
                          type="date"
                          value={fieldValue === "{{current_date}}" ? "" : fieldValue}
                          onChange={(e) => {
                            const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          className="text-sm min-h-[2.5rem] [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-2 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                          placeholder={fieldValue === "{{current_date}}" ? "Current date will be used" : ""}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={fieldValue === "{{current_date}}" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newValue = fieldValue === "{{current_date}}" ? "" : "{{current_date}}"
                            const newFields = { ...config.fields, [fieldDef.name]: newValue }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          className="text-xs h-7 flex-1"
                        >
                          {fieldValue === "{{current_date}}" ? "Using Current Date" : "Use Current Date"}
                        </Button>
                        <EnhancedTooltip 
                          description="When enabled, this field will automatically use the current date each time the workflow runs, rather than a fixed date."
                          title="Auto Date Information"
                          buttonClassName="h-7 w-7 p-0 flex-shrink-0"
                          showExpandButton={false}
                        />
                      </div>
                    </div>
                  ) : fieldDef.type === "attachment" || fieldDef.type === "file" || fieldDef.type === "image" || fieldDef.name.toLowerCase().includes('image') || fieldDef.name.toLowerCase().includes('photo') || fieldDef.name.toLowerCase().includes('picture') ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="file"
                        id={`file-${fieldDef.name}`}
                        multiple={fieldDef.type === "attachment"}
                        accept={fieldDef.type === "image" ? "image/*" : undefined}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          const newFields = { ...config.fields, [fieldDef.name]: files }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        className="hidden"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById(`file-${fieldDef.name}`)?.click()}
                          className="min-h-[2.5rem] text-sm flex-1"
                        >
                          Upload {fieldDef.type === "image" ? "Image" : fieldDef.type === "attachment" ? "Files" : "File"}
                        </Button>
                        <VariablePicker
                          workflowData={workflowData}
                          currentNodeId={currentNodeId}
                          onVariableSelect={(variable) => {
                            const newFields = { ...config.fields, [fieldDef.name]: variable }
                            setConfig(prev => ({ ...prev, fields: newFields }))
                          }}
                          fieldType="file"
                          trigger={
                            <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                              <Database className="w-4 h-4" />
                            </Button>
                          }
                        />
                      </div>
                      {fieldValue && (
                        <div className="text-xs text-muted-foreground">
                          {Array.isArray(fieldValue) && fieldValue.length > 0 
                            ? fieldValue.length === 1
                              ? `Selected: ${fieldValue[0].name}`
                              : `${fieldValue.length} files: ${fieldValue.map(f => f.name).join(', ')}`
                            : typeof fieldValue === 'string' && fieldValue.includes('{{')
                            ? 'Using file from previous node'
                            : 'File selected'
                          }
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Textarea
                        value={fieldValue}
                        placeholder={`Enter ${fieldDef.name.toLowerCase()}`}
                        onChange={(e) => {
                          const newFields = { ...config.fields, [fieldDef.name]: e.target.value }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        className="text-sm flex-1 min-h-[2.5rem] resize-none"
                        rows={1}
                      />
                      <VariablePicker
                        workflowData={workflowData}
                        currentNodeId={currentNodeId}
                        onVariableSelect={(variable) => {
                          const currentValue = fieldValue || ""
                          const newValue = currentValue + variable
                          const newFields = { ...config.fields, [fieldDef.name]: newValue }
                          setConfig(prev => ({ ...prev, fields: newFields }))
                        }}
                        fieldType={fieldDef.type === "multilineText" ? "textarea" : "text"}
                        trigger={
                          <Button variant="outline" size="sm" className="flex-shrink-0 px-3 min-h-[2.5rem]">
                            <Database className="w-4 h-4" />
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
        </div>
      )
    }

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
      console.log('🔄 Select value changed:', {
        fieldName: field.name,
        newValue,
        isAirtableAction: nodeInfo?.type === "airtable_action_create_record",
        isBaseIdField: field.name === "baseId"
      })
      
      // Clear dependent fields when base changes for Airtable
      if ((nodeInfo?.type === "airtable_action_create_record" || 
           nodeInfo?.type === "airtable_action_update_record" ||
           nodeInfo?.type === "airtable_action_move_record" ||
           nodeInfo?.type === "airtable_action_list_records") && 
          field.name === "baseId") {

        setConfig(prev => ({ 
          ...prev, 
          [field.name]: newValue,
          tableName: undefined,
          fields: undefined
        }))
      } else {
        setConfig({ ...config, [field.name]: newValue })
      }
      
      // Check Discord bot status when guild is selected
      if (nodeInfo?.type === "discord_action_send_message" && field.name === "guildId" && newValue) {
        checkBotInGuild(newValue)
      }
      
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
          console.log('🔄 Found dependent field:', {
            field: dependentField.name,
            dependsOn: field.name,
            newValue
          })
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

    const handleVariableSelect = (variable: string) => {
      const currentValue = config[field.name] || ""
      
      // If there's existing text and it doesn't already end with the variable, append it
      let newValue = variable
      if (currentValue && !currentValue.includes(variable)) {
        newValue = currentValue + variable
      }
      
      setConfig({ ...config, [field.name]: newValue })
      
      // Clear any validation errors
      if (hasError) {
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[field.name]
          return newErrors
        })
      }
    }

    switch (String(field.type)) {
      case "text":
      case "email":
      case "password":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex gap-2 w-full">
              <Input
                type={field.type}
                value={value}
                onChange={handleChange}
                placeholder={field.placeholder}
                readOnly={field.readonly}
                className={cn(
                  "flex-1", 
                  hasError && "border-red-500",
                  field.readonly && "bg-muted/50 cursor-not-allowed"
                )}
              />
              {!field.readonly && (
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button variant="outline" size="sm" className="flex-shrink-0 px-3">
                      <Database className="w-4 h-4" />
                    </Button>
                  }
                />
              )}
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "number":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <Input
              type="number"
              value={value}
              onChange={handleChange}
              placeholder={field.placeholder}
              className={cn("w-full", hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "textarea":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="w-full space-y-2">
              <Textarea
                value={value}
                onChange={handleChange}
                placeholder={field.placeholder}
                className={cn("w-full min-h-[100px] resize-y", hasError && "border-red-500")}
              />
              <div className="flex justify-end">
                <VariablePicker
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  onVariableSelect={handleVariableSelect}
                  fieldType={field.type}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-2">
                      <Database className="w-4 h-4" />
                      Insert Variable
                    </Button>
                  }
                />
              </div>
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "select":
        const options = field.dynamic ? dynamicOptions[field.name] || [] : field.options || []
        
        // Use MultiCombobox for multiple select with creatable option
        if (field.multiple && field.creatable) {
          return (
            <div className="space-y-2">
              {renderLabel()}
              <MultiCombobox
                options={options.map((option) => {
                  if (typeof option === 'string') {
                    return {
                      value: option,
                      label: option,
                      isExisting: false
                    }
                  } else {
                    return {
                      value: option.value,
                      label: option.label,
                      isExisting: (option as any).isExisting || false
                    }
                  }
                })}
                value={Array.isArray(value) ? value : []}
                onChange={(newValues) => {
                  // For Gmail labels, we need to handle both existing labels and new label names
                  if (field.name === 'labelIds') {
                    // Separate existing label IDs from new label names
                    const existingLabelIds: string[] = []
                    const newLabelNames: string[] = []
                    
                    for (const val of newValues) {
                      const option = options.find(opt => 
                        (typeof opt === 'string' ? opt : opt.value) === val
                      )
                      if (option && typeof option === 'object' && (option as any).isExisting) {
                        existingLabelIds.push(val)
                      } else {
                        newLabelNames.push(val)
                      }
                    }
                    
                    // Store both existing IDs and new names
                    setConfig(prev => ({
                      ...prev,
                      labelIds: existingLabelIds,
                      labelNames: newLabelNames
                    }))
                  } else {
                    // For other fields, use the standard behavior
                    handleMultiSelectChange(newValues)
                  }
                }}
                placeholder={loadingDynamic ? "Loading..." : field.placeholder}
                searchPlaceholder="Search labels or type to create new ones..."
                emptyPlaceholder={loadingDynamic ? "Loading..." : "No labels found."}
                disabled={loadingDynamic}
                creatable={true}
              />
              {hasError && (
                <p className="text-xs text-red-500">{errors[field.name]}</p>
              )}
            </div>
          )
        }
        
        // Use regular Select for single select
        return (
          <div className="space-y-2">
            {renderLabel()}
            <Select
              value={value}
              onValueChange={handleSelectChange}
              disabled={loadingDynamic}
            >
              <SelectTrigger className={cn("w-full", hasError && "border-red-500")}>
                <SelectValue placeholder={loadingDynamic ? "Loading..." : field.placeholder} />
              </SelectTrigger>
              <SelectContent className="max-h-96" side="bottom" sideOffset={4} align="start" avoidCollisions={false} style={{ transform: 'translateY(0) !important' }}>
                {options.map((option) => {
                  const optionValue = typeof option === 'string' ? option : option.value
                  const optionLabel = typeof option === 'string' ? option : option.label
                  return (
                    <SelectItem key={optionValue} value={optionValue} className="whitespace-nowrap">
                      {optionLabel}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            
            {/* Discord bot status indicator */}
            {nodeInfo?.type === "discord_action_send_message" && field.name === "guildId" && value && (
              <div className="flex items-center gap-2 mt-2">
                {checkingBot ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking bot status...
                  </div>
                ) : botStatus[value] !== undefined ? (
                  <div className={cn(
                    "flex items-center gap-2 text-sm",
                    botStatus[value] ? "text-green-600" : "text-amber-600"
                  )}>
                    {botStatus[value] ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        Bot is connected to this server
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkBotInGuild(value)}
                        >
                          Refresh
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-amber-500 rounded-full" />
                        Bot is not in this server or lacks permissions
                        {errors.botRefresh && (
                          <p className="text-xs text-amber-500 mt-1">{errors.botRefresh}</p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                            const popup = window.open(
                              "https://discord.com/oauth2/authorize?client_id=1378595955212812308&permissions=274877910016&scope=bot",
                              "discord_bot_invite",
                              "width=500,height=600,scrollbars=yes,resizable=yes"
                            )
                            
                            if (popup) {
                              // Monitor when the popup is closed and check bot status
                              const checkClosed = setInterval(() => {
                                if (popup.closed) {
                                  clearInterval(checkClosed)
                                  
                                  // Wait 1 second for Discord to process the bot addition
                                  setTimeout(async () => {
                                    if (config.guildId) {
                                      console.log('🔄 Checking bot status after popup closed...')
                                      await checkBotInGuild(config.guildId)
                                      const currentBotStatus = botStatus[config.guildId]
                                      if (currentBotStatus) {
                                        console.log('✅ Bot is now connected')
                                        // Clear any previous errors
                                        setErrors(prev => {
                                          const newErrors = { ...prev }
                                          delete newErrors.channelId
                                          return newErrors
                                        })
                                      } else {
                                        console.log('❌ Bot is still not connected after 1 second')
                                        // Show manual refresh option
                                        setErrors(prev => ({
                                          ...prev,
                                          botRefresh: "Bot not detected. Click 'Refresh' to check again."
                                        }))
                                      }
                                    }
                                  }, 1000) // Wait 1 second for Discord to process
                                }
                              }, 500) // Check every 500ms if popup is closed
                              
                              // Cleanup after 5 minutes
                              setTimeout(() => {
                                clearInterval(checkClosed)
                              }, 300000)
                            }
                          }}
                        >
                          Add Bot
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (config.guildId) {
                              console.log('🔄 Manual refresh of bot status...')
                              await checkBotInGuild(config.guildId)
                              const currentBotStatus = botStatus[config.guildId]
                              if (currentBotStatus) {
                                console.log('✅ Bot is now connected')
                                // Clear any previous errors
                                setErrors(prev => {
                                  const newErrors = { ...prev }
                                  delete newErrors.botRefresh
                                  delete newErrors.channelId
                                  return newErrors
                                })
                              } else {
                                console.log('❌ Bot is still not connected')
                              }
                            }
                          }}
                        >
                          Refresh
                        </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}
            
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "combobox":
        const comboboxOptions = field.dynamic ? dynamicOptions[field.name] || [] : field.options || []
        return (
          <div className="space-y-2">
            {renderLabel()}
            <Combobox
              value={value}
              onChange={handleSelectChange}
              disabled={loadingDynamic}
              placeholder={loadingDynamic ? "Loading..." : field.placeholder}
              options={comboboxOptions.map((option) => ({
                value: typeof option === 'string' ? option : option.value,
                label: typeof option === 'string' ? option : option.label,
                description: typeof option === 'object' && 'description' in option && typeof option.description === 'string' ? option.description : undefined
              }))}
              searchPlaceholder="Search records..."
              emptyPlaceholder="No records found."
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "boolean":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="flex items-center space-x-3">
              <Checkbox
                checked={!!value}
                onCheckedChange={handleCheckboxChange}
                className={cn(hasError && "border-red-500")}
              />
              <Label className="text-sm font-medium cursor-pointer" onClick={() => handleCheckboxChange(!value)}>
                Enable
              </Label>
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "file":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <FileUpload
              value={value}
              onChange={handleFileChange}
              accept={field.accept}
              maxFiles={field.multiple ? 10 : 1}
              maxSize={typeof field.maxSize === 'number' ? field.maxSize : undefined}
              placeholder={field.placeholder}
              className={cn(hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "date":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <div className="relative group w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <Calendar className="w-5 h-5" />
              </span>
              <input
                type="date"
                value={value || ""}
                onChange={e => {
                  setConfig(prev => ({ ...prev, [field.name]: e.target.value }))
                }}
                className={cn(
                  "pl-10 pr-3 py-2 w-full rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary",
                  hasError ? "border-red-500" : "border-border"
                )}
                placeholder="Select date"
              />
            </div>
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "time":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <TimePicker
              value={value}
              onChange={handleTimeChange}
              placeholder={field.placeholder}
              className={cn(hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "datetime": {
        // Validation: must be in the future
        const now = new Date()
        const selected = value ? new Date(value) : null
        const isPast = selected && selected < now
        return (
          <div className="space-y-2">
            {renderLabel()}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative group w-64">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                      <Calendar className="w-5 h-5" />
                    </span>
                    <input
                      type="datetime-local"
                      value={value ? value.slice(0, 16) : ""}
                      onChange={e => {
                        setConfig(prev => ({ ...prev, [field.name]: e.target.value }))
                      }}
                      min={now.toISOString().slice(0, 16)}
                      className={cn(
                        "pl-10 pr-3 py-2 w-full rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary",
                        hasError || isPast ? "border-red-500" : "border-border"
                      )}
                      placeholder="Select date & time"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Select a future time for the post to go live.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {(hasError || isPast) && (
              <p className="text-xs text-red-500">
                {isPast ? "Please select a future date and time." : errors[field.name]}
              </p>
            )}
          </div>
        )
      }

      case "email-autocomplete":
        const emailOptions = dynamicOptions[field.name] || []
        const emailSuggestions = emailOptions.map((opt: any) => ({
          value: opt.value || opt.email,
          label: opt.label || opt.email || opt.value,
          email: opt.email || opt.value,
          name: opt.name,
          type: opt.type,
          isGroup: opt.isGroup,
          groupId: opt.groupId,
          members: opt.members
        }))
        
        // Fields that support multiple emails
        const isMultipleEmail = field.multiple || field.name === "attendees" || field.name === "to" || field.name === "cc" || field.name === "bcc"
        
        return (
          <div className="space-y-2">
            {renderLabel()}
            <EmailAutocomplete
              value={value}
              onChange={(newValue) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
              suggestions={emailSuggestions}
              placeholder={field.placeholder}
              multiple={isMultipleEmail}
              disabled={loadingDynamic}
              isLoading={loadingDynamic}
              className={cn(hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "location-autocomplete":
        return (
          <div className="space-y-2">
            {renderLabel()}
            <LocationAutocomplete
              value={value}
              onChange={(newValue) => setConfig(prev => ({ ...prev, [field.name]: newValue }))}
              placeholder={field.placeholder}
              className={cn(hasError && "border-red-500")}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

      case "info":
        return (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium text-blue-800 mb-1">{(field as any).label}</div>
              <div className="text-blue-700 text-sm">{(field as any).description}</div>
            </div>
            {(field as any).showConnectButton && (
              <Button
                variant="default"
                onClick={() => {
                  // Discord bot invite URL with your bot's client ID
                  window.open("https://discord.com/oauth2/authorize?client_id=1378595955212812308&scope=bot+applications.commands&permissions=268438528", "_blank")
                }}
              >
                Connect Bot
              </Button>
            )}
          </div>
        )

      default:
        return (
          <div className="space-y-2">
            {renderLabel()}
            <Input
              value={value}
              onChange={handleChange}
              placeholder={field.placeholder}
              readOnly={field.readonly}
              className={cn(
                "w-full", 
                hasError && "border-red-500",
                field.readonly && "bg-muted/50 cursor-not-allowed"
              )}
            />
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
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

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent 
          className={cn(
            "max-w-7xl w-full max-h-[95vh] p-0 gap-0 overflow-hidden",
            showDataFlowPanels && "max-w-[98vw]"
          )}
        >
          <div className="flex h-full">
            {/* Left Data Flow Panel - Input */}
            {showDataFlowPanels && (
              <div className="w-80 bg-muted/30 border-r border-border">
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
                  <DialogDescription className="sr-only">
                    Configuration settings for {nodeInfo.title || nodeInfo.type}
                  </DialogDescription>
                  
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
              <ScrollArea className="flex-1 max-h-[70vh]">
                <div className="px-6 py-4 space-y-6">
                  {/* Integration Error */}
                  {errors.integrationError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-red-700">{errors.integrationError}</p>
                          {errors.integrationError.includes('reconnect') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => {
                                // Trigger reconnection for the current integration
                                const integration = getIntegrationByProvider(nodeInfo?.providerId || "")
                                if (integration) {
                                  // Use the integration store's reconnect function
                                  const { reconnectIntegration } = useIntegrationStore.getState()
                                  reconnectIntegration(integration.id)
                                }
                              }}
                            >
                              Reconnect {nodeInfo?.providerId || 'Integration'}
                            </Button>
                          )}
                          {!errors.integrationError.includes('reconnect') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => {
                                // Clear the error and retry loading data
                                setErrors(prev => {
                                  const newErrors = { ...prev }
                                  delete newErrors.integrationError
                                  return newErrors
                                })
                                // Retry loading dynamic data
                                fetchDynamicData()
                              }}
                            >
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Configuration Fields */}
                  {nodeInfo.configSchema?.map((field) => {
                    // Hide time fields and time zone field for Google Calendar when "All Day" is enabled
                    if (nodeInfo?.type === "google_calendar_action_create_event" && 
                        ((field.type === "time" && config.allDay) || 
                         (field.name === "timeZone" && config.allDay))) {
                      return null
                    }
                    
                    // Hide fields that depend on other fields that haven't been selected
                    if (!shouldShowField(field)) {
                      return null
                    }
                    
                    return (
                      <div key={field.name} className="flex flex-col space-y-3 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                        {renderField(field)}
                      </div>
                    )
                  })}

                  {/* Data Preview Table for Google Sheets Actions */}
                  {((nodeInfo?.type === "google_sheets_unified_action" && config.action && config.spreadsheetId && config.sheetName) || 
                    (nodeInfo?.type === "google-sheets_action_create_row" && config.spreadsheetId && config.sheetName) ||
                    (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode && config.spreadsheetId && config.sheetName) ||
                    (nodeInfo?.providerId === "google-sheets" && nodeInfo?.type !== "google_sheets_unified_action" && nodeInfo?.type !== "google-sheets_action_create_row" && nodeInfo?.type !== "google_sheets_action_read_data" && config.spreadsheetId && config.sheetName)) && 
                   dynamicOptions.sheetData && (dynamicOptions.sheetData as any).headers && Array.isArray((dynamicOptions.sheetData as any).headers) && (dynamicOptions.sheetData as any).data && Array.isArray((dynamicOptions.sheetData as any).data) && (
                    <div className="space-y-3 border-b pb-4">
                      <div className="text-sm font-medium">
                        {nodeInfo?.type === "google_sheets_unified_action" 
                          ? `Data Preview for ${config.action} action:`
                          : nodeInfo?.type === "google-sheets_action_create_row"
                          ? "Select a row to insert relative to:"
                          : nodeInfo?.type === "google_sheets_action_read_data"
                          ? config.readMode === "rows"
                            ? "Select rows to read:"
                            : config.readMode === "cells"
                              ? "Select cells to read:"
                              : config.readMode === "range"
                                ? "Select a range to read:"
                                : "Data Preview:"
                          : "Data Preview:"}
                        {loadingDynamic && <span className="text-muted-foreground ml-2">(Loading...)</span>}
                      </div>
                      
                      <div className="border rounded-lg overflow-hidden select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
                        {/* Header Row */}
                        <div className="grid gap-2 p-2 bg-muted/50 select-none" style={{ 
                          gridTemplateColumns: `repeat(${(dynamicOptions.sheetData as any).headers.length}, minmax(120px, 1fr))`,
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          {(dynamicOptions.sheetData as any).headers.map((header: any, index: number) => (
                            <div key={index} className="text-xs font-medium text-center p-1 select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
                              <div className="font-mono bg-background px-2 py-1 rounded mb-1">
                                {header.column}
                              </div>
                              <div className="truncate">{header.name}</div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Data Rows */}
                        <div className="max-h-80 overflow-y-auto">
                          {(dynamicOptions.sheetData as any).data.map((row: any, index: number) => (
                            <div 
                              key={index} 
                              className={`grid gap-2 p-2 border-t select-none ${
                                (nodeInfo?.type === "google_sheets_unified_action" && config.action !== "add") ||
                                nodeInfo?.type === "google-sheets_action_create_row" ||
                                (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows")
                                  ? `cursor-pointer hover:bg-muted/50 ${
                                      (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows"
                                        ? (config.selectedRows || []).some((r: any) => r.rowIndex === row.rowIndex)
                                        : config.selectedRow?.rowIndex === row.rowIndex)
                                        ? "bg-primary/10 border border-primary" 
                                        : "border border-transparent"
                                    }`
                                  : "border border-transparent"
                              }`}
                              style={{ 
                                gridTemplateColumns: `repeat(${(dynamicOptions.sheetData as any).headers.length}, minmax(120px, 1fr))`,
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                MozUserSelect: 'none',
                                msUserSelect: 'none'
                              }}
                              onClick={() => {
                                if (nodeInfo?.type === "google_sheets_unified_action" && config.action !== "add") {
                                  // For update action, populate column values with current row data
                                  if (config.action === "update") {
                                    const columnValues: Record<string, string> = {}
                                    row.values.forEach((value: string, index: number) => {
                                      const header = (dynamicOptions.sheetData as any).headers[index]
                                      if (header) {
                                        columnValues[header.column] = value || ""
                                      }
                                    })
                                    setConfig(prev => ({
                                      ...prev,
                                      selectedRow: row,
                                      columnValues: columnValues
                                    }))
                                  } else {
                                    // For delete action, just select the row
                                    setConfig(prev => ({
                                      ...prev,
                                      selectedRow: row
                                    }))
                                  }
                                } else if (nodeInfo?.type === "google-sheets_action_create_row") {
                                  // For create row action, just select the row
                                  setConfig(prev => ({
                                    ...prev,
                                    selectedRow: row
                                  }))
                                } else if (nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows") {
                                  // For read data rows mode, toggle row selection
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
                              }}
                            >
                              {row.values.map((cell: string, cellIndex: number) => (
                                <div 
                                  key={cellIndex} 
                                  className={`text-sm truncate p-1 select-none ${
                                    nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range"
                                      ? `cursor-crosshair ${
                                          selectedRange && isCellInRange(index, cellIndex, selectedRange)
                                            ? "bg-blue-500 text-white"
                                            : isDragging && dragStart && dragEnd
                                              ? isCellInRange(index, cellIndex, { start: dragStart, end: dragEnd })
                                                ? "bg-blue-300"
                                                : ""
                                              : ""
                                        }`
                                      : nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells"
                                        ? `cursor-pointer ${
                                            isCellSelected(index, cellIndex)
                                              ? "bg-green-200 text-green-900"
                                              : "hover:bg-green-100 hover:text-black"
                                          }`
                                        : ""
                                  }`}
                                  onMouseDown={() => handleMouseDown(index, cellIndex)}
                                  onMouseEnter={() => handleMouseEnter(index, cellIndex)}
                                  onClick={() => handleCellClick(index, cellIndex)}
                                  style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
                                >
                                  {cell || ""}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {nodeInfo?.type === "google_sheets_unified_action" && config.action === "delete" && config.selectedRow && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          ⚠️ Row selected for deletion!
                        </div>
                      )}
                      
                      {nodeInfo?.type === "google-sheets_action_create_row" && config.selectedRow && (
                        <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                          ✓ Row selected! New row will be inserted {config.insertPosition === "above" ? "above" : config.insertPosition === "below" ? "below" : "at the end of"} the selected row.
                        </div>
                      )}
                      
                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "rows" && config.selectedRows && Array.isArray(config.selectedRows) && config.selectedRows.length > 0 && (
                        <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                          ✓ {config.selectedRows.length} row(s) selected for reading!
                        </div>
                      )}
                      
                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells" && config.selectedCells && Array.isArray(config.selectedCells) && config.selectedCells.length > 0 && (
                        <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                          ✓ {config.selectedCells.length} cell(s) selected for reading!
                        </div>
                      )}

                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range" && config.range && (
                        <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                          ✓ Range selected: {config.range}
                          {isDragging && (
                            <span className="ml-2 text-blue-500">
                              (Drag to adjust selection)
                            </span>
                          )}
                        </div>
                      )}

                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "range" && !config.range && (
                        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          💡 Click and drag to select a range of cells
                        </div>
                      )}

                      {nodeInfo?.type === "google_sheets_action_read_data" && config.readMode === "cells" && (!config.selectedCells || config.selectedCells.length === 0) && (
                        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          💡 Click on cells to select them for reading
                        </div>
                      )}

                      {/* Column Input Fields for Add and Update Actions */}
                      {((nodeInfo?.type === "google_sheets_unified_action" && (config.action === "add" || (config.action === "update" && config.selectedRow))) ||
                        (nodeInfo?.type === "google-sheets_action_create_row")) && dynamicOptions.sheetData && (dynamicOptions.sheetData as any).headers && Array.isArray((dynamicOptions.sheetData as any).headers) && (
                        <div className="space-y-3 border-b pb-4">
                          <div className="text-sm font-medium">
                            {nodeInfo?.type === "google-sheets_action_create_row" 
                              ? "Enter values for the new row:"
                              : config.action === "add" 
                                ? "Enter values for each column:" 
                                : "Edit values for the selected row:"}
                          </div>
                          
                          <div className="space-y-3">
                            {(dynamicOptions.sheetData as any).headers.map((header: any, index: number) => (
                              <div key={index} className="flex flex-col space-y-2">
                                <Label className="text-sm font-medium">
                                  {header.name} ({header.column})
                                </Label>
                                <Input
                                  value={config.columnValues?.[header.column] || ""}
                                  onChange={(e) => {
                                    setConfig(prev => ({
                                      ...prev,
                                      columnValues: {
                                        ...prev.columnValues,
                                        [header.column]: e.target.value
                                      }
                                    }))
                                  }}
                                  placeholder={`Enter value for ${header.name}`}
                                  className="w-full"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Discord Bot Connection Hint */}
                  {nodeInfo?.type === "discord_action_send_message" && config.guildId && !botStatus[config.guildId] && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-amber-700">
                            <strong>Bot Required:</strong> You need to add the Discord bot to your server before you can send messages to channels. 
                            The bot needs permission to view channels and send messages.
                          </p>
                        </div>
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
          
          {/* Loading Overlay */}
          {loadingDynamic && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
              <ConfigurationLoadingScreen 
                integrationName={nodeInfo.title || nodeInfo.type || integrationName}
              />
              {retryCount > 0 && (
                <div className="mt-4 text-sm text-muted-foreground animate-pulse">
                  Retrying... (attempt {retryCount + 1})
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
