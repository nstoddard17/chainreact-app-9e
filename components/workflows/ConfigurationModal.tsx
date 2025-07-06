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
    Record<string, { value: string; label: string; fields?: any[] }[]>
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

  useEffect(() => {
    setConfig(initialData)
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
      if (field.defaultValue !== undefined && config[field.name] === undefined) {
        defaultValues[field.name] = field.defaultValue
      }
    })

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
  }, [nodeInfo, config, workflowData])

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
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new AbortController for this request
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
        
        // Only update state if the request wasn't aborted
        if (!controller.signal.aborted && data && data.length > 0) {
          setSheetData(data[0])
          setDynamicOptions(prev => ({
            ...prev,
            sheetData: data[0]
          }))
        }
      } catch (error) {
        // Don't log errors for aborted requests
        if (!controller.signal.aborted) {
          console.error("Error auto-loading sheet data:", error)
        }
      } finally {
        // Only update loading state if the request wasn't aborted
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
    const value = config[field.name] || ""
    const hasError = !!errors[field.name]

    // Add label rendering
    const renderLabel = () => (
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-medium">
          {field.label || field.name}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {field.description && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{field.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    )

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
                        <SelectContent>
                          {fieldDef.options.choices.map((choice: any) => (
                            <SelectItem key={choice.name} value={choice.name}>
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 flex-shrink-0"
                              >
                                <HelpCircle className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-sm">
                                When enabled, this field will automatically use the current date each time the workflow runs, rather than a fixed date.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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

    switch (field.type) {
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
            <DatePicker
              value={value ? new Date(value) : undefined}
              onChange={handleDateChange}
              placeholder={field.placeholder}
              className={cn(hasError && "border-red-500")}
            />
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

      case "datetime":
        return (
          <div className="space-y-2">
            {renderLabel()}
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
            {hasError && (
              <p className="text-xs text-red-500">{errors[field.name]}</p>
            )}
          </div>
        )

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
        const isMultipleEmail = field.name === "attendees" || field.name === "to" || field.name === "cc" || field.name === "bcc"
        
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
              <div className="font-medium text-blue-800 mb-1">{field.label}</div>
              <div className="text-blue-700 text-sm">{field.description}</div>
            </div>
            {field.showConnectButton && (
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
            "max-w-4xl w-full max-h-[90vh] p-0 gap-0 overflow-hidden",
            showDataFlowPanels && "max-w-[95vw]"
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
              <ScrollArea className="flex-1 max-h-[60vh]">
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
                    
                    return (
                      <div key={field.name} className="flex flex-col space-y-3 pb-4 border-b border-border/50 last:border-b-0 last:pb-0">
                        {renderField(field)}
                      </div>
                    )
                  })}
                  
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
