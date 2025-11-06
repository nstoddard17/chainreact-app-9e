"use client"

import React, { useState, useRef, useEffect } from 'react'
import { useAIVariables, AIVariable, AIVariableGroup } from '@/hooks/useAIVariables'
import { Button } from '@/components/ui/button'
import { ProfessionalSearch } from '@/components/ui/professional-search'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  Variable, Bot, Hash, AtSign, Sparkles, X,
  ChevronDown, Copy, Plus, Grip, Info, Code, Wand2,
  BookOpen, Lightbulb, ChevronRight, MousePointer, HelpCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface AIVariablePanelProps {
  nodes: any[]
  currentNodeId?: string
  onVariableSelect?: (variable: AIVariable) => void
  onDragStart?: (variable: AIVariable) => void
  onClose?: () => void
}

// Pre-built AI instructions
const AI_INSTRUCTIONS = [
  { id: 'summarize', var: '{{AI:summarize}}', desc: 'Summarize content', icon: '📝' },
  { id: 'extract', var: '{{AI:extract_key_points}}', desc: 'Extract key points', icon: '🔍' },
  { id: 'respond', var: '{{AI:generate_response}}', desc: 'Generate response', icon: '💬' },
  { id: 'priority', var: '{{AI:assess_priority}}', desc: 'Assess priority', icon: '⚡' },
  { id: 'categorize', var: '{{AI:categorize}}', desc: 'Categorize content', icon: '🏷️' },
  { id: 'format', var: '{{AI:format_professionally}}', desc: 'Professional format', icon: '👔' },
  { id: 'greeting', var: '{{AI:casual_greeting}}', desc: 'Casual greeting', icon: '👋' },
  { id: 'next', var: '{{AI:next_steps}}', desc: 'Suggest next steps', icon: '➡️' },
  { id: 'translate', var: '{{AI:translate:spanish}}', desc: 'Translate (Spanish)', icon: '🌐' },
  { id: 'sentiment', var: '{{AI:sentiment_analysis}}', desc: 'Analyze sentiment', icon: '😊' },
  { id: 'extract_data', var: '{{AI:extract_data}}', desc: 'Extract structured data', icon: '📊' },
  { id: 'validate', var: '{{AI:validate_format}}', desc: 'Validate & fix format', icon: '✅' }
]

// Quick snippets for common patterns
const QUICK_SNIPPETS = [
  {
    name: 'Email Reply',
    snippet: 'Generate a [tone] response to [message] addressing [subject]',
    category: 'email'
  },
  {
    name: 'Task Assignment',
    snippet: 'Analyze {{trigger.data}} and assign to appropriate team',
    category: 'routing'
  },
  {
    name: 'Data Processing',
    snippet: 'Extract data from {{trigger.webhook.body}} and format as JSON',
    category: 'data'
  },
  {
    name: 'Content Analysis',
    snippet: '{{AI:summarize}} the content and {{AI:assess_priority}}',
    category: 'analysis'
  }
]

export function AIVariablePanel({
  nodes,
  currentNodeId,
  onVariableSelect,
  onDragStart,
  onClose
}: AIVariablePanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('variables')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['simple']))
  const [hoveredVariable, setHoveredVariable] = useState<string | null>(null)
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  const { variableGroups = [], insertVariable } = useAIVariables({
    nodes,
    currentNodeId,
    hasAIAgent: true
  })

  // Add default simple variables if no groups exist
  const defaultSimpleVariables: AIVariableGroup = {
    id: 'simple',
    name: 'Simple Variables',
    icon: '📋',
    variables: [
      { id: 's1', label: 'Name', value: '[name]', description: 'User or sender name', category: 'system' },
      { id: 's2', label: 'Email', value: '[email]', description: 'Email address', category: 'system' },
      { id: 's3', label: 'Subject', value: '[subject]', description: 'Email or message subject', category: 'system' },
      { id: 's4', label: 'Message', value: '[message]', description: 'Message content', category: 'system' },
      { id: 's5', label: 'Date', value: '[date]', description: 'Current date', category: 'system' },
      { id: 's6', label: 'Time', value: '[time]', description: 'Current time', category: 'system' },
      { id: 's7', label: 'Username', value: '[username]', description: 'Username', category: 'system' },
      { id: 's8', label: 'Channel', value: '[channel]', description: 'Channel or room name', category: 'system' }
    ]
  }

  // Combine default variables with any existing groups
  const allVariableGroups = variableGroups.length > 0 
    ? variableGroups 
    : [defaultSimpleVariables]

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  const handleVariableClick = (variable: AIVariable) => {
    if (onVariableSelect) {
      onVariableSelect(variable)
    }
  }

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedVariable(value)
    setTimeout(() => setCopiedVariable(null), 2000)
  }

  const handleDragStart = (e: React.DragEvent, variable: AIVariable) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', variable.value)
    if (onDragStart) {
      onDragStart(variable)
    }
  }

  // Filter based on search
  const filterItems = (items: any[], query: string) => {
    if (!query) return items
    const q = query.toLowerCase()
    return items.filter(item => 
      item.var?.toLowerCase().includes(q) ||
      item.desc?.toLowerCase().includes(q) ||
      item.label?.toLowerCase().includes(q) ||
      item.value?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.name?.toLowerCase().includes(q) ||
      item.snippet?.toLowerCase().includes(q)
    )
  }

  const filteredGroups = allVariableGroups.map(group => ({
    ...group,
    variables: filterItems(group.variables, searchQuery)
  })).filter(group => group.variables.length > 0)

  const filteredInstructions = filterItems(AI_INSTRUCTIONS, searchQuery)
  const filteredSnippets = filterItems(QUICK_SNIPPETS, searchQuery)

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'trigger': return <AtSign className="w-3 h-3" />
      case 'node': return <Hash className="w-3 h-3" />
      case 'ai': return <Bot className="w-3 h-3" />
      case 'system': return <Variable className="w-3 h-3" />
      default: return <Variable className="w-3 h-3" />
    }
  }

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'trigger': return 'text-blue-600 bg-blue-100'
      case 'node': return 'text-green-600 bg-green-100'
      case 'ai': return 'text-purple-600 bg-purple-100'
      case 'system': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  // Always show the panel in AI Agent modal
  // if (!hasAIAgent) {
  //   return null
  // }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h3 className="font-semibold">AI Variables</h3>
            </div>
          </div>
          
          {/* Search */}
          <ProfessionalSearch
            ref={searchInputRef}
            placeholder="Search variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            className="h-9"
          />

          {/* Instructions */}
          <div className="mt-3 p-2 bg-muted rounded-lg text-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <MousePointer className="w-3 h-3" />
                <span className="font-medium">How to use:</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-sm">
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="font-semibold mb-1">Variable Types:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li><strong>[simple]</strong> - Direct text replacement</li>
                        <li><strong>{`{{complex}}`}</strong> - Nested data & objects</li>
                        <li><strong>{`{{AI:instruction}}`}</strong> - AI-processed content</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold mb-1">Usage Examples:</p>
                      <code className="block bg-muted p-2 rounded">
                        Hi [userName],<br/>
                        Your order {`{{trigger.orderId}}`} is ready.<br/>
                        {`{{AI:summarize}}`}
                      </code>
                    </div>
                    <div>
                      <p className="font-semibold mb-1">Advanced Features:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Chain multiple variables</li>
                        <li>Access nested properties with dot notation</li>
                        <li>Combine with static text</li>
                        <li>Use in any text field</li>
                      </ul>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Click to insert at cursor</li>
              <li>• Drag & drop into prompt field</li>
              <li>• Copy with hover button</li>
            </ul>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-2 grid w-[calc(100%-2rem)] grid-cols-3">
            <TabsTrigger value="variables" className="text-xs">
              <Variable className="w-3 h-3 mr-1" />
              Variables
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">
              <Bot className="w-3 h-3 mr-1" />
              AI
            </TabsTrigger>
            <TabsTrigger value="snippets" className="text-xs">
              <Code className="w-3 h-3 mr-1" />
              Snippets
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 min-h-0">
            {/* Variables Tab */}
            <TabsContent value="variables" className="px-4 pb-4 space-y-2">
              {filteredGroups.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No variables found
                </div>
              ) : (
                filteredGroups.map(group => (
                  <Collapsible
                    key={group.id}
                    open={expandedGroups.has(group.id)}
                  >
                    <CollapsibleTrigger
                      onClick={() => toggleGroup(group.id)}
                      className="flex items-center justify-between w-full p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {group.icon && <span>{group.icon}</span>}
                        <span className="text-sm font-medium">{group.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {group.variables.length}
                        </Badge>
                      </div>
                      <ChevronDown className={cn(
                        "w-4 h-4 transition-transform",
                        expandedGroups.has(group.id) && "rotate-180"
                      )} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-1">
                        {group.variables.map(variable => (
                          <motion.div
                            key={`${group.id}_${variable.id}`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "group relative flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all",
                              "hover:bg-muted",
                              hoveredVariable === variable.id && "bg-muted"
                            )}
                            draggable
                            onDragStart={(e) => handleDragStart(e, variable)}
                            onMouseEnter={() => setHoveredVariable(variable.id)}
                            onMouseLeave={() => setHoveredVariable(null)}
                            onClick={() => handleVariableClick(variable)}
                          >
                            <Grip className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            <div className={cn(
                              "p-1 rounded",
                              getCategoryColor(variable.category)
                            )}>
                              {getCategoryIcon(variable.category)}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono bg-background px-1 py-0.5 rounded">
                                  {variable.value}
                                </code>
                              </div>
                              {variable.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {variable.description}
                                </p>
                              )}
                            </div>

                            {/* Copy button */}
                            <AnimatePresence>
                              {hoveredVariable === variable.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                >
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleCopy(variable.value)
                                        }}
                                      >
                                        {copiedVariable === variable.value ? (
                                          <CheckCircle className="w-3 h-3 text-green-500" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Copy to clipboard</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))
              )}
            </TabsContent>

            {/* AI Instructions Tab */}
            <TabsContent value="ai" className="px-4 pb-4">
              <div className="space-y-1">
                {filteredInstructions.map(instruction => (
                  <motion.div
                    key={instruction.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted transition-all"
                    draggable
                    onDragStart={(e) => handleDragStart(e, {
                      id: instruction.id,
                      value: instruction.var,
                      label: instruction.desc,
                      category: 'ai',
                      description: instruction.desc
                    })}
                    onClick={() => handleVariableClick({
                      id: instruction.id,
                      value: instruction.var,
                      label: instruction.desc,
                      category: 'ai',
                      description: instruction.desc
                    })}
                  >
                    <Grip className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="text-lg">{instruction.icon}</span>
                    <div className="flex-1">
                      <code className="text-xs font-mono bg-background px-1 py-0.5 rounded">
                        {instruction.var}
                      </code>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {instruction.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <div className="text-xs space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Custom Instructions</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <div className="space-y-2 text-xs">
                            <p className="font-semibold">How Custom AI Instructions Work:</p>
                            <p>Create your own AI instructions using the format: {`{{AI:instruction_name}}`}</p>
                            <div className="space-y-1">
                              <p className="font-medium">Examples:</p>
                              <ul className="list-disc list-inside space-y-1">
                                <li>{`{{AI:write_follow_up}}`} - Writes a follow-up message</li>
                                <li>{`{{AI:extract_phone}}`} - Extracts phone numbers</li>
                                <li>{`{{AI:create_title}}`} - Generates a title</li>
                              </ul>
                            </div>
                            <p>The AI will interpret your instruction based on the workflow context and available data.</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-muted-foreground">
                      Create custom AI instructions:
                    </p>
                    <code className="block bg-background px-2 py-1 rounded mt-1">
                      {`{{AI:your_instruction}}`}
                    </code>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Snippets Tab */}
            <TabsContent value="snippets" className="px-4 pb-4">
              <div className="space-y-2">
                {filteredSnippets.map((snippet, idx) => (
                  <motion.div
                    key={idx}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group p-3 rounded-lg border cursor-pointer hover:bg-muted transition-all"
                    onClick={() => {
                      if (onVariableSelect) {
                        onVariableSelect({
                          id: `snippet_${idx}`,
                          value: snippet.snippet,
                          label: snippet.name,
                          category: 'system',
                          description: snippet.category
                        })
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-medium">{snippet.name}</h4>
                      <Badge variant="outline" className="text-xs">
                        {snippet.category}
                      </Badge>
                    </div>
                    <p className="text-xs font-mono bg-muted p-2 rounded">
                      {snippet.snippet}
                    </p>
                  </motion.div>
                ))}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

// Import missing CheckCircle
import { CheckCircle } from 'lucide-react'