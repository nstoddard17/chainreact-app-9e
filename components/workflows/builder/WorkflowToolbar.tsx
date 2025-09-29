import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RoleGuard } from '@/components/ui/role-guard'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Save, Play, ArrowLeft, Ear, RefreshCw, Radio, Pause, Loader2,
  Shield, FlaskConical, Rocket, History, Eye, EyeOff, ChevronDown
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { Node, Edge } from '@xyflow/react'

interface PreCheckResult {
  name: string
  ok: boolean
  info?: string
}

interface WorkflowToolbarProps {
  workflowName: string
  setWorkflowName: (name: string) => void
  hasUnsavedChanges: boolean
  isSaving: boolean
  isExecuting: boolean
  listeningMode: boolean
  getWorkflowStatus: () => { text: string; variant: "default" | "secondary" | "outline" | "destructive" }
  handleSave: () => Promise<void>
  handleExecute: () => void
  handleResetLoadingStates: () => void
  handleNavigation: (href: string) => void
  workflowStatus?: string
  handleToggleLive?: () => Promise<void>
  isUpdatingStatus?: boolean
  currentWorkflow?: any
  workflowId?: string | null
  // New props for missing buttons
  handleTestSandbox?: () => void
  handleExecuteLive?: () => void
  isStepMode?: boolean
  showSandboxPreview?: boolean
  setShowSandboxPreview?: (show: boolean) => void
  sandboxInterceptedActions?: any[]
  showExecutionHistory?: boolean
  setShowExecutionHistory?: (show: boolean) => void
  // For admin functions
  getNodes?: () => Node[]
  getEdges?: () => Edge[]
  setNodes?: (nodes: any) => void
  setEdges?: (edges: any) => void
  handleConfigureNode?: (nodeId: string) => void
}

export function WorkflowToolbar({
  workflowName,
  setWorkflowName,
  hasUnsavedChanges,
  isSaving,
  isExecuting,
  listeningMode,
  getWorkflowStatus,
  handleSave,
  handleExecute,
  handleResetLoadingStates,
  handleNavigation,
  workflowStatus,
  handleToggleLive,
  isUpdatingStatus = false,
  currentWorkflow,
  workflowId,
  handleTestSandbox,
  handleExecuteLive,
  isStepMode = false,
  showSandboxPreview = false,
  setShowSandboxPreview,
  sandboxInterceptedActions = [],
  showExecutionHistory = false,
  setShowExecutionHistory,
  getNodes,
  getEdges,
  setNodes,
  setEdges,
  handleConfigureNode,
}: WorkflowToolbarProps) {
  const { toast } = useToast()
  const [showPrecheck, setShowPrecheck] = useState(false)
  const [precheckRunning, setPrecheckRunning] = useState(false)
  const [precheckResults, setPrecheckResults] = useState<PreCheckResult[]>([])

  // Pre-activation check logic
  const runPreActivationCheck = async () => {
    if (!getNodes || !currentWorkflow) return

    setPrecheckRunning(true)
    const results: PreCheckResult[] = []

    try {
      const nodes = getNodes()
      const trigger = nodes.find((n: any) => n?.data?.isTrigger)

      // Check 1: Has a trigger
      if (!trigger) {
        results.push({ name: 'Workflow has a trigger', ok: false })
      } else {
        results.push({ name: 'Workflow has a trigger', ok: true, info: trigger.data?.type || 'Unknown trigger' })
      }

      // Check 2: Trigger is configured
      if (trigger) {
        const hasConfig = trigger.data?.config && Object.keys(trigger.data.config).length > 0
        if (!hasConfig) {
          results.push({ name: 'Trigger is configured', ok: false })
        } else {
          results.push({ name: 'Trigger is configured', ok: true })
        }

        // Check 3: Integration-specific checks
        const triggerType = trigger.data?.type
        if (triggerType === 'discord_message') {
          const guildId = trigger.data?.config?.guildId
          const channelId = trigger.data?.config?.channelId
          if (!guildId || !channelId) {
            results.push({ name: 'Discord server and channel selected', ok: false })
          } else {
            results.push({ name: 'Discord server and channel selected', ok: true })
          }
        } else if (triggerType === 'webhook') {
          results.push({ name: 'Webhook URL will be generated on activation', ok: true, info: 'URL provided after activation' })
        }
      }

      // Check 4: Has at least one action
      const actions = nodes.filter((n: any) => !n?.data?.isTrigger && n?.data?.type && n.type !== 'addAction')
      if (actions.length === 0) {
        results.push({ name: 'Has at least one action', ok: false })
      } else {
        results.push({ name: 'Has at least one action', ok: true, info: `${actions.length} action${actions.length > 1 ? 's' : ''}` })
      }

      // Check 5: All required fields configured
      const unconfiguredActions = actions.filter((n: any) => {
        const fields = n.data?.nodeComponent?.fields || []
        const config = n.data?.config || {}
        return fields.some((f: any) => f.required && !config[f.name])
      })
      if (unconfiguredActions.length > 0) {
        results.push({ name: 'All required fields configured', ok: false, info: `${unconfiguredActions.length} action${unconfiguredActions.length > 1 ? 's' : ''} need configuration` })
      } else if (actions.length > 0) {
        results.push({ name: 'All required fields configured', ok: true })
      }
    } catch (error) {
      console.error('Pre-activation check failed:', error)
      results.push({ name: 'System check', ok: false, info: 'Check failed unexpectedly' })
    } finally {
      setPrecheckResults(results)
      setPrecheckRunning(false)
    }
  }

  // Clean up add buttons function for admin
  const cleanUpAddButtons = () => {
    if (!getNodes || !getEdges || !setNodes || !setEdges) return

    try {
      const allNodes = getNodes()
      const aiAgents = allNodes.filter((n: any) => n.data?.type === 'ai_agent')
      if (aiAgents.length === 0) {
        toast({ title: 'No AI Agents found', description: 'No AI Agent nodes to clean up.' })
        return
      }

      // Build node map for quick lookup
      const nodeMap: Record<string, any> = {}
      allNodes.forEach(n => nodeMap[n.id] = n)

      // Remove existing addAction nodes
      const addNodeIds = new Set(allNodes.filter((n: any) => n.type === 'addAction').map((n: any) => n.id))

      setNodes((nodes: any) => nodes.filter((n: any) => !addNodeIds.has(n.id)))
      setEdges((eds: any) => eds.filter((e: any) => !addNodeIds.has(e.source) && !addNodeIds.has(e.target)))

      // Helper: find last node in a chain by walking edges forward
      const findLastInChain = (startId: string, edgeList: any[]): any => {
        let current = nodeMap[startId]
        const visited = new Set<string>()
        while (true) {
          if (!current || visited.has(current.id)) break
          visited.add(current.id)
          const outs = edgeList.filter((e: any) => e.source === current.id)
          const next = outs
            .map((e: any) => nodeMap[e.target])
            .find((n: any) => n && n.type !== 'addAction')
          if (!next) break
          current = next
        }
        return current
      }

      // For each AI Agent, add clean addAction buttons
      const newAddNodes: any[] = []
      const newAddEdges: any[] = []
      const currentEdges = getEdges() || []

      aiAgents.forEach((agent: any) => {
        const firstEdges = currentEdges.filter((e: any) => e.source === agent.id)
        const firstNodes = firstEdges
          .map((e: any) => nodeMap[e.target])
          .filter((n: any) => n && n.type !== 'addAction')

        firstNodes.forEach((fn: any, idx: number) => {
          const last = findLastInChain(fn.id, currentEdges)
          if (!last) return

          const addId = `add-action-${agent.id}-chain${idx}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
          const addNode = {
            id: addId,
            type: 'addAction',
            position: { x: last.position.x, y: last.position.y + 150 },
            draggable: false, // Prevent Add Action nodes from being dragged
            data: { parentId: last.id, parentAIAgentId: agent.id }
          }
          newAddNodes.push(addNode)
          newAddEdges.push({ id: `e-${last.id}-${addId}`, source: last.id, target: addId, type: 'straight' })
        })
      })

      setNodes((nds: any) => [...nds, ...newAddNodes])
      setEdges((eds: any) => [...eds, ...newAddEdges])

      toast({
        title: 'Add buttons cleaned',
        description: `${newAddNodes.length} buttons repositioned at chain ends.`
      })
    } catch (e) {
      console.error('Cleanup failed:', e)
      toast({
        title: 'Cleanup failed',
        description: 'Could not reposition add buttons.',
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      <div className="flex justify-between items-start p-4 pointer-events-auto">
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleNavigation("/workflows")}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col space-y-1 flex-1 min-w-0">
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onBlur={handleSave}
              className="text-xl font-semibold !border-none !outline-none !ring-0 p-0 bg-transparent w-auto min-w-[200px] max-w-full"
              style={{
                boxShadow: "none",
                width: `${Math.max(200, (workflowName?.length || 0) * 10 + 20)}px`
              }}
              placeholder="Untitled Workflow"
              title={workflowName || "Untitled Workflow"}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Admin-only Pre-Activation Check */}
          <RoleGuard requiredRole="admin">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPrecheck(true)
                      runPreActivationCheck()
                    }}
                  >
                    Pre-Activation Check
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Run readiness checks before activating</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </RoleGuard>

          {/* Admin-only Clean Up Add Buttons */}
          <RoleGuard requiredRole="admin">
            <Button
              variant="outline"
              onClick={cleanUpAddButtons}
            >
              Clean Up Add Buttons
            </Button>
          </RoleGuard>

          {/* Status badges */}
          <Badge variant={getWorkflowStatus().variant}>{getWorkflowStatus().text}</Badge>
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Unsaved Changes
            </Badge>
          )}

          {/* Save button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleSave} disabled={isSaving || isExecuting} variant="secondary">
                  {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                  Save
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save your workflow</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Activate/Deactivate button */}
          {handleToggleLive && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleToggleLive}
                    disabled={isUpdatingStatus || isSaving || hasUnsavedChanges}
                    variant={currentWorkflow?.status === 'active' ? "destructive" : "default"}
                  >
                    {isUpdatingStatus ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : currentWorkflow?.status === 'active' ? (
                      <Pause className="w-5 h-5 mr-2" />
                    ) : (
                      <Radio className="w-5 h-5 mr-2" />
                    )}
                    {currentWorkflow?.status === 'active' ? 'Deactivate' : 'Activate Workflow'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="font-semibold mb-1">
                    {currentWorkflow?.status === 'active' ? 'Deactivate Workflow' : 'Activate Workflow'}
                  </p>
                  <p className="text-xs">
                    {hasUnsavedChanges
                      ? "Save your changes before activating the workflow"
                      : currentWorkflow?.status === 'active'
                        ? "Stop the workflow from running automatically on triggers"
                        : "Enable automatic execution when trigger events occur (e.g., new email, webhook)"
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Combined Test button with dropdown */}
          {(handleTestSandbox || handleExecuteLive) && (
            <>
              {isStepMode || listeningMode ? (
                // Show exit/stop button when in test mode
                <Button
                  variant="secondary"
                  onClick={handleTestSandbox}
                  disabled={(isExecuting && !listeningMode) || isSaving}
                >
                  {isExecuting && !listeningMode && !isStepMode ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Shield className="w-5 h-5 mr-2" />
                  )}
                  {isStepMode ? "Exit Test Mode" : "Stop Sandbox"}
                </Button>
              ) : (
                // Show dropdown when not in test mode
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={isSaving || isExecuting}
                    >
                      <FlaskConical className="w-5 h-5 mr-2" />
                      Test
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    {handleTestSandbox && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onClick={handleTestSandbox}
                              disabled={(isExecuting && !listeningMode) || isSaving}
                              className="cursor-pointer"
                            >
                              <div className="flex items-start w-full">
                                <Shield className="w-5 h-5 mr-3 mt-0.5 text-blue-500" />
                                <div className="flex-1">
                                  <div className="font-medium">Sandbox Mode</div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Safe testing environment - no real actions
                                  </div>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="font-semibold mb-1">Test in Sandbox Mode</p>
                            <p className="text-xs">
                              Run workflow step-by-step with test data. No emails sent, no external actions performed. Perfect for testing your logic safely.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {handleTestSandbox && handleExecuteLive && <DropdownMenuSeparator />}

                    {handleExecuteLive && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onClick={handleExecuteLive}
                              disabled={isSaving || isExecuting}
                              className="cursor-pointer"
                            >
                              <div className="flex items-start w-full">
                                <Rocket className="w-5 h-5 mr-3 mt-0.5 text-orange-500" />
                                <div className="flex-1">
                                  <div className="font-medium">Live Mode</div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Execute with real data and actions
                                  </div>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="font-semibold mb-1">Run Once with Live Data</p>
                            <p className="text-xs">
                              Execute workflow immediately with test trigger data. <span className="text-yellow-500 font-semibold">Warning:</span> This will send real emails, post real messages, and perform actual actions in your connected services.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Show preview button when in sandbox mode */}
              {listeningMode && sandboxInterceptedActions.length > 0 && setShowSandboxPreview && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showSandboxPreview ? "default" : "outline"}
                        size="icon"
                        onClick={() => setShowSandboxPreview(!showSandboxPreview)}
                        className="relative"
                      >
                        <Shield className="w-5 h-5" />
                        {sandboxInterceptedActions.length > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                            {sandboxInterceptedActions.length}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">
                        {showSandboxPreview ? "Hide" : "Show"} Sandbox Preview
                      </p>
                      <p className="text-xs">
                        {sandboxInterceptedActions.length} intercepted action{sandboxInterceptedActions.length !== 1 ? 's' : ''}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}

          {/* Execution History Button */}
          {workflowId && setShowExecutionHistory && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setShowExecutionHistory(true)}
                    variant="outline"
                    size="icon"
                  >
                    <History className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View execution history</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Emergency reset button */}
          {(isSaving || isExecuting) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleResetLoadingStates}
                    variant="outline"
                    size="sm"
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset stuck loading states</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Pre-Activation Check Modal */}
      <Dialog open={showPrecheck} onOpenChange={setShowPrecheck}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pre-Activation Check</DialogTitle>
            <DialogDescription>We run a few readiness checks before activation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {precheckRunning ? (
              <div className="text-sm text-slate-600">Running checks...</div>
            ) : precheckResults.length === 0 ? (
              <div className="text-sm text-slate-600">No checks run yet.</div>
            ) : (
              <ul className="space-y-2">
                {precheckResults.map((r, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className={`text-sm ${r.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {r.ok ? '✓' : '✗'} {r.name}{r.info ? ` — ${r.info}` : ''}
                    </span>
                    {!r.ok && handleConfigureNode && getNodes && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const nodes = getNodes()
                          const trigger = nodes.find((n: any) => n?.data?.isTrigger)
                          if (trigger && r.name.toLowerCase().includes('discord')) {
                            handleConfigureNode(trigger.id)
                            setShowPrecheck(false)
                            return
                          }
                          if (trigger && r.name.toLowerCase().includes('webhook')) {
                            handleConfigureNode(trigger.id)
                            setShowPrecheck(false)
                            return
                          }
                        }}
                      >
                        Fix
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => runPreActivationCheck()} disabled={precheckRunning}>
              Re-run
            </Button>
            <Button
              onClick={() => setShowPrecheck(false)}
              disabled={precheckRunning}
              variant={precheckResults.every(r => r.ok) && precheckResults.length > 0 ? 'default' : 'secondary'}
            >
              {precheckResults.every(r => r.ok) && precheckResults.length > 0 ? 'Close (All Good)' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}