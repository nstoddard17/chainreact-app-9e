"use client"

import React, { useState, useRef, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { 
  Bold, 
  Italic, 
  Code, 
  Eye,
  EyeOff,
} from 'lucide-react'

interface DiscordRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableInsert?: (variable: string) => void
  guildId?: string
  channelId?: string
  userId?: string
}

// Memoized component to prevent unnecessary re-renders
export const DiscordRichTextEditor = memo(function DiscordRichTextEditor({
  value,
  onChange,
  placeholder = "Type your Discord message...",
  className = "",
  error,
  workflowData,
  currentNodeId,
  onVariableInsert,
  guildId,
  channelId,
  userId
}: DiscordRichTextEditorProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Optimized markdown insertion
  const insertMarkdown = useCallback((markdownSyntax: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end)
    
    let newText = ''
    
    switch(markdownSyntax) {
      case '**bold**':
        newText = selectedText ? `**${selectedText}**` : '**bold text**'
        break;
      case '*italic*':
        newText = selectedText ? `*${selectedText}*` : '*italic text*'
        break;
      case '`code`':
        newText = selectedText ? `\`${selectedText}\`` : '`inline code`'
        break;
      default:
        newText = markdownSyntax
    }
    
    const newValue = value.substring(0, start) + newText + value.substring(end)
    onChange(newValue)
    
    // Restore focus
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPosition = start + newText.length
        textareaRef.current.setSelectionRange(newPosition, newPosition)
        textareaRef.current.focus()
      }
    })
  }, [value, onChange])

  const togglePreview = useCallback(() => {
    setIsPreviewMode(prev => !prev)
  }, [])

  return (
    <div className={cn("border border-slate-700 rounded-lg overflow-hidden bg-slate-900", className)}>
      {/* Simplified Toolbar */}
      <div className="border-b border-slate-700 p-2 bg-slate-800">
        <div className="flex items-center gap-1">
          {/* Basic formatting buttons */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => insertMarkdown('**bold**')}
            title="Bold"
            className="h-8 w-8 p-0 hover:bg-slate-700 text-slate-300 hover:text-white"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => insertMarkdown('*italic*')}
            title="Italic"
            className="h-8 w-8 p-0 hover:bg-slate-700 text-slate-300 hover:text-white"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => insertMarkdown('`code`')}
            title="Inline Code"
            className="h-8 w-8 p-0 hover:bg-slate-700 text-slate-300 hover:text-white"
          >
            <Code className="h-4 w-4" />
          </Button>
          
          <Separator orientation="vertical" className="h-6 mx-2" />
          
          {/* Advanced features toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-advanced"
              checked={showAdvanced}
              onCheckedChange={setShowAdvanced}
            />
            <Label htmlFor="show-advanced" className="text-sm text-slate-300">
              Advanced Features
            </Label>
          </div>
          
          <div className="flex-1" />
          
          {/* Preview Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={togglePreview}
            className="h-8 gap-1 hover:bg-slate-700 text-slate-300 hover:text-white"
          >
            {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPreviewMode ? 'Edit' : 'Preview'}
          </Button>
        </div>
      </div>
      
      {/* Message Content */}
      <div className="p-4">
        {isPreviewMode ? (
          <div className="discord-preview bg-gray-800 text-white rounded-lg p-4 min-h-[150px]">
            <div className="text-gray-100">
              {value ? (
                value.split('\n').map((line, i) => (
                  <div key={i}>{line || '\u00A0'}</div>
                ))
              ) : (
                <span className="text-gray-500 italic">No message content yet...</span>
              )}
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="message-content" className="text-sm font-medium mb-2 block text-slate-200">
              Message Content
            </Label>
            <Textarea
              ref={textareaRef}
              id="message-content"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="min-h-[100px] font-mono text-sm bg-slate-800 text-slate-100 border-slate-600"
            />
            {showAdvanced && (
              <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                <p className="text-sm text-slate-400">
                  Advanced features like embeds, mentions, and rich formatting are temporarily disabled to prevent freezing.
                  We're working on optimizing these features.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="p-2 bg-red-900/20 border-t border-red-800">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      
      {/* Footer */}
      <div className="border-t border-slate-700 p-2 bg-slate-800 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>Discord message editor (Optimized)</span>
          <span>{value.length}/2000 characters</span>
        </div>
      </div>
    </div>
  )
})