'use client'

import React, { useState, useCallback, useEffect } from 'react'
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
import { logger } from '@/lib/utils/logger'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { getResourceTypeForField } from '@/components/workflows/configuration/config/fieldMappings'

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
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({})
  const [loadingDynamic, setLoadingDynamic] = useState(false)
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({})
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set())

  // Test data state
  const [testDataJson, setTestDataJson] = useState<string>('{}')
  const [testDataError, setTestDataError] = useState<string>('')

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [requestDetails, setRequestDetails] = useState<any>(null)
  const [responseDetails, setResponseDetails] = useState<any>(null)
  const [isResultsExpanded, setIsResultsExpanded] = useState(false)

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
    setDynamicOptions({})
    setTestResult(null)
    setRequestDetails(null)
    setResponseDetails(null)
  }, [selectedProvider])

  // Reset when action changes
  useEffect(() => {
    setConfigValues({})
    setConfigErrors({})
    setDynamicOptions({})
    setTestResult(null)
    setRequestDetails(null)
    setResponseDetails(null)

    // Auto-select first integration if available
    if (integrationsForProvider.length > 0 && !selectedIntegrationId) {
      setSelectedIntegrationId(integrationsForProvider[0].id)
    }
  }, [selectedAction, integrationsForProvider, selectedIntegrationId])

  // Load dynamic options
  const loadOptions = useCallback(async (
    fieldName: string,
    parentField?: string,
    parentValue?: any,
    forceReload?: boolean
  ) => {
    if (!selectedProvider || !selectedIntegrationId) {
      logger.debug('[ActionTester] Cannot load options - missing provider or integration')
      return
    }

    setLoadingDynamic(true)
    setLoadingFields(prev => new Set([...prev, fieldName]))

    try {
      const requestId = logApiCall('POST', `/api/integrations/${selectedProvider}/data`)

      // Convert field name to resource type (e.g., "boardId" -> "trello_boards")
      const resourceType = getResourceTypeForField(fieldName, selectedNode?.type)

      logger.debug('[ActionTester] Loading options', {
        fieldName,
        nodeType: selectedNode?.type,
        resourceType,
        provider: selectedProvider
      })

      // If resourceType is undefined, fall back to fieldName
      const dataType = resourceType || fieldName

      // Build options from current config values and parent value
      const options: Record<string, any> = { ...configValues }
      if (parentValue !== undefined && parentField) {
        options[parentField] = parentValue
      }

      const response = await fetchWithTimeout(
        `/api/integrations/${selectedProvider}/data`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId: selectedIntegrationId,
            dataType, // Use dataType (resourceType or fallback to fieldName)
            options
          })
        },
        8000
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[ActionTester] Load options failed', {
          fieldName,
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Failed to load options: ${response.statusText}`)
      }

      const result = await response.json()
      logApiResponse(requestId, response.status, result, Date.now())

      // Transform raw API data to {value, label} format expected by GenericConfiguration
      const rawData = result.data || []
      const transformedData = rawData.map((item: any) => {
        // Handle different data structures from various providers
        if (item.value && item.label) {
          // Already in correct format
          return item
        } else if (item.id && item.name) {
          // Common format: id + name (Trello, etc.)
          return { value: item.id, label: item.name }
        } else if (item.id && item.title) {
          // Alternative: id + title
          return { value: item.id, label: item.title }
        } else if (typeof item === 'string') {
          // Simple string values
          return { value: item, label: item }
        } else {
          // Fallback: use first available property as label
          const value = item.id || item.value || JSON.stringify(item)
          const label = item.name || item.label || item.title || value
          return { value, label }
        }
      })

      setDynamicOptions(prev => ({
        ...prev,
        [fieldName]: transformedData
      }))

      logEvent('info', 'ActionTester', `Loaded ${transformedData.length} options for ${fieldName}`)

    } catch (error: any) {
      logger.error('[ActionTester] Failed to load options', {
        fieldName,
        error: error.message
      })
      logApiError('load-options', error, Date.now())

      // Don't throw - just log and continue
      // This prevents the UI from breaking if one field fails to load
    } finally {
      setLoadingDynamic(false)
      setLoadingFields(prev => {
        const next = new Set(prev)
        next.delete(fieldName)
        return next
      })
    }
  }, [selectedProvider, selectedIntegrationId, selectedNode, configValues, logApiCall, logApiResponse, logEvent, logApiError])

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
        30000 // 30 second timeout for action execution
      )

      const result = await response.json()
      logApiResponse(requestId, response.status, result, Date.now())

      if (result.success) {
        setTestResult(result.testResult)
        setRequestDetails(result.requestDetails)
        setResponseDetails(result.responseDetails)
        setIsResultsExpanded(true) // Auto-expand results after execution

        logEvent('info', 'ActionTester', `Test completed successfully`, {
          executionTime: result.testResult.executionTime
        })
      } else {
        setTestResult(result.testResult)
        setRequestDetails(result.requestDetails)
        setResponseDetails(result.responseDetails)
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
                <div className="flex-1 overflow-auto p-6 space-y-4">
                  <RequestResponseViewer
                    requestDetails={requestDetails}
                    responseDetails={responseDetails}
                    success={testResult?.success || false}
                  />
                  {testResult?.output && (
                    <div className="border rounded-md p-4 bg-muted/50">
                      <h4 className="text-base font-semibold mb-3">Action Output</h4>
                      <pre className="text-sm overflow-auto bg-background p-3 rounded">
                        {JSON.stringify(testResult.output, null, 2)}
                      </pre>
                    </div>
                  )}
                  {testResult?.error && (
                    <div className="border border-red-500 rounded-md p-4 bg-red-500/10">
                      <h4 className="text-base font-semibold mb-3 text-red-600 dark:text-red-400">Error Details</h4>
                      <pre className="text-sm overflow-auto text-red-600 dark:text-red-400">
                        {testResult.error}
                      </pre>
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
                  setValue={(field, value) => setConfigValues(prev => ({ ...prev, [field]: value }))}
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
