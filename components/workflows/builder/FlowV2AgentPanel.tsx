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
} from "@/src/lib/workflows/builder/BuildState"
import { Copy } from "./ui/copy"
import "./styles/FlowBuilder.anim.css"

interface AgentMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface PanelLayoutProps {
  isOpen: boolean
  onClose: () => void
  width: number
}

interface PanelStateProps {
  buildMachine: BuildStateMachine
  agentInput: string
  isAgentLoading: boolean
  agentMessages: AgentMessage[]
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

  // Set viewport dimensions after mount to avoid SSR/client mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setViewportDimensions({ height: window.innerHeight, width: window.innerWidth })
    }
  }, [])

  // BuilderHeader is 56px tall (from tokens.css --header-height)
  // The panel sits below it, so we must subtract header height
  const headerHeight = 56
  const safeWidth = Math.max(0, Math.min(width, viewportDimensions.width))
  const safeHeight = viewportDimensions.height > 0 ? Math.max(0, viewportDimensions.height - headerHeight) : undefined

  return (
    <div
      className={`absolute top-0 left-0 bg-background border-r border-border shadow-xl z-40 transition-transform duration-300 ease-in-out max-w-full overflow-hidden ${
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
          <div className="flex items-center gap-2">
            <Image
              src="/logo_transparent.png"
              alt="ChainReact"
              width={24}
              height={24}
              className="w-6 h-6"
            />
            <h2 className="font-semibold text-sm text-foreground">React Agent</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[11px] text-foreground hover:bg-accent gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              Agent Context
            </Button>
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
              className="h-8 w-8 text-foreground hover:bg-accent"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 overflow-hidden flex flex-col w-full min-h-0">
          {/* Welcome message */}
          {buildMachine.state === BuildState.IDLE && (
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
                  {agentMessages.filter(m => m.role === 'user').map((msg, index) => (
                    <div key={index} className="flex justify-end w-full">
                      <div
                        className="max-w-[80%] rounded-lg px-4 py-3 bg-primary text-primary-foreground"
                        style={{
                          wordBreak: "break-word",
                          overflowWrap: "anywhere"
                        }}
                      >
                        <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>
                          {msg.content}
                        </p>
                        <p className="text-xs opacity-70 mt-1">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}

                  {(buildMachine.state === BuildState.THINKING ||
                    buildMachine.state === BuildState.SUBTASKS ||
                    buildMachine.state === BuildState.COLLECT_NODES ||
                    buildMachine.state === BuildState.OUTLINE ||
                    buildMachine.state === BuildState.PURPOSE ||
                    buildMachine.state === BuildState.PLAN_READY ||
                    buildMachine.state === BuildState.BUILDING_SKELETON ||
                    buildMachine.state === BuildState.WAITING_USER ||
                    buildMachine.state === BuildState.PREPARING_NODE ||
                    buildMachine.state === BuildState.TESTING_NODE ||
                    buildMachine.state === BuildState.COMPLETE) && (
                    <div className="flex w-full">
                      <div className="space-y-4 max-w-[80%] overflow-hidden min-w-0">
                        {buildMachine.state === BuildState.THINKING && (
                          <div className="w-full overflow-hidden min-w-0">
                            <div className="chip blue chip-shimmer">
                              <div className="pulse-dot" />
                              <span className="break-words">{Copy.thinking}</span>
                            </div>
                          </div>
                        )}

                        {(buildMachine.state === BuildState.SUBTASKS || buildMachine.state === BuildState.COLLECT_NODES ||
                          buildMachine.state === BuildState.OUTLINE || buildMachine.state === BuildState.PURPOSE ||
                          buildMachine.state === BuildState.PLAN_READY || buildMachine.state === BuildState.BUILDING_SKELETON ||
                          buildMachine.state === BuildState.WAITING_USER || buildMachine.state === BuildState.PREPARING_NODE ||
                          buildMachine.state === BuildState.TESTING_NODE || buildMachine.state === BuildState.COMPLETE) && (
                          <>
                      {buildMachine.state === BuildState.SUBTASKS && (
                        <div className="overflow-hidden min-w-0">
                          <div className="chip blue staged-text-item">
                            <span className="break-words">{getStateLabel(BuildState.SUBTASKS)}</span>
                          </div>
                        </div>
                      )}

                      {buildMachine.state !== BuildState.SUBTASKS && buildMachine.stagedText.subtasks && buildMachine.stagedText.subtasks.length > 0 && (
                        <div className="overflow-hidden min-w-0">
                          <div className="space-y-2 staged-text-item max-w-full">
                            <div className="chip blue">
                              {getStateLabel(BuildState.SUBTASKS)}
                            </div>
                            <div className="text-sm text-foreground space-y-1 overflow-hidden break-words border-l border-border/50 pl-4">
                              {buildMachine.stagedText.subtasks.map((task, i) => (
                                <div key={i} className="flex items-start gap-2 overflow-hidden">
                                  <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                  <span className="break-words overflow-wrap-anywhere flex-1 min-w-0">{task}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {buildMachine.state === BuildState.COLLECT_NODES && (
                        <div className="overflow-hidden min-w-0">
                          <div className="chip blue chip-shimmer staged-text-item">
                            <div className="pulse-dot" />
                            <span className="break-words">{getStateLabel(BuildState.COLLECT_NODES)}</span>
                          </div>
                        </div>
                      )}

                      {buildMachine.state !== BuildState.COLLECT_NODES && buildMachine.state !== BuildState.SUBTASKS &&
                       buildMachine.stagedText.relevantNodes && buildMachine.stagedText.relevantNodes.length > 0 && (
                        <div className="overflow-hidden min-w-0">
                          <div className="space-y-2 staged-text-item max-w-full">
                            <div className="chip blue">
                              {getStateLabel(BuildState.COLLECT_NODES)}
                            </div>
                            <div className="space-y-2 overflow-hidden border-l border-border/50 pl-4">
                              {buildMachine.stagedText.relevantNodes.map((node, i) => (
                                <div key={i} className="flex items-start gap-3 p-2 rounded bg-accent/50 overflow-hidden">
                                  {node.providerId && (
                                    <Image
                                      src={`/integrations/${node.providerId}.svg`}
                                      alt={node.providerId}
                                      width={20}
                                      height={20}
                                      className="shrink-0"
                                    />
                                  )}
                                  <div className="flex-1 text-sm min-w-0 overflow-hidden">
                                    <div className="font-medium break-words overflow-wrap-anywhere">{node.title}</div>
                                    <div className="text-xs text-muted-foreground break-words overflow-wrap-anywhere">{node.description}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {(buildMachine.state === BuildState.OUTLINE || buildMachine.state === BuildState.PURPOSE) && (
                        <div className="overflow-hidden min-w-0">
                          <div className="chip blue chip-shimmer staged-text-item">
                            <div className="pulse-dot" />
                            <span className="break-words">{getStateLabel(BuildState.OUTLINE)}</span>
                          </div>
                        </div>
                      )}

                      {buildMachine.state !== BuildState.OUTLINE && buildMachine.state !== BuildState.PURPOSE &&
                       buildMachine.state !== BuildState.SUBTASKS && buildMachine.state !== BuildState.COLLECT_NODES &&
                       buildMachine.stagedText.purpose && (
                        <div className="overflow-hidden min-w-0">
                          <div className="space-y-2 staged-text-item max-w-full">
                            <div className="chip blue">
                              {getStateLabel(BuildState.OUTLINE)}
                            </div>
                            <div className="p-3 rounded bg-accent/50 text-sm overflow-hidden break-words border-l border-border/50 pl-4">
                              <div className="font-medium mb-1 break-words">{Copy.purposeLabel}</div>
                              <p className="text-muted-foreground break-words overflow-wrap-anywhere">{buildMachine.stagedText.purpose}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Plan Ready - Show plan list and Build button */}
                      {(buildMachine.state === BuildState.PLAN_READY || buildMachine.state === BuildState.BUILDING_SKELETON ||
                        buildMachine.state === BuildState.WAITING_USER || buildMachine.state === BuildState.PREPARING_NODE ||
                        buildMachine.state === BuildState.TESTING_NODE || buildMachine.state === BuildState.COMPLETE) && (
                        <div className="w-full overflow-hidden min-w-0">
                          <div className="space-y-3 staged-text-item">
                            <div className="text-sm font-medium break-words">{getStateLabel(BuildState.PLAN_READY)}</div>
                            <div className="text-xs font-semibold text-muted-foreground break-words">Flow plan:</div>
                            <div className="space-y-1 w-full overflow-hidden min-w-0">
                              {buildMachine.plan.map((planNode, index) => {
                                const isDone = index < buildMachine.progress.done
                                const isActive = index === buildMachine.progress.currentIndex
                                const NodeIcon = planNode.icon

                                return (
                                  <div key={planNode.id} className={`plan-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} w-full overflow-hidden min-w-0`}>
                                    <div className="plan-item-bullet shrink-0">{index + 1}</div>
                                    <div className="flex-1 flex items-start gap-2 min-w-0 overflow-hidden">
                                      {planNode.providerId ? (
                                        <Image
                                          src={`/integrations/${planNode.providerId}.svg`}
                                          alt={planNode.providerId}
                                          width={16}
                                          height={16}
                                          className="shrink-0 mt-0.5"
                                        />
                                      ) : NodeIcon ? (
                                        <NodeIcon className="w-4 h-4 shrink-0 mt-0.5" />
                                      ) : null}
                                      <span className="text-sm break-words overflow-wrap-anywhere flex-1 min-w-0">{planNode.title}</span>
                                    </div>
                                    {isActive && buildMachine.state === BuildState.PREPARING_NODE && (
                                      <div className="chip blue">
                                        <span className="text-xs">Preparing node</span>
                                        <div className="pulse-dot" />
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            {buildMachine.state === BuildState.PLAN_READY && (
                              <Button onClick={onBuild} className="w-full mt-2" size="lg">
                                {Copy.planReadyCta}
                              </Button>
                            )}

                            {buildMachine.state === BuildState.BUILDING_SKELETON && (
                              <div className="space-y-2 w-full overflow-hidden min-w-0">
                                <div className="chip blue">
                                  <div className="bouncing-dots">
                                    <span />
                                    <span />
                                    <span />
                                  </div>
                                  <span className="break-words">{getStateLabel(BuildState.BUILDING_SKELETON)}</span>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <Button variant="ghost" size="sm" onClick={onUndoToPreviousStage} className="flex-1">
                                    {Copy.undo}
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={onCancelBuild} className="flex-1 text-destructive">
                                    {Copy.cancel}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {buildMachine.state === BuildState.WAITING_USER && buildMachine.progress.currentIndex >= 0 && (
                              <div className="space-y-3 w-full overflow-hidden min-w-0">
                                <div className="chip green">
                                  {getStateLabel(BuildState.WAITING_USER)}
                                </div>
                                <div className="setup-card setup-card-warning w-full overflow-hidden min-w-0">
                                  <div className="text-sm font-medium mb-3 break-words">
                                    Let's connect the service first — pick a saved connection or make a new one
                                  </div>
                                  <div className="text-xs text-muted-foreground mb-3 break-words">
                                    Your Monday connection
                                  </div>
                                  <Button variant="default" size="sm" className="mb-3">
                                    + Connect monday
                                  </Button>
                                  <Separator className="my-3" />
                                  <div className="text-xs text-muted-foreground mb-2">
                                    Board - Fill the parameter Board
                                  </div>
                                  <Input placeholder="loading options..." className="mb-3" />
                                  <div className="flex gap-2 flex-wrap">
                                    <Button onClick={onContinueNode} size="sm" className="flex-1">
                                      {Copy.continue}
                                    </Button>
                                    <Button onClick={onSkipNode} variant="ghost" size="sm" className="flex-1">
                                      {Copy.skip}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

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
                        </div>
                      )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chat input - Fixed at bottom */}
          <div className="mt-auto mb-4 px-4 relative min-w-0">
            <div className="border border-border rounded-lg bg-background p-2 min-w-0">
              <div className="mb-0.5 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-foreground hover:bg-accent gap-1"
                  disabled={isAgentLoading}
                >
                  <AtSign className="w-3 h-3" />
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
