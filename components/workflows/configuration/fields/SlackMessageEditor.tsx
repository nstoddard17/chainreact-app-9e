"use client"

import React, { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Strikethrough,
  Link,
  List,
  ListOrdered,
  Code,
  AtSign,
  Hash,
  Smile,
  Paperclip,
  Send,
  ChevronDown,
  Braces,
  FileText
} from 'lucide-react'
import { useVariableDropTarget } from '../hooks/useVariableDropTarget'
import { insertVariableIntoContentEditable } from '@/lib/workflows/variableInsertion'
import { Input } from '@/components/ui/input'
import { useUpstreamVariables } from '../hooks/useUpstreamVariables'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { Variable } from 'lucide-react'

interface SlackMessageEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  availableVariables?: string[]
  workflowNodes?: any[]
  workflowData?: { nodes: any[]; edges: any[] }
  currentNodeId?: string
  onAttachmentClick?: () => void
  onFileSelect?: (files: File[]) => void
}

interface SlackTemplate {
  id: string
  name: string
  content: string
  emoji: string
}

const SLACK_TEMPLATES: SlackTemplate[] = [
  {
    id: 'task-assigned',
    name: 'Task Assigned',
    emoji: '✅',
    content: `*New task assigned:* {{task_name}}\n*Due:* {{due_date}}\n*Priority:* {{priority}}\n\n{{task_description}}`
  },
  {
    id: 'meeting-reminder',
    name: 'Meeting Reminder',
    emoji: '📅',
    content: `*Meeting:* {{meeting_title}}\n*When:* {{meeting_time}}\n*Where:* {{meeting_location}}`
  },
  {
    id: 'daily-standup',
    name: 'Daily Standup',
    emoji: '🌅',
    content: `*Yesterday:* {{yesterday}}\n*Today:* {{today}}\n*Blockers:* {{blockers}}`
  },
  {
    id: 'announcement',
    name: 'Announcement',
    emoji: '📢',
    content: `*{{title}}*\n\n{{message}}`
  },
  {
    id: 'status-update',
    name: 'Status Update',
    emoji: '📊',
    content: `*{{project}} Update*\n✅ Done: {{done}}\n🔄 In Progress: {{in_progress}}\n🎯 Next: {{next}}`
  }
]

export function SlackMessageEditor({
  value,
  onChange,
  placeholder = "Message #all-chain-react",
  className,
  error,
  availableVariables = [],
  workflowNodes = [],
  workflowData,
  currentNodeId,
  onAttachmentClick,
  onFileSelect
}: SlackMessageEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const isInitializedRef = useRef(false)
  const fileDialogOpenRef = useRef(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false)

  // Get upstream variables from previous nodes in the workflow (same as Discord)
  const { upstreamNodes, hasVariables } = useUpstreamVariables({
    workflowData,
    currentNodeId
  })

  // Get nodes that have variables (computed from the hook - same as Discord)
  const nodesWithVariables = React.useMemo(() => {
    return upstreamNodes.filter(node => node.outputs.length > 0)
  }, [upstreamNodes])

  // Initialize editor content on mount or when value changes externally
  React.useEffect(() => {
    // Only update if editor exists and content differs from current value
    if (editorRef.current && editorRef.current.innerText !== value) {
      // Prevent infinite loop by checking if this update is from user input
      // If isInitializedRef is false, it's the initial mount
      // If content differs but we're initialized, it's an external update (e.g., loading saved data)
      if (!isInitializedRef.current || editorRef.current !== document.activeElement) {
        editorRef.current.textContent = value || ''
        isInitializedRef.current = true
      }
    }
  }, [value])

  // Variable drop target
  const { isDragOver, eventHandlers } = useVariableDropTarget({
    fieldId: 'message',
    elementRef: editorRef,
    onInsert: (variable: string) => {
      if (editorRef.current) {
        insertVariableIntoContentEditable(editorRef.current, variable)
        const newContent = editorRef.current.innerText
        onChange(newContent)
      }
    }
  })

  // Formatting commands
  const applyFormat = (format: string) => {
    if (!editorRef.current) return

    // Save the current selection before any prompt
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      // No selection, insert at the end
      const currentContent = editorRef.current.innerText
      let formattedText = ''

      switch (format) {
        case 'bold':
          formattedText = '**'
          break
        case 'italic':
          formattedText = '__'
          break
        case 'strikethrough':
          formattedText = '~~'
          break
        case 'code':
          formattedText = '``'
          break
        case 'codeblock':
          formattedText = '```\n\n```'
          break
        default:
          return
      }

      const newContent = currentContent ? `${currentContent}${formattedText}` : formattedText
      editorRef.current.innerText = newContent
      onChange(newContent)
      editorRef.current.focus()
      return
    }

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString()

    let formattedText = ''

    switch (format) {
      case 'bold':
        formattedText = selectedText ? `*${selectedText}*` : '**'
        break
      case 'italic':
        formattedText = selectedText ? `_${selectedText}_` : '__'
        break
      case 'strikethrough':
        formattedText = selectedText ? `~${selectedText}~` : '~~'
        break
      case 'code':
        formattedText = selectedText ? `\`${selectedText}\`` : '``'
        break
      case 'codeblock':
        formattedText = selectedText ? `\`\`\`\n${selectedText}\n\`\`\`` : '```\n\n```'
        break
      case 'link':
        const url = prompt('Enter URL:')
        if (!url) return
        formattedText = selectedText ? `<${url}|${selectedText}>` : `<${url}>`
        break
      default:
        return
    }

    // Replace selection with formatted text
    const currentContent = editorRef.current.innerText
    const beforeSelection = currentContent.substring(0, range.startOffset)
    const afterSelection = currentContent.substring(range.endOffset)
    const newContent = beforeSelection + formattedText + afterSelection

    editorRef.current.innerText = newContent
    onChange(newContent)

    // Set cursor position
    editorRef.current.focus()
    const newRange = document.createRange()
    const sel = window.getSelection()

    if (editorRef.current.firstChild) {
      const cursorPos = beforeSelection.length + (selectedText ? formattedText.length : 1)
      newRange.setStart(editorRef.current.firstChild, Math.min(cursorPos, newContent.length))
      newRange.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(newRange)
    }
  }

  // Insert list
  const insertList = (ordered: boolean = false) => {
    if (!editorRef.current) return

    const currentContent = editorRef.current.innerText.trim()
    const prefix = ordered ? '1. ' : '• '
    const listItem = currentContent ? `\n${prefix}` : prefix

    const newContent = currentContent + listItem
    editorRef.current.innerText = newContent
    onChange(newContent)

    // Focus and move cursor to end
    editorRef.current.focus()
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(editorRef.current)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  // Insert variable
  const insertVariable = (variable: string) => {
    if (editorRef.current) {
      insertVariableIntoContentEditable(editorRef.current, variable)
      onChange(editorRef.current.innerText)
    }
  }

  // Load template
  const loadTemplate = (templateId: string) => {
    const template = SLACK_TEMPLATES.find(t => t.id === templateId)
    if (template && editorRef.current) {
      editorRef.current.innerText = template.content
      onChange(template.content)
    }
  }

  // Emoji name to character mapping
  const emojiMap: Record<string, string> = {
    'smile': '😊',
    'laughing': '😂',
    'heart': '❤️',
    'tada': '🎉',
    'thumbsup': '👍',
    'fire': '🔥',
    'eyes': '👀',
    'rocket': '🚀',
    'star': '⭐',
    'check': '✅',
    'wave': '👋',
    'thinking_face': '🤔',
    'party': '🥳',
    'clap': '👏',
    'raised_hands': '🙌',
    'ok_hand': '👌'
  }

  // Insert emoji
  const insertEmoji = (emoji: string, closePopover?: () => void) => {
    if (!editorRef.current) return

    const currentContent = editorRef.current.innerText.trim()
    // Use actual emoji character if available, otherwise use :name: format
    const emojiChar = emojiMap[emoji] || `:${emoji}:`

    // Append emoji with proper spacing
    const newContent = currentContent ? `${currentContent} ${emojiChar}` : emojiChar
    editorRef.current.innerText = newContent
    onChange(newContent)

    // Focus editor and move cursor to end
    editorRef.current.focus()
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(editorRef.current)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)

    // Close popover if callback provided
    if (closePopover) {
      closePopover()
    }
  }

  // Insert mention
  const insertMention = (userId: string, displayName: string, closePopover?: () => void) => {
    if (!editorRef.current) return

    const currentContent = editorRef.current.innerText.trim()
    const mentionText = `<@${userId}>`

    // Append mention with proper spacing
    const newContent = currentContent ? `${currentContent} ${mentionText}` : mentionText
    editorRef.current.innerText = newContent
    onChange(newContent)

    // Focus editor and move cursor to end
    editorRef.current.focus()
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(editorRef.current)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)

    // Close popover if callback provided
    if (closePopover) {
      closePopover()
    }
  }

  // Handle attachment button click
  const handleAttachmentClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fileDialogOpenRef.current = true
    fileInputRef.current?.click()
  }

  return (
    <div className={cn("space-y-0", className)}>
      {/* Main Editor Container - Slack Style */}
      <div
        className={cn(
          "border rounded-lg overflow-hidden transition-all",
          isFocused ? "ring-2 ring-blue-500 border-blue-500" : "border-border",
          error && "border-destructive ring-destructive",
          isDragOver && "ring-2 ring-primary border-primary"
        )}
      >
        {/* Formatting Toolbar - Top Row (like Slack) */}
        <div className="flex items-center gap-0.5 px-3 py-2 bg-muted/30 border-b">
          {/* Text Formatting */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted font-bold"
            onClick={() => applyFormat('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted italic"
            onClick={() => applyFormat('italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted line-through"
            onClick={() => applyFormat('strikethrough')}
            title="Strikethrough (Ctrl+Shift+X)"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Lists & Formatting */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('link')}
            title="Link (Ctrl+Shift+U)"
          >
            <Link className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => insertList(true)}
            title="Numbered list (Ctrl+Shift+7)"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => insertList(false)}
            title="Bulleted list (Ctrl+Shift+8)"
          >
            <List className="h-3.5 w-3.5" />
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Code */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('code')}
            title="Inline code (Ctrl+Shift+C)"
          >
            <Code className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('codeblock')}
            title="Code block (Ctrl+Shift+Alt+C)"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 2v8h6V4H5z"/>
            </svg>
          </Button>

          <div className="flex-1" />

          {/* Variables Picker - Discord-style Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs hover:bg-muted"
              >
                <Braces className="h-3.5 w-3.5 mr-1" />
                Insert workflow variable
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="end">
              <div className="p-3 border-b">
                <h4 className="text-sm font-medium">Insert Variable</h4>
                <p className="text-xs text-muted-foreground mt-1">Add dynamic data from previous workflow steps</p>
              </div>
              <ScrollArea className="h-[300px]">
                <div className="p-2">
                  {!hasVariables || nodesWithVariables.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <Variable className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No variables available</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Add other nodes to your workflow to create dynamic content
                      </p>
                    </div>
                  ) : (
                    nodesWithVariables.map((node) => (
                      <div key={node.id} className="mb-3">
                        {/* Node Header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-t-md">
                          {node.providerId ? (
                            <StaticIntegrationLogo
                              providerId={node.providerId}
                              providerName={node.title}
                            />
                          ) : (
                            <div className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                              <Variable className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <span className="font-medium text-sm">{node.title}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            {node.outputs.length}
                          </Badge>
                        </div>
                        {/* Node Outputs */}
                        <div className="border border-border border-t-0 rounded-b-md divide-y divide-border/50">
                          {node.outputs.map((output: any) => {
                            // Use friendly node type for variable reference (engine resolves by type)
                            const referencePrefix = node.isTrigger ? 'trigger' : (node.type || node.id)
                            const variableRef = `{{${referencePrefix}.${output.name}}}`
                            const displayRef = `${referencePrefix}.${output.name}`
                            return (
                              <div
                                key={`${node.id}-${output.name}`}
                                className="flex flex-col gap-0.5 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                                onClick={() => insertVariable(variableRef)}
                              >
                                <div className="flex items-center gap-2">
                                  <code className="text-sm font-medium font-mono">
                                    {displayRef}
                                  </code>
                                  {output.type && (
                                    <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
                                      {output.type}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {output.label || output.name}
                                  {output.description && ` — ${output.description}`}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>

        {/* Editor Area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            "min-h-[120px] max-h-[400px] px-4 py-3",
            "focus:outline-none",
            "overflow-y-auto whitespace-pre-wrap",
            "text-sm leading-relaxed",
            "bg-background"
          )}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onInput={(e) => {
            const target = e.target as HTMLDivElement
            onChange(target.innerText)
          }}
          onKeyDown={(e) => {
            // Handle keyboard shortcuts
            if (e.ctrlKey || e.metaKey) {
              if (e.key === 'b') {
                e.preventDefault()
                applyFormat('bold')
              } else if (e.key === 'i') {
                e.preventDefault()
                applyFormat('italic')
              } else if (e.shiftKey && e.key === 'X') {
                e.preventDefault()
                applyFormat('strikethrough')
              } else if (e.shiftKey && e.key === 'C') {
                e.preventDefault()
                applyFormat('code')
              } else if (e.shiftKey && e.key === 'U') {
                e.preventDefault()
                applyFormat('link')
              } else if (e.shiftKey && e.key === '7') {
                e.preventDefault()
                insertList(true)
              } else if (e.shiftKey && e.key === '8') {
                e.preventDefault()
                insertList(false)
              }
            }
          }}
          data-placeholder={!value ? placeholder : ''}
          style={{
            caretColor: 'currentColor'
          }}
        />


        {/* Bottom Toolbar - Action Buttons (like Slack) */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t">
          <div className="flex items-center gap-1">
            {/* Quick Actions */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-muted"
              title="Attach files"
              onClick={handleAttachmentClick}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>

            {/* Emoji Picker */}
            <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-muted"
                  title="Insert emoji"
                >
                  <Smile className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="start">
                <div className="flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b">
                    <h4 className="font-semibold text-sm">Insert Emoji</h4>
                  </div>

                  {/* Search Input */}
                  <div className="px-4 py-3">
                    <Input
                      placeholder="Search emoji (e.g., smile, heart, tada)"
                      className="h-9"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.currentTarget
                          const emojiName = input.value.trim()
                          if (emojiName) {
                            insertEmoji(emojiName, () => setEmojiPickerOpen(false))
                            input.value = ''
                          }
                        }
                      }}
                    />
                  </div>

                  {/* Emoji Grid */}
                  <div className="px-4 pb-3">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Commonly used</p>
                        <div className="grid grid-cols-8 gap-1">
                          {[
                            { name: 'smile', emoji: '😊' },
                            { name: 'laughing', emoji: '😂' },
                            { name: 'heart', emoji: '❤️' },
                            { name: 'tada', emoji: '🎉' },
                            { name: 'thumbsup', emoji: '👍' },
                            { name: 'fire', emoji: '🔥' },
                            { name: 'eyes', emoji: '👀' },
                            { name: 'rocket', emoji: '🚀' },
                            { name: 'star', emoji: '⭐' },
                            { name: 'check', emoji: '✅' },
                            { name: 'wave', emoji: '👋' },
                            { name: 'thinking_face', emoji: '🤔' },
                            { name: 'party', emoji: '🥳' },
                            { name: 'clap', emoji: '👏' },
                            { name: 'raised_hands', emoji: '🙌' },
                            { name: 'ok_hand', emoji: '👌' }
                          ].map(({ name, emoji }) => (
                            <Button
                              key={name}
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0 hover:bg-accent text-xl"
                              onClick={() => insertEmoji(name, () => setEmojiPickerOpen(false))}
                              title={`:${name}:`}
                            >
                              {emoji}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2 border-t bg-muted/30">
                    <p className="text-xs text-muted-foreground text-center">
                      Type emoji name and press Enter
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Mention Picker */}
            <Popover open={mentionPickerOpen} onOpenChange={setMentionPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-muted"
                  title="Mention someone"
                >
                  <AtSign className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="start">
                <div className="flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 border-b">
                    <h4 className="font-semibold text-sm">Mention User</h4>
                  </div>

                  {/* Search Input */}
                  <div className="p-4 border-b">
                    <Input
                      placeholder="Enter user ID"
                      className="h-9"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.currentTarget
                          const userId = input.value.trim()
                          if (userId) {
                            insertMention(userId, userId, () => setMentionPickerOpen(false))
                            input.value = ''
                          }
                        }
                      }}
                    />
                  </div>

                  {/* Special Mentions */}
                  <div className="p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Special mentions</p>
                    <div className="space-y-1">
                      {[
                        { id: 'channel', label: 'Notify everyone in channel', icon: Hash },
                        { id: 'here', label: 'Notify active members', icon: AtSign },
                        { id: 'everyone', label: 'Notify all workspace members', icon: AtSign }
                      ].map((mention) => (
                        <Button
                          key={mention.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start h-auto py-2 px-3 hover:bg-accent"
                          onClick={() => insertMention(mention.id, mention.label, () => setMentionPickerOpen(false))}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <mention.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex flex-col items-start flex-1 min-w-0">
                              <span className="font-medium text-sm">@{mention.id}</span>
                              <span className="text-xs text-muted-foreground">{mention.label}</span>
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-3 border-t bg-muted/30">
                    <p className="text-xs text-muted-foreground text-center">
                      Use {'{{user_id}}'} variable for dynamic mentions
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-destructive mt-2">{error}</p>
      )}

      {/* Hidden file input for attachments */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar"
        multiple
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation()
          fileDialogOpenRef.current = false
          const files = e.target.files
          if (files && files.length > 0 && onFileSelect) {
            onFileSelect(Array.from(files))
          }
        }}
        onCancel={() => {
          fileDialogOpenRef.current = false
        }}
      />

      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
