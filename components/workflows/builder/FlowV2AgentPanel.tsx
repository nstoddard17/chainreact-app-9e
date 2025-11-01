"use client"

/**
 * FlowV2AgentPanel.tsx
 *
 * Complete agent panel extracted from WorkflowBuilderV2.
 * Contains chat interface, staged chips, plan list, and build controls.
 */

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import Image from "next/image"
import {
  Sparkles,
  HelpCircle,
  ArrowLeft,
  AtSign,
  Pause,
} from "lucide-react"
import {
  BuildState,
  type BuildStateMachine,
  getStateLabel,
  getBadgeForState,
} from "@/src/lib/workflows/builder/BuildState"
import { Copy } from "./ui/copy"
import { ChatStatusBadge, type BadgeState } from "./ui/ChatStatusBadge"
import { getProviderDisplayName } from "@/lib/workflows/builder/providerNames"
import { useIntegrations } from "@/hooks/use-integrations"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { getFieldTypeIcon } from "./ui/FieldTypeIcons"
import "./styles/FlowBuilder.anim.css"
import type { ChatMessage } from "@/lib/workflows/ai-agent/chat-service"

interface PanelLayoutProps {
  isOpen: boolean
  onClose: () => void
  width: number
}

interface PanelStateProps {
  buildMachine: BuildStateMachine
  agentInput: string
  isAgentLoading: boolean
  agentMessages: ChatMessage[]
}

interface PanelActions {
  onInputChange: (value: string) => void
  onSubmit: () => void
  onBuild: () => void
  onContinueNode: () => void
  onSkipNode: () => void
  onUndoToPreviousStage: () => void
  onCancelBuild: () => void
}

interface FlowV2AgentPanelProps {
  layout: PanelLayoutProps
  state: PanelStateProps
  actions: PanelActions
}

export function FlowV2AgentPanel({
  layout,
  state,
  actions,
}: FlowV2AgentPanelProps) {
  const { isOpen, onClose, width } = layout
  const { buildMachine, agentInput, isAgentLoading, agentMessages } = state
  const {
    onInputChange,
    onSubmit,
    onBuild,
    onContinueNode,
    onSkipNode,
    onUndoToPreviousStage,
    onCancelBuild,
  } = actions

  // Use state for viewport dimensions to avoid hydration mismatch
  const [viewportDimensions, setViewportDimensions] = useState<{ height: number; width: number }>({ height: 0, width: 0 })

  // Fetch user's integrations for connection dropdown
  const { integrations, loading: integrationsLoading } = useIntegrations()

  // State for field configurations per node
  const [nodeConfigs, setNodeConfigs] = useState<Record<string, Record<string, any>>>({})

  // Set viewport dimensions after mount to avoid SSR/client mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setViewportDimensions({ height: window.innerHeight, width: window.innerWidth })
    }
  }, [])

  // Helper: Get node component schema by type
  const getNodeSchema = (nodeType: string) => {
    return ALL_NODE_COMPONENTS.find(n => n.type === nodeType)
  }

  // Helper: Determine which fields require user input
  // Fields need user input if they are: required, have dynamic options, OR are connection selectors
  const getRequiredUserFields = (nodeType: string) => {
    const schema = getNodeSchema(nodeType)
    if (!schema?.configSchema) return []

    return schema.configSchema.filter(field =>
      // Connection field (always required)
      field.name === 'connection' ||
      // Required fields with dynamic data (server/channel selections, etc.)
      (field.required && field.dynamic) ||
      // Required select/combobox fields
      (field.required && (field.type === 'select' || field.type === 'combobox'))
    )
  }

  // Helper: Update field configuration for a node
  const handleFieldChange = (nodeId: string, fieldName: string, value: any) => {
    setNodeConfigs(prev => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        [fieldName]: value
      }
    }))
  }

  // Helper: Get connected integrations for a provider
  const getProviderConnections = (providerId: string) => {
    return integrations.filter(int =>
      int.id.toLowerCase() === providerId.toLowerCase() && int.isConnected
    )
  }

  // BuilderHeader is 56px tall (from tokens.css --header-height)
  // The panel sits below it, so we must subtract header height
  const headerHeight = 56
  const safeWidth = Math.max(0, Math.min(width, viewportDimensions.width))
  const safeHeight = viewportDimensions.height > 0 ? Math.max(0, viewportDimensions.height - headerHeight) : undefined

  return (
    <div
      className={`absolute top-0 left-0 bg-white border-r border-border shadow-xl z-40 transition-transform duration-300 ease-in-out max-w-full overflow-hidden ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{
        width: `${safeWidth}px`,
        maxWidth: '100vw',
        height: safeHeight ? `${safeHeight}px` : '100%',
        maxHeight: safeHeight ? `${safeHeight}px` : '100%',
      }}
    >
      <div className="h-full flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo_transparent.png"
              alt="ChainReact"
              width={32}
              height={32}
              className="w-8 h-8"
            />
            <h2 className="font-semibold text-base text-foreground">React Agent</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-foreground hover:bg-accent"
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-gray-300 hover:text-gray-400 hover:bg-accent"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 overflow-hidden flex flex-col w-full min-h-0">
          {/* Welcome message */}
          {(buildMachine.state === BuildState.IDLE || agentMessages.length === 0) && (
            <div className="text-sm text-foreground space-y-2 pt-2 pb-3 px-4 w-full overflow-hidden">
              <p className="break-words">Hello, what would you like to craft?</p>
              <p className="text-xs break-words">Tell me about your goal or task, and include the tools you normally use (like your email, calendar, or CRM).</p>
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto w-full overflow-x-hidden min-h-0 px-4">
            <div className="space-y-4 py-4 pb-8 w-full min-h-0">
              {/* Animated Build UI */}
              {buildMachine.state !== BuildState.IDLE && (
                <div className="space-y-4 w-full">
                  {/* User message */}
                  {agentMessages.filter(m => m && m.role === 'user').map((msg, index) => {
                    const text = (msg as any).text ?? (msg as any).content ?? ''
                    const created = (msg as any).createdAt ?? (msg as any).timestamp ?? null
                    let formattedTime: string | null = null
                    if (created) {
                      const date = created instanceof Date ? created : new Date(created)
                      if (!Number.isNaN(date.getTime())) {
                        formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      }
                    }

                    return (
                      <div key={index} className="flex justify-end w-full">
                        <div
                          className="max-w-[80%] rounded-lg px-4 py-3 bg-gray-100 text-gray-900"
                          style={{
                            wordBreak: "break-word",
                            overflowWrap: "anywhere"
                        }}
                      >
                        <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>
                          {text}
                        </p>
                        {formattedTime && (
                          <p className="text-xs opacity-70 mt-1">
                            {formattedTime}
                          </p>
                        )}
                      </div>
                    </div>
                    )
                  })}

                  {/* Status Badge - updates as state transitions through planning */}
                  {(buildMachine.state === BuildState.THINKING ||
                    buildMachine.state === BuildState.SUBTASKS ||
                    buildMachine.state === BuildState.COLLECT_NODES ||
                    buildMachine.state === BuildState.OUTLINE ||
                    buildMachine.state === BuildState.PURPOSE) && (
                    <div className="flex w-full">
                      <ChatStatusBadge
                        text={(() => {
                          const currentNode = buildMachine.plan[buildMachine.progress.currentIndex]
                          const badge = getBadgeForState(buildMachine.state, currentNode?.title)
                          return badge?.text || ''
                        })()}
                        subtext={(() => {
                          const currentNode = buildMachine.plan[buildMachine.progress.currentIndex]
                          const badge = getBadgeForState(buildMachine.state, currentNode?.title)
                          return badge?.subtext
                        })()}
                        state="active"
                        className="build-progress-badge"
                        reducedMotion={typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches}
                      />
                    </div>
                  )}

                  {/* Outline text only shown during OUTLINE state, hidden once plan is ready */}
                  {buildMachine.state === BuildState.OUTLINE && buildMachine.stagedText.outline && (
                    <div className="flex w-full">
                      <div className="text-sm text-muted-foreground">
                        {buildMachine.stagedText.outline}
                      </div>
                    </div>
                  )}

                  {/* Plan Ready - Show plan list and Build button (only visible when PLAN_READY or later) */}
                  {(buildMachine.state === BuildState.PLAN_READY ||
                    buildMachine.state === BuildState.BUILDING_SKELETON ||
                    buildMachine.state === BuildState.WAITING_USER ||
                    buildMachine.state === BuildState.PREPARING_NODE ||
                    buildMachine.state === BuildState.TESTING_NODE ||
                    buildMachine.state === BuildState.COMPLETE) && (
                    <div className="flex flex-col w-full gap-3">
                      <div className="flex w-full">
                        <div className="space-y-4 w-full overflow-visible min-w-0">
                          <div className="w-full overflow-visible min-w-0">
                            <div className="space-y-3 staged-text-item">
                              <div className="text-sm break-words">{getStateLabel(BuildState.PLAN_READY)}</div>
                              <div className="text-sm font-bold break-words">Flow plan:</div>

                              {/* Status badge shown during build directly below Flow plan: */}
                              {buildMachine.state === BuildState.BUILDING_SKELETON && (
                                <ChatStatusBadge
                                  text={getStateLabel(BuildState.BUILDING_SKELETON)}
                                  state="active"
                                  className="build-progress-badge"
                                  reducedMotion={typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches}
                                />
                              )}

                              <div className="space-y-2 w-full overflow-visible min-w-0">
                                {buildMachine.plan.map((planNode, index) => {
                                  const isDone = index < buildMachine.progress.done
                                  const isActive = index === buildMachine.progress.currentIndex
                                  const NodeIcon = planNode.icon

                                  const showExpanded = isActive && buildMachine.state === BuildState.WAITING_USER
                                  const requiresConnection = planNode.providerId && planNode.providerId !== 'ai' && planNode.providerId !== 'logic' && planNode.providerId !== 'mapper'

                                  return (
                                    <div key={planNode.id} className={`plan-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${showExpanded ? 'expanded' : ''} w-full overflow-visible min-w-0`}>
                                      <div className="flex-1 flex items-center gap-3 min-w-0 overflow-hidden">
                                        <div className="flex items-center justify-center shrink-0">
                                          {planNode.providerId ? (
                                            <img
                                              src={`/integrations/${planNode.providerId}.svg`}
                                              alt={planNode.providerId}
                                              className=""
                                              style={{ width: '24px', height: 'auto', flexShrink: 0 }}
                                            />
                                          ) : NodeIcon ? (
                                            <NodeIcon className="w-6 h-6 shrink-0" />
                                          ) : null}
                                        </div>
                                        <div className="flex-1 flex flex-col items-start gap-0.5 min-w-0 overflow-hidden">
                                          <div className="flex items-center gap-2 w-full">
                                            <span className="text-base font-medium break-words overflow-wrap-anywhere flex-1 min-w-0">{planNode.title}</span>
                                            {isActive && (buildMachine.state === BuildState.PREPARING_NODE || buildMachine.state === BuildState.TESTING_NODE || buildMachine.state === BuildState.BUILDING_SKELETON) && (
                                              <div className="chip blue shrink-0">
                                                <span className="text-xs">
                                                  {buildMachine.state === BuildState.TESTING_NODE && 'Testing node'}
                                                  {buildMachine.state === BuildState.PREPARING_NODE && 'Preparing node'}
                                                  {buildMachine.state === BuildState.BUILDING_SKELETON && 'Building node'}
                                                </span>
                                                <div className="pulse-dot" />
                                              </div>
                                            )}
                                          </div>
                                          {planNode.description && (
                                            <span className="text-xs text-muted-foreground break-words overflow-wrap-anywhere w-full">
                                              {planNode.description}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Expanded configuration section */}
                                      {showExpanded && (() => {
                                        const requiredFields = getRequiredUserFields(planNode.nodeType)
                                        const providerConnections = planNode.providerId ? getProviderConnections(planNode.providerId) : []

                                        return (
                                          <div className="w-full mt-4 space-y-4 border-t border-border pt-4">
                                            {requiresConnection && (
                                              <div className="space-y-3">
                                                <p className="text-sm text-muted-foreground">
                                                  Let's connect the service first — pick a saved connection or make a new one
                                                </p>

                                                <div className="space-y-2">
                                                  <label className="text-xs font-medium text-foreground">
                                                    Your {getProviderDisplayName(planNode.providerId || '')} connection
                                                  </label>
                                                  <select
                                                    className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
                                                    value={nodeConfigs[planNode.id]?.connection || ''}
                                                    onChange={(e) => handleFieldChange(planNode.id, 'connection', e.target.value)}
                                                  >
                                                    <option value="">Select an option...</option>
                                                    {providerConnections.map(conn => (
                                                      <option key={conn.id} value={conn.id}>
                                                        {conn.name || `${getProviderDisplayName(planNode.providerId || '')} Account`}
                                                      </option>
                                                    ))}
                                                  </select>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                                                    onClick={() => {
                                                      window.open(`/integrations?provider=${planNode.providerId}`, '_blank')
                                                    }}
                                                  >
                                                    + Connect {getProviderDisplayName(planNode.providerId || '')}
                                                  </Button>
                                                </div>
                                              </div>
                                            )}

                                            {/* Required field dropdowns */}
                                            {requiredFields.filter(f => f.name !== 'connection').map((field) => {
                                              const FieldIcon = getFieldTypeIcon(field.type)

                                              return (
                                                <div key={field.name} className="space-y-2">
                                                  <label className="text-xs font-medium text-foreground flex items-center gap-2">
                                                    <FieldIcon className="w-4 h-4 text-muted-foreground" />
                                                    {field.label || field.name}
                                                    {field.required && <span className="text-red-500">*</span>}
                                                  </label>
                                                  <select
                                                    className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
                                                    value={nodeConfigs[planNode.id]?.[field.name] || ''}
                                                    onChange={(e) => handleFieldChange(planNode.id, field.name, e.target.value)}
                                                  >
                                                    <option value="">{field.placeholder || 'Select an option...'}</option>
                                                    {/* TODO: Fetch dynamic options based on field.dynamic value */}
                                                    {field.defaultOptions?.map(opt => (
                                                      <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
                                                        {typeof opt === 'string' ? opt : opt.label}
                                                      </option>
                                                    ))}
                                                  </select>
                                                  {field.description && (
                                                    <p className="text-xs text-muted-foreground">{field.description}</p>
                                                  )}
                                                </div>
                                              )
                                            })}

                                            {/* Continue/Skip buttons */}
                                            <div className="flex gap-2 pt-2">
                                              <Button
                                                onClick={onContinueNode}
                                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                              >
                                                Continue
                                              </Button>
                                              <Button
                                                onClick={onSkipNode}
                                                variant="ghost"
                                                className="flex-1"
                                              >
                                                Skip
                                              </Button>
                                            </div>
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {buildMachine.state === BuildState.PLAN_READY && (
                        <Button onClick={onBuild} className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="lg">
                          {Copy.planReadyCta}
                        </Button>
                      )}

                      {buildMachine.state === BuildState.BUILDING_SKELETON && (
                        <div className="space-y-2 w-full overflow-hidden min-w-0">
                          <Button
                            onClick={onCancelBuild}
                            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-200"
                            size="lg"
                          >
                            {Copy.cancel}
                          </Button>
                          <Button
                            onClick={onUndoToPreviousStage}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                            size="sm"
                          >
                            {Copy.undo}
                          </Button>
                        </div>
                      )}

                      {/* WAITING_USER state removed - Prerequisites are handled dynamically by the workflow builder */}

                      {buildMachine.state === BuildState.COMPLETE && (
                        <div className="setup-card w-full overflow-hidden min-w-0">
                          <div className="text-center space-y-3">
                            <div className="text-lg font-semibold text-green-600 break-words">
                              {getStateLabel(BuildState.COMPLETE)}
                            </div>
                            <div className="text-sm text-muted-foreground break-words">
                              Your flow is configured and ready to use. You can now publish or test it.
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Button variant="default" className="flex-1">
                                Publish
                              </Button>
                              <Button variant="outline" className="flex-1">
                                Test all
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chat input - Fixed at bottom */}
          <div className="mt-auto mb-4 px-4 relative min-w-0">
            <div className="border border-border rounded-lg bg-white p-2 min-w-0">
              <div className="mb-0.5 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 gap-0.5"
                  disabled={isAgentLoading}
                >
                  <AtSign className="w-2.5 h-2.5 text-blue-500" />
                  add context
                </Button>
                {isAgentLoading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 gap-1"
                  >
                    <Pause className="w-3 h-3" />
                    pause
                  </Button>
                )}
              </div>

              <div className="relative">
                {agentInput === '' && (
                  <div className="absolute left-0 top-0 pointer-events-none px-3 py-2 text-sm text-muted-foreground leading-normal">
                    How can ChainReact help you today?
                  </div>
                )}
                <input
                  type="text"
                  value={agentInput}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && agentInput.trim()) {
                      onSubmit()
                    }
                  }}
                  disabled={isAgentLoading}
                  className="w-full border-0 shadow-none focus:outline-none focus:ring-0 text-sm text-foreground px-3 py-2 bg-transparent leading-normal"
                  style={{ caretColor: 'currentColor' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
