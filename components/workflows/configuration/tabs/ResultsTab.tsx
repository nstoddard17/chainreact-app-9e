"use client"

import React, { useMemo, useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Clock, Info, TestTube, AlertCircle, RefreshCw, ChevronDown, ChevronRight, Code2, Database, History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { ConfigurationSectionHeader } from '../components/ConfigurationSectionHeader'
import { useFlowV2Builder } from '@/src/lib/workflows/builder/useFlowV2Builder'
import { logger } from '@/lib/utils/logger'
import { flattenOutputFields } from '@/components/workflows/configuration/hooks/useUpstreamVariables'
import { navigateArrayPath } from '@/lib/workflows/actions/core/resolveValue'

const MAX_OBJECT_PREVIEW_FIELDS = 4

function isValueEmpty(value: any): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

function formatPreviewValue(value: any): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value)
}

function renderObjectPreview(obj: Record<string, any> | null | undefined) {
  if (!obj || typeof obj !== 'object') return null

  const entries = Object.entries(obj)
  if (entries.length === 0) return null

  const previewEntries = entries.slice(0, MAX_OBJECT_PREVIEW_FIELDS)
  const remainingCount = entries.length - previewEntries.length

  return (
    <div className="rounded bg-muted/30 p-3 border border-border text-xs">
      <dl className="space-y-1">
        {previewEntries.map(([key, val]) => (
          <div key={key} className="flex items-start gap-2">
            <dt className="text-muted-foreground min-w-[90px] font-medium">{key}</dt>
            <dd className="text-foreground break-words flex-1">{formatPreviewValue(val)}</dd>
          </div>
        ))}
      </dl>
      {remainingCount > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">+{remainingCount} more field{remainingCount === 1 ? '' : 's'}</p>
      )}
    </div>
  )
}

interface ResultsTabProps {
  nodeInfo: any
  currentNodeId?: string
  testData?: Record<string, any>
  testResult?: {
    success: boolean
    executionTime?: number
    timestamp?: string
    error?: string
    rawResponse?: any
    cachedDataUsed?: number
    outputCached?: boolean
  }
  onRunTest?: () => void
  isTestingNode?: boolean
  cachedOutputsInfo?: {
    available: boolean
    nodeCount: number
    availableNodes: string[]
  }
  workflowId?: string
}

/**
 * Results Tab - Test execution results and output data
 *
 * Displays:
 * - Test execution status (success/failure)
 * - Output data matched against outputSchema
 * - Execution time and timestamp
 * - Error messages if failed
 * - Raw response viewer
 */
export function ResultsTab({
  nodeInfo,
  currentNodeId,
  testData,
  testResult,
  onRunTest,
  isTestingNode = false,
  cachedOutputsInfo,
  workflowId,
}: ResultsTabProps) {
  const [showRawResponse, setShowRawResponse] = useState(false)
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({})
  const [rowsToShow, setRowsToShow] = useState(10)
  const [latestExecutionData, setLatestExecutionData] = useState<Record<string, any> | null>(null)
  const [latestExecutionResult, setLatestExecutionResult] = useState<any>(null)
  const [isLoadingLatest, setIsLoadingLatest] = useState(false)
  const [cachedOutput, setCachedOutput] = useState<any>(null)
  const [isLoadingCached, setIsLoadingCached] = useState(false)

  // Get builder instance to access actions
  const builder = useFlowV2Builder()

  // Get the node component definition with outputSchema
  const nodeComponent = useMemo(() => {
    return ALL_NODE_COMPONENTS.find(c => c.type === nodeInfo?.type)
  }, [nodeInfo?.type])

  const outputSchema = nodeComponent?.outputSchema || []
  const flattenedOutputSchema = useMemo(() => flattenOutputFields(outputSchema), [outputSchema])

  // Fetch cached output directly from API when component mounts
  useEffect(() => {
    const fetchCachedOutput = async () => {
      if (!workflowId || !currentNodeId || testData) return // Don't fetch if we already have test data

      try {
        setIsLoadingCached(true)
        const response = await fetch(`/api/workflows/cached-outputs?workflowId=${workflowId}&nodeId=${currentNodeId}`, {
          credentials: 'include'
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.cachedOutputs?.[currentNodeId]) {
            setCachedOutput(data.cachedOutputs[currentNodeId])
            logger.debug('[ResultsTab] Loaded cached output for node:', currentNodeId)
          }
        }
      } catch (error) {
        logger.debug('[ResultsTab] Failed to fetch cached output:', error)
      } finally {
        setIsLoadingCached(false)
      }
    }

    fetchCachedOutput()
  }, [workflowId, currentNodeId, testData])

  // Extract output data from cached output structure
  // The cached output has structure: { nodeId, nodeType, output: { success, output: {...}, message }, executedAt }
  const cachedOutputData = useMemo(() => {
    if (!cachedOutput?.output) return null
    // The output field contains the ActionResult with nested output
    const actionResult = cachedOutput.output
    if (actionResult?.output && typeof actionResult.output === 'object') {
      return actionResult.output
    }
    // Fallback to direct output if not nested
    return actionResult
  }, [cachedOutput])

  const cachedOutputResult = useMemo(() => {
    if (!cachedOutput?.output) return null
    const actionResult = cachedOutput.output
    return {
      success: actionResult?.success !== false,
      executionTime: actionResult?.executionTime,
      timestamp: cachedOutput.executedAt,
      error: actionResult?.error,
      message: actionResult?.message,
      rawResponse: actionResult,
      fromCache: true
    }
  }, [cachedOutput])

  // Use latest execution data if available, then test data, then cached data
  const displayData = latestExecutionData || testData || cachedOutputData
  const displayResult = latestExecutionResult || testResult || cachedOutputResult

  const hasTestData = displayData && Object.keys(displayData).length > 0
  const hasTestResult = displayResult !== undefined
  const isFromCache = !latestExecutionData && !testData && cachedOutputData !== null

  // Debug logging to trace data flow issues
  useEffect(() => {
    // CRITICAL DEBUG: Log to browser console for visibility
    console.log('🔍 [ResultsTab] Props received:', {
      hasTestData,
      hasTestResult,
      testData,
      testDataKeys: testData ? Object.keys(testData) : 'NULL',
      testResult,
      displayData,
      displayDataKeys: displayData ? Object.keys(displayData) : 'NULL',
      outputSchemaLength: flattenedOutputSchema?.length || 0
    })

    logger.debug('[ResultsTab] Data state:', {
      hasTestData,
      hasTestResult,
      isFromCache,
      testDataKeys: testData ? Object.keys(testData) : [],
      testDataSample: testData ? JSON.stringify(testData).slice(0, 200) : null,
      displayDataKeys: displayData ? Object.keys(displayData) : [],
      displayDataSample: displayData ? JSON.stringify(displayData).slice(0, 200) : null,
      outputSchemaLength: flattenedOutputSchema?.length || 0,
      outputSchemaFields: flattenedOutputSchema?.map((f: any) => f.name) || [],
      testResult: testResult ? { success: testResult.success, hasError: !!testResult.error } : null,
      nodeType: nodeInfo?.type
    })
  }, [testData, displayData, testResult, flattenedOutputSchema, nodeInfo?.type, hasTestData, hasTestResult, isFromCache])

  useEffect(() => {
    setLatestExecutionData(null)
    setLatestExecutionResult(null)
  }, [currentNodeId])

  // Fetch latest execution results when tab is opened
  useEffect(() => {
    const fetchLatestExecution = async () => {
      if (!currentNodeId || !builder?.actions?.getNodeSnapshot || !builder?.flowState?.lastRunId) return

      try {
        setIsLoadingLatest(true)
        logger.debug('[ResultsTab] Fetching latest execution for node:', currentNodeId)

        const snapshot = await builder.actions.getNodeSnapshot(currentNodeId)

        if (snapshot?.snapshot) {
          logger.debug('[ResultsTab] Got latest execution snapshot:', snapshot.snapshot)

          // Extract output data from snapshot
          const output = snapshot.snapshot.output || snapshot.snapshot.data || {}

          setLatestExecutionData(output)
          setLatestExecutionResult({
            success: snapshot.snapshot.success !== false,
            executionTime: snapshot.snapshot.executionTime,
            timestamp: snapshot.snapshot.timestamp || snapshot.snapshot.completedAt,
            error: snapshot.snapshot.error,
            message: snapshot.snapshot.message,
            rawResponse: snapshot.snapshot
          })
        }
      } catch (error: any) {
        logger.debug('[ResultsTab] No execution history found:', error.message)
        // Don't show error - it's normal if there's no execution history yet
      } finally {
        setIsLoadingLatest(false)
      }
    }

    fetchLatestExecution()
  }, [currentNodeId, builder?.actions, builder?.flowState?.lastRunId])

  // Auto-refresh every 5 seconds if there's an active workflow run
  useEffect(() => {
    if (!currentNodeId || !builder?.actions?.getNodeSnapshot || !builder?.flowState?.lastRunId) return

    const interval = setInterval(async () => {
      try {
        const snapshot = await builder.actions.getNodeSnapshot(currentNodeId)
        if (snapshot?.snapshot) {
          const output = snapshot.snapshot.output || snapshot.snapshot.data || {}
          setLatestExecutionData(output)
          setLatestExecutionResult({
            success: snapshot.snapshot.success !== false,
            executionTime: snapshot.snapshot.executionTime,
            timestamp: snapshot.snapshot.timestamp || snapshot.snapshot.completedAt,
            error: snapshot.snapshot.error,
            message: snapshot.snapshot.message,
            rawResponse: snapshot.snapshot
          })
        }
      } catch (error) {
        // Silently fail - execution may not exist yet
      }
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [currentNodeId, builder?.actions, builder?.flowState?.lastRunId])

  // Format timestamp
  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'N/A'
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return timestamp
    }
  }

  // Format execution time
  const formatExecutionTime = (ms?: number) => {
    if (ms === undefined) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  // Helper function to highlight variables in text
  const highlightVariables = (text: string) => {
    // Match {{variable}} pattern including AI_FIELD, trigger, previous, node_X, etc.
    const variableRegex = /(\{\{[^}]+\}\})/g
    const parts = text.split(variableRegex)

    return parts.map((part, index) => {
      if (variableRegex.test(part)) {
        // This is a variable - highlight it
        return (
          <span
            key={index}
            className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 font-mono text-xs"
          >
            {part}
          </span>
        )
      }
      return part
    })
  }

  // Format value for display
  const formatValue = (value: any, maxLength = 150): string => {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') {
      if (value.length > maxLength) return `${value.substring(0, maxLength)}...`
      return value
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
      return `Array (${value.length} item${value.length !== 1 ? 's' : ''})`
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value)
      return `Object (${keys.length} field${keys.length !== 1 ? 's' : ''})`
    }
    return String(value)
  }

  // Helper to render cell value based on type
  const renderCellValue = (value: any, columnName: string) => {
    if (value === null || value === undefined) {
      return <span className="text-slate-400 dark:text-slate-600 italic text-xs">empty</span>
    }

    // Handle Google Calendar specific fields
    if (columnName === 'start' || columnName === 'end') {
      if (typeof value === 'object' && value !== null) {
        // Handle Google Calendar datetime object
        const dateTime = value.dateTime || value.date
        if (dateTime) {
          try {
            const date = new Date(dateTime)
            const formatted = date.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: value.dateTime ? 'numeric' : undefined,
              minute: value.dateTime ? '2-digit' : undefined,
            })
            return <span className="text-xs whitespace-nowrap">{formatted}</span>
          } catch {
            return <span className="text-xs">{dateTime}</span>
          }
        }
      }
    }

    if (columnName === 'attendees') {
      if (Array.isArray(value) && value.length > 0) {
        return (
          <div className="flex flex-col gap-1 max-w-xs">
            {value.slice(0, 3).map((attendee: any, idx: number) => (
              <span key={idx} className="text-xs truncate" title={attendee.email}>
                {attendee.displayName || attendee.email}
                {attendee.responseStatus && (
                  <span className="ml-1 text-slate-400">
                    ({attendee.responseStatus === 'accepted' ? '✓' :
                      attendee.responseStatus === 'declined' ? '✗' :
                      attendee.responseStatus === 'tentative' ? '?' : '?'})
                  </span>
                )}
              </span>
            ))}
            {value.length > 3 && (
              <span className="text-xs text-slate-400">+{value.length - 3} more</span>
            )}
          </div>
        )
      }
    }

    if (columnName === 'organizer') {
      if (typeof value === 'object' && value !== null) {
        return (
          <span className="text-xs" title={value.email}>
            {value.displayName || value.email}
          </span>
        )
      }
    }

    if (columnName === 'htmlLink') {
      if (typeof value === 'string' && value.startsWith('http')) {
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Event
          </a>
        )
      }
    }

    if (columnName === 'status') {
      const statusColors: Record<string, string> = {
        confirmed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
        tentative: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
        cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      }
      const colorClass = statusColors[String(value).toLowerCase()] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${colorClass}`}>
          {String(value)}
        </span>
      )
    }

    // Handle arrays (linked records, multi-select, etc.)
    if (Array.isArray(value)) {
      // Check if it's an array of attachment objects
      if (value.length > 0 && value[0]?.url && value[0]?.filename) {
        return (
          <div className="flex flex-wrap gap-2">
            {value.map((attachment, idx) => (
              <div key={idx} className="group relative">
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {attachment.type?.startsWith('image/') ? (
                    <img
                      src={attachment.thumbnails?.small?.url || attachment.url}
                      alt={attachment.filename}
                      className="w-16 h-16 object-cover rounded border border-slate-200 dark:border-slate-700 hover:scale-105 transition-transform"
                      title={attachment.filename}
                    />
                  ) : (
                    <div className="w-16 h-16 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate px-1">
                        {attachment.filename?.split('.').pop()?.toUpperCase() || 'FILE'}
                      </span>
                    </div>
                  )}
                </a>
              </div>
            ))}
          </div>
        )
      }

      // Handle linked records with display format "rec::Name"
      if (value.length > 0 && typeof value[0] === 'string' && value[0].includes('::')) {
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((item, idx) => {
              const label = item.split('::')[1] || item
              return (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                >
                  {label}
                </span>
              )
            })}
          </div>
        )
      }

      // Regular array
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, idx) => (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              {String(item)}
            </span>
          ))}
        </div>
      )
    }

    // Handle objects
    if (typeof value === 'object') {
      return (
        <code className="text-xs font-mono text-slate-600 dark:text-slate-400 block max-w-xs truncate">
          {JSON.stringify(value)}
        </code>
      )
    }

    // Handle long text
    const stringValue = String(value)
    if (stringValue.length > 100) {
      return (
        <span className="text-xs block max-w-xs truncate" title={stringValue}>
          {highlightVariables(stringValue)}
        </span>
      )
    }

    // Regular value with variable highlighting
    return <span className="text-xs inline-flex items-center gap-1 flex-wrap">{highlightVariables(stringValue)}</span>
  }

  // Define common field orders for different data types
  const getFieldOrder = (data: any[], fieldName?: string) => {
    const firstItem = data[0]
    if (!firstItem || typeof firstItem !== 'object') return null

    const allKeys = Object.keys(firstItem)

    // Google Calendar event field order
    const calendarEventFields = ['summary', 'start', 'end', 'location', 'description', 'attendees', 'organizer', 'status', 'htmlLink', 'eventId', 'created', 'updated']

    // Check if this looks like Google Calendar event data
    const isCalendarEvent = allKeys.some(key => ['summary', 'start', 'end'].includes(key)) ||
                            allKeys.some(key => ['eventId', 'htmlLink'].includes(key))

    if (isCalendarEvent) {
      // Use Calendar event field order
      return [
        ...calendarEventFields.filter(field => allKeys.includes(field)),
        ...allKeys.filter(field => !calendarEventFields.includes(field)).sort()
      ]
    }

    // Gmail email message field order
    const gmailEmailFields = ['from', 'to', 'cc', 'bcc', 'subject', 'body', 'snippet', 'date', 'attachments', 'labelIds', 'threadId', 'id']

    // Check if this looks like Gmail email data
    const isGmailEmail = allKeys.some(key => ['from', 'to', 'subject'].includes(key))

    if (isGmailEmail) {
      // Use Gmail email field order
      return [
        ...gmailEmailFields.filter(field => allKeys.includes(field)),
        ...allKeys.filter(field => !gmailEmailFields.includes(field)).sort()
      ]
    }

    // Try to use schema order for other types
    const schemaFields = outputSchema.length > 0
      ? outputSchema
      : (nodeComponent?.configSchema || [])

    const schemaFieldNames = schemaFields.map((f: any) => f.name)

    // Sort keys: schema fields first (in order), then remaining fields alphabetically
    return [
      ...allKeys.filter(key => schemaFieldNames.includes(key)).sort((a, b) => {
        const indexA = schemaFieldNames.indexOf(a)
        const indexB = schemaFieldNames.indexOf(b)
        return indexA - indexB
      }),
      ...allKeys.filter(key => !schemaFieldNames.includes(key)).sort()
    ]
  }

  // Render table for array of objects (Airtable-style)
  const renderTable = (data: any[], fieldName?: string) => {
    if (!Array.isArray(data) || data.length === 0) return null

    // Check if all items are objects with similar keys
    const firstItem = data[0]
    if (typeof firstItem !== 'object' || firstItem === null) return null

    const allKeys = Object.keys(firstItem)
    if (allKeys.length === 0) return null

    // Get the ordered keys based on data type
    const keys = getFieldOrder(data, fieldName) || allKeys

    const displayedRows = data.slice(0, rowsToShow)
    const hasMore = data.length > rowsToShow

    return (
      <div className="space-y-2">
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {keys.map((key) => (
                  <th
                    key={key}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide border-r border-slate-200 dark:border-slate-700 last:border-r-0 whitespace-nowrap"
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {displayedRows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  {keys.map((key) => (
                    <td
                      key={key}
                      className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800 last:border-r-0 align-top"
                    >
                      {renderCellValue(row[key], key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between px-1">
          <div className="text-xs text-muted-foreground">
            Showing {Math.min(rowsToShow, data.length)} of {data.length} rows
          </div>
          {hasMore && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRowsToShow(prev => Math.min(prev + 10, data.length))}
                className="h-7 text-xs"
              >
                Show 10 More
              </Button>
              {rowsToShow < data.length && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRowsToShow(data.length)}
                  className="h-7 text-xs"
                >
                  Show All ({data.length})
                </Button>
              )}
            </div>
          )}
          {!hasMore && rowsToShow > 10 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRowsToShow(10)}
              className="h-7 text-xs"
            >
              Show Less
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Show output schema even without test data
  const showOutputSchema = flattenedOutputSchema.length > 0

  // Empty state - show schema but no values
  if (!hasTestData && !hasTestResult && showOutputSchema) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="flex-1 overflow-y-auto"
          style={{
            transform: 'translateZ(0)', // Force GPU acceleration
            backfaceVisibility: 'hidden', // Prevent flickering
            WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
          }}
        >
          <div className="px-6 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Output Variables</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  These variables will be available after this node executes
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {onRunTest && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onRunTest}
                    disabled={isTestingNode}
                    className="flex items-center gap-2"
                  >
                    {isTestingNode ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="h-3.5 w-3.5" />
                        Test Node
                      </>
                    )}
                  </Button>
                )}
                {cachedOutputsInfo?.available && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{cachedOutputsInfo.nodeCount} cached output{cachedOutputsInfo.nodeCount !== 1 ? 's' : ''} available</span>
                  </div>
                )}
              </div>
            </div>

            {/* Output Schema - No values yet */}
            <div className="space-y-2">
              {flattenedOutputSchema.map((field) => (
                <div
                  key={field.name}
                  className="rounded-lg border border-border bg-card p-4 hover:border-border transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {field.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-2 font-mono">
                        {field.type}
                      </Badge>
                    </div>
                  </div>
                  {field.description && (
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      {field.description}
                    </p>
                  )}
                  <div className="rounded bg-muted/30 p-3 border border-dashed border-border">
                    <p className="text-xs text-muted-foreground italic">
                      Value will appear here after test execution
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Completely empty - no schema
  if (!hasTestData && !hasTestResult && !showOutputSchema) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Info className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Output Schema</h3>
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
          This node does not define any output variables.
        </p>
      </div>
    )
  }

  const isSuccess = testResult?.success ?? true
  const executionTime = testResult?.executionTime
  const timestamp = testResult?.timestamp

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-1 overflow-y-auto"
        style={{
          transform: 'translateZ(0)', // Force GPU acceleration
          backfaceVisibility: 'hidden', // Prevent flickering
          WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
        }}
      >
        <div className="px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">
                  {isFromCache ? 'Cached Results' : 'Test Execution Results'}
                </h2>
                {isFromCache && (
                  <Badge variant="outline" className="text-[10px] h-5 px-2 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                    <History className="h-3 w-3 mr-1" />
                    From previous run
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isFromCache
                  ? 'Output data from a previous test run. Re-test to get fresh results.'
                  : 'Output data and execution details from the most recent test run'
                }
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {onRunTest && (
                <Button
                  variant={isFromCache ? "default" : "outline"}
                  size="sm"
                  onClick={onRunTest}
                  disabled={isTestingNode}
                  className="flex items-center gap-2"
                >
                  {isTestingNode ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                      Testing...
                    </>
                  ) : (
                    <>
                      {isFromCache ? <TestTube className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {isFromCache ? 'Test Node' : 'Re-test'}
                    </>
                  )}
                </Button>
              )}
              {cachedOutputsInfo?.available && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{cachedOutputsInfo.nodeCount} cached output{cachedOutputsInfo.nodeCount !== 1 ? 's' : ''} available</span>
                </div>
              )}
            </div>
          </div>

          {/* Test Status Summary */}
          {hasTestResult && (
            <div className={`rounded-lg border-2 p-4 ${
              isSuccess
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30'
                : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30'
            }`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  {isSuccess ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
                        Test Passed
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <span className="text-base font-semibold text-red-900 dark:text-red-200">
                        Test Failed
                      </span>
                    </>
                  )}
                </div>
                <Badge variant={isSuccess ? 'default' : 'destructive'} className="text-[10px]">
                  {isSuccess ? 'Success' : 'Failed'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Execution Time</p>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium text-foreground">
                      {formatExecutionTime(executionTime)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <span className="font-mono text-xs text-foreground">
                    {formatTimestamp(timestamp)}
                  </span>
                </div>
              </div>

              {/* Cached data info */}
              {testResult?.cachedDataUsed && testResult.cachedDataUsed > 0 && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2 border border-blue-200 dark:border-blue-800">
                  <Database className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    Used {testResult.cachedDataUsed} cached node output{testResult.cachedDataUsed !== 1 ? 's' : ''} from previous run
                  </span>
                </div>
              )}

              {!isSuccess && displayResult.error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs leading-relaxed">
                    {displayResult.error}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Debug: Show when test passed but no output data */}
          {hasTestResult && !hasTestData && isSuccess && (
            <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
                <p className="font-medium mb-1">Test passed but no output data was returned.</p>
                <p className="text-[10px] opacity-70">
                  testData keys: {testData ? Object.keys(testData).join(', ') || '(empty)' : '(null)'}<br/>
                  displayData keys: {displayData ? Object.keys(displayData).join(', ') || '(empty)' : '(null)'}<br/>
                  outputSchema fields: {flattenedOutputSchema?.length || 0}<br/>
                  testResult.rawResponse: {testResult?.rawResponse ? Object.keys(testResult.rawResponse).join(', ') : '(none)'}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Fallback: If test passed and we have rawResponse but no testData, show rawResponse */}
          {hasTestResult && !hasTestData && isSuccess && testResult?.rawResponse && Object.keys(testResult.rawResponse).length > 0 && (
            <div className="space-y-4">
              <ConfigurationSectionHeader
                label="Output Data (from rawResponse)"
                prefix={<Code2 className="h-4 w-4 text-muted-foreground" />}
              />
              <div className="rounded-lg border border-border bg-card p-4">
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                  {JSON.stringify(testResult.rawResponse, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Output Data */}
          {hasTestData && (
            <div className="space-y-4">
              <ConfigurationSectionHeader
                label="Output Data"
                prefix={<Code2 className="h-4 w-4 text-muted-foreground" />}
              />

              <div className="space-y-2">
                {flattenedOutputSchema.map((field) => {
                  const value = displayData ? navigateArrayPath(displayData, field.name) : undefined
                  const hasValue = !isValueEmpty(value)
                  const isArray = Array.isArray(value)
                  const isObject = !isArray && typeof value === 'object' && value !== null
                  const isExpanded = expandedFields[field.name] || false

                  return (
                    <div
                      key={field.name}
                      className="rounded-lg border border-border bg-card p-4 hover:border-border transition-colors"
                    >
                      {/* Field Header */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {field.name}
                          </span>
                          <Badge variant="secondary" className="text-[10px] h-5 px-2 font-mono">
                            {field.type}
                          </Badge>
                        </div>
                      </div>

                      {/* Field Description */}
                      {field.description && (
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                          {field.description}
                        </p>
                      )}

                      {/* Field Value */}
                      {hasValue ? (
                        <div className="space-y-2">
                          {/* Table view for arrays */}
                          {isArray && value.length > 0 && typeof value[0] === 'object' ? (
                            <>
                              {/* Special handling for Airtable records with nested 'fields' property */}
                              {value[0].fields && typeof value[0].fields === 'object' ? (
                                (() => {
                                  // Flatten Airtable records - extract the 'fields' object and merge with id/createdTime
                                  const flattenedRecords = value.map((record: any) => ({
                                    id: record.id,
                                    ...record.fields,
                                    createdTime: record.createdTime
                                  }))
                                  return renderTable(flattenedRecords, field.name)
                                })()
                              ) : (
                                renderTable(value, field.name)
                              )}
                            </>
                          ) : isArray ? (
                            <div className="rounded bg-muted/30 p-3 border border-border">
                              <code className="text-xs font-mono text-foreground break-all whitespace-pre-wrap">
                                {(() => {
                                  const jsonString = JSON.stringify(value, null, 2)
                                  return highlightVariables(jsonString)
                                })()}
                              </code>
                            </div>
                          ) : isObject ? (
                            <>
                              {renderObjectPreview(value)}
                              <button
                                onClick={() => setExpandedFields(prev => ({ ...prev, [field.name]: !prev[field.name] }))}
                                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                {isExpanded ? 'Hide' : 'Show'} object details
                              </button>
                              {isExpanded && (
                                <div className="rounded bg-muted/30 p-3 border border-border mt-2">
                                  <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                                    {highlightVariables(JSON.stringify(value, null, 2))}
                                  </pre>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded bg-muted/30 p-3 border border-border">
                              <code className="text-xs font-mono text-foreground break-all inline-flex items-center gap-1 flex-wrap">
                                {highlightVariables(String(value))}
                              </code>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded bg-muted/30 p-3 border border-dashed border-border">
                          <div className="flex items-center gap-2">
                            <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs text-muted-foreground italic">
                              No value returned
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Extra fields not in schema */}
                {Object.keys(displayData).filter(key => !outputSchema.find(f => f.name === key)).length > 0 && (
                  <Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <AlertDescription className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                      Additional fields returned: <code className="font-mono">{Object.keys(displayData).filter(key => !outputSchema.find(f => f.name === key)).join(', ')}</code>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}

          {/* Raw Response Viewer */}
          {testResult?.rawResponse && (
            <div className="space-y-3">
              <button
                onClick={() => setShowRawResponse(!showRawResponse)}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
              >
                {showRawResponse ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Raw API Response
              </button>

              {showRawResponse && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 overflow-x-auto">
                  <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                    {highlightVariables(JSON.stringify(displayResult.rawResponse, null, 2))}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
