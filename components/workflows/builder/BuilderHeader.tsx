"use client"

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Save, ArrowLeft, Loader2, Pause, Radio, ChevronDown,
  MoreVertical, Undo2, Redo2, Share2, Copy, BarChart3, Trash2,
  Activity, CheckCircle, XCircle, ClipboardCheck, Table2, Settings,
  Shield, Rocket, FlaskConical, History, Clock, TrendingUp
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useWorkflowActions } from '@/hooks/workflows/useWorkflowActions'
import { useAuthStore } from '@/stores/authStore'

interface BuilderHeaderProps {
  workflowName: string
  setWorkflowName: (name: string) => void
  hasUnsavedChanges: boolean
  isSaving: boolean
  isExecuting: boolean
  handleSave: () => Promise<void>
  handleToggleLive?: () => Promise<void>
  isUpdatingStatus?: boolean
  currentWorkflow?: any
  workflowId?: string | null
  editTemplateId?: string | null
  isTemplateEditing?: boolean
  onOpenTemplateSettings?: () => void
  templateSettingsLabel?: string
  handleTestSandbox?: () => void
  handleExecuteLive?: () => void
  handleExecuteLiveSequential?: () => void
  handleRunPreflight?: () => void
  isRunningPreflight?: boolean
  isStepMode?: boolean
  listeningMode?: boolean
  handleUndo?: () => void
  handleRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  setShowExecutionHistory?: (show: boolean) => void
}

export function BuilderHeader({
  workflowName,
  setWorkflowName,
  hasUnsavedChanges,
  isSaving,
  isExecuting,
  handleSave,
  handleToggleLive,
  isUpdatingStatus = false,
  currentWorkflow,
  workflowId,
  editTemplateId,
  isTemplateEditing = false,
  onOpenTemplateSettings,
  templateSettingsLabel,
  handleTestSandbox,
  handleExecuteLive,
  handleExecuteLiveSequential,
  handleRunPreflight,
  isRunningPreflight = false,
  isStepMode = false,
  listeningMode = false,
  handleUndo,
  handleRedo,
  canUndo = false,
  canRedo = false,
  setShowExecutionHistory,
}: BuilderHeaderProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { duplicateWorkflow, deleteWorkflow, isDuplicating, isDeleting } = useWorkflowActions()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)

  // Compute status badge
  const statusBadge = React.useMemo(() => {
    if (isExecuting) return { text: "Running", variant: "default" as const, color: "text-blue-600" }
    if (isSaving) return { text: "Saving...", variant: "secondary" as const, color: "" }
    if (hasUnsavedChanges) return { text: "Unsaved", variant: "outline" as const, color: "text-orange-600 border-orange-600" }
    return null // Don't show "Saved" - it's redundant
  }, [isExecuting, isSaving, hasUnsavedChanges])

  const handleBackClick = React.useCallback(() => {
    router.push("/workflows")
  }, [router])

  const handleDuplicateClick = React.useCallback(() => {
    if (workflowId) {
      duplicateWorkflow(workflowId)
    }
  }, [workflowId, duplicateWorkflow])

  const handleConfirmDelete = React.useCallback(() => {
    if (workflowId) {
      deleteWorkflow(workflowId)
      setShowDeleteConfirm(false)
    }
  }, [workflowId, deleteWorkflow])

  const handleOpenAirtableSetup = React.useCallback(() => {
    const templateId = currentWorkflow?.source_template_id || editTemplateId
    const storageKey = `airtable-setup-panel-${workflowId || templateId}`
    localStorage.setItem(storageKey, 'expanded')
    window.dispatchEvent(new CustomEvent('airtable-panel-reopen'))
    toast({
      title: "Airtable Setup Panel",
      description: "Opening setup instructions...",
    })
  }, [currentWorkflow?.source_template_id, editTemplateId, workflowId, toast])

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
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast({
        title: "Success",
        description: `Workflow shared with ${shareEmail}`,
      })
      setShowShareModal(false)
      setShareEmail('')
    } catch (error) {
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
    <>
      <div className="h-14 border-b bg-background flex items-center justify-between px-4 gap-4">
        {/* Left Side - Navigation & Name */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackClick}
                className="flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Workflows</TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onBlur={handleSave}
              className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-2 py-1 h-8 bg-transparent max-w-md"
              placeholder="Untitled Workflow"
            />

            {statusBadge && (
              <Badge variant={statusBadge.variant} className={statusBadge.color}>
                {statusBadge.text}
              </Badge>
            )}

            {isTemplateEditing && (
              <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
                Template
              </Badge>
            )}

            {currentWorkflow?.status === 'active' && !isExecuting && !isSaving && !hasUnsavedChanges && (
              <Badge variant="default" className="bg-green-600">
                Active
              </Badge>
            )}
          </div>
        </div>

        {/* Right Side - Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Undo/Redo Group */}
          {handleUndo && handleRedo && (
            <>
              <div className="flex items-center gap-1">
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
                  <TooltipContent>Undo (⌘Z)</TooltipContent>
                </Tooltip>
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
                  <TooltipContent>Redo (⌘Y)</TooltipContent>
                </Tooltip>
              </div>
              <div className="w-px h-6 bg-border" />
            </>
          )}

          {/* Save Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleSave}
                disabled={isSaving || isExecuting}
                variant="secondary"
                size="sm"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save workflow (⌘S)</TooltipContent>
          </Tooltip>

          {/* Template Settings */}
          {isTemplateEditing && onOpenTemplateSettings && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenTemplateSettings}
              disabled={isSaving}
            >
              <Settings className="w-4 h-4 mr-2" />
              {templateSettingsLabel || "Settings"}
            </Button>
          )}

          {/* Test Dropdown */}
          {(handleTestSandbox || handleExecuteLive) && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSaving || (isExecuting && !listeningMode && !isStepMode)}
                  >
                    <FlaskConical className="w-4 h-4 mr-2" />
                    Test
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {handleTestSandbox && (
                    <DropdownMenuItem onClick={handleTestSandbox} className="cursor-pointer">
                      <div className="flex items-start w-full gap-3">
                        <Shield className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">Sandbox Mode</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {isStepMode ? "Exit sandbox testing" : "Safe testing - no real actions"}
                          </div>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  )}

                  {handleRunPreflight && (
                    <DropdownMenuItem
                      onClick={handleRunPreflight}
                      disabled={isSaving || isExecuting || isRunningPreflight}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start w-full gap-3">
                        <ClipboardCheck className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">Preflight Check</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Verify integrations and configuration
                          </div>
                        </div>
                        {isRunningPreflight && <Loader2 className="w-3 h-3 animate-spin" />}
                      </div>
                    </DropdownMenuItem>
                  )}

                  {(handleTestSandbox || handleRunPreflight) && handleExecuteLive && (
                    <DropdownMenuSeparator />
                  )}

                  {handleExecuteLive && (
                    <DropdownMenuItem
                      onClick={handleExecuteLive}
                      disabled={isSaving || isExecuting}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start w-full gap-3">
                        <Rocket className="w-4 h-4 mt-0.5 text-orange-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">Live Mode</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Execute with real data (parallel)
                          </div>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  )}

                  {isAdmin && handleExecuteLiveSequential && (
                    <DropdownMenuItem
                      onClick={handleExecuteLiveSequential}
                      disabled={isSaving || isExecuting}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start w-full gap-3">
                        <Activity className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">Live Sequential</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Debug mode - one node at a time
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">Admin</Badge>
                      </div>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* Activate/Deactivate */}
          {handleToggleLive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleToggleLive}
                  disabled={isUpdatingStatus || isSaving || hasUnsavedChanges}
                  variant={currentWorkflow?.status === 'active' ? "destructive" : "default"}
                  size="sm"
                >
                  {isUpdatingStatus ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : currentWorkflow?.status === 'active' ? (
                    <Pause className="w-4 h-4 mr-2" />
                  ) : (
                    <Radio className="w-4 h-4 mr-2" />
                  )}
                  {currentWorkflow?.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {hasUnsavedChanges
                  ? "Save changes before activating"
                  : currentWorkflow?.status === 'active'
                    ? "Stop automatic execution"
                    : "Enable automatic execution on triggers"
                }
              </TooltipContent>
            </Tooltip>
          )}

          {/* More Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {workflowId && setShowExecutionHistory && (
                <>
                  <DropdownMenuItem onClick={() => setShowExecutionHistory(true)}>
                    <History className="w-4 h-4 mr-2" />
                    View History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {(currentWorkflow?.source_template_id || editTemplateId) && (
                <>
                  <DropdownMenuItem onClick={handleOpenAirtableSetup}>
                    <Table2 className="w-4 h-4 mr-2" />
                    Airtable Setup Guide
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => setShowShareModal(true)}>
                <Share2 className="w-4 h-4 mr-2" />
                Share Workflow
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicateClick} disabled={isDuplicating}>
                <Copy className="w-4 h-4 mr-2" />
                {isDuplicating ? 'Duplicating...' : 'Duplicate'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowAnalytics(true)}>
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{workflowName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
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
              The recipient will receive a copy of this workflow in their account.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleShareWorkflow} disabled={isSharing || !shareEmail}>
              {isSharing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAnalytics} onOpenChange={setShowAnalytics}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Workflow Analytics</DialogTitle>
            <DialogDescription>
              Performance metrics for "{workflowName}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
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

            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Average Execution Time</h3>
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">0 ms</p>
              <p className="text-sm text-muted-foreground mt-1">Based on last 30 days</p>
            </div>

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

            <div className="bg-secondary/50 rounded-lg p-4">
              <h3 className="font-medium mb-2">Recent Executions</h3>
              <p className="text-sm text-muted-foreground">
                No executions yet. Analytics will appear once your workflow runs.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnalytics(false)}>
              Close
            </Button>
            {setShowExecutionHistory && (
              <Button onClick={() => {
                setShowAnalytics(false)
                setShowExecutionHistory(true)
              }}>
                <History className="w-4 h-4 mr-2" />
                View Full History
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
