"use client"

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Search, Copy, Check, Variable, Play, CircleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { apiClient } from '@/lib/apiClient'
import { useWorkflowTestStore } from '@/stores/workflowTestStore'
import { resolveVariableValue, getNodeVariableValues } from '@/lib/workflows/variableResolution'
import { logger } from '@/lib/utils/logger'

interface SimpleVariablePickerProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableSelect: (variable: string) => void
  fieldType?: string
  currentNodeType?: string
}

/**
 * A simplified variable picker that shows available variables from previous nodes
 * and provides a way to test the workflow and view actual values
 */
function SimpleVariablePickerComponent({
  workflowData,
  currentNodeId,
  onVariableSelect,
  fieldType,
  currentNodeType
}: SimpleVariablePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [isTestRunning, setIsTestRunning] = useState(false)
  const { toast } = useToast()

  // Access test store data
  const { 
    testResults, 
    executionPath, 
    testTimestamp,
    getNodeTestResult, 
    hasTestResults, 
    setTestResults,
    clearTestResults
  } = useWorkflowTestStore()

  const getPreviousNodeIds = (): string[] => {
    if (!workflowData || !currentNodeId) return []

    const findPreviousNodes = (nodeId: string, visited = new Set<string>()): string[] => {
      if (visited.has(nodeId)) return []
      visited.add(nodeId)

      const incomingEdges = workflowData.edges.filter(edge => edge.target === nodeId)
      if (incomingEdges.length === 0) return []

      const sourceNodeIds = incomingEdges.map(edge => edge.source)
      const allPreviousNodes: string[] = [...sourceNodeIds]

      sourceNodeIds.forEach(sourceId => {
        const previousNodes = findPreviousNodes(sourceId, visited)
        allPreviousNodes.push(...previousNodes)
      })

      return allPreviousNodes
    }

    return findPreviousNodes(currentNodeId)
  }

  // Get nodes to display - previous nodes only when in a node config
  // Memoize allNodes to prevent recreation on every render
  const allNodes = useMemo(() => {
    return workflowData?.nodes?.map((node: any) => ({
      id: node.id,
      title: node.data?.title || node.data?.type || 'Unknown Node',
      outputs: node.data?.outputSchema || []
    })) || []
  }, [workflowData?.nodes])

  const previousNodeIdSet = useMemo(() => {
    if (!workflowData || !currentNodeId) return new Set<string>()
    return new Set(getPreviousNodeIds())
  }, [workflowData, currentNodeId])

  // Memoize nodes to prevent recreation on every render
  const nodes = useMemo(() => {
    return currentNodeId
      ? allNodes.filter(node => {
          if (node.id === currentNodeId) return false
          const hasOutputs = node.outputs && node.outputs.length > 0
          return hasOutputs && previousNodeIdSet.has(node.id)
        })
      : allNodes.filter(node => node.outputs && node.outputs.length > 0)
  }, [allNodes, currentNodeId, previousNodeIdSet])

  // Function to get relevant AI agent outputs based on current node type
  // Memoized to prevent recreation on every render
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

  // Filter nodes and outputs based on search term and context
  // Memoize to prevent infinite loops in useEffect dependencies
  const filteredNodes = useMemo(() => {
    return nodes.map(node => {
      // Context-aware filtering for AI agent nodes
      if (node.title === "AI Agent" || node.title.toLowerCase().includes("ai agent")) {
        const relevantOutputs = getRelevantAIAgentOutputs(currentNodeType || '');
        logger.debug(`🎯 [CONTEXT-AWARE] AI Agent filtering in SimpleVariablePicker for ${currentNodeType}:`, {
          currentNodeType,
          relevantOutputs,
          availableOutputs: node.outputs.map((o: any) => o.name),
          originalOutputsCount: node.outputs.length
        });

        // Filter AI agent outputs to only show relevant ones for the current action type
        const aiNodeOutputs = node.outputs.filter((output: any) =>
          relevantOutputs.includes(output.name)
        );

        logger.debug(`🎯 [CONTEXT-AWARE] SimpleVariablePicker After filtering:`, {
          filteredOutputsCount: aiNodeOutputs.length,
          filteredOutputs: aiNodeOutputs.map((o: any) => o.name)
        });

        // Return a new node object with filtered outputs (don't mutate original)
        return {
          ...node,
          outputs: aiNodeOutputs
        };
      }

      return node;
    }).filter(node => {
      const nodeMatches = node.title.toLowerCase().includes(searchTerm.toLowerCase())
      const outputMatches = node.outputs.some((output: any) =>
        output.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        output.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      return nodeMatches || outputMatches
    })
  }, [nodes, searchTerm, currentNodeType, getRelevantAIAgentOutputs])

  // Handle node expansion toggle
  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  // Auto-expand nodes when searching
  useEffect(() => {
    if (searchTerm) {
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
      // Only update if the set actually changed
      setExpandedNodes(prev => {
        if (prev.size !== nodesToExpand.size) return nodesToExpand
        for (const id of nodesToExpand) {
          if (!prev.has(id)) return nodesToExpand
        }
        return prev
      })
    } else if (hasTestResults()) {
      // Expand nodes that were executed in the test
      const nodesToExpand = new Set<string>()
      executionPath.forEach(nodeId => {
        nodesToExpand.add(nodeId)
      })
      // Only update if the set actually changed
      setExpandedNodes(prev => {
        if (prev.size !== nodesToExpand.size) return nodesToExpand
        for (const id of nodesToExpand) {
          if (!prev.has(id)) return nodesToExpand
        }
        return prev
      })
    } else {
      // Only clear if not already empty
      setExpandedNodes(prev => prev.size === 0 ? prev : new Set())
    }
  }, [searchTerm, filteredNodes, executionPath])

  const handleVariableSelect = (variable: string) => {
    // INSERT THE TEMPLATE VARIABLE FOR RUNTIME RESOLUTION
    // Do NOT try to resolve it at design time - that should happen during workflow execution
    logger.debug(`🎯 SimpleVariablePicker inserting template variable: ${variable}`)
    onVariableSelect(variable)
    
    // Keep the dropdown open after selecting a variable
    // setIsOpen(false) - removed to keep dropdown persistent
    // setSearchTerm('') - keep search term for multiple selections
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
        nodeId: triggerNode.id,
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

  // Function to handle popover state changes
  const handleOpenChange = (open: boolean) => {
    // If closing, check if it's due to an outside click
    if (!open) {
      // We set a timeout to allow click handlers inside to execute first
      setTimeout(() => setIsOpen(open), 100);
    } else {
      // When opening, set immediately
      setIsOpen(open);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button 
          size="sm"
          className="h-10 w-10 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 rounded-md"
          type="button"
          title="Insert workflow variable"
        >
          <span className="text-sm font-mono font-semibold">{`{}`}</span>
          <span className="sr-only">Insert workflow variable</span>
        </Button>
      </PopoverTrigger>
        <PopoverContent className="w-[380px] p-0" align="end">
          <div className="p-3 border-b flex justify-between items-center">
            <div className="text-sm font-medium">Insert Variable</div>
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
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">Test</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Test workflow to see actual values</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search variables..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Test results timestamp */}
          {hasTestResults() && (
            <div className="px-3 py-2 bg-slate-50 border-b flex justify-between items-center">
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
          
          <ScrollArea className="h-[400px]">
            {filteredNodes.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {currentNodeId ? (
                  <>
                    <CircleAlert className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                    <p>No previous nodes available.</p>
                    <p className="text-xs mt-1 text-slate-400">
                      Variables can only come from nodes that appear before this one in the workflow.
                    </p>
                  </>
                ) : (
                  "No variables available"
                )}
              </div>
            ) : (
              filteredNodes.map((node) => {
                const isExpanded = expandedNodes.has(node.id)
                const hasOutputs = node.outputs && node.outputs.length > 0
                const nodeResult = getNodeTestResult(node.id)
                const isNodeTested = nodeResult !== null
                
                return (
                  <div key={node.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Node Header - Clickable to expand/collapse */}
                    <div 
                      className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors ${isNodeTested ? 'bg-green-50 hover:bg-green-100' : ''}`}
                      onClick={() => hasOutputs && toggleNodeExpansion(node.id)}
                    >
                      <div className="flex items-center gap-2">
                        {hasOutputs && (
                          <div className="w-4 h-4 flex items-center justify-center">
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3 text-gray-500" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-gray-500" />
                            )}
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900">{node.title}</span>
                        {hasOutputs && (
                          <Badge variant="secondary" className="text-xs">
                            {node.outputs.length}
                          </Badge>
                        )}
                        {isNodeTested && (
                          <div className="w-2 h-2 rounded-full bg-green-500" title="Test data available"></div>
                        )}
                      </div>
                    </div>
                    
                    {/* Node Outputs - Expandable dropdown */}
                    {isExpanded && hasOutputs && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {node.outputs.map((output: any) => {
                          const variableRef = `{{${node.title}.${output.label || output.name}}}`
                          const variableValue = getVariableValue(node.id, output.name)
                          const hasValue = variableValue !== null
                          
                          return (
                            <div
                              key={`${node.id}-${output.name}`}
                              className="flex items-center justify-between px-4 py-2 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors"
                              onClick={() => handleVariableSelect(variableRef)}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Badge variant="outline" className={`text-xs bg-white ${hasValue ? 'border-green-300' : ''}`}>
                                  {output.type}
                                </Badge>
                                <span className="text-sm text-gray-700">{output.label || output.name}</span>
                              </div>
                              
                              <div className="flex items-center">
                                {/* Show variable value if available */}
                                {hasValue && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="mr-2 bg-green-100 text-green-800 hover:bg-green-200 transition-colors">
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
                                  className="h-6 w-6 p-0 hover:bg-gray-200"
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
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
  )
}

// Wrap in React.memo to prevent unnecessary re-renders
export const SimpleVariablePicker = React.memo(SimpleVariablePickerComponent)
