"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Search, Copy, Check, Variable } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface SimpleVariablePickerProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableSelect: (variable: string) => void
  fieldType?: string
}

/**
 * A simplified variable picker that only shows a button to open the variable selector
 * without any additional text input field
 */
export function SimpleVariablePicker({
  workflowData,
  currentNodeId,
  onVariableSelect,
  fieldType
}: SimpleVariablePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [copiedVariable, setCopiedVariable] = React.useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(new Set())
  const { toast } = useToast()

  // Get available nodes from workflow data
  const nodes = workflowData?.nodes?.map((node: any) => ({
    id: node.id,
    title: node.data?.title || node.data?.type || 'Unknown Node',
    outputs: node.data?.outputSchema || []
  })) || []

  // Filter nodes and outputs based on search term
  const filteredNodes = nodes.filter(node => {
    const nodeMatches = node.title.toLowerCase().includes(searchTerm.toLowerCase())
    const outputMatches = node.outputs.some((output: any) => 
      output.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      output.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    return nodeMatches || outputMatches
  })

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
    onVariableSelect(variable)
    setIsOpen(false)
    setSearchTerm('')
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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
        <PopoverContent className="w-[350px] p-0" align="end">
          <div className="p-3 border-b">
            <div className="text-sm font-medium mb-2">Insert Variable</div>
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
          <ScrollArea className="h-[400px]">
            {filteredNodes.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No variables available
              </div>
            ) : (
              filteredNodes.map((node) => {
                const isExpanded = expandedNodes.has(node.id)
                const hasOutputs = node.outputs && node.outputs.length > 0
                
                return (
                  <div key={node.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Node Header - Clickable to expand/collapse */}
                    <div 
                      className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
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
                      </div>
                    </div>
                    
                    {/* Node Outputs - Expandable dropdown */}
                    {isExpanded && hasOutputs && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {node.outputs.map((output: any) => {
                          const variableRef = `{{${node.id}.${output.name}}}`
                          return (
                            <div
                              key={`${node.id}-${output.name}`}
                              className="flex items-center justify-between px-4 py-2 hover:bg-gray-100 cursor-pointer transition-colors"
                              onClick={() => handleVariableSelect(variableRef)}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Badge variant="outline" className="text-xs bg-white">
                                  {output.type}
                                </Badge>
                                <span className="text-sm text-gray-700">{output.label || output.name}</span>
                              </div>
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