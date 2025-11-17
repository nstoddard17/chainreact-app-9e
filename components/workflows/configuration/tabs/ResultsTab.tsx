"use client"

import React, { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, Info, TestTube, AlertCircle, RefreshCw, ChevronDown, ChevronRight, Code2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { ConfigurationSectionHeader } from '../components/ConfigurationSectionHeader'

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
  }
  onRunTest?: () => void
  isTestingNode?: boolean
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
}: ResultsTabProps) {
  const [showRawResponse, setShowRawResponse] = useState(false)
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({})
  const [rowsToShow, setRowsToShow] = useState(10)

  // Get the node component definition with outputSchema
  const nodeComponent = useMemo(() => {
    return ALL_NODE_COMPONENTS.find(c => c.type === nodeInfo?.type)
  }, [nodeInfo?.type])

  const outputSchema = nodeComponent?.outputSchema || []
  const hasTestData = testData && Object.keys(testData).length > 0
  const hasTestResult = testResult !== undefined

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
          {stringValue}
        </span>
      )
    }

    // Regular value
    return <span className="text-xs">{stringValue}</span>
  }

  // Render table for array of objects (Airtable-style)
  const renderTable = (data: any[], fieldName?: string) => {
    if (!Array.isArray(data) || data.length === 0) return null

    // Check if all items are objects with similar keys
    const firstItem = data[0]
    if (typeof firstItem !== 'object' || firstItem === null) return null

    const keys = Object.keys(firstItem)
    if (keys.length === 0) return null

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
  const showOutputSchema = outputSchema.length > 0

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
              {onRunTest && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onRunTest}
                  disabled={isTestingNode}
                  className="flex items-center gap-2 flex-shrink-0"
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
            </div>

            {/* Output Schema - No values yet */}
            <div className="space-y-2">
              {outputSchema.map((field) => (
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
              <h2 className="text-lg font-semibold text-foreground">Test Execution Results</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Output data and execution details from the most recent test run
              </p>
            </div>
            {onRunTest && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRunTest}
                disabled={isTestingNode}
                className="flex items-center gap-2 flex-shrink-0"
              >
                {isTestingNode ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                    Testing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-test
                  </>
                )}
              </Button>
            )}
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

              {!isSuccess && testResult.error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs leading-relaxed">
                    {testResult.error}
                  </AlertDescription>
                </Alert>
              )}
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
                {outputSchema.map((field) => {
                  const value = testData[field.name]
                  const hasValue = value !== undefined && value !== null
                  const isArray = Array.isArray(value)
                  const isObject = typeof value === 'object' && value !== null && !isArray
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
                          {isArray && field.type === 'array' && value.length > 0 && typeof value[0] === 'object' ? (
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
                              <code className="text-xs font-mono text-foreground break-all">
                                {JSON.stringify(value, null, 2)}
                              </code>
                            </div>
                          ) : isObject ? (
                            <>
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
                                    {JSON.stringify(value, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded bg-muted/30 p-3 border border-border">
                              <code className="text-xs font-mono text-foreground break-all">
                                {String(value)}
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
                {Object.keys(testData).filter(key => !outputSchema.find(f => f.name === key)).length > 0 && (
                  <Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <AlertDescription className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                      Additional fields returned: <code className="font-mono">{Object.keys(testData).filter(key => !outputSchema.find(f => f.name === key)).join(', ')}</code>
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
                    {JSON.stringify(testResult.rawResponse, null, 2)}
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
