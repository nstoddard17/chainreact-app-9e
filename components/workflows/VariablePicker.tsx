"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Search, Copy, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { resolveVariableValue } from '@/lib/workflows/variableResolution'
import { buildVariableReference } from '@/lib/workflows/variableInsertion'

interface VariablePickerProps {
  value?: string
  onChange?: (value: string) => void
  availableNodes?: Array<{
    id: string
    title: string
    outputs: Array<{
      name: string
      label: string
      type: string
      description: string
    }>
  }>
  placeholder?: string
  className?: string
  // Legacy props for backward compatibility
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableSelect?: (variable: string) => void
  fieldType?: string
  currentNodeType?: string
  trigger?: React.ReactNode
}

export function VariablePicker({
  value = "",
  onChange,
  availableNodes = [],
  placeholder = "Select a variable or enter text...",
  className = "",
  // Legacy props
  workflowData,
  currentNodeId,
  onVariableSelect,
  fieldType,
  currentNodeType,
  trigger
}: VariablePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null)
  const { toast } = useToast()

  // Function to handle popover state changes to prevent auto-closing
  const handleOpenChange = (open: boolean) => {
    // Only allow manual closing by clicking the trigger button or outside the popover
    setIsOpen(open);
  };

  // Handle legacy interface
  const isLegacyMode = !onChange && onVariableSelect
  const handleChange = isLegacyMode ? onVariableSelect : onChange

  // Get available nodes from either new or legacy interface
  const allNodes = availableNodes.length > 0 ? availableNodes : 
    (workflowData?.nodes?.map((node: any) => ({
      id: node.id,
      title: node.data?.title || node.data?.type || 'Unknown Node',
      outputs: node.data?.outputSchema || []
    })) || [])
    
  // Filter nodes to only show previous nodes if we have a current node ID
  const nodes = currentNodeId ? getPreviousNodes(allNodes, currentNodeId, workflowData) : allNodes
  
  // Helper function to get previous nodes in the workflow
  function getPreviousNodes(nodes: any[], currentNodeId: string, workflowData: any) {
    if (!workflowData || !currentNodeId) return nodes
    
    // Function to find previous nodes recursively
    const findPreviousNodes = (nodeId: string, visited = new Set<string>()): string[] => {
      if (visited.has(nodeId)) return []
      visited.add(nodeId)
      
      // Find edges where this node is the target
      const incomingEdges = workflowData.edges.filter((edge: any) => edge.target === nodeId)
      
      // No incoming edges means no previous nodes
      if (incomingEdges.length === 0) return []
      
      // Get the source nodes from incoming edges
      const sourceNodeIds = incomingEdges.map((edge: any) => edge.source)
      
      // For each source node, also get its previous nodes
      const allPreviousNodes: string[] = [...sourceNodeIds]
      
      sourceNodeIds.forEach(sourceId => {
        const previousNodes = findPreviousNodes(sourceId, visited)
        allPreviousNodes.push(...previousNodes)
      })
      
      return allPreviousNodes
    }
    
    // Get all previous node IDs
    const previousNodeIds = findPreviousNodes(currentNodeId)
    
    // Find trigger nodes (they're always available)
    const triggerNodes = workflowData.nodes.filter((node: any) => node.data?.isTrigger).map((node: any) => node.id)
    
    // Return filtered nodes - include previous nodes, trigger nodes, and any nodes with outputs (excluding current node)
    return nodes.filter((node: any) => 
      node.id !== currentNodeId && // Exclude the current node being configured
      (previousNodeIds.includes(node.id) || 
      triggerNodes.includes(node.id) ||
      (node.outputs && node.outputs.length > 0)) // Include any node that has outputs
    )
  }

  // Function to get relevant AI agent outputs based on current node type
  const getRelevantAIAgentOutputs = (currentNodeType: string): string[] => {
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
  };

  // Filter nodes and outputs based on search term and context
  const filteredNodes = nodes.filter(node => {
    // Context-aware filtering for AI agent nodes
    if (node.title === "AI Agent" || node.title.toLowerCase().includes("ai agent")) {
      const relevantOutputs = getRelevantAIAgentOutputs(currentNodeType || '');
      console.log(`🎯 [CONTEXT-AWARE] AI Agent filtering in VariablePicker for ${currentNodeType}:`, {
        currentNodeType,
        relevantOutputs,
        availableOutputs: node.outputs.map((o: any) => o.name),
        originalOutputsCount: node.outputs.length
      });
      
      // Filter AI agent outputs to only show relevant ones for the current action type
      const aiNodeOutputs = node.outputs.filter((output: any) => 
        relevantOutputs.includes(output.name)
      );
      
      console.log(`🎯 [CONTEXT-AWARE] After filtering:`, {
        filteredOutputsCount: aiNodeOutputs.length,
        filteredOutputs: aiNodeOutputs.map((o: any) => o.name)
      });
      
      // Update the node's outputs
      node.outputs = aiNodeOutputs;
    }

    const nodeMatches = node.title.toLowerCase().includes(searchTerm.toLowerCase())
    const outputMatches = node.outputs.some((output: any) => 
      output.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      output.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    return nodeMatches || outputMatches
  })

  const handleVariableSelect = (variable: string) => {
    if (handleChange) {
      // INSERT THE TEMPLATE VARIABLE FOR RUNTIME RESOLUTION
      // Do NOT try to resolve it at design time - that should happen during workflow execution
      console.log(`🎯 VariablePicker handleVariableSelect inserting template variable: ${variable}`)
      handleChange(variable)
    }
    // Keep the popover open after selecting a variable
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

  const insertVariable = (variable: string) => {
    // INSERT THE TEMPLATE VARIABLE FOR RUNTIME RESOLUTION
    // Do NOT try to resolve it at design time - that should happen during workflow execution
    
    console.log(`🎯 VariablePicker inserting template variable: ${variable}`)
    
    // If there's already text, insert the variable at cursor position or append
    if (value && handleChange) {
      // For now, just append. In a more sophisticated version, we could track cursor position
      handleChange(value + variable)
    } else if (handleChange) {
      handleChange(variable)
    }
    // Keep the popover open after inserting a variable
    // setIsOpen(false) - removed to keep dropdown persistent
    // setSearchTerm('') - keep search term for multiple selections
  }

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <div className="p-4 border-b">
              <Label htmlFor="variable-search" className="text-sm font-medium">
                Available Variables
              </Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="variable-search"
                  placeholder="Search variables..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <ScrollArea className="h-64">
              <div className="p-2">
                {filteredNodes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No variables found' : 'No variables available'}
                  </div>
                ) : (
                  filteredNodes.map((node) => (
                    <div key={node.id} className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {node.title}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(buildVariableReference(node.id))}
                          className="h-6 px-2"
                        >
                          {copiedVariable === buildVariableReference(node.id) ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      
                      <div className="space-y-1 ml-4">
                        {node.outputs
                          .filter(output => 
                            !searchTerm || 
                            output.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            output.name.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          .map((output) => (
                            <div
                              key={output.name}
                              className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => insertVariable(buildVariableReference(node.id, output.name))}
                            >
                              <div className="flex-1">
                                <div className="text-sm font-medium">{output.label}</div>
                                <div className="text-xs text-muted-foreground">
                                  {output.description}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {`{{${node.title} → ${output.label}}}`}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {buildVariableReference(node.id, output.name)}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(buildVariableReference(node.id, output.name))
                                }}
                                className="h-6 px-2"
                              >
                                {copiedVariable === buildVariableReference(node.id, output.name) ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            
            <div className="p-4 border-t bg-muted/50">
              <div className="text-xs text-muted-foreground">
                <p className="mb-2">Variable Reference Format:</p>
                <ul className="space-y-1">
                  <li><code className="bg-background px-1 rounded">{"{{nodeId}}"}</code> - All output data</li>
                  <li><code className="bg-background px-1 rounded">{"{{nodeId.fieldName}}"}</code> - Specific field</li>
                  <li><code className="bg-background px-1 rounded">{"{{var.variableName}}"}</code> - Custom variable</li>
                </ul>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

export default VariablePicker 
