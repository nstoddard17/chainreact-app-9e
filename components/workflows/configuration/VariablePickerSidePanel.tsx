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
}

export function VariablePickerSidePanel({
  workflowData,
  currentNodeId,
  currentNodeType,
  onVariableSelect
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
      
      // Debug logging
      logger.debug('📊 [VARIABLES] Debug info:', {
        currentNodeId,
        previousNodeIds: Array.from(previousNodeIds),
        allNodesCount: allNodes.length,
        allNodes: allNodes.map(n => ({
          id: n.id,
          title: n.title,
          type: n.type,
          isTrigger: n.isTrigger,
          outputsCount: n.outputs?.length || 0,
          outputs: n.outputs?.map(o => o.name) || []
        }))
      });
      
      // Include all nodes that have outputs, not just previous ones
      const filteredNodes = allNodes.filter(node => 
        node.id !== currentNodeId &&
        node.outputs &&
        node.outputs.length > 0 &&
        previousNodeIds.has(node.id)
      );
      
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
      
      // Find workflow ID from any node in the workflow
      let workflowId = null;
      for (const node of workflowData.nodes) {
        if (node.data?.workflowId) {
          workflowId = node.data.workflowId;
          break;
        }
      }
      
      if (!workflowId) {
        toast({
          title: "Missing workflow ID",
          description: "Could not determine the workflow ID.",
          variant: "destructive",
        });
        return;
      }
      
      // Call API to test the workflow
      const response = await apiClient.post('/api/workflows/test-workflow-segment', {
        workflowId,
        nodeId: currentNodeId || triggerNode.id,
        input: {}, // Empty input for testing
      });
      
      if (response.success) {
        // Store the test results
        setTestResults(
          (response as any).testResults || [],
          (response as any).executionPath || [],
          (response as any).triggerOutput || {},
          triggerNode.id
        );
        
        toast({
          title: "Test completed",
          description: "Workflow test completed successfully.",
        });
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
    // Use the new resolution system to get variable values
    const nodeValues = getNodeVariableValues(nodeId, workflowData || { nodes: [], edges: [] }, testResults)
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
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-blue-500 to-purple-600">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-r from-purple-400 to-purple-600 rounded-md shadow-sm">
              <span className="text-sm font-mono font-semibold text-white">{`{}`}</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Variables</h3>
              <span className="text-xs text-white/80">Click headers to expand/collapse</span>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  size="sm" 
                  className="bg-green-500 hover:bg-green-600 text-white"
                  onClick={runWorkflowTest}
                  disabled={isTestRunning}
                >
                  {isTestRunning ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1" />
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
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search variables..."
            className="pl-9 bg-white/90 border-white/20 focus:border-white/40 focus:ring-white/20 placeholder:text-slate-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>
    </div>

      <div className="px-4 py-2.5 border-b border-blue-300 bg-gradient-to-r from-blue-600 to-indigo-600">
        {activeField ? (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-blue-100 font-bold">
              Inserting into
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-sm"></div>
              <span
                className="text-sm text-white font-bold truncate"
                title={activeField.label || activeField.id}
              >
                {activeField.label || activeField.id}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-blue-100 font-medium">
            Click a form field to enable click-to-insert (copy icon still available).
          </div>
        )}
      </div>

      {/* Test results timestamp */}
      {hasTestResults() && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            Test results available ({new Date(testTimestamp || 0).toLocaleTimeString()})
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearTestResults} 
            className="h-6 text-xs"
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
                  className={`mb-3 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm ${isNodeTested ? 'border-green-300' : ''}`}
                >
                  {/* Node Header */}
                  <CollapsibleTrigger asChild>
                    <div
                      className={`flex items-start justify-between px-3 py-2 hover:bg-slate-100 cursor-pointer transition-colors w-full ${isNodeTested ? 'bg-green-50 hover:bg-green-100' : 'bg-slate-50'}`}
                      onClick={() => toggleNodeExpansion(node.id)}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-4 h-4 flex items-center justify-center mt-1 flex-shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-slate-500" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-slate-500" />
                          )}
                        </div>
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className="mt-0.5 flex-shrink-0">
                            {renderProviderIcon(node.providerId, node.providerName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-900 break-words whitespace-normal leading-tight block">
                              {node.title}
                            </span>
                            {node.subtitle && (
                              <span className="text-xs text-slate-500 break-words whitespace-normal block mt-0.5">
                                {node.subtitle}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-1 flex-shrink-0 ml-2">
                        {hasOutputs && (
                          <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 border-slate-200">
                            {node.outputs.length}
                          </Badge>
                        )}
                        {isNodeTested && (
                          <div className="w-2 h-2 rounded-full bg-green-500 mt-1" title="Test data available"></div>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  {/* Node Outputs */}
                  <CollapsibleContent className="bg-white">
                    {hasOutputs ? (
                      node.outputs.map((output: any) => {
                                                  // Use node.id for the actual variable reference, not node.title
                        const variableRef = buildVariableReference(node.id, output.name)
                        const displayVariableRef = `{{${node.title}.${output.label || output.name}}}`
                        const variableValue = getVariableValue(node.id, output.name)
                        const hasValue = variableValue !== null
                        
                        return (
                          <div
                            key={`${node.id}-${output.name}`}
                            className={`flex items-start justify-between px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors border-t border-slate-100 ${hasValue ? 'bg-green-50/30' : ''}`}
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
                              e.stopPropagation() // Prevent collapsible from closing
                              e.dataTransfer.setData('application/json', JSON.stringify({
                                variable: variableRef,
                                nodeTitle: node.title,
                                outputName: output.name,
                                outputLabel: output.label
                              }))
                            }}
                            onDragEnd={(e) => {
                              e.stopPropagation() // Prevent collapsible from closing
                              handleDragEnd(e)
                            }}
                            onClick={(e) => {
                              e.stopPropagation() // Prevent collapsible from closing
                              handleVariableSelect(variableRef, node.id, output.name)
                              // Prevent the collapsible from closing after insertion
                              e.preventDefault()
                            }}
                          >
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <Badge variant="outline" className={`text-xs bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0 ${hasValue ? 'border-green-300' : ''}`}>
                                {output.type || 'string'}
                              </Badge>
                              <span className="text-sm text-slate-700 break-words whitespace-normal leading-tight">{output.label || output.name}</span>
                            </div>
                            
                            <div className="flex items-start flex-shrink-0">
                              {/* Show variable value if available */}
                              {hasValue && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className="mr-2 mt-0.5 bg-green-100 text-green-800 hover:bg-green-200 transition-colors">
                                        {formatVariableValue(variableValue)}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
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
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 mt-0.5 hover:bg-blue-100"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(variableRef)
                                }}
                              >
                                {copiedVariable === variableRef ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                <span className="sr-only">Copy</span>
                              </Button>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-500 border-t border-slate-100">
                        No variables available from this node
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
      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <p className="text-xs text-slate-500 text-center">
          Drag or click to insert. Use the copy icon for clipboard.
        </p>
      </div>
    </div>
  )
}
