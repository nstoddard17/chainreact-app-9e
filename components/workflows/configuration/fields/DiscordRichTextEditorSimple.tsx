"use client"

import React from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { logger } from '@/lib/utils/logger'

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

export function DiscordRichTextEditor({
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
  logger.debug('[DiscordRichTextEditorSimple] Rendering - Simplified version active')
  
  return (
    <div className={cn("space-y-2", className)}>
      <Label>Discord Message (Simplified Editor)</Label>
      <Textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "min-h-[100px] font-mono text-sm",
          error && "border-red-500"
        )}
      />
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      <p className="text-xs text-slate-500">
        Note: Using simplified editor to prevent freezing. Full rich text features temporarily disabled.
      </p>
    </div>
  )
}