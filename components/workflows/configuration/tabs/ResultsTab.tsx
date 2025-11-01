"use client"

import React, { useMemo } from 'react'
import { CheckCircle2, XCircle, Clock, Info, TestTube, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { ScrollArea } from '@/components/ui/scroll-area'

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
}

/**
 * Results Tab - Shows test execution results
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
}: ResultsTabProps) {
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
        year: 'numeric',
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
  const formatValue = (value: any): string => {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') {
      if (value.length > 100) return `${value.substring(0, 100)}...`
      return value
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
      return `Array(${value.length})`
    }
    if (typeof value === 'object') {
      return 'Object {...}'
    }
    return String(value)
  }

  // No test data state
  if (!hasTestData && !hasTestResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
        <TestTube className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No Test Results Yet</h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Run a test to see the output data this node produces and verify it's working correctly.
        </p>
        {onRunTest && (
          <Button onClick={onRunTest} className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            Run Test
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Test Results</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Output data from the latest test execution
            </p>
          </div>
          {onRunTest && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRunTest}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Re-run Test
            </Button>
          )}
        </div>
      </div>

      {/* Results Content */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-4">
          {/* Test Status Card */}
          {hasTestResult && (
            <Card className={testResult.success ? 'border-emerald-200' : 'border-red-200'}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {testResult.success ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <span className="text-emerald-600">Test Passed</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-red-600" />
                        <span className="text-red-600">Test Failed</span>
                      </>
                    )}
                  </CardTitle>
                  <Badge variant={testResult.success ? 'default' : 'destructive'}>
                    {testResult.success ? 'Success' : 'Error'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Execution Time</p>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {formatExecutionTime(testResult.executionTime)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Timestamp</p>
                    <span className="font-mono text-xs">
                      {formatTimestamp(testResult.timestamp)}
                    </span>
                  </div>
                </div>

                {!testResult.success && testResult.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      {testResult.error}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Output Data Card */}
          {hasTestData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Output Data</CardTitle>
                <CardDescription>
                  Data produced by this node during test execution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {outputSchema.map((field) => {
                    const value = testData[field.name]
                    const hasValue = value !== undefined && value !== null

                    return (
                      <div
                        key={field.name}
                        className="flex items-start justify-between gap-4 p-3 rounded-md border border-border bg-muted/30"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium">{field.label}</p>
                            <Badge variant="outline" className="text-xs">
                              {field.type}
                            </Badge>
                          </div>
                          <div className="flex items-start gap-2">
                            {hasValue ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                                <code className="text-xs bg-emerald-50 text-emerald-800 px-2 py-1 rounded break-all">
                                  {formatValue(value)}
                                </code>
                              </>
                            ) : (
                              <>
                                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <span className="text-xs text-muted-foreground">
                                  No value returned
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Show extra fields not in schema */}
                  {Object.keys(testData).filter(key => !outputSchema.find(f => f.name === key)).length > 0 && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        Additional fields returned: {Object.keys(testData).filter(key => !outputSchema.find(f => f.name === key)).join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Raw Response Viewer */}
          {testResult?.rawResponse && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw Response</CardTitle>
                <CardDescription>
                  Complete API response from this node
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto">
                  {JSON.stringify(testResult.rawResponse, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
