/**
 * Kadabra-Style Workflow Builder
 *
 * Complete Kadabra-style workflow building experience:
 * - Natural language prompt
 * - Plan approval
 * - Sequential node building
 * - Interactive config in chat
 * - OAuth inline
 * - Animated tutorials
 * - Node testing
 * - Seamless variable passing
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Node, Edge } from '@xyflow/react'
import { SequentialWorkflowBuilder, type BuilderEvent, type WorkflowPlan } from '@/lib/workflows/ai/SequentialWorkflowBuilder'
import { TutorialOrchestrator, type TutorialState } from '@/lib/workflows/ai/TutorialOrchestrator'
import { WorkflowPlanApproval } from './WorkflowPlanApproval'
import { InteractiveNodeConfig } from './InteractiveNodeConfig'
import { AnimatedCursor } from './AnimatedCursor'
import { Loader2, Sparkles, CheckCircle } from 'lucide-react'

interface KadabraStyleWorkflowBuilderProps {
  initialPrompt?: string
  userId: string
  organizationId: string
  onWorkflowComplete?: (nodes: Node[], edges: Edge[]) => void
  onCancel?: () => void
}

interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'system' | 'plan' | 'config' | 'progress'
  content: string
  timestamp: Date
  data?: any
}

export function KadabraStyleWorkflowBuilder({
  initialPrompt,
  userId,
  organizationId,
  onWorkflowComplete,
  onCancel
}: KadabraStyleWorkflowBuilderProps) {
  const router = useRouter()

  // State
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentPlan, setCurrentPlan] = useState<WorkflowPlan | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)
  const [currentEvent, setCurrentEvent] = useState<BuilderEvent | null>(null)
  const [tutorialState, setTutorialState] = useState<TutorialState>({
    isRunning: false,
    currentStep: 0,
    cursorPosition: { x: 0, y: 0 },
    cursorAnimation: 'idle'
  })

  // Refs
  const builderRef = useRef<SequentialWorkflowBuilder | null>(null)
  const tutorialRef = useRef<TutorialOrchestrator | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize builder and tutorial orchestrator
  useEffect(() => {
    builderRef.current = new SequentialWorkflowBuilder((event) => {
      handleBuilderEvent(event)
    })

    tutorialRef.current = new TutorialOrchestrator((state) => {
      setTutorialState(state)
    })

    return () => {
      builderRef.current?.abort()
      tutorialRef.current?.stop()
    }
  }, [])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle builder events
  const handleBuilderEvent = useCallback((event: BuilderEvent) => {
    setCurrentEvent(event)

    switch (event.type) {
      case 'plan_generated':
        setCurrentPlan(event.plan)
        addMessage({
          type: 'plan',
          content: 'I\'ve created a plan for your workflow!',
          data: event.plan
        })
        setIsGenerating(false)
        break

      case 'plan_approved':
        addMessage({
          type: 'assistant',
          content: 'Great! Let\'s start building your workflow step by step.'
        })
        setIsBuilding(true)
        break

      case 'node_starting':
        addMessage({
          type: 'progress',
          content: `Step ${event.currentStep} of ${event.totalSteps}: ${event.node.title}`,
          data: event.node
        })
        break

      case 'needs_auth':
        addMessage({
          type: 'system',
          content: `Let's connect to ${event.provider} first`,
          data: { provider: event.provider, authUrl: event.authUrl }
        })
        break

      case 'collecting_config':
        addMessage({
          type: 'config',
          content: event.nodeTitle,
          data: event.field
        })
        break

      case 'config_collected':
        addMessage({
          type: 'system',
          content: `✓ ${event.fieldName}: ${JSON.stringify(event.value)}`
        })
        break

      case 'node_created':
        addMessage({
          type: 'system',
          content: `✓ Node created: ${event.node.data.title}`
        })
        break

      case 'tutorial_step':
        addMessage({
          type: 'system',
          content: `Tutorial: ${event.description}`
        })
        break

      case 'node_tested':
        if (event.success) {
          addMessage({
            type: 'system',
            content: `✓ Test passed: ${event.nodeId}`
          })
        } else {
          addMessage({
            type: 'system',
            content: `⚠ Test failed: ${event.error}`
          })
        }
        break

      case 'workflow_complete':
        addMessage({
          type: 'assistant',
          content: '🎉 Your workflow is complete! All nodes are configured and tested.'
        })
        setIsBuilding(false)
        if (onWorkflowComplete) {
          onWorkflowComplete(event.nodes, event.edges)
        }
        break

      case 'error':
        addMessage({
          type: 'system',
          content: `Error: ${event.message}`
        })
        setIsGenerating(false)
        setIsBuilding(false)
        break
    }
  }, [onWorkflowComplete])

  // Add message to chat
  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date()
    }])
  }

  // Generate workflow plan
  const handleGeneratePlan = async () => {
    if (!prompt.trim() || isGenerating) return

    addMessage({
      type: 'user',
      content: prompt
    })

    setIsGenerating(true)

    addMessage({
      type: 'assistant',
      content: 'Let me think about how to build this workflow...'
    })

    try {
      await builderRef.current?.generatePlan(prompt, userId, organizationId)
    } catch (error: any) {
      addMessage({
        type: 'system',
        content: `Failed to generate plan: ${error.message}`
      })
      setIsGenerating(false)
    }
  }

  // Approve plan and start building
  const handleApprovePlan = async () => {
    if (!builderRef.current) return
    await builderRef.current.approvePlan()
  }

  // Reject plan and start over
  const handleRejectPlan = () => {
    if (!builderRef.current) return
    builderRef.current.rejectPlan()
    setCurrentPlan(null)
    setMessages([])
    setPrompt('')
  }

  // Provide config value
  const handleProvideValue = (fieldName: string, value: any) => {
    builderRef.current?.provideFieldValue(fieldName, value)
  }

  // Skip current field
  const handleSkipField = () => {
    builderRef.current?.skipCurrentField()
  }

  // Handle OAuth connection
  const handleConnect = async (provider: string) => {
    // Open OAuth flow
    window.open(`/api/auth/${provider}/connect`, '_blank', 'width=600,height=700')

    // Poll for connection status
    const checkConnection = setInterval(async () => {
      try {
        const response = await fetch('/api/integrations')
        if (!response.ok) return

        const { data: integrations } = await response.json()
        const integration = integrations?.find((i: any) => i.provider === provider)
        const isConnected = integration && integration.status === 'connected'

        if (isConnected) {
          clearInterval(checkConnection)
          builderRef.current?.markAuthComplete(provider)
          addMessage({
            type: 'system',
            content: `✓ Connected to ${provider}`
          })
        }
      } catch (error) {
        console.error('Error checking connection status:', error)
      }
    }, 2000)

    // Stop checking after 2 minutes
    setTimeout(() => clearInterval(checkConnection), 120000)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                AI Workflow Builder
              </h1>
              <p className="text-sm text-gray-600">
                Describe what you want to automate, and I'll build it for you
              </p>
            </div>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !isGenerating && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                What would you like to automate?
              </h2>
              <p className="text-gray-600 mb-6">
                Describe your workflow in plain English, and I'll build it for you
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
                {[
                  'Send a Slack message when I get an email from support@example.com',
                  'Log customer feedback emails to a Google Sheet',
                  'Analyze sentiment of incoming emails and create Notion tasks',
                  'Send daily summaries of new Airtable records to Slack'
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(example)}
                    className="p-4 text-left text-sm bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((message) => (
            <div key={message.id}>
              {message.type === 'user' && (
                <div className="flex justify-end">
                  <div className="bg-blue-600 text-white rounded-lg px-4 py-3 max-w-xl">
                    {message.content}
                  </div>
                </div>
              )}

              {message.type === 'assistant' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white rounded-lg px-4 py-3 max-w-xl border border-gray-200">
                    {message.content}
                  </div>
                </div>
              )}

              {message.type === 'system' && !message.data?.provider && (
                <div className="flex justify-center">
                  <div className="text-sm text-gray-600 bg-gray-100 rounded-full px-4 py-2">
                    {message.content}
                  </div>
                </div>
              )}

              {message.type === 'system' && message.data?.provider && currentEvent?.type === 'needs_auth' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
                      <p className="text-sm text-gray-700 mb-3">{message.content}</p>
                      <button
                        onClick={() => handleConnect(message.data.provider)}
                        className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Connect to {message.data.provider}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {message.type === 'plan' && message.data && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <WorkflowPlanApproval
                      plan={message.data}
                      onApprove={handleApprovePlan}
                      onReject={handleRejectPlan}
                      isBuilding={isBuilding}
                    />
                  </div>
                </div>
              )}

              {message.type === 'config' && message.data && currentEvent?.type === 'collecting_config' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <InteractiveNodeConfig
                      nodeTitle={message.content}
                      field={message.data}
                      onValueProvided={(value) => handleProvideValue(message.data.name, value)}
                      onSkip={handleSkipField}
                      needsAuth={currentEvent.type === 'needs_auth'}
                      authProvider={currentEvent.type === 'needs_auth' ? currentEvent.provider : undefined}
                      onConnect={() => currentEvent.type === 'needs_auth' && handleConnect(currentEvent.provider)}
                    />
                  </div>
                </div>
              )}

              {message.type === 'progress' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 bg-green-50 rounded-lg px-4 py-3 border border-green-200">
                    <div className="text-sm font-medium text-gray-900">
                      {message.content}
                    </div>
                    {message.data && (
                      <div className="text-xs text-gray-600 mt-1">
                        {message.data.description}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isGenerating && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              </div>
              <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {!currentPlan && !isBuilding && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan()}
                placeholder="Describe your workflow..."
                disabled={isGenerating}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={handleGeneratePlan}
                disabled={!prompt.trim() || isGenerating}
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animated Cursor */}
      <AnimatedCursor
        isVisible={tutorialState.isRunning}
        position={tutorialState.cursorPosition}
        animation={tutorialState.cursorAnimation}
        label={tutorialState.cursorLabel}
      />
    </div>
  )
}
