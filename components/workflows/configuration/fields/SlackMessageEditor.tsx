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

interface SlackMessageEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  availableVariables?: string[]
  workflowNodes?: any[]
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
  onAttachmentClick,
  onFileSelect
}: SlackMessageEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const isInitializedRef = useRef(false)
  const fileDialogOpenRef = useRef(false)

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

    const selection = window.getSelection()
    if (!selection) return

    // Get cursor position or selected text
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    if (!range) return

    const selectedText = selection.toString()

    let formattedText = ''
    let needsPrompt = false

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
      case 'quote':
        formattedText = selectedText ? `> ${selectedText}` : '> '
        break
      default:
        return
    }

    // Delete selected text if any
    if (selectedText) {
      range.deleteContents()
    }

    // Insert formatted text
    const textNode = document.createTextNode(formattedText)
    range.insertNode(textNode)

    // Move cursor to appropriate position
    if (!selectedText) {
      // If no selection, move cursor between markers (e.g., between ** for bold)
      const offset = format === 'codeblock' ? 4 : (format === 'quote' ? 2 : 1)
      range.setStart(textNode, offset)
      range.setEnd(textNode, offset)
    } else {
      // Move cursor after inserted text
      range.setStartAfter(textNode)
      range.setEndAfter(textNode)
    }

    selection.removeAllRanges()
    selection.addRange(range)

    // Update value
    onChange(editorRef.current.innerText)
    editorRef.current.focus()
  }

  // Insert list
  const insertList = (ordered: boolean = false) => {
    if (!editorRef.current) return

    const selection = window.getSelection()
    if (!selection) return

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    if (!range) return

    const prefix = ordered ? '1. ' : '• '
    const textNode = document.createTextNode('\n' + prefix)

    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.setEndAfter(textNode)
    selection.removeAllRanges()
    selection.addRange(range)

    onChange(editorRef.current.innerText)
    editorRef.current.focus()
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
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('strikethrough')}
            title="Strikethrough (Ctrl+Shift+X)"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Lists & Formatting */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('link')}
            title="Link (Ctrl+Shift+U)"
          >
            <Link className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => insertList(true)}
            title="Numbered list (Ctrl+Shift+7)"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Button
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
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-muted"
            onClick={() => applyFormat('code')}
            title="Inline code (Ctrl+Shift+C)"
          >
            <Code className="h-3.5 w-3.5" />
          </Button>
          <Button
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

          {/* Variables Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs hover:bg-muted"
              >
                <Braces className="h-3.5 w-3.5 mr-1" />
                Variables
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Insert Variable</h4>
                {availableVariables.length > 0 ? (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {availableVariables.map((variable) => (
                      <Button
                        key={variable}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start font-mono text-xs"
                        onClick={() => insertVariable(variable)}
                      >
                        {`{{${variable}}}`}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add a trigger or action to use variables
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Templates Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs hover:bg-muted"
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Templates
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Message Templates</h4>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {SLACK_TEMPLATES.map((template) => (
                    <Button
                      key={template.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left"
                      onClick={() => loadTemplate(template.id)}
                    >
                      <span className="mr-2">{template.emoji}</span>
                      <span className="text-sm">{template.name}</span>
                    </Button>
                  ))}
                </div>
              </div>
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
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-muted"
              title="Insert emoji"
            >
              <Smile className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-muted"
              title="Mention someone"
            >
              <AtSign className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Formatting Hint */}
          <span className="text-xs text-muted-foreground">
            *bold* _italic_ ~strike~ `code`
          </span>
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
