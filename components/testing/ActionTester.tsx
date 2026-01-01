'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Play, AlertCircle, Loader2 } from 'lucide-react'
import { GenericConfiguration } from '@/components/workflows/configuration/providers/GenericConfiguration'
import { VariableDragProvider } from '@/components/workflows/configuration/VariableDragContext'
import { RequestResponseViewer } from './RequestResponseViewer'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useDebugStore } from '@/stores/debugStore'
import { useDynamicOptions } from '@/components/workflows/configuration/hooks/useDynamicOptions'
import { logger } from '@/lib/utils/logger'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'

interface ActionTesterProps {
  userId: string
}

export function ActionTester({ userId }: ActionTesterProps) {
  const { logEvent, logApiCall, logApiResponse, logApiError } = useDebugStore()
  const {
    getAllIntegrationsByProvider,
    fetchIntegrations,
    integrations
  } = useIntegrationStore()

  // Selection state
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [selectedAction, setSelectedAction] = useState<string>('')
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('')

  // Configuration state
  const [configValues, setConfigValues] = useState<Record<string, any>>({})
  const [configErrors, setConfigErrors] = useState<Record<string, string>>({})
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({})
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set())

  // Create stable getFormValues callback like ConfigurationForm does
  const configValuesRef = useRef(configValues)
  useEffect(() => {
    configValuesRef.current = configValues
  }, [configValues])
  const getFormValuesStable = useCallback(() => configValuesRef.current, [])

  // Test data state
  const [testDataJson, setTestDataJson] = useState<string>('{}')
  const [testDataError, setTestDataError] = useState<string>('')

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [requestDetails, setRequestDetails] = useState<any>(null)
  const [responseDetails, setResponseDetails] = useState<any>(null)
  const [isResultsExpanded, setIsResultsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'results' | 'request' | 'response' | 'validation'>('results')

  // Get unique providers from available nodes (actions only)
  const providers = React.useMemo(() => {
    const providerSet = new Set<string>()
    ALL_NODE_COMPONENTS
      .filter(node => node.type.includes('_action_'))
      .forEach(node => {
        if (node.providerId) {
          providerSet.add(node.providerId)
        }
      })
    return Array.from(providerSet).sort()
  }, [])

  // Get actions for selected provider
  const actionsForProvider = React.useMemo(() => {
    if (!selectedProvider) return []
    return ALL_NODE_COMPONENTS
      .filter(node =>
        node.providerId === selectedProvider &&
        node.type.includes('_action_')
      )
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [selectedProvider])

  // Get integrations for selected provider
  const integrationsForProvider = React.useMemo(() => {
    if (!selectedProvider) return []
    return getAllIntegrationsByProvider(selectedProvider)
      .filter(integration => integration.status === 'connected')
  }, [selectedProvider, integrations, getAllIntegrationsByProvider])

  // Get selected node info
  const selectedNode = React.useMemo(() => {
    if (!selectedAction) return null
    return ALL_NODE_COMPONENTS.find(node => node.type === selectedAction)
  }, [selectedAction])

  // Use shared hook for configuration field loading (same as workflow builder)
  const {
    dynamicOptions,
    loading: loadingDynamic,
    loadOptions,
    loadOptionsParallel,
  } = useDynamicOptions({
    nodeType: selectedNode?.type,
    providerId: selectedProvider,
    workflowId: undefined, // ActionTester doesn't have a workflow
    getFormValues: getFormValuesStable,
    onLoadingChange: (fieldName, isLoading) => {
      setLoadingFields(prev => {
        const next = new Set(prev)
        if (isLoading) next.add(fieldName)
        else next.delete(fieldName)
        return next
      })
    },
    initialOptions: {}, // ActionTester doesn't persist options
    onOptionsUpdated: () => {}, // No-op for ActionTester
  })

  // Load integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Reset when provider changes
  useEffect(() => {
    setSelectedAction('')
    setSelectedIntegrationId('')
    setConfigValues({})
    setConfigErrors({})
    setTestResult(null)
    setRequestDetails(null)
    setResponseDetails(null)
  }, [selectedProvider])

  // Reset when action changes
  useEffect(() => {
    setConfigValues({})
    setConfigErrors({})
    setTestResult(null)
    setRequestDetails(null)
    setResponseDetails(null)

    // Auto-select first integration if available
    if (integrationsForProvider.length > 0 && !selectedIntegrationId) {
      setSelectedIntegrationId(integrationsForProvider[0].id)
    }
  }, [selectedAction, integrationsForProvider, selectedIntegrationId])

  // Note: loadOptions and field loading on mount are now handled by useDynamicOptions hook
  // This ensures ActionTester uses the same configuration logic as the workflow builder

  // setValue handler
  const handleSetValue = useCallback((field: string, value: any) => {
    setConfigValues(prev => ({ ...prev, [field]: value }))
  }, [])

  // Analyze schema validation - compare config fields vs API response
  const analyzeSchemaValidation = useCallback((configSent: any, apiResponse: any) => {
    if (!selectedNode || !apiResponse) return null

    const configFields = Object.keys(configSent)
    const responseFields = Object.keys(apiResponse)

    // Fields we sent but API didn't return (could be ignored or input-only)
    const ignoredFields = configFields.filter(field => !responseFields.includes(field))

    // Fields API returned but we don't have in our schema
    const missingFields = responseFields.filter(field => {
      const inSchema = selectedNode.configSchema?.some((schema: any) => schema.name === field)
      return !inSchema
    })

    // Fields that matched (we sent and got back)
    const matchedFields = configFields.filter(field => responseFields.includes(field))

    return {
      ignoredFields,
      missingFields,
      matchedFields,
      configFields,
      responseFields
    }
  }, [selectedNode])

  // Execute test
  const executeTest = useCallback(async () => {
    if (!selectedNode || !selectedIntegrationId) {
      logger.error('[ActionTester] Missing required fields for test execution')
      return
    }

    // Validate test data JSON
    let testData: any = {}
    try {
      testData = JSON.parse(testDataJson)
    } catch (error) {
      setTestDataError('Invalid JSON format')
      return
    }
    setTestDataError('')

    setIsExecuting(true)
    setTestResult(null)
    setRequestDetails(null)
    setResponseDetails(null)

    try {
      const requestId = logApiCall('POST', '/api/test-action')
      logEvent('info', 'ActionTester', `Executing test for ${selectedNode.title}`, {
        nodeType: selectedNode.type,
        integrationId: selectedIntegrationId,
        configKeys: Object.keys(configValues)
      })

      const executionTimeoutMs = selectedNode.recommendedTimeoutMs || 30000

      const response = await fetchWithTimeout(
        '/api/test-action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeType: selectedNode.type,
            config: configValues,
            testData,
            integrationId: selectedIntegrationId
          })
        },
        executionTimeoutMs
      )

      const result = await response.json()
      logApiResponse(requestId, response.status, result, Date.now())

      if (result.success) {
        setTestResult(result.testResult)
        setRequestDetails(result.requestDetails)
        setResponseDetails(result.responseDetails)
        setActiveTab('results') // Start on results tab
        setIsResultsExpanded(true) // Auto-expand results after execution

        logEvent('info', 'ActionTester', `Test completed successfully`, {
          executionTime: result.testResult.executionTime
        })
      } else {
        setTestResult(result.testResult)
        setRequestDetails(result.requestDetails)
        setResponseDetails(result.responseDetails)
        setActiveTab('results') // Start on results tab
        setIsResultsExpanded(true) // Auto-expand results after execution

        logEvent('error', 'ActionTester', `Test failed: ${result.error}`, {
          error: result.error
        })
      }

    } catch (error: any) {
      logger.error('[ActionTester] Test execution failed', {
        error: error.message,
        stack: error.stack
      })
      logApiError('test-execution', error, Date.now())

      setTestResult({
        success: false,
        error: error.message,
        executionTime: 0,
        timestamp: new Date().toISOString()
      })
      setActiveTab('results') // Start on results tab
      setIsResultsExpanded(true) // Auto-expand results to show error
    } finally {
      setIsExecuting(false)
    }
  }, [
    selectedNode,
    selectedIntegrationId,
    configValues,
    testDataJson,
    logApiCall,
    logApiResponse,
    logEvent,
    logApiError
  ])

  const handleConfigSubmit = useCallback(async (values: Record<string, any>) => {
    // For testing tool, we don't actually submit - just execute the test
    await executeTest()
  }, [executeTest])

  const canExecute = selectedNode && selectedIntegrationId

  return (
    <TooltipProvider>
      <VariableDragProvider>
        <div className="h-full flex gap-4 p-6 overflow-hidden relative">
          {/* Left Column: Action Selection + Test Data */}
          <div className={`flex flex-col gap-4 flex-shrink-0 transition-all duration-300 ${isResultsExpanded ? 'w-80' : 'w-80'}`}>
            {/* Selection Section */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-3">Action Selection</h2>

              {/* Provider Selector */}
              <div className="space-y-2 mb-3">
                <Label className="text-xs">Provider</Label>
                <select
                  className="w-full p-2 border rounded-md bg-background text-sm"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                >
                  <option value="">Select a provider...</option>
                  {providers.map(provider => (
                    <option key={provider} value={provider}>
                      {provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Selector */}
              {selectedProvider && (
                <div className="space-y-2 mb-3">
                  <Label className="text-xs">Action</Label>
                  <select
                    className="w-full p-2 border rounded-md bg-background text-sm"
                    value={selectedAction}
                    onChange={(e) => setSelectedAction(e.target.value)}
                  >
                    <option value="">Select an action...</option>
                    {actionsForProvider.map(action => (
                      <option key={action.type} value={action.type}>
                        {action.title}
                      </option>
                    ))}
                  </select>
                  {selectedNode?.description && (
                    <p className="text-xs text-muted-foreground">{selectedNode.description}</p>
                  )}
                </div>
              )}

              {/* Integration Account Selector */}
              {selectedAction && (
                <div className="space-y-2">
                  <Label className="text-xs">Integration Account</Label>
                  {integrationsForProvider.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        No connected accounts found for {selectedProvider}.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <select
                      className="w-full p-2 border rounded-md bg-background text-sm"
                      value={selectedIntegrationId}
                      onChange={(e) => setSelectedIntegrationId(e.target.value)}
                    >
                      <option value="">Select an account...</option>
                      {integrationsForProvider.map(integration => (
                        <option key={integration.id} value={integration.id}>
                          {integration.account_identifier || integration.provider_id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </Card>

            {/* Results Section - Collapsed */}
            {selectedNode && selectedIntegrationId && !isResultsExpanded && (
              <Card className="p-4 flex-none">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsResultsExpanded(true)}>
                  <h3 className="text-lg font-semibold">Results</h3>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">+</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Click to expand results</p>
              </Card>
            )}

            {/* Results Section - Expanded (Overlay) */}
            {selectedNode && selectedIntegrationId && isResultsExpanded && (
              <div className="fixed inset-4 z-50 bg-background border rounded-lg shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-xl font-semibold">Test Results</h3>
                  <Button variant="ghost" size="sm" onClick={() => setIsResultsExpanded(false)}>
                    ✕
                  </Button>
                </div>

                {/* Tabs */}
                <div className="flex border-b px-4">
                  <button
                    onClick={() => setActiveTab('results')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'results'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Results
                  </button>
                  <button
                    onClick={() => setActiveTab('validation')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'validation'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Schema Validation
                    {requestDetails && responseDetails && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                        !
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('request')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'request'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Request
                  </button>
                  <button
                    onClick={() => setActiveTab('response')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'response'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Response
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                  {/* Results Tab */}
                  {activeTab === 'results' && (
                    <div className="space-y-4">
                      {testResult?.output && (
                        <div className="border rounded-md p-4 bg-muted/50">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-base font-semibold">Action Output</h4>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(testResult.output, null, 2))
                                logEvent('info', 'ActionTester', 'Copied action output to clipboard')
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                          <pre className="text-sm overflow-auto bg-background p-3 rounded">
                            {JSON.stringify(testResult.output, null, 2)}
                          </pre>
                        </div>
                      )}
                      {testResult?.error && (
                        <div className="border border-red-500 rounded-md p-4 bg-red-500/10">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-base font-semibold text-red-600 dark:text-red-400">Error Details</h4>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(testResult.error)
                                logEvent('info', 'ActionTester', 'Copied error to clipboard')
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                          <pre className="text-sm overflow-auto text-red-600 dark:text-red-400">
                            {testResult.error}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Schema Validation Tab */}
                  {activeTab === 'validation' && requestDetails && responseDetails && (() => {
                    // The requestDetails.config contains the config sent
                    // The responseDetails.data contains the API response
                    const validation = analyzeSchemaValidation(
                      requestDetails.config || {},
                      responseDetails.data || {}
                    )

                    if (!validation) {
                      return <p className="text-muted-foreground">No validation data available</p>
                    }

                    return (
                      <div className="space-y-6">
                        <div className="text-sm text-muted-foreground">
                          Comparing configuration fields vs API response to detect mismatches
                        </div>

                        {/* Matched Fields */}
                        {validation.matchedFields.length > 0 && (
                          <div className="border rounded-md p-4 bg-green-500/10 border-green-500/30">
                            <h4 className="text-base font-semibold mb-3 text-green-700 dark:text-green-400 flex items-center gap-2">
                              <span className="text-lg">✅</span> Matched Fields ({validation.matchedFields.length})
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3">
                              Fields that were sent in the request and returned in the response
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {validation.matchedFields.map(field => (
                                <span key={field} className="px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-300 rounded text-sm font-mono">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ignored/Input-Only Fields */}
                        {validation.ignoredFields.length > 0 && (
                          <div className="border rounded-md p-4 bg-yellow-500/10 border-yellow-500/30">
                            <h4 className="text-base font-semibold mb-3 text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                              <span className="text-lg">⚠️</span> Fields Not in Response ({validation.ignoredFields.length})
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3">
                              These fields were sent in the request but didn't appear in the API response. This could mean:
                              <br />• They are input-only fields (normal for create/update actions)
                              <br />• The API ignored them (possibly unsupported fields that should be removed from schema)
                            </p>
                            <div className="flex flex-wrap gap-2 mb-4">
                              {validation.ignoredFields.map(field => (
                                <span key={field} className="px-2 py-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 rounded text-sm font-mono">
                                  {field}
                                </span>
                              ))}
                            </div>
                            <div className="bg-background p-3 rounded text-xs">
                              <p className="font-semibold mb-2">💡 Suggested Action:</p>
                              <p className="text-muted-foreground">
                                Review these fields in the node configuration schema. If they are NOT input-only fields and the API doesn't support them, consider removing them from:
                              </p>
                              <code className="block mt-2 text-xs">
                                /lib/workflows/nodes/providers/{selectedProvider}/index.ts
                              </code>
                            </div>
                          </div>
                        )}

                        {/* Missing Fields in Schema */}
                        {validation.missingFields.length > 0 && (
                          <div className="border rounded-md p-4 bg-orange-500/10 border-orange-500/30">
                            <h4 className="text-base font-semibold mb-3 text-orange-700 dark:text-orange-400 flex items-center gap-2">
                              <span className="text-lg">💡</span> Fields Not in Schema ({validation.missingFields.length})
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3">
                              The API returned these fields, but they're not defined in our configuration schema. Consider adding them to capture more data.
                            </p>
                            <div className="flex flex-wrap gap-2 mb-4">
                              {validation.missingFields.map(field => (
                                <span key={field} className="px-2 py-1 bg-orange-500/20 text-orange-700 dark:text-orange-300 rounded text-sm font-mono">
                                  {field}
                                </span>
                              ))}
                            </div>
                            <div className="bg-background p-3 rounded text-xs space-y-2">
                              <p className="font-semibold">🔧 Auto-Generated Fix:</p>
                              <p className="text-muted-foreground">Add these fields to the output schema:</p>
                              <pre className="bg-muted p-3 rounded overflow-auto text-xs">
{`outputSchema: [
  // ... existing fields ...
${validation.missingFields.map(field => {
  const responseValue = responseDetails.data?.[field]
  const fieldType = Array.isArray(responseValue) ? 'array' : typeof responseValue
  return `  { name: "${field}", label: "${field.charAt(0).toUpperCase() + field.slice(1)}", type: "${fieldType}", description: "TODO: Add description" }`
}).join(',\n')}
]`}
                              </pre>
                            </div>
                          </div>
                        )}

                        {/* Summary */}
                        <div className="border rounded-md p-4 bg-muted/50">
                          <h4 className="text-base font-semibold mb-3">Summary</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Config Fields Sent</p>
                              <p className="text-2xl font-bold">{validation.configFields.length}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Response Fields Received</p>
                              <p className="text-2xl font-bold">{validation.responseFields.length}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Matched</p>
                              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{validation.matchedFields.length}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Mismatches</p>
                              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                                {validation.ignoredFields.length + validation.missingFields.length}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Request Tab */}
                  {activeTab === 'request' && requestDetails && (
                    <div className="border rounded-md p-4 bg-muted/50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-base font-semibold">Request Details</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(requestDetails, null, 2))
                            logEvent('info', 'ActionTester', 'Copied request details to clipboard')
                          }}
                        >
                          Copy All
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Method & Endpoint</p>
                          <p className="text-sm font-mono">{requestDetails.method} {requestDetails.endpoint}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Integration ID</p>
                          <p className="text-sm font-mono">{requestDetails.integrationId}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Configuration Sent</p>
                          <pre className="text-xs overflow-auto bg-background p-3 rounded max-h-96">
                            {JSON.stringify(requestDetails.config, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Response Tab */}
                  {activeTab === 'response' && responseDetails && (
                    <div className="border rounded-md p-4 bg-muted/50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-base font-semibold">Response Details</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(responseDetails, null, 2))
                            logEvent('info', 'ActionTester', 'Copied response details to clipboard')
                          }}
                        >
                          Copy All
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Status Code</p>
                          <p className={`text-sm font-mono ${
                            responseDetails.statusCode >= 200 && responseDetails.statusCode < 300
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {responseDetails.statusCode}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Execution Time</p>
                          <p className="text-sm font-mono">{responseDetails.executionTime}ms</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Timestamp</p>
                          <p className="text-sm font-mono">{responseDetails.timestamp}</p>
                        </div>
                        {responseDetails.data && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Response Data (API Output)</p>
                            <pre className="text-xs overflow-auto bg-background p-3 rounded max-h-96">
                              {JSON.stringify(responseDetails.data, null, 2)}
                            </pre>
                          </div>
                        )}
                        {responseDetails.error && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Error</p>
                            <pre className="text-xs overflow-auto bg-background p-3 rounded text-red-600 dark:text-red-400">
                              {responseDetails.error}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Test Data Input */}
            {selectedNode && selectedIntegrationId && (
              <Card className="p-4">
                <Label className="text-sm mb-2 block">Test Context Data</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Optional: Data from previous nodes
                </p>
                <Textarea
                  value={testDataJson}
                  onChange={(e) => setTestDataJson(e.target.value)}
                  placeholder='{"field": "value"}'
                  className="font-mono text-xs min-h-[120px]"
                />
                {testDataError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{testDataError}</p>
                )}

                {/* Execute Button */}
                <Button
                  onClick={executeTest}
                  disabled={!canExecute || isExecuting}
                  size="lg"
                  className="w-full mt-3"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Execute Test
                    </>
                  )}
                </Button>
              </Card>
            )}
          </div>

          {/* Right Column: Configuration */}
          {selectedNode && selectedIntegrationId && (
            <Card className="flex-1 p-6 overflow-auto">
              <h3 className="text-xl font-semibold mb-4">Configuration</h3>
              {selectedNode?.configSchema && selectedNode.configSchema.length > 0 ? (
                <GenericConfiguration
                  nodeInfo={selectedNode}
                  values={configValues}
                  setValue={handleSetValue}
                  errors={configErrors}
                  onSubmit={handleConfigSubmit}
                  onCancel={() => {}}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingDynamic}
                  loadOptions={loadOptions}
                  integrationId={selectedIntegrationId}
                  aiFields={aiFields}
                  setAiFields={setAiFields}
                  loadingFields={loadingFields}
                  needsConnection={false}
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  This action has no configuration fields.
                </div>
              )}
            </Card>
          )}
        </div>
      </VariableDragProvider>
    </TooltipProvider>
  )
}
