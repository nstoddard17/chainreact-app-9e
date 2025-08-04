"use client"

import React, { useState, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Search, ChevronDown, ChevronRight, Copy, Check, Variable } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'

interface VariablePickerSidePanelProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableSelect?: (variable: string) => void
}

export function VariablePickerSidePanel({
  workflowData,
  currentNodeId,
  onVariableSelect
}: VariablePickerSidePanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  // Get available nodes from workflow data
  const nodes = useMemo(() => {
    return workflowData?.nodes?.map((node: any) => {
      // Get the node component definition to access outputSchema
      const nodeComponent = ALL_NODE_COMPONENTS.find(comp => comp.type === node.data?.type)
      
      // Get outputs from the node component's outputSchema
      const outputs = nodeComponent?.outputSchema || []
      
      return {
        id: node.id,
        title: node.data?.title || node.data?.type || node.type || 'Unknown Node',
        outputs: Array.isArray(outputs) ? outputs : []
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
  }, [workflowData])

  // Filter nodes and outputs based on search term
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => {
      const nodeMatches = node.title.toLowerCase().includes(searchTerm.toLowerCase())
      const outputMatches = node.outputs.some((output: any) => 
        output.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        output.name.toLowerCase().includes(searchTerm.toLowerCase())
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
      return newSet
    })
  }

  // Auto-expand nodes when searching
  React.useEffect(() => {
    if (searchTerm) {
      const nodesToExpand = new Set<string>()
      filteredNodes.forEach(node => {
        const hasMatchingOutputs = node.outputs.some((output: any) => 
          output.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          output.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        if (hasMatchingOutputs) {
          nodesToExpand.add(node.id)
        }
      })
      setExpandedNodes(nodesToExpand)
    } else {
      setExpandedNodes(new Set())
    }
  }, [searchTerm, filteredNodes])

  const handleVariableSelect = (variable: string) => {
    if (onVariableSelect) {
      onVariableSelect(variable)
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
    e.dataTransfer.setData('text/plain', variable)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <div className="w-80 h-full bg-gradient-to-br from-slate-50 to-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-blue-500 to-purple-600">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-r from-purple-400 to-purple-600 rounded-md shadow-sm">
            <span className="text-sm font-mono font-semibold text-white">{`{}`}</span>
          </div>
          <h3 className="text-lg font-semibold text-white">Variables</h3>
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

      {/* Variables List */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {filteredNodes.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              {searchTerm ? 'No variables found' : 'No variables available'}
            </div>
          ) : (
            filteredNodes.map((node) => {
              const isExpanded = expandedNodes.has(node.id)
              const hasOutputs = node.outputs && node.outputs.length > 0
              
              return (
                <Collapsible 
                  key={node.id} 
                  open={isExpanded} 
                  onOpenChange={() => toggleNodeExpansion(node.id)}
                  className="mb-3 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm"
                >
                  {/* Node Header */}
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors w-full">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-slate-500" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-slate-500" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-900 truncate">{node.title}</span>
                        {hasOutputs && (
                          <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 border-slate-200">
                            {node.outputs.length}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  {/* Node Outputs */}
                  <CollapsibleContent className="bg-white">
                    {hasOutputs ? (
                      node.outputs.map((output: any) => {
                        const variableRef = `{{${node.id}.${output.name}}}`
                        return (
                          <div
                            key={`${node.id}-${output.name}`}
                            className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors border-t border-slate-100"
                            draggable
                            onDragStart={(e) => handleDragStart(e, variableRef)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleVariableSelect(variableRef)}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                {output.type || 'string'}
                              </Badge>
                              <span className="text-sm text-slate-700 truncate">{output.label || output.name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-blue-100"
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
          Drag variables to fields or click to copy
        </p>
      </div>
    </div>
  )
} 