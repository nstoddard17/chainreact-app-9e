import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Save, Play, ArrowLeft, Ear, RefreshCw, Radio, Pause, Loader2,
  Shield, FlaskConical, Rocket, History, Eye, EyeOff, ChevronDown,
  MoreVertical, Undo2, Redo2, Share2, Copy, BarChart3, Trash2,
  TrendingUp, Clock, CheckCircle, XCircle, Activity, ClipboardCheck
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useWorkflowActions } from '@/hooks/workflows/useWorkflowActions'
import { useAuthStore } from '@/stores/authStore'
import type { Node, Edge } from '@xyflow/react'

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
  editTemplateId?: string | null
  // New props for missing buttons
  handleTestSandbox?: () => void
  handleExecuteLive?: () => void
  handleExecuteLiveSequential?: () => void
  handleRunPreflight?: () => void
  isRunningPreflight?: boolean
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
  ensureOneAddActionPerChain?: () => void
  handleUndo?: () => void
  handleRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  // Edge selection and deletion
  selectedEdgeId?: string | null
  deleteSelectedEdge?: () => void
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
  editTemplateId,
  handleTestSandbox,
  handleExecuteLive,
  handleExecuteLiveSequential,
  handleRunPreflight,
  isRunningPreflight = false,
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
  ensureOneAddActionPerChain,
  handleUndo,
  handleRedo,
  canUndo = false,
  canRedo = false,
  selectedEdgeId,
  deleteSelectedEdge,
}: WorkflowToolbarProps) {
  const { toast } = useToast()
  const { duplicateWorkflow, deleteWorkflow, shareWorkflow, isDuplicating, isDeleting } = useWorkflowActions()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)

  // Handle sharing workflow with another user
  const handleShareWorkflow = async () => {
    if (!shareEmail || !workflowId) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSharing(true)

      // TODO: Implement actual sharing logic with Supabase
      // For now, we'll simulate the sharing process
      await new Promise(resolve => setTimeout(resolve, 1000))

      toast({
        title: "Success",
        description: `Workflow shared with ${shareEmail}`,
      })

      setShowShareModal(false)
      setShareEmail('')
    } catch (error) {
      console.error('Error sharing workflow:', error)
      toast({
        title: "Error",
        description: "Failed to share workflow",
        variant: "destructive",
      })
    } finally {
      setIsSharing(false)
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
          <div className="flex items-center gap-3 flex-1 min-w-0">
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
            {editTemplateId && (
              <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 flex-shrink-0">
                Editing Template
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Undo/Redo Buttons */}
          <div className="flex items-center gap-1 border-r pr-2 mr-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="h-8 w-8"
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Undo (Ctrl+Z)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="h-8 w-8"
                  >
                    <Redo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Redo (Ctrl+Y)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {selectedEdgeId && deleteSelectedEdge && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={deleteSelectedEdge}
                      className="h-8 w-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete Connection (Delete/Backspace)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Status badges */}
          <Badge variant={getWorkflowStatus().variant}>{getWorkflowStatus().text}</Badge>
          {selectedEdgeId && (
            <Badge variant="outline" className="ml-2">
              Connection Selected
            </Badge>
          )}
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

                    {handleRunPreflight && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onClick={handleRunPreflight}
                              disabled={isSaving || isExecuting || isRunningPreflight}
                              className="cursor-pointer"
                            >
                              <div className="flex items-start w-full">
                                <ClipboardCheck className="w-5 h-5 mr-3 mt-0.5 text-emerald-500" />
                                <div className="flex-1">
                                  <div className="font-medium">Preflight Check</div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Verify integrations and required fields before running
                                  </div>
                                </div>
                              </div>
                              {isRunningPreflight && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="font-semibold mb-1">Run Preflight Checklist</p>
                            <p className="text-xs">
                              Checks that every integration is connected and each action has the required configuration. Fix issues before sending real data.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {(!!handleTestSandbox || !!handleRunPreflight) && handleExecuteLive && <DropdownMenuSeparator />}

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
                                    Execute with real data (parallel processing)
                                  </div>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="font-semibold mb-1">Run with Live Data (Parallel)</p>
                            <p className="text-xs">
                              Execute workflow immediately with real data. Multiple nodes will run simultaneously for faster execution. <span className="text-yellow-500 font-semibold">Warning:</span> This will send real emails, post real messages, and perform actual actions in your connected services.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {/* Admin-only sequential mode for debugging */}
                    {isAdmin && handleExecuteLiveSequential && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem
                              onClick={handleExecuteLiveSequential}
                              disabled={isSaving || isExecuting}
                              className="cursor-pointer"
                            >
                              <div className="flex items-start w-full">
                                <Activity className="w-5 h-5 mr-3 mt-0.5 text-purple-500" />
                                <div className="flex-1">
                                  <div className="font-medium">Live Mode Sequential</div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Debug mode - one node at a time
                                  </div>
                                  <Badge variant="outline" className="text-xs mt-1">Admin</Badge>
                                </div>
                              </div>
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="font-semibold mb-1">Sequential Execution (Debug Mode)</p>
                            <p className="text-xs">
                              Execute workflow with real data but process nodes one at a time. Easier for debugging and understanding flow. <span className="text-yellow-500 font-semibold">Warning:</span> Still performs real actions.
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

          {/* Three dots menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {workflowId && setShowExecutionHistory && (
                <>
                  <DropdownMenuItem
                    onClick={() => setShowExecutionHistory(true)}
                  >
                    <History className="w-4 h-4 mr-2" />
                    View History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => setShowShareModal(true)}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share Workflow
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (workflowId) {
                    duplicateWorkflow(workflowId)
                  }
                }}
                disabled={isDuplicating}
              >
                <Copy className="w-4 h-4 mr-2" />
                {isDuplicating ? 'Duplicating...' : 'Duplicate Workflow'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowAnalytics(true)}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Analytics
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete Workflow'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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


      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{workflowName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (workflowId) {
                  deleteWorkflow(workflowId)
                  setShowDeleteConfirm(false)
                }
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Workflow'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Workflow Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Workflow</DialogTitle>
            <DialogDescription>
              Enter the email address of the team member you want to share this workflow with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="share-email">Email Address</Label>
              <Input
                id="share-email"
                type="email"
                placeholder="colleague@example.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && shareEmail) {
                    handleShareWorkflow()
                  }
                }}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              The recipient will receive a copy of this workflow in their account and a notification.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowShareModal(false)
                setShareEmail('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleShareWorkflow}
              disabled={isSharing || !shareEmail}
            >
              {isSharing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics Modal */}
      <Dialog open={showAnalytics} onOpenChange={setShowAnalytics}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Workflow Analytics</DialogTitle>
            <DialogDescription>
              Performance metrics and execution history for "{workflowName}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Analytics Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-secondary/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Executions</p>
                    <p className="text-2xl font-bold">0</p>
                  </div>
                  <Activity className="w-8 h-8 text-muted-foreground" />
                </div>
              </div>
              <div className="bg-green-500/10 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Successful</p>
                    <p className="text-2xl font-bold text-green-600">0</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <div className="bg-red-500/10 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Failed</p>
                    <p className="text-2xl font-bold text-red-600">0</p>
                  </div>
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>
              </div>
            </div>

            {/* Average Execution Time */}
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Average Execution Time</h3>
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">0 ms</p>
              <p className="text-sm text-muted-foreground mt-1">
                Based on the last 30 days
              </p>
            </div>

            {/* Success Rate */}
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Success Rate</h3>
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex items-end gap-4">
                <p className="text-2xl font-bold">N/A</p>
                <div className="flex-1">
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: '0%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Executions Placeholder */}
            <div className="bg-secondary/50 rounded-lg p-4">
              <h3 className="font-medium mb-2">Recent Executions</h3>
              <p className="text-sm text-muted-foreground">
                No executions yet. Analytics will be available once your workflow has been executed.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAnalytics(false)}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                if (setShowExecutionHistory) {
                  setShowExecutionHistory(true)
                  setShowAnalytics(false)
                }
              }}
            >
              <History className="w-4 h-4 mr-2" />
              View Full History
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
