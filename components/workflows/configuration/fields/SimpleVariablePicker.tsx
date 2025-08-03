"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Search, Copy, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

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
          variant="ghost" 
          size="icon"
          className="h-9 w-9 p-0"
        >
          <ChevronDown className="h-4 w-4" />
          <span className="sr-only">Open variable picker</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
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
        <ScrollArea className="h-[300px]">
          {filteredNodes.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No variables available
            </div>
          ) : (
            filteredNodes.map((node) => (
              <div key={node.id} className="p-2">
                <div className="text-xs font-medium px-2 py-1.5">{node.title}</div>
                <div className="space-y-1">
                  {node.outputs.map((output: any) => {
                    const variableRef = `{{${node.id}.${output.name}}}`
                    return (
                      <div
                        key={`${node.id}-${output.name}`}
                        className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <div 
                          className="flex-1 flex items-center gap-2" 
                          onClick={() => handleVariableSelect(variableRef)}
                        >
                          <Badge variant="outline" className="text-xs">
                            {output.type}
                          </Badge>
                          <span className="text-sm">{output.label || output.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            copyToClipboard(variableRef)
                          }}
                        >
                          {copiedVariable === variableRef ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span className="sr-only">Copy</span>
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}