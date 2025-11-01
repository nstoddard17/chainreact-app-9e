"use client"

import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Loader2, User, Sparkles, Info, CheckCircle2 } from 'lucide-react'
import { ChatMessage } from '@/lib/workflows/ai-agent/chat-service'
import { GuidedSetupCard, GuidedSetupNode, SetupResult } from './GuidedSetupCard'
import './agent-flow.css'

interface AgentChatPanelProps {
  messages: ChatMessage[]
  currentSetupNode?: GuidedSetupNode | null
  isBuilding?: boolean
  onNodeSetupContinue?: (nodeId: string) => Promise<SetupResult>
  onNodeSetupSkip?: (nodeId: string) => void
}

/**
 * Agent Chat Panel - Shows conversation history and current setup
 * Matches design token: width 420px ± 4
 */
export function AgentChatPanel({
  messages,
  currentSetupNode,
  isBuilding,
  onNodeSetupContinue,
  onNodeSetupSkip
}: AgentChatPanelProps) {
  // Sort messages by timestamp (newest first)
  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime()
    const timeB = new Date(b.createdAt || 0).getTime()
    return timeB - timeA
  })

  return (
    <div className="agent-panel h-full bg-background border-r border-border flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-base-agent font-semibold">AI Agent</h2>
          {isBuilding && (
            <Badge variant="secondary" className="ml-auto">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Building
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-4">
          {/* Current Setup Card (if active) */}
          {currentSetupNode && onNodeSetupContinue && onNodeSetupSkip && (
            <div className="mb-6">
              <GuidedSetupCard
                node={currentSetupNode}
                onContinue={onNodeSetupContinue}
                onSkip={onNodeSetupSkip}
                isProcessing={isBuilding}
              />
            </div>
          )}

          {/* Chat History */}
          {sortedMessages.map((message) => (
            <MessageBubble key={message.id || message.createdAt} message={message} />
          ))}

          {/* Empty State */}
          {sortedMessages.length === 0 && !currentSetupNode && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <Sparkles className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-base-agent font-semibold text-foreground mb-2">
                Ready to build
              </h3>
              <p className="text-sm-agent text-muted-foreground max-w-xs">
                Your workflow conversation will appear here
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Message Bubble Component
 */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isStatus = message.role === 'status'

  // Icon based on role
  const Icon = isUser ? User : isStatus ? Info : Sparkles

  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      role={isStatus ? 'status' : undefined}
      aria-live={isStatus ? 'polite' : undefined}
      aria-atomic={isStatus ? 'true' : undefined}
    >
      {/* Icon */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-primary/10 text-primary'
            : isStatus
            ? 'bg-blue-50 text-blue-600'
            : 'bg-purple-50 text-purple-600'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Message Content */}
      <div
        className={`flex-1 space-y-1 ${
          isUser ? 'text-right' : 'text-left'
        }`}
      >
        <div
          className={`inline-block px-4 py-2 rounded-lg text-sm-agent ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : isStatus
              ? 'bg-blue-50 text-blue-900 border border-blue-200'
              : 'bg-muted text-foreground'
          }`}
        >
          <div className="whitespace-pre-wrap">{message.text}</div>
          {message.subtext && (
            <div className="mt-1 text-xs-agent opacity-80">
              {message.subtext}
            </div>
          )}
        </div>

        {/* Timestamp */}
        {message.createdAt && (
          <div
            className={`text-xs-agent text-muted-foreground ${
              isUser ? 'text-right' : 'text-left'
            }`}
          >
            {formatTimestamp(message.createdAt)}
          </div>
        )}

        {/* Plan Metadata (if assistant message with plan) */}
        {message.role === 'assistant' && message.meta?.plan && (
          <div className="mt-2">
            <PlanDisplay plan={message.meta.plan} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Plan Display Component
 */
function PlanDisplay({ plan }: { plan: any }) {
  if (!plan.edits || !Array.isArray(plan.edits)) return null

  const nodeEdits = plan.edits.filter((e: any) => e.op === 'addNode')

  return (
    <div className="bg-muted rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm-agent font-medium">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <span>Flow Plan</span>
      </div>
      <ol className="space-y-1 text-xs-agent text-muted-foreground pl-6">
        {nodeEdits.map((edit: any, idx: number) => (
          <li key={idx} className="list-decimal">
            {edit.node?.type || 'Unknown node'}
          </li>
        ))}
      </ol>
      {plan.prerequisites && plan.prerequisites.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-xs-agent font-medium text-orange-600 mb-1">
            Required Setup:
          </div>
          <ul className="space-y-1 text-xs-agent text-muted-foreground pl-4">
            {plan.prerequisites.map((prereq: string, idx: number) => (
              <li key={idx} className="list-disc">
                {prereq.replace('secret:', '')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // Less than 1 minute
    if (diff < 60000) {
      return 'Just now'
    }

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000)
      return `${minutes}m ago`
    }

    // Less than 1 day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      return `${hours}h ago`
    }

    // Format as time
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return ''
  }
}
