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

  // Render table for array of objects
  const renderTable = (data: any[]) => {
    if (!Array.isArray(data) || data.length === 0) return null

    // Check if all items are objects with similar keys
    const firstItem = data[0]
    if (typeof firstItem !== 'object' || firstItem === null) return null

    const keys = Object.keys(firstItem)
    if (keys.length === 0) return null

    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {keys.map((key) => (
                <th key={key} className="px-4 py-2 text-left font-medium text-foreground">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 10).map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                {keys.map((key) => (
                  <td key={key} className="px-4 py-2 text-muted-foreground">
                    {typeof row[key] === 'object'
                      ? JSON.stringify(row[key])
                      : String(row[key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 10 && (
          <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-t border-border">
            Showing 10 of {data.length} rows
          </div>
        )}
      </div>
    )
  }

  // Show output schema even without test data
  const showOutputSchema = outputSchema.length > 0

  // Empty state - show schema but no values
  if (!hasTestData && !hasTestResult && showOutputSchema) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
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
      <div className="flex-1 overflow-y-auto">
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
                              {renderTable(value)}
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
