"use client"

import React, { useState, useRef, useEffect } from 'react'
import { useAIVariables, formatVariableDisplay, AIVariable, AIVariableGroup } from '@/hooks/useAIVariables'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Variable, 
  Bot, 
  Hash, 
  AtSign,
  Sparkles,
  Info,
  Search,
  ChevronRight
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface AIVariableMenuProps {
  nodes: any[]
  currentNodeId?: string
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
  onVariableInsert?: (variable: AIVariable) => void
  buttonClassName?: string
  position?: 'left' | 'right'
}

export function AIVariableMenu({
  nodes,
  currentNodeId,
  inputRef,
  onVariableInsert,
  buttonClassName = '',
  position = 'left'
}: AIVariableMenuProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  const { variableGroups, insertVariable, hasAIAgent } = useAIVariables({
    nodes,
    currentNodeId,
    hasAIAgent: true // We control visibility from parent
  })

  // Focus search when menu opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleVariableSelect = (variable: AIVariable) => {
    insertVariable(variable, inputRef)
    if (onVariableInsert) {
      onVariableInsert(variable)
    }
    setIsOpen(false)
    setSearchQuery('')
  }

  // Filter variables based on search
  const filteredGroups = variableGroups.map(group => ({
    ...group,
    variables: group.variables.filter(v =>
      v.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(group => group.variables.length > 0)

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'trigger':
        return <AtSign className="w-3 h-3" />
      case 'node':
        return <Hash className="w-3 h-3" />
      case 'ai':
        return <Bot className="w-3 h-3" />
      case 'system':
        return <Variable className="w-3 h-3" />
      default:
        return null
    }
  }

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'trigger':
        return 'bg-blue-100 text-blue-800'
      case 'node':
        return 'bg-green-100 text-green-800'
      case 'ai':
        return 'bg-purple-100 text-purple-800'
      case 'system':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (!hasAIAgent) {
    return null // Don't show if no AI agent in workflow
  }

  return (
    <TooltipProvider>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className={`gap-2 ${buttonClassName}`}
              >
                <Sparkles className="w-4 h-4" />
                AI Variables
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Insert AI-powered variables</p>
          </TooltipContent>
        </Tooltip>
        
        <DropdownMenuContent 
          className="w-80" 
          align={position === 'left' ? 'start' : 'end'}
          sideOffset={5}
        >
          <DropdownMenuLabel className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              AI Variables
            </span>
            <Badge variant="secondary" className="text-xs">
              {variableGroups.reduce((acc, g) => acc + g.variables.length, 0)} available
            </Badge>
          </DropdownMenuLabel>
          
          <DropdownMenuSeparator />
          
          {/* Search */}
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search variables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          
          <ScrollArea className="h-[400px]">
            {filteredGroups.length === 0 ? (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No variables found
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.id} className="mb-2">
                  <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
                    {group.icon && <span>{group.icon}</span>}
                    {group.name}
                  </DropdownMenuLabel>
                  
                  {group.variables.map((variable) => (
                    <DropdownMenuItem
                      key={`${group.id}_${variable.id}`}
                      onClick={() => handleVariableSelect(variable)}
                      className="flex items-start gap-2 py-2 cursor-pointer"
                    >
                      <div className="mt-0.5">
                        {getCategoryIcon(variable.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {variable.label}
                          </span>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getCategoryColor(variable.category)}`}
                          >
                            {variable.value}
                          </Badge>
                        </div>
                        {variable.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {variable.description}
                          </p>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))
            )}
          </ScrollArea>
          
          <DropdownMenuSeparator />
          
          <div className="px-2 py-2">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-3 h-3 mt-0.5" />
              <div>
                <p>Variables are resolved at runtime based on workflow data.</p>
                <p className="mt-1">
                  <strong>{`{{var}}`}</strong> - Complex variables
                  <br />
                  <strong>[var]</strong> - Simple variables
                </p>
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  )
}

/**
 * Inline variable selector for text inputs
 */
export function InlineVariableSelector({
  nodes,
  currentNodeId,
  value,
  onChange,
  placeholder,
  className = ''
}: {
  nodes: any[]
  currentNodeId?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showVariables, setShowVariables] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  
  const { hasAIAgent } = useAIVariables({ nodes, currentNodeId, hasAIAgent: true })
  
  useEffect(() => {
    // Detect when user types [ or {{ to show variable menu
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!inputRef.current) return
      
      const { selectionStart } = inputRef.current
      const textBeforeCursor = value.substring(0, selectionStart || 0)
      
      if (textBeforeCursor.endsWith('[') || textBeforeCursor.endsWith('{{')) {
        setShowVariables(true)
        setCursorPosition(selectionStart || 0)
      }
    }
    
    if (inputRef.current) {
      inputRef.current.addEventListener('keyup', handleKeyUp)
      return () => inputRef.current?.removeEventListener('keyup', handleKeyUp)
    }
  }, [value])
  
  const handleVariableInsert = (variable: AIVariable) => {
    const beforeCursor = value.substring(0, cursorPosition)
    const afterCursor = value.substring(cursorPosition)
    
    // Remove the [ or {{ that triggered the menu
    let newBefore = beforeCursor
    if (beforeCursor.endsWith('[')) {
      newBefore = beforeCursor.slice(0, -1)
    } else if (beforeCursor.endsWith('{{')) {
      newBefore = beforeCursor.slice(0, -2)
    }
    
    const newValue = newBefore + variable.value + afterCursor
    onChange(newValue)
    setShowVariables(false)
  }
  
  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
      
      {hasAIAgent && (
        <div className="absolute top-1 right-1">
          <AIVariableMenu
            nodes={nodes}
            currentNodeId={currentNodeId}
            inputRef={inputRef}
            onVariableInsert={handleVariableInsert}
            buttonClassName="h-7 text-xs"
            position="right"
          />
        </div>
      )}
      
      {showVariables && (
        <div className="absolute z-50 mt-1 w-full max-w-md bg-white border rounded-md shadow-lg">
          {/* Quick variable picker would go here */}
        </div>
      )}
    </div>
  )
}