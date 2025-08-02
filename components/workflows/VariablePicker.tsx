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
  trigger
}: VariablePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null)
  const { toast } = useToast()

  // Handle legacy interface
  const isLegacyMode = !onChange && onVariableSelect
  const handleChange = isLegacyMode ? onVariableSelect : onChange

  // Get available nodes from either new or legacy interface
  const nodes = availableNodes.length > 0 ? availableNodes : 
    (workflowData?.nodes?.map((node: any) => ({
      id: node.id,
      title: node.data?.title || node.data?.type || 'Unknown Node',
      outputs: node.data?.outputSchema || []
    })) || [])

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
    if (handleChange) {
      handleChange(variable)
    }
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

  const insertVariable = (variable: string) => {
    // If there's already text, insert the variable at cursor position or append
    if (value && handleChange) {
      // For now, just append. In a more sophisticated version, we could track cursor position
      handleChange(value + variable)
    } else if (handleChange) {
      handleChange(variable)
    }
    setIsOpen(false)
    setSearchTerm('')
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
        <Popover open={isOpen} onOpenChange={setIsOpen}>
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
                          onClick={() => copyToClipboard(`{{${node.id}.output}}`)}
                          className="h-6 px-2"
                        >
                          {copiedVariable === `{{${node.id}.output}}` ? (
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
                              onClick={() => insertVariable(`{{${node.id}.output.${output.name}}}`)}
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
                                  {`{{${node.id}.output.${output.name}}}`}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  copyToClipboard(`{{${node.id}.output.${output.name}}}`)
                                }}
                                className="h-6 px-2"
                              >
                                {copiedVariable === `{{${node.id}.output.${output.name}}}` ? (
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
                  <li><code className="bg-background px-1 rounded">{"{{nodeId.output}}"}</code> - All output data</li>
                  <li><code className="bg-background px-1 rounded">{"{{nodeId.output.fieldName}}"}</code> - Specific field</li>
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