'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  Play,
  Square,
  AlertCircle,
  Loader2,
  Copy,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  Radio,
  ChevronDown,
  ChevronUp,
  Filter,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { GenericConfiguration } from '@/components/workflows/configuration/providers/GenericConfiguration'
import { VariableDragProvider } from '@/components/workflows/configuration/VariableDragContext'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useDebugStore } from '@/stores/debugStore'
import { useDynamicOptions } from '@/components/workflows/configuration/hooks/useDynamicOptions'
import { useTriggerTest, DebugLogEntry, TriggerTestStatus } from './hooks/useTriggerTest'

interface TriggerTesterProps {
  userId: string
}

export function TriggerTester({ userId }: TriggerTesterProps) {
  const { logEvent } = useDebugStore()
  const {
    getAllIntegrationsByProvider,
    fetchIntegrations,
    integrations
  } = useIntegrationStore()

  // Selection state
  const [workflows, setWorkflows] = useState<any[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [workflowNodes, setWorkflowNodes] = useState<any[]>([])
  const [workflowConnections, setWorkflowConnections] = useState<any[]>([])
  const [workflowLoadError, setWorkflowLoadError] = useState<string | null>(null)
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(false)
  const [selectedWorkflowTriggerNodeId, setSelectedWorkflowTriggerNodeId] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [selectedTrigger, setSelectedTrigger] = useState<string>('')
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

  // Results display state
  const [isResultsExpanded, setIsResultsExpanded] = useState(false)
  const [isDebugLogsExpanded, setIsDebugLogsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'results' | 'logs' | 'config'>('results')
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all')
  const [isLogsCollapsed, setIsLogsCollapsed] = useState(false)

  // Countdown timer state
  const [countdownSeconds, setCountdownSeconds] = useState(60)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize trigger test hook
  const {
    startTest,
    stopTest,
    testSessionId,
    workflowId,
    status,
    webhookUrl,
    isLoading,
    error,
    triggerData,
    expiresAt,
    debugLogs,
    addLog,
    clearLogs,
    formatLogsForCopy
  } = useTriggerTest({
    onTriggerReceived: (data) => {
      logEvent('info', 'TriggerTester', 'Trigger event received', { dataKeys: Object.keys(data) })
      setIsResultsExpanded(true)
      setActiveTab('results')
      stopCountdown()
    },
    onTimeout: () => {
      logEvent('warn', 'TriggerTester', 'Trigger test timed out')
      stopCountdown()
    },
    onError: (message, details) => {
      logEvent('error', 'TriggerTester', `Test error: ${message}`, details)
      stopCountdown()
    },
    onStatusChange: (newStatus) => {
      if (newStatus === 'listening') {
        startCountdown()
      } else if (newStatus !== 'starting') {
        stopCountdown()
      }
    }
  })

  // Countdown timer functions
  const startCountdown = useCallback(() => {
    setCountdownSeconds(60)
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }
    countdownIntervalRef.current = setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const stopCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }, [])

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
    }
  }, [])

  // Get unique providers from available nodes (triggers only)
  const providers = React.useMemo(() => {
    const providerSet = new Set<string>()
    ALL_NODE_COMPONENTS
      .filter(node => node.isTrigger === true)
      .forEach(node => {
        if (node.providerId) {
          providerSet.add(node.providerId)
        }
      })
    return Array.from(providerSet).sort()
  }, [])

  // Get triggers for selected provider
  const triggersForProvider = React.useMemo(() => {
    if (!selectedProvider) return []
    return ALL_NODE_COMPONENTS
      .filter(node =>
        node.providerId === selectedProvider &&
        node.isTrigger === true
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
    if (!selectedTrigger) return null
    return ALL_NODE_COMPONENTS.find(node => node.type === selectedTrigger)
  }, [selectedTrigger])

  // Use shared hook for configuration field loading (same as workflow builder)
  const {
    dynamicOptions,
    loading: loadingDynamic,
    loadOptions,
    resetOptions,
  } = useDynamicOptions({
    nodeType: selectedNode?.type,
    providerId: selectedProvider,
    workflowId: selectedWorkflowId || undefined,
    getFormValues: getFormValuesStable,
    onLoadingChange: (fieldName, isLoading) => {
      setLoadingFields(prev => {
        const next = new Set(prev)
        if (isLoading) next.add(fieldName)
        else next.delete(fieldName)
        return next
      })
    },
    initialOptions: {},
    onOptionsUpdated: () => {},
  })

  // Load workflows on mount
  useEffect(() => {
    const loadWorkflows = async () => {
      setIsWorkflowLoading(true)
      setWorkflowLoadError(null)
      try {
        const response = await fetch('/api/workflows')
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load workflows')
        }
        setWorkflows(Array.isArray(data?.data) ? data.data : [])
      } catch (err: any) {
        setWorkflowLoadError(err.message || 'Failed to load workflows')
      } finally {
        setIsWorkflowLoading(false)
      }
    }

    loadWorkflows()
  }, [])

  // Load integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Load selected workflow details
  useEffect(() => {
    const loadWorkflow = async () => {
      if (!selectedWorkflowId) {
        setWorkflowNodes([])
        setWorkflowConnections([])
        setSelectedWorkflowTriggerNodeId('')
        setSelectedProvider('')
        setSelectedTrigger('')
        setSelectedIntegrationId('')
        setConfigValues({})
        setConfigErrors({})
        return
      }

      setIsWorkflowLoading(true)
      setWorkflowLoadError(null)
      try {
        const response = await fetch(`/api/workflows/${selectedWorkflowId}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load workflow')
        }

        setWorkflowNodes(Array.isArray(data?.nodes) ? data.nodes : data?.data?.nodes || [])
        setWorkflowConnections(Array.isArray(data?.connections) ? data.connections : data?.data?.connections || [])
        setSelectedWorkflowTriggerNodeId('')
        setSelectedProvider('')
        setSelectedTrigger('')
        setSelectedIntegrationId('')
        setConfigValues({})
        setConfigErrors({})
      } catch (err: any) {
        setWorkflowLoadError(err.message || 'Failed to load workflow')
        setWorkflowNodes([])
        setWorkflowConnections([])
        setSelectedWorkflowTriggerNodeId('')
      } finally {
        setIsWorkflowLoading(false)
      }
    }

    loadWorkflow()
  }, [selectedWorkflowId])

  const workflowTriggerNodes = React.useMemo(() => {
    if (!selectedWorkflowId) return []
    const triggerTypes = new Set(
      ALL_NODE_COMPONENTS.filter(node => node.isTrigger === true).map(node => node.type)
    )
    return workflowNodes.filter((node: any) => {
      const nodeType = node?.data?.type || node?.type || ''
      return Boolean(
        node?.isTrigger ||
          node?.data?.isTrigger ||
          (nodeType && triggerTypes.has(nodeType))
      )
    })
  }, [selectedWorkflowId, workflowNodes])

  // Reset when provider changes
  useEffect(() => {
    if (!selectedWorkflowId) {
      setSelectedTrigger('')
      setSelectedIntegrationId('')
    }
    setConfigValues({})
    setConfigErrors({})
  }, [selectedProvider, selectedWorkflowId])

  // Reset when trigger changes
  useEffect(() => {
    if (!selectedWorkflowId) {
      setConfigValues({})
      setConfigErrors({})
    }

    // Auto-select first integration if available
    if (integrationsForProvider.length > 0 && !selectedIntegrationId) {
      setSelectedIntegrationId(integrationsForProvider[0].id)
    }
  }, [selectedTrigger, integrationsForProvider, selectedIntegrationId, selectedWorkflowId])

  // Hydrate selection from workflow trigger node
  useEffect(() => {
    if (!selectedWorkflowId || !selectedWorkflowTriggerNodeId) return

    const node = workflowNodes.find((item: any) => item?.id === selectedWorkflowTriggerNodeId)
    if (!node) return

    const providerId = node?.data?.providerId || ''
    const triggerType = node?.data?.type || node?.type || ''
    const config = node?.data?.config || {}
    const integrationId = config?.integrationId || ''

    setSelectedProvider(providerId)
    setSelectedTrigger(triggerType)
    setConfigValues(config)
    setSelectedIntegrationId(integrationId)
  }, [selectedWorkflowId, selectedWorkflowTriggerNodeId, workflowNodes])

  // setValue handler
  const handleSetValue = useCallback((field: string, value: any) => {
    setConfigValues(prev => ({ ...prev, [field]: value }))
  }, [])

  // Start trigger test
  const handleStartTest = useCallback(async () => {
    if (!selectedNode || !selectedIntegrationId) {
      addLog('error', 'Config', 'Missing required fields for test', {
        hasNode: !!selectedNode,
        hasIntegration: !!selectedIntegrationId
      })
      return
    }

    const updatedConfig = {
      ...configValues,
      integrationId: selectedIntegrationId
    }

    if (selectedWorkflowId && selectedWorkflowTriggerNodeId) {
      const updatedNodes = workflowNodes.map((node: any) => {
        if (node?.id !== selectedWorkflowTriggerNodeId) return node
        return {
          ...node,
          data: {
            ...node.data,
            config: updatedConfig
          }
        }
      })

      addLog('info', 'Config', 'Saving workflow updates before test', {
        workflowId: selectedWorkflowId,
        triggerNodeId: selectedWorkflowTriggerNodeId,
        configKeys: Object.keys(updatedConfig)
      })

      try {
        const saveResponse = await fetch(`/api/workflows/${selectedWorkflowId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodes: updatedNodes,
            connections: workflowConnections
          })
        })

        const saveResult = await saveResponse.json().catch(() => ({}))
        if (!saveResponse.ok) {
          addLog('error', 'API', 'Failed to save workflow updates', {
            status: saveResponse.status,
            error: saveResult.error
          })
          return
        }
      } catch (err: any) {
        addLog('error', 'API', 'Failed to save workflow updates', {
          error: err.message
        })
        return
      }

      addLog('info', 'Config', 'Starting trigger test with workflow', {
        nodeId: selectedWorkflowTriggerNodeId,
        workflowId: selectedWorkflowId,
        providerId: selectedProvider,
        triggerType: selectedTrigger
      })

      await startTest({
        nodeId: selectedWorkflowTriggerNodeId,
        nodes: updatedNodes,
        connections: workflowConnections,
        workflowId: selectedWorkflowId
      })

      return
    }

    // Create mock trigger node (unsaved workflow)
    const mockTriggerNode = {
      id: `test-trigger-${Date.now()}`,
      type: selectedTrigger,
      data: {
        ...selectedNode,
        isTrigger: true,
        providerId: selectedProvider,
        type: selectedTrigger,
        config: updatedConfig
      },
      position: { x: 0, y: 0 }
    }

    addLog('info', 'Config', 'Starting trigger test with configuration', {
      nodeId: mockTriggerNode.id,
      providerId: selectedProvider,
      triggerType: selectedTrigger,
      configKeys: Object.keys(updatedConfig)
    })

    await startTest({
      nodeId: mockTriggerNode.id,
      nodes: [mockTriggerNode],
      connections: []
    })
  }, [
    selectedNode,
    selectedIntegrationId,
    selectedProvider,
    selectedTrigger,
    configValues,
    selectedWorkflowId,
    selectedWorkflowTriggerNodeId,
    workflowNodes,
    workflowConnections,
    startTest,
    addLog
  ])

  // Stop trigger test
  const handleStopTest = useCallback(async () => {
    addLog('info', 'Lifecycle', 'User requested test stop')
    await stopTest()
  }, [stopTest, addLog])

  // Copy webhook URL to clipboard
  const copyWebhookUrl = useCallback(() => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl)
      addLog('info', 'API', 'Webhook URL copied to clipboard')
    }
  }, [webhookUrl, addLog])

  // Copy logs to clipboard
  const copyLogs = useCallback(() => {
    const formattedLogs = formatLogsForCopy()
    navigator.clipboard.writeText(formattedLogs)
    addLog('info', 'API', 'Debug logs copied to clipboard')
  }, [formatLogsForCopy, addLog])

  // Filter logs
  const filteredLogs = React.useMemo(() => {
    if (logFilter === 'all') return debugLogs
    return debugLogs.filter(log => log.level === logFilter)
  }, [debugLogs, logFilter])

  // Get status display
  const getStatusDisplay = () => {
    switch (status) {
      case 'idle':
        return { icon: <Radio className="w-4 h-4" />, text: 'Ready', color: 'text-muted-foreground' }
      case 'starting':
        return { icon: <Loader2 className="w-4 h-4 animate-spin" />, text: 'Starting...', color: 'text-blue-500' }
      case 'listening':
        return { icon: <Radio className="w-4 h-4 animate-pulse" />, text: `Listening (${countdownSeconds}s)`, color: 'text-green-500' }
      case 'received':
        return { icon: <CheckCircle className="w-4 h-4" />, text: 'Event Received!', color: 'text-green-600' }
      case 'timeout':
        return { icon: <Clock className="w-4 h-4" />, text: 'Timeout', color: 'text-yellow-600' }
      case 'error':
        return { icon: <XCircle className="w-4 h-4" />, text: 'Error', color: 'text-red-600' }
      case 'stopped':
        return { icon: <Square className="w-4 h-4" />, text: 'Stopped', color: 'text-muted-foreground' }
      default:
        return { icon: <Radio className="w-4 h-4" />, text: 'Unknown', color: 'text-muted-foreground' }
    }
  }

  const statusDisplay = getStatusDisplay()
  const canStartTest = selectedNode && selectedIntegrationId && status === 'idle'
  const isTestActive = status === 'starting' || status === 'listening'

  const handleConfigSubmit = useCallback(async () => {
    // For testing tool, we don't actually submit - just start the test
    await handleStartTest()
  }, [handleStartTest])

  return (
    <TooltipProvider>
      <VariableDragProvider>
        <div className="h-full flex gap-4 p-6 overflow-hidden relative">
          {/* Left Column: Trigger Selection + Controls */}
          <div className="flex flex-col gap-4 flex-shrink-0 w-80">
            {/* Selection Section */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-3">Trigger Selection</h2>

              {/* Workflow Selector */}
              <div className="space-y-2 mb-3">
                <Label className="text-xs">Workflow</Label>
                <select
                  className="w-full p-2 border rounded-md bg-background text-sm"
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  disabled={isTestActive || isWorkflowLoading}
                >
                  <option value="">Use unsaved test workflow...</option>
                  {workflows.map(workflow => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name || workflow.id}
                    </option>
                  ))}
                </select>
                {workflowLoadError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{workflowLoadError}</p>
                )}
              </div>

              {/* Workflow Trigger Selector */}
              {selectedWorkflowId && (
                <div className="space-y-2 mb-3">
                  <Label className="text-xs">Workflow Trigger</Label>
                  {workflowTriggerNodes.length === 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        This workflow has no trigger nodes.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <select
                      className="w-full p-2 border rounded-md bg-background text-sm"
                      value={selectedWorkflowTriggerNodeId}
                      onChange={(e) => setSelectedWorkflowTriggerNodeId(e.target.value)}
                      disabled={isTestActive || isWorkflowLoading}
                    >
                      <option value="">Select a trigger node...</option>
                      {workflowTriggerNodes.map(node => (
                        <option key={node.id} value={node.id}>
                          {node?.data?.label || node?.data?.title || node?.data?.type || node.id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Provider Selector */}
              {!selectedWorkflowId && (
                <div className="space-y-2 mb-3">
                  <Label className="text-xs">Provider</Label>
                  <select
                    className="w-full p-2 border rounded-md bg-background text-sm"
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    disabled={isTestActive}
                  >
                    <option value="">Select a provider...</option>
                    {providers.map(provider => (
                      <option key={provider} value={provider}>
                        {provider.charAt(0).toUpperCase() + provider.slice(1).replace(/-/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Trigger Selector */}
              {!selectedWorkflowId && selectedProvider && (
                <div className="space-y-2 mb-3">
                  <Label className="text-xs">Trigger</Label>
                  <select
                    className="w-full p-2 border rounded-md bg-background text-sm"
                    value={selectedTrigger}
                    onChange={(e) => setSelectedTrigger(e.target.value)}
                    disabled={isTestActive}
                  >
                    <option value="">Select a trigger...</option>
                    {triggersForProvider.map(trigger => (
                      <option key={trigger.type} value={trigger.type}>
                        {trigger.title}
                      </option>
                    ))}
                  </select>
                  {selectedNode?.description && (
                    <p className="text-xs text-muted-foreground">{selectedNode.description}</p>
                  )}
                </div>
              )}

              {/* Integration Account Selector */}
              {selectedTrigger && (
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
                      disabled={isTestActive}
                    >
                      <option value="">Select an account...</option>
                      {integrationsForProvider.map(integration => (
                        <option key={integration.id} value={integration.id}>
                          {integration.email || integration.account_name || integration.username || integration.provider}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </Card>

            {/* Test Controls */}
            {selectedNode && selectedIntegrationId && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Test Controls</h3>
                  <Badge variant="outline" className={statusDisplay.color}>
                    {statusDisplay.icon}
                    <span className="ml-1">{statusDisplay.text}</span>
                  </Badge>
                </div>

                {/* Webhook URL Display */}
                {webhookUrl && status === 'listening' && (
                  <div className="mb-3 p-2 bg-muted rounded-md">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Webhook URL</Label>
                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={copyWebhookUrl}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs font-mono break-all text-muted-foreground">
                      {webhookUrl}
                    </p>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                {/* Test Buttons */}
                <div className="flex gap-2">
                  {!isTestActive ? (
                    <Button
                      onClick={handleStartTest}
                      disabled={!canStartTest || isLoading}
                      size="lg"
                      className="flex-1"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Start Listening
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStopTest}
                      variant="destructive"
                      size="lg"
                      className="flex-1"
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Stop Test
                    </Button>
                  )}
                </div>

                {selectedWorkflowId && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Workflow changes are saved before the test starts.
                  </p>
                )}

                {status === 'listening' && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Waiting for webhook event... Send a test event to the webhook URL above.
                  </p>
                )}
              </Card>
            )}

            {/* Results Preview (collapsed) */}
            {selectedNode && selectedIntegrationId && !isResultsExpanded && (status === 'received' || triggerData) && (
              <Card className="p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setIsResultsExpanded(true)}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">Event Received!</h3>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">+</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Click to view event data</p>
              </Card>
            )}

            {/* Debug Logs Panel */}
            {selectedNode && selectedIntegrationId && (
              <Card className="p-4 flex-1 overflow-hidden flex flex-col">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setIsLogsCollapsed(!isLogsCollapsed)}
                >
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    Debug Logs
                    {debugLogs.some(l => l.level === 'error') && (
                      <Badge variant="destructive" className="text-xs">
                        {debugLogs.filter(l => l.level === 'error').length} errors
                      </Badge>
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={(e) => { e.stopPropagation(); setIsDebugLogsExpanded(true); }} title="Expand logs">
                      <Maximize2 className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={(e) => { e.stopPropagation(); copyLogs(); }} title="Copy logs">
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={(e) => { e.stopPropagation(); clearLogs(); }} title="Clear logs">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    {isLogsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </div>
                </div>

                {!isLogsCollapsed && (
                  <>
                    {/* Log Filters */}
                    <div className="flex gap-1 mt-2 mb-2">
                      {(['all', 'info', 'warn', 'error', 'debug'] as const).map(filter => (
                        <Button
                          key={filter}
                          variant={logFilter === filter ? 'default' : 'ghost'}
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setLogFilter(filter)}
                        >
                          {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                        </Button>
                      ))}
                    </div>

                    {/* Log Entries */}
                    <div className="flex-1 overflow-auto bg-muted/50 rounded-md p-2 font-mono text-xs space-y-1">
                      {filteredLogs.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No logs yet</p>
                      ) : (
                        filteredLogs.map((log, idx) => (
                          <div key={idx} className={`
                            ${log.level === 'error' ? 'text-red-600 dark:text-red-400' : ''}
                            ${log.level === 'warn' ? 'text-yellow-600 dark:text-yellow-400' : ''}
                            ${log.level === 'info' ? 'text-foreground' : ''}
                            ${log.level === 'debug' ? 'text-muted-foreground' : ''}
                          `}>
                            <span className="text-muted-foreground">
                              {log.timestamp.split('T')[1]?.split('.')[0]}
                            </span>
                            {' '}
                            <span className="font-semibold">[{log.level.toUpperCase()}]</span>
                            {' '}
                            <span className="text-blue-500 dark:text-blue-400">[{log.category}]</span>
                            {' '}
                            {log.message}
                            {log.details && (
                              <div className="ml-4 text-muted-foreground">
                                {Object.entries(log.details).map(([key, value]) => (
                                  <div key={key}>
                                    └─ {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </Card>
            )}
          </div>

          {/* Right Column: Configuration */}
          {selectedNode && selectedIntegrationId && (
            <Card className="flex-1 p-6 overflow-auto">
              <h3 className="text-xl font-semibold mb-4">Trigger Configuration</h3>
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
                  resetOptions={resetOptions}
                  integrationId={selectedIntegrationId}
                  aiFields={aiFields}
                  setAiFields={setAiFields}
                  loadingFields={loadingFields}
                  needsConnection={false}
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  This trigger has no configuration fields.
                </div>
              )}
            </Card>
          )}

          {/* Results Overlay (expanded) */}
          {selectedNode && selectedIntegrationId && isResultsExpanded && (
            <div className="fixed inset-4 z-50 bg-background border rounded-lg shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-xl font-semibold">Trigger Test Results</h3>
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
                  Event Data
                </button>
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'logs'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Debug Logs
                  {debugLogs.some(l => l.level === 'error') && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-red-500/20 text-red-700 dark:text-red-300">
                      {debugLogs.filter(l => l.level === 'error').length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('config')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'config'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Test Config
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                {/* Event Data Tab */}
                {activeTab === 'results' && (
                  <div className="space-y-4">
                    {triggerData ? (
                      <div className="border rounded-md p-4 bg-green-500/10 border-green-500/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-base font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5" />
                            Trigger Event Received
                          </h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(triggerData, null, 2))
                              addLog('info', 'API', 'Event data copied to clipboard')
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                        <pre className="text-sm overflow-auto bg-background p-3 rounded max-h-96">
                          {JSON.stringify(triggerData, null, 2)}
                        </pre>
                      </div>
                    ) : status === 'timeout' ? (
                      <div className="border rounded-md p-4 bg-yellow-500/10 border-yellow-500/30">
                        <h4 className="text-base font-semibold text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                          <Clock className="w-5 h-5" />
                          Test Timed Out
                        </h4>
                        <p className="text-sm text-muted-foreground mt-2">
                          No trigger event was received within the timeout period. Try:
                        </p>
                        <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside">
                          <li>Sending a test event to the webhook URL</li>
                          <li>Checking that the integration account has proper permissions</li>
                          <li>Reviewing the debug logs for errors</li>
                        </ul>
                      </div>
                    ) : error ? (
                      <div className="border rounded-md p-4 bg-red-500/10 border-red-500/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-base font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                            <XCircle className="w-5 h-5" />
                            Error Occurred
                          </h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(error)
                              addLog('info', 'API', 'Error copied to clipboard')
                            }}
                          >
                            Copy Error
                          </Button>
                        </div>
                        <pre className="text-sm overflow-auto text-red-600 dark:text-red-400">
                          {error}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Radio className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No event data yet. Start a test to listen for trigger events.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Debug Logs Tab */}
                {activeTab === 'logs' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {(['all', 'info', 'warn', 'error', 'debug'] as const).map(filter => (
                          <Button
                            key={filter}
                            variant={logFilter === filter ? 'default' : 'ghost'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setLogFilter(filter)}
                          >
                            {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                            {filter !== 'all' && (
                              <span className="ml-1 text-muted-foreground">
                                ({debugLogs.filter(l => l.level === filter).length})
                              </span>
                            )}
                          </Button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={copyLogs}>
                          <Copy className="w-3 h-3 mr-1" /> Copy All
                        </Button>
                        <Button variant="outline" size="sm" onClick={clearLogs}>
                          <Trash2 className="w-3 h-3 mr-1" /> Clear
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-md bg-muted/50 p-4 font-mono text-xs space-y-2 max-h-[60vh] overflow-auto">
                      {filteredLogs.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No logs to display</p>
                      ) : (
                        filteredLogs.map((log, idx) => (
                          <div key={idx} className={`
                            p-2 rounded
                            ${log.level === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : ''}
                            ${log.level === 'warn' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' : ''}
                            ${log.level === 'info' ? 'bg-background' : ''}
                            ${log.level === 'debug' ? 'bg-background text-muted-foreground' : ''}
                          `}>
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground shrink-0">
                                {log.timestamp.split('T')[1]?.split('.')[0]}
                              </span>
                              <span className={`font-semibold shrink-0 ${
                                log.level === 'error' ? 'text-red-600 dark:text-red-400' :
                                log.level === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
                                log.level === 'info' ? 'text-blue-600 dark:text-blue-400' :
                                'text-gray-500'
                              }`}>
                                [{log.level.toUpperCase()}]
                              </span>
                              <span className="text-purple-600 dark:text-purple-400 shrink-0">
                                [{log.category}]
                              </span>
                              <span className="break-all">{log.message}</span>
                            </div>
                            {log.details && (
                              <div className="ml-6 mt-1 text-muted-foreground border-l-2 border-muted pl-2">
                                {Object.entries(log.details).map(([key, value]) => (
                                  <div key={key} className="break-all">
                                    └─ <span className="text-foreground">{key}:</span> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Test Config Tab */}
                {activeTab === 'config' && (
                  <div className="space-y-4">
                    <div className="border rounded-md p-4 bg-muted/50">
                      <h4 className="text-base font-semibold mb-3">Test Session Details</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Session ID:</span>
                          <span className="font-mono">{testSessionId || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Workflow ID:</span>
                          <span className="font-mono">{workflowId || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Provider:</span>
                          <span>{selectedProvider}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trigger Type:</span>
                          <span>{selectedNode?.title || selectedTrigger}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span className={statusDisplay.color}>{statusDisplay.text}</span>
                        </div>
                        {expiresAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Expires At:</span>
                            <span className="font-mono">{new Date(expiresAt).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-md p-4 bg-muted/50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-base font-semibold">Configuration Sent</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(configValues, null, 2))
                            addLog('info', 'API', 'Configuration copied to clipboard')
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <pre className="text-xs overflow-auto bg-background p-3 rounded max-h-96">
                        {JSON.stringify(configValues, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Debug Logs Overlay (expanded) */}
          {isDebugLogsExpanded && (
            <div className="fixed inset-4 z-50 bg-background border rounded-lg shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  Debug Logs
                  {debugLogs.some(l => l.level === 'error') && (
                    <Badge variant="destructive">
                      {debugLogs.filter(l => l.level === 'error').length} errors
                    </Badge>
                  )}
                  {debugLogs.some(l => l.level === 'warn') && (
                    <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400 border-yellow-500">
                      {debugLogs.filter(l => l.level === 'warn').length} warnings
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-muted-foreground">
                    {debugLogs.length} total
                  </Badge>
                </h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={copyLogs}>
                    <Copy className="w-4 h-4 mr-1" /> Copy All
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearLogs}>
                    <Trash2 className="w-4 h-4 mr-1" /> Clear
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsDebugLogsExpanded(false)}>
                    ✕
                  </Button>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                <span className="text-sm text-muted-foreground">Filter:</span>
                {(['all', 'info', 'warn', 'error', 'debug'] as const).map(filter => (
                  <Button
                    key={filter}
                    variant={logFilter === filter ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-3"
                    onClick={() => setLogFilter(filter)}
                  >
                    {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({filter === 'all' ? debugLogs.length : debugLogs.filter(l => l.level === filter).length})
                    </span>
                  </Button>
                ))}
              </div>

              {/* Log Entries */}
              <div className="flex-1 overflow-auto p-4 font-mono text-sm space-y-2">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No logs to display</p>
                    {logFilter !== 'all' && (
                      <p className="text-xs mt-1">Try changing the filter or clear existing filters</p>
                    )}
                  </div>
                ) : (
                  filteredLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`
                        p-3 rounded border
                        ${log.level === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' : ''}
                        ${log.level === 'warn' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400' : ''}
                        ${log.level === 'info' ? 'bg-blue-500/5 border-blue-500/20' : ''}
                        ${log.level === 'debug' ? 'bg-muted/50 border-muted text-muted-foreground' : ''}
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xs text-muted-foreground shrink-0 font-normal">
                          {log.timestamp.split('T')[1]?.split('.')[0]}
                        </span>
                        <span className={`
                          font-bold text-xs shrink-0 px-1.5 py-0.5 rounded
                          ${log.level === 'error' ? 'bg-red-500/20 text-red-600 dark:text-red-400' : ''}
                          ${log.level === 'warn' ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' : ''}
                          ${log.level === 'info' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : ''}
                          ${log.level === 'debug' ? 'bg-gray-500/20 text-gray-500' : ''}
                        `}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className="text-purple-600 dark:text-purple-400 text-xs shrink-0 font-semibold">
                          [{log.category}]
                        </span>
                        <span className="break-all font-normal">{log.message}</span>
                      </div>
                      {log.details && (
                        <div className="mt-2 ml-[100px] text-xs border-l-2 border-muted pl-3 space-y-1">
                          {Object.entries(log.details).map(([key, value]) => (
                            <div key={key} className="break-all text-muted-foreground">
                              <span className="text-foreground font-medium">{key}:</span>{' '}
                              {typeof value === 'object' ? (
                                <pre className="inline-block bg-muted/50 px-1 rounded text-xs">
                                  {JSON.stringify(value, null, 2)}
                                </pre>
                              ) : (
                                String(value)
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Footer with session info */}
              <div className="border-t px-4 py-2 bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
                <div className="flex gap-4">
                  <span>Session: <code>{testSessionId || 'N/A'}</code></span>
                  <span>Status: <span className={statusDisplay.color}>{statusDisplay.text}</span></span>
                </div>
                <div>
                  {expiresAt && <span>Expires: {new Date(expiresAt).toLocaleTimeString()}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </VariableDragProvider>
    </TooltipProvider>
  )
}
