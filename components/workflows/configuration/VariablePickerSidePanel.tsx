"use client"

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Search, ChevronDown, ChevronRight, Copy, Check, Variable, Play, CircleAlert } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { apiClient } from '@/lib/apiClient'
import { useWorkflowTestStore } from '@/stores/workflowTestStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { resolveVariableValue, getNodeVariableValues } from '@/lib/workflows/variableResolution'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { useVariableDragContext } from './VariableDragContext'
import { buildVariableReference } from '@/lib/workflows/variableInsertion'

import { logger } from '@/lib/utils/logger'
import { getActionOutputSchema, mergeSchemas, type OutputField } from '@/lib/workflows/actions/outputSchemaRegistry'

const formatProviderName = (providerId?: string): string => {
  if (!providerId) return ''
  return providerId
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const humanizeNodeType = (type?: string): string => {
  if (!type) return 'Step'
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface VariablePickerSidePanelProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  currentNodeType?: string
  onVariableSelect?: (variable: string) => void
  workflowId?: string
}

export function VariablePickerSidePanel({
  workflowData,
  currentNodeId,
  currentNodeType,
  onVariableSelect,
  workflowId
}: VariablePickerSidePanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [isTestRunning, setIsTestRunning] = useState(false)
  const { toast } = useToast()
  const isDraggingVariable = useRef(false)
  const allowClickSelect = useRef(true)
  const manualExpandedNodesRef = useRef<Set<string>>(new Set())
  const expandedBeforeSearchRef = useRef<Set<string> | null>(null)
  const prevSearchTermRef = useRef("")
  const autoExpandedFromTestsRef = useRef(false)
  const { activeField, insertIntoActiveField } = useVariableDragContext()

  // Access test store data FIRST (before callbacks that depend on it)
  const {
    testResults,
    executionPath,
    testTimestamp,
    getNodeTestResult,
    hasTestResults,
    setTestResults,
    clearTestResults
  } = useWorkflowTestStore()

  const renderProviderIcon = useCallback((providerId?: string, providerName?: string) => {
    if (providerId) {
      return (
        <StaticIntegrationLogo
          providerId={providerId}
          providerName={providerName || providerId}
        />
      )
    }

    return (
      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
        <Variable className="h-3 w-3" />
      </div>
    )
  }, [])

  // Function to get relevant AI agent outputs based on current node type
  const getRelevantAIAgentOutputs = useCallback((currentNodeType: string): string[] => {
    if (!currentNodeType) return ['output']; // Default to generic output
    
    // Email actions should show email-specific fields
    if (currentNodeType.includes('gmail') || currentNodeType.includes('outlook') || currentNodeType.includes('email')) {
      return ['email_subject', 'email_body', 'output'];
    }
    
    // Discord actions should show discord-specific and general output
    if (currentNodeType.includes('discord')) {
      return ['output', 'discord_message'];
    }
    
    // Slack actions should show slack-specific and general output
    if (currentNodeType.includes('slack')) {
      return ['output', 'slack_message'];
    }
    
    // Notion actions should show notion-specific and general output
    if (currentNodeType.includes('notion')) {
      return ['output', 'notion_title', 'notion_content'];
    }
    
    // For other actions, show general output
    return ['output'];
  }, []);

  // Function to get outputs based on node type and config using the new schema system
  const getRelevantOutputs = useCallback((nodeType: string, nodeConfig: any, nodeId?: string) => {
    // Special context-aware filtering for AI agent nodes based on current action type
    if ((nodeType === 'ai_agent' || nodeType === 'ai_message') && currentNodeType) {
      const relevantAIOutputs = getRelevantAIAgentOutputs(currentNodeType);
      // Get static schema first
      const staticSchema = getActionOutputSchema(nodeType, nodeConfig)
      const filteredOutputs = staticSchema.filter(output => relevantAIOutputs.includes(output.name));

      logger.debug(`📊 [VARIABLES] Context-aware AI Agent filtering for ${currentNodeType}:`, {
        nodeType,
        currentNodeType,
        relevantAIOutputs,
        originalOutputs: staticSchema.map(o => o.name),
        filteredOutputs: filteredOutputs.map(o => o.name)
      });

      return filteredOutputs;
    }

    // Get static schema from registry
    const staticSchema = getActionOutputSchema(nodeType, nodeConfig)

    // If we have test results for this node, merge runtime data
    if (nodeId && testResults[nodeId]) {
      const mergedSchema = mergeSchemas(staticSchema, testResults[nodeId])

      logger.debug(`📊 [VARIABLES] Merged schema for ${nodeType}:`, {
        nodeType,
        staticFieldCount: staticSchema.length,
        runtimeFieldCount: Object.keys(testResults[nodeId] || {}).length,
        mergedFieldCount: mergedSchema.length,
        staticFields: staticSchema.map(o => o.name),
        mergedFields: mergedSchema.map(o => o.name)
      })

      return mergedSchema
    }

    logger.debug(`📊 [VARIABLES] Using static schema for ${nodeType}:`, {
      nodeType,
      fieldCount: staticSchema.length,
      fields: staticSchema.map(o => o.name)
    })

    return staticSchema
  }, [currentNodeType, getRelevantAIAgentOutputs, testResults])

  // Get previous nodes from the workflow data based on edge connections
  const getPreviousNodes = (nodeId: string) => {
    if (!workflowData || !nodeId) return [];

    // Function to get all nodes that come before the current node in the workflow
    const findPreviousNodes = (nodeId: string, visited = new Set<string>()): string[] => {
      if (visited.has(nodeId)) return [];
      visited.add(nodeId);
      
      // Find edges where this node is the target
      const incomingEdges = workflowData.edges.filter(edge => edge.target === nodeId);
      
      // No incoming edges means no previous nodes
      if (incomingEdges.length === 0) return [];
      
      // Get the source nodes from incoming edges
      const sourceNodeIds = incomingEdges.map(edge => edge.source);
      
      // For each source node, also get its previous nodes
      const allPreviousNodes: string[] = [...sourceNodeIds];
      
      sourceNodeIds.forEach(sourceId => {
        const previousNodes = findPreviousNodes(sourceId, visited);
        allPreviousNodes.push(...previousNodes);
      });
      
      return allPreviousNodes;
    };

    // Get all previous nodes
    const previousNodeIds = findPreviousNodes(nodeId);
    return previousNodeIds;
  };

  // Get available nodes from workflow data
  const nodes = useMemo(() => {
    const allNodes = workflowData?.nodes?.map((node: any) => {
      // Get the node component definition (for providerId, title, etc.)
      const nodeComponent = ALL_NODE_COMPONENTS.find(comp => comp.type === node.data?.type)

      // Get outputs using the new schema system (which handles dynamic schemas based on config)
      const relevantOutputs = getRelevantOutputs(node.data?.type || '', node.data?.config, node.id)
      
      const providerId = node.data?.providerId || nodeComponent?.providerId || ''
      const providerName = formatProviderName(providerId)
      const title = node.data?.title?.trim() || nodeComponent?.title || humanizeNodeType(node.data?.type) || 'Untitled Step'
      const isTrigger = Boolean(node.data?.isTrigger)

      const nodeTypeLabel = isTrigger
        ? 'Trigger'
        : (providerId === 'ai' || node.data?.type?.startsWith('ai_'))
          ? 'AI Action'
          : 'Action'

      const subtitleParts = []
      if (providerName) subtitleParts.push(providerName)
      if (nodeTypeLabel && (subtitleParts.length === 0 || nodeTypeLabel !== subtitleParts[subtitleParts.length - 1])) {
        subtitleParts.push(nodeTypeLabel)
      }
      const subtitle = subtitleParts.join(' • ')

      return {
        id: node.id,
        title,
        subtitle,
        providerId,
        providerName,
        type: node.data?.type,
        outputs: Array.isArray(relevantOutputs) ? relevantOutputs : [],
        isTrigger
      }
    })
    .filter(node => {
      // Exclude the "Add Action" button and similar UI elements
      const title = node.title.toLowerCase()
      return !title.includes('add action') && 
             !title.includes('add node') && 
             !title.includes('add trigger') &&
             !title.includes('add workflow') &&
             node.id !== 'add-action-button' &&
             node.id !== 'add-node-button'
    }) || []
    
    if (currentNodeId) {
      const previousNodeIds = new Set(getPreviousNodes(currentNodeId));

      // Debug logging with MORE DETAIL
      logger.debug('📊 [VARIABLES] Debug info:', {
        currentNodeId,
        previousNodeIds: Array.from(previousNodeIds),
        allNodesCount: allNodes.length,
        edges: workflowData?.edges?.map(e => ({ source: e.source, target: e.target })),
        allNodes: allNodes.map(n => ({
          id: n.id,
          title: n.title,
          type: n.type,
          isTrigger: n.isTrigger,
          outputsCount: n.outputs?.length || 0,
          outputs: n.outputs?.map(o => o.name) || [],
          isPreviousNode: previousNodeIds.has(n.id),
          isCurrentNode: n.id === currentNodeId
        }))
      });

      // Include all nodes that have outputs, not just previous ones
      const filteredNodes = allNodes.filter(node => {
        const isNotCurrent = node.id !== currentNodeId;
        const hasOutputs = node.outputs && node.outputs.length > 0;
        const isPrevious = previousNodeIds.has(node.id);

        // Log why each node is included/excluded
        if (!isNotCurrent || !hasOutputs || !isPrevious) {
          logger.debug(`📊 [VARIABLES] Node "${node.title}" excluded:`, {
            nodeId: node.id,
            isNotCurrent,
            hasOutputs,
            outputCount: node.outputs?.length || 0,
            isPrevious,
            reason: !isNotCurrent ? 'is current node' : !hasOutputs ? 'no outputs' : 'not a previous node'
          });
        }

        return isNotCurrent && hasOutputs && isPrevious;
      });

      // Debug: Log which nodes are being included
      logger.debug('📊 [VARIABLES] Filtered nodes for variables menu:', filteredNodes.map(n => ({
        id: n.id,
        title: n.title,
        type: n.type,
        hasOutputs: n.outputs.length > 0,
        outputs: n.outputs.map(o => o.name)
      })));

      return filteredNodes;
    }
    
    return allNodes;
  }, [workflowData, currentNodeId, getRelevantOutputs])

  // Filter nodes and outputs based on search term
  const filteredNodes = useMemo(() => {
    const query = searchTerm.toLowerCase()
    return nodes.filter(node => {
      const nodeMatches =
        node.title.toLowerCase().includes(query) ||
        (node.subtitle?.toLowerCase().includes(query) ?? false) ||
        (node.providerName?.toLowerCase().includes(query) ?? false)
      const outputMatches = node.outputs.some((output: any) => 
        output.label?.toLowerCase().includes(query) ||
        output.name.toLowerCase().includes(query)
      )
      return nodeMatches || outputMatches
    })
  }, [nodes, searchTerm])

  // Handle node expansion toggle
  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      manualExpandedNodesRef.current = new Set(newSet)
      return newSet
    })
  }

  // Auto-expand nodes when searching or when test results are available
  useEffect(() => {
    if (searchTerm) {
      if (!prevSearchTermRef.current) {
        expandedBeforeSearchRef.current = new Set(manualExpandedNodesRef.current)
      }
      prevSearchTermRef.current = searchTerm
      const nodesToExpand = new Set<string>()
      filteredNodes.forEach(node => {
        const hasMatchingOutputs = node.outputs.some((output: any) => 
          output.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          output.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        if (hasMatchingOutputs) {
          nodesToExpand.add(node.id)
        }
      })
      setExpandedNodes(nodesToExpand)
      return
    }

    if (prevSearchTermRef.current && !searchTerm) {
      prevSearchTermRef.current = ""
      const restore =
        expandedBeforeSearchRef.current
          ? new Set(expandedBeforeSearchRef.current)
          : new Set(manualExpandedNodesRef.current)
      manualExpandedNodesRef.current = new Set(restore)
      setExpandedNodes(restore)
      expandedBeforeSearchRef.current = null
      return
    }

    const hasResults = hasTestResults()
    if (!searchTerm && hasResults && !autoExpandedFromTestsRef.current) {
      const nodesToExpand = new Set(manualExpandedNodesRef.current)
      executionPath.forEach(nodeId => {
        nodesToExpand.add(nodeId)
      })
      manualExpandedNodesRef.current = new Set(nodesToExpand)
      setExpandedNodes(nodesToExpand)
      autoExpandedFromTestsRef.current = true
      return
    }

    if (!hasResults) {
      autoExpandedFromTestsRef.current = false
    }
  }, [searchTerm, filteredNodes, executionPath, hasTestResults])

  const handleVariableSelect = (variable: string, nodeId: string, outputName: string) => {
    if (!allowClickSelect.current) {
      allowClickSelect.current = true
      return
    }

    if (isDraggingVariable.current) {
      return
    }

    if (onVariableSelect) {
      // Try to resolve the actual value using our new resolution system
      const resolvedValue = resolveVariableValue(variable, workflowData || { nodes: [], edges: [] }, testResults)
      
      if (resolvedValue !== variable) {
        // Pass the actual resolved value
        onVariableSelect(resolvedValue)
      } else {
        // Fallback to variable reference if we can't resolve it
        onVariableSelect(variable)
      }
      return
    }

    const inserted = insertIntoActiveField(variable)
    if (!inserted) {
      toast({
        title: "Choose a field first",
        description: "Click into the form field you want to update, then pick a variable.",
      })
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedVariable(text)
      toast({
        title: "Variable copied",
        description: "Variable reference copied to clipboard",
      })
      setTimeout(() => setCopiedVariable(null), 2000)
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy variable to clipboard",
        variant: "destructive",
      })
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, variable: string) => {
    isDraggingVariable.current = true
    allowClickSelect.current = false
    logger.debug('🚀 [VariablePickerSidePanel] Drag started:', {
      variable,
      dataTransferTypes: e.dataTransfer.types,
      effectAllowed: 'copy'
    })
    e.dataTransfer.setData('text/plain', variable)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = (e?: React.DragEvent) => {
    requestAnimationFrame(() => {
      isDraggingVariable.current = false
      allowClickSelect.current = true
    })
    logger.debug('🏁 [VariablePickerSidePanel] Drag ended', {
      dropEffect: e?.dataTransfer?.dropEffect
    })
    if (e) {
      e.preventDefault()
    }
  }

  // Run workflow test to get actual output values
  const runWorkflowTest = async () => {
    if (!workflowData?.nodes || workflowData.nodes.length === 0) return;

    try {
      setIsTestRunning(true);

      // Find the trigger node (first node)
      const triggerNodes = workflowData.nodes.filter((node: any) =>
        node.data?.isTrigger || node.type === 'trigger'
      );

      if (triggerNodes.length === 0) {
        toast({
          title: "No trigger found",
          description: "This workflow doesn't have a trigger node.",
          variant: "destructive",
        });
        return;
      }

      const triggerNode = triggerNodes[0];

      // Try to find workflow ID from multiple sources
      let resolvedWorkflowId = workflowId; // Use prop if provided

      // Fallback 1: Check node data
      if (!resolvedWorkflowId) {
        for (const node of workflowData.nodes) {
          if (node.data?.workflowId) {
            resolvedWorkflowId = node.data.workflowId;
            break;
          }
        }
      }

      // Fallback 2: Try to extract from URL
      if (!resolvedWorkflowId && typeof window !== 'undefined') {
        const urlMatch = window.location.pathname.match(/\/workflows\/([a-f0-9-]+)/);
        if (urlMatch) {
          resolvedWorkflowId = urlMatch[1];
        }
      }

      if (!resolvedWorkflowId) {
        logger.error('❌ [Test] Could not find workflow ID:', {
          propWorkflowId: workflowId,
          nodeDataWorkflowIds: workflowData.nodes.map(n => n.data?.workflowId).filter(Boolean),
          url: typeof window !== 'undefined' ? window.location.pathname : 'SSR'
        });
        toast({
          title: "Missing workflow ID",
          description: "Could not determine the workflow ID. Please save the workflow first.",
          variant: "destructive",
        });
        return;
      }

      // Call API to test the workflow
      // Send the current workflow data (nodes and edges) instead of relying on database
      logger.debug('🧪 [Test] Calling test API with:', {
        workflowId: resolvedWorkflowId,
        nodeId: currentNodeId || triggerNode.id,
        nodesCount: workflowData.nodes.length,
        edgesCount: workflowData.edges.length
      });

      const response = await apiClient.post('/api/workflows/test-workflow-segment', {
        workflowId: resolvedWorkflowId,
        nodeId: currentNodeId || triggerNode.id,
        input: {}, // Empty input for testing
        workflowData: {
          nodes: workflowData.nodes,
          edges: workflowData.edges
        }
      });
      
      if (response.success) {
        // Extract data from the nested response structure
        const responseData = (response as any).data || response;

        // Store the test results - convert array to object format
        const testDataArray = responseData.testResults || [];
        const execPath = responseData.executionPath || [];
        const triggerOut = responseData.triggerOutput || {};

        logger.debug('🧪 [Test] Full API Response:', response);
        logger.debug('🧪 [Test] Results received:', {
          testResultsArray: testDataArray,
          testResultsType: Array.isArray(testDataArray) ? 'array' : typeof testDataArray,
          executionPath: execPath,
          triggerOutput: triggerOut,
          testResultsCount: testDataArray.length,
          executionPathLength: execPath.length,
          firstResult: testDataArray[0]
        });

        setTestResults(
          testDataArray,
          execPath,
          triggerOut,
          triggerNode.id
        );

        // Count how many nodes have test data
        const testedNodesCount = testDataArray.length;

        // Show detailed info if no results
        if (testedNodesCount === 0) {
          logger.error('🧪 [Test] No test results returned!', {
            response,
            executionPathLength: execPath.length,
            triggerOutputKeys: Object.keys(triggerOut)
          });

          toast({
            title: "Test completed",
            description: `Test ran but returned no results. Check console for details. ExecutionPath: ${execPath.length} nodes`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Test completed",
            description: `Successfully tested ${testedNodesCount} ${testedNodesCount === 1 ? 'node' : 'nodes'}. Green badges show actual values.`,
          });
        }
      } else {
        toast({
          title: "Test failed",
          description: response.error || "Failed to run workflow test.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Error running workflow test:", error);
      toast({
        title: "Test error",
        description: "An error occurred while testing the workflow.",
        variant: "destructive",
      });
    } finally {
      setIsTestRunning(false);
    }
  };

  // Get the actual value of a variable if test results are available
  const getVariableValue = (nodeId: string, outputName: string) => {
    // Convert testResults array to object format expected by getNodeVariableValues
    // testResults is an array of { nodeId, output, ... } objects
    // We need to convert to { [nodeId]: { output: {...} } }
    const testResultsObj = testResults.reduce((acc: any, result: any) => {
      acc[result.nodeId] = result
      return acc
    }, {})

    logger.debug('🔍 [getVariableValue] Looking up value:', {
      nodeId,
      outputName,
      hasTestResults: testResults.length > 0,
      testResultsObjKeys: Object.keys(testResultsObj),
      nodeTestResult: testResultsObj[nodeId],
      nodeOutput: testResultsObj[nodeId]?.output
    });

    // Use the new resolution system to get variable values
    const nodeValues = getNodeVariableValues(nodeId, workflowData || { nodes: [], edges: [] }, testResultsObj)

    logger.debug('🔍 [getVariableValue] Retrieved values:', {
      nodeId,
      outputName,
      nodeValues,
      nodeValuesKeys: Object.keys(nodeValues),
      resultValue: nodeValues[outputName]
    });

    return nodeValues[outputName] || null
  };

  // Format variable value for display
  const formatVariableValue = (value: any) => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value).substring(0, 30) + (JSON.stringify(value).length > 30 ? '...' : '');
      } catch (e) {
        return '[Complex Object]';
      }
    }
    return String(value).substring(0, 30) + (String(value).length > 30 ? '...' : '');
  };

  return (
    <div className="w-full h-full bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg">
              <span className="text-sm font-mono font-semibold text-slate-700">{`{}`}</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Variables</h3>
              <span className="text-xs text-slate-500">Available data from previous steps</span>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs font-medium"
                  onClick={runWorkflowTest}
                  disabled={isTestRunning}
                >
                  {isTestRunning ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"></div>
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Test
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Test workflow to see actual values</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          placeholder="Search variables..."
          className="h-9 bg-slate-50 border-slate-200 focus:bg-white focus:border-slate-300 placeholder:text-slate-400 text-sm text-slate-900 px-3"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
    </div>

      {activeField && (
        <div className="px-3 py-2 border-b border-slate-200 bg-blue-50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-xs text-slate-700 font-medium truncate" title={activeField.label || activeField.id}>
              Inserting into: <span className="text-blue-700">{activeField.label || activeField.id}</span>
            </span>
          </div>
        </div>
      )}

      {/* Test results timestamp */}
      {hasTestResults() && (
        <div className="px-3 py-2 bg-green-50 border-b border-green-200 flex justify-between items-center">
          <div className="text-xs text-green-700 flex items-center gap-1.5 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            Test data loaded ({new Date(testTimestamp || 0).toLocaleTimeString()})
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearTestResults}
            className="h-6 text-xs text-green-700 hover:text-green-900 hover:bg-green-100"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Variables List */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {filteredNodes.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              {currentNodeId ? (
                <>
                  <CircleAlert className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                  <p>No previous nodes available.</p>
                  <p className="text-xs mt-1 text-slate-400">
                    Variables can only come from nodes that appear before this one in the workflow.
                  </p>
                </>
              ) : (
                searchTerm ? 'No variables found' : 'No variables available'
              )}
            </div>
          ) : (
            filteredNodes.map((node) => {
              const isExpanded = expandedNodes.has(node.id)
              const hasOutputs = node.outputs && node.outputs.length > 0
              const nodeResult = getNodeTestResult(node.id)
              const isNodeTested = nodeResult !== null
              
              return (
                <Collapsible
                  key={node.id}
                  open={isExpanded}
                  className={`mb-2 border rounded-lg overflow-hidden transition-all ${
                    isNodeTested
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Node Header */}
                  <CollapsibleTrigger asChild>
                    <div
                      className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50/50 transition-colors w-full"
                      onClick={() => toggleNodeExpansion(node.id)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          {renderProviderIcon(node.providerId, node.providerName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {node.title}
                            </span>
                            {hasOutputs && (
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-600 border-slate-200 font-medium">
                                {node.outputs.length}
                              </Badge>
                            )}
                          </div>
                          {node.subtitle && (
                            <span className="text-xs text-white truncate block">
                              {node.subtitle}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isNodeTested && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" title="Test data available"></div>
                          )}
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  {/* Node Outputs */}
                  <CollapsibleContent className="bg-slate-50/30 border-t border-slate-100">
                    {hasOutputs ? (
                      <div className="py-1">
                        {node.outputs.map((output: any) => {
                          // Use node.id for the actual variable reference, not node.title
                          const variableRef = buildVariableReference(node.id, output.name)
                          const displayVariableRef = `{{${node.title}.${output.label || output.name}}}`
                          const variableValue = getVariableValue(node.id, output.name)
                          const hasValue = variableValue !== null

                          return (
                            <div
                              key={`${node.id}-${output.name}`}
                              className="group flex items-center justify-between px-3 py-2 bg-gray-700 text-white hover:bg-black hover:text-white cursor-pointer transition-colors mx-1 rounded"
                              draggable
                              onMouseDown={() => {
                                allowClickSelect.current = true
                              }}
                              onDragStart={(e) => {
                                logger.debug('🚀🚀🚀 [VariablePickerSidePanel] DRAG STARTED!', {
                                  variableRef,
                                  nodeTitle: node.title,
                                  outputName: output.name,
                                  outputLabel: output.label,
                                  dataTransfer: e.dataTransfer
                                })
                                handleDragStart(e, variableRef)
                                e.stopPropagation()
                                e.dataTransfer.setData('application/json', JSON.stringify({
                                  variable: variableRef,
                                  nodeTitle: node.title,
                                  outputName: output.name,
                                  outputLabel: output.label
                                }))
                              }}
                              onDragEnd={(e) => {
                                e.stopPropagation()
                                handleDragEnd(e)
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleVariableSelect(variableRef, node.id, output.name)
                                e.preventDefault()
                              }}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-white text-slate-900 border-slate-300 font-medium flex-shrink-0">
                                  {output.type || 'string'}
                                </Badge>
                                <span className="text-sm truncate font-medium">{output.label || output.name}</span>
                                {hasValue && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="text-[10px] h-5 px-1.5 bg-green-50 text-green-700 border-green-200 font-medium max-w-[80px] truncate">
                                          {formatVariableValue(variableValue)}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="left">
                                        <p className="text-xs whitespace-pre-wrap max-w-[300px]">
                                          {typeof variableValue === 'object'
                                            ? JSON.stringify(variableValue, null, 2)
                                            : String(variableValue)
                                          }
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(variableRef)
                                }}
                              >
                                {copiedVariable === variableRef ? (
                                  <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3 text-slate-400" />
                                )}
                                <span className="sr-only">Copy</span>
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        No variables available
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-slate-200 bg-slate-50/50">
        <p className="text-xs text-black text-center leading-relaxed font-medium">
          Click to insert • Drag & drop • Hover to copy
        </p>
      </div>
    </div>
  )
}
