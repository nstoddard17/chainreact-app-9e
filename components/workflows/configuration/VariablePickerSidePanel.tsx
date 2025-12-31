"use client"

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ProfessionalSearch } from '@/components/ui/professional-search'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Search, ChevronDown, ChevronRight, Copy, Check, Variable, Play, CircleAlert, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { apiClient } from '@/lib/apiClient'
import { useWorkflowTestStore } from '@/stores/workflowTestStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { resolveVariableValue, getNodeVariableValues } from '@/lib/workflows/variableResolution'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { useVariableDragContext } from './VariableDragContext'
import { buildVariableReference, createVariableAlias } from '@/lib/workflows/variableInsertion'
import { ConfigurationSectionHeader } from './components/ConfigurationSectionHeader'

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
  const [dataDialogOpen, setDataDialogOpen] = useState(false)
  const [selectedDataInfo, setSelectedDataInfo] = useState<{ label: string; value: any; nodeTitle: string; isMock?: boolean } | null>(null)
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

  // Topological sort based on workflow edges to get execution order
  const getTopologicalOrder = useCallback((): string[] => {
    if (!workflowData?.nodes || !workflowData?.edges) return []

    const nodeIds = workflowData.nodes.map((n: any) => n.id)
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()

    // Initialize
    nodeIds.forEach((id: string) => {
      inDegree.set(id, 0)
      adjList.set(id, [])
    })

    // Build adjacency list and calculate in-degrees
    workflowData.edges.forEach((edge: any) => {
      const { source, target } = edge
      adjList.get(source)?.push(target)
      inDegree.set(target, (inDegree.get(target) || 0) + 1)
    })

    // Queue with nodes that have no incoming edges (starts with triggers)
    const queue: string[] = []
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) queue.push(nodeId)
    })

    const result: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)

      adjList.get(current)?.forEach(neighbor => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) {
          queue.push(neighbor)
        }
      })
    }

    return result
  }, [workflowData])

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
      // Check if the current node exists in the workflow graph
      const currentNodeExists = allNodes.some(n => n.id === currentNodeId);

      // If the node doesn't exist yet (being configured before adding to graph),
      // show all nodes since we don't know where it will be placed
      if (!currentNodeExists) {
        logger.debug('📊 [VARIABLES] Current node not in graph yet, showing all nodes:', {
          currentNodeId,
          allNodesCount: allNodes.length
        });

        // Return all nodes with outputs (they'll all be "previous" once the node is added)
        const nodesWithOutputs = allNodes.filter(node => node.outputs && node.outputs.length > 0);

        // Sort by topological order
        const topologicalOrder = getTopologicalOrder()
        const sortedNodes = [...nodesWithOutputs].sort((a, b) => {
          const aIndex = topologicalOrder.indexOf(a.id)
          const bIndex = topologicalOrder.indexOf(b.id)

          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex
          }

          if (aIndex !== -1) return -1
          if (bIndex !== -1) return 1

          return 0
        })

        return sortedNodes;
      }

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

      // Sort nodes by workflow execution order (topological sort)
      const topologicalOrder = getTopologicalOrder()
      const sortedNodes = [...filteredNodes].sort((a, b) => {
        const aIndex = topologicalOrder.indexOf(a.id)
        const bIndex = topologicalOrder.indexOf(b.id)

        // If both are in topological order, sort by their order
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex
        }

        // If only one is in topological order, it comes first
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1

        // Otherwise maintain original order
        return 0
      })

      return sortedNodes;
    }
    
    // Sort all nodes when no currentNodeId (show all)
    const topologicalOrder = getTopologicalOrder()
    const sortedAllNodes = [...allNodes].sort((a, b) => {
      const aIndex = topologicalOrder.indexOf(a.id)
      const bIndex = topologicalOrder.indexOf(b.id)

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex
      }

      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1

      return 0
    })

    return sortedAllNodes;
  }, [workflowData, currentNodeId, getRelevantOutputs, getTopologicalOrder])

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

        logger.debug('🧪 [Test] Results received:', {
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

    // Use the new resolution system to get variable values
    const nodeValues = getNodeVariableValues(nodeId, workflowData || { nodes: [], edges: [] }, testResultsObj)

    return nodeValues[outputName] || null
  };

  // Generate mock data based on field type and name
  const generateMockData = (outputName: string, outputType?: string): any => {
    const nameLower = outputName.toLowerCase()

    // Email-related fields
    if (nameLower.includes('email')) return 'user@example.com'
    if (nameLower.includes('subject')) return 'Example Subject Line'
    if (nameLower.includes('body') || nameLower.includes('content') || nameLower.includes('message')) {
      return 'This is example message content...'
    }

    // ID fields
    if (nameLower.includes('id') || nameLower.includes('uuid')) return 'abc123-def456-ghi789'

    // Name fields
    if (nameLower.includes('name') || nameLower.includes('username') || nameLower.includes('author')) {
      return 'John Doe'
    }

    // URL fields
    if (nameLower.includes('url') || nameLower.includes('link')) return 'https://example.com/resource'

    // Date/Time fields
    if (nameLower.includes('date') || nameLower.includes('created') || nameLower.includes('updated')) {
      return new Date().toISOString()
    }

    // Title fields
    if (nameLower.includes('title')) return 'Example Title'

    // Description fields
    if (nameLower.includes('description')) return 'Example description text'

    // Status fields
    if (nameLower.includes('status')) return 'active'

    // Number/Count fields
    if (nameLower.includes('count') || nameLower.includes('number') || outputType === 'number') {
      return 42
    }

    // Boolean fields
    if (outputType === 'boolean') return true

    // Array fields
    if (outputType === 'array') return ['item1', 'item2', 'item3']

    // Object fields
    if (outputType === 'object') {
      return { key: 'value', example: 'data' }
    }

    // Default
    return 'Example data'
  }

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
            <div className="space-y-1">
              <ConfigurationSectionHeader label="Variables" className="border-none pb-0" />
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
                <p>Test actions to see actual output values</p>
                <p className="text-xs text-muted-foreground mt-1">Triggers show values only when they fire with real events</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ProfessionalSearch
          placeholder="Search variables..."
          className="h-9 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onClear={() => setSearchTerm('')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
    </div>

      {activeField && (
        <div className="px-3 py-2 border-b border-slate-200 bg-orange-50 dark:bg-orange-950 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></div>
            <span className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate" title={activeField.label || activeField.id}>
              Inserting into: <span className="text-orange-800 dark:text-orange-300 font-semibold">{activeField.label || activeField.id}</span>
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="px-6 py-2 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-center gap-2 text-[10px]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
              <span className="text-slate-600">Real data</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-orange-100 border border-orange-300"></div>
              <span className="text-slate-600">Example</span>
            </div>
          </div>
        </div>
      </div>

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
                            <span className={`text-sm font-medium truncate ${isNodeTested ? 'text-black' : 'text-slate-900'}`}>
                              {node.title}
                            </span>
                            {hasOutputs && (
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-600 border-slate-200 font-medium">
                                {node.outputs.length}
                              </Badge>
                            )}
                          </div>
                          {node.subtitle && (
                            <span className={`text-xs truncate block ${isNodeTested ? 'text-slate-700' : 'text-slate-600'}`}>
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
                          const displayVariableRef = createVariableAlias(variableRef, node.title, output.label || output.name)
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
                                  displayVariableRef,
                                  nodeTitle: node.title,
                                  outputName: output.name,
                                  outputLabel: output.label,
                                  dataTransfer: e.dataTransfer
                                })
                                handleDragStart(e, variableRef)
                                e.stopPropagation()
                                e.dataTransfer.setData('application/json', JSON.stringify({
                                  variable: variableRef,
                                  alias: displayVariableRef,
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
                                {(() => {
                                  // Only show data badges if test has been run
                                  if (!hasTestResults()) return null

                                  // Generate mock data if real data isn't available
                                  const displayValue = hasValue ? variableValue : generateMockData(output.name, output.type)
                                  const isMockData = !hasValue

                                  return (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge
                                            className={`text-[10px] h-5 px-1.5 font-medium flex-shrink-0 max-w-[150px] inline-block overflow-hidden whitespace-nowrap cursor-pointer transition-colors ${
                                              isMockData
                                                ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 hover:border-orange-300'
                                                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:border-green-300'
                                            }`}
                                            style={{ textOverflow: 'ellipsis' }}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setSelectedDataInfo({
                                                label: output.label || output.name,
                                                value: displayValue,
                                                nodeTitle: node.title,
                                                isMock: isMockData
                                              } as any)
                                              setDataDialogOpen(true)
                                            }}
                                          >
                                            {formatVariableValue(displayValue)}
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent side="left">
                                          <p className="text-xs">
                                            {isMockData ? 'Click to view example data' : 'Click to view full data'}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )
                                })()}
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

      {/* Full Data Dialog */}
      <Dialog open={dataDialogOpen} onOpenChange={setDataDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={selectedDataInfo?.isMock ? "text-orange-600 dark:text-orange-600" : "text-green-600 dark:text-green-600"}>
                {selectedDataInfo?.isMock ? 'Example Data:' : 'Test Data:'}
              </span>
              <span className="text-slate-900 dark:text-slate-900">{selectedDataInfo?.label}</span>
            </DialogTitle>
            <DialogDescription>
              <span className="text-slate-700 dark:text-slate-700">From: {selectedDataInfo?.nodeTitle}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <div className="rounded-lg p-4 border bg-slate-700 border-slate-600">
              <pre className="text-xs font-mono whitespace-pre-wrap break-words text-white">
                {selectedDataInfo?.value !== null && selectedDataInfo?.value !== undefined
                  ? typeof selectedDataInfo?.value === 'object'
                    ? JSON.stringify(selectedDataInfo?.value, null, 2)
                    : String(selectedDataInfo?.value)
                  : 'null'}
              </pre>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const textToCopy = selectedDataInfo?.value !== null && selectedDataInfo?.value !== undefined
                  ? typeof selectedDataInfo?.value === 'object'
                    ? JSON.stringify(selectedDataInfo?.value, null, 2)
                    : String(selectedDataInfo?.value)
                  : 'null'
                navigator.clipboard.writeText(textToCopy)
                toast({
                  title: "Copied!",
                  description: "Data copied to clipboard",
                })
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setDataDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
