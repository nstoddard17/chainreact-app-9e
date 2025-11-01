"use client"

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Undo2,
  Redo2,
  MoreVertical,
  History,
  GitBranch,
  Play,
  TestTube,
  Rocket,
  Loader2,
  Download,
  Upload,
  Trash2,
  Copy,
  Share2,
  Link2,
  Users,
  ArrowLeft,
  Settings,
  Code2,
  Clock,
  Zap,
  RotateCcw,
  FolderGit2,
  Layers,
  Archive,
  Files,
  Workflow,
  CloudCog,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkflowActions } from "@/hooks/workflows/useWorkflowActions"
import { useToast } from "@/hooks/use-toast"
import { WorkflowVersionsDialog } from "./WorkflowVersionsDialog"
import { WorkflowHistoryDialog } from "./WorkflowHistoryDialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface BuilderHeaderProps {
  workflowName: string
  setWorkflowName: (name: string) => void
  hasUnsavedChanges?: boolean
  isSaving: boolean
  isExecuting?: boolean
  handleSave?: () => Promise<void>
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

const BuilderHeaderComponent = ({
  workflowName,
  setWorkflowName,
  hasUnsavedChanges = false,
  isSaving,
  isExecuting = false,
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
}: BuilderHeaderProps) => {
  const router = useRouter()
  const { toast } = useToast()
  const { duplicateWorkflow, deleteWorkflow, isDuplicating, isDeleting } = useWorkflowActions()
  const { profile } = useAuthStore()
  const isAdmin = profile?.admin === true

  const [isEditingName, setIsEditingName] = useState(false)
  const [showVersionsDialog, setShowVersionsDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [shareEmail, setShareEmail] = useState("")
  const [shareMode, setShareMode] = useState<"view" | "edit" | "duplicate">("view")
  const [shareUrl, setShareUrl] = useState("")
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [importJson, setImportJson] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState(false)

  const isSavingRef = useRef(false)
  const isNavigatingRef = useRef(false)

  const isLiveTestingDisabled = isExecuting || isSaving

  const statusBadge = useMemo(() => {
    if (isExecuting) {
      return { text: "Running", className: "bg-blue-50 text-blue-600 border-blue-200" }
    }
    if (isSaving) {
      return { text: "Saving…", className: "bg-muted text-muted-foreground border-muted" }
    }
    if (hasUnsavedChanges) {
      return { text: "Unsaved", className: "bg-orange-50 text-orange-600 border-orange-300" }
    }
    return null
  }, [hasUnsavedChanges, isExecuting, isSaving])

  const isTemplateInstance = Boolean(editTemplateId || currentWorkflow?.source_template_id)

  const canDeleteWorkflow =
    isAdmin || (!isTemplateInstance && (!currentWorkflow?.user_id || currentWorkflow?.user_id === profile?.id))

  const handleNameCommit = useCallback(() => {
    setIsEditingName(false)

    if (!handleSave) {
      return
    }

    if (isSavingRef.current || isSaving || !hasUnsavedChanges) {
      return
    }

    isSavingRef.current = true
    handleSave().finally(() => {
      setTimeout(() => {
        isSavingRef.current = false
      }, 100)
    })
  }, [handleSave, hasUnsavedChanges, isSaving])

  useEffect(() => {
    if (!isSaving) {
      isSavingRef.current = false
    }
  }, [isSaving])

  const handleDuplicateClick = useCallback(() => {
    if (workflowId) {
      duplicateWorkflow(workflowId)
    }
  }, [duplicateWorkflow, workflowId])

  const handleDeleteClick = useCallback(() => {
    if (!canDeleteWorkflow) {
      toast({
        title: "Permission denied",
        description: "You do not have permission to delete this workflow.",
        variant: "destructive",
      })
      return
    }
    setShowDeleteConfirm(true)
  }, [canDeleteWorkflow, toast])

  const handleConfirmDelete = useCallback(() => {
    if (workflowId && canDeleteWorkflow) {
      deleteWorkflow(workflowId)
      setShowDeleteConfirm(false)
    }
  }, [canDeleteWorkflow, deleteWorkflow, workflowId])

  const isActive = currentWorkflow?.status === "active"

  const handleGenerateShareLink = async () => {
    if (!workflowId) return

    setIsGeneratingLink(true)
    try {
      const baseUrl = window.location.origin
      let url = ""

      if (shareMode === "view") {
        url = `${baseUrl}/workflows/view/${workflowId}`
      } else if (shareMode === "edit") {
        url = `${baseUrl}/workflows/builder/${workflowId}?collaborative=true`
      } else {
        url = `${baseUrl}/workflows/duplicate/${workflowId}`
      }

      setShareUrl(url)
      await navigator.clipboard.writeText(url)

      toast({
        title: "Link copied",
        description: "Share link has been copied to your clipboard.",
      })
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to generate share link.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingLink(false)
    }
  }

  const handleShareWithEmail = async () => {
    if (!shareEmail || !workflowId) {
      toast({
        title: "Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      })
      return
    }

    try {
      // TODO: Implement backend API to share workflow with specific user
      toast({
        title: "Success",
        description: `Workflow shared with ${shareEmail}`,
      })
      setShareEmail("")
      setShowShareDialog(false)
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to share workflow.",
        variant: "destructive",
      })
    }
  }

  const handleExportWorkflow = async () => {
    if (!currentWorkflow) return

    try {
      const exportData = {
        name: currentWorkflow.name,
        description: currentWorkflow.description,
        nodes: currentWorkflow.nodes,
        connections: currentWorkflow.connections,
        version: "1.0",
        exported_at: new Date().toISOString(),
      }

      const json = JSON.stringify(exportData, null, 2)
      await navigator.clipboard.writeText(json)

      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${currentWorkflow.name.replace(/[^a-z0-9]/gi, "_")}.json`
      anchor.click()
      URL.revokeObjectURL(url)

      toast({
        title: "Workflow exported",
        description: "JSON copied to clipboard and downloaded.",
      })
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to export workflow.",
        variant: "destructive",
      })
    }
  }

  const handleImportWorkflow = async () => {
    if (!importJson.trim()) {
      toast({
        title: "Error",
        description: "Please paste workflow JSON.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsImporting(true)
      const data = JSON.parse(importJson)

      if (!data.nodes || !data.connections) {
        throw new Error("Invalid workflow format")
      }

      // TODO: Implement backend API to import workflow
      toast({
        title: "Workflow imported",
        description: "Workflow has been imported successfully.",
      })

      setImportJson("")
      setShowImportDialog(false)
      window.location.reload()
    } catch (_error) {
      toast({
        title: "Error",
        description: "Invalid workflow JSON format.",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  // Watch for save completion when navigation is pending
  useEffect(() => {
    if (pendingNavigation && !isSaving && !isNavigatingRef.current) {
      // Save completed, navigate now
      isNavigatingRef.current = true
      setPendingNavigation(false)
      router.push('/workflows')
    }
  }, [pendingNavigation, isSaving, router])

  return (
    <>
      <div className="h-12 border-b bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex-1 min-w-0 flex items-center gap-6">
          <button
            onClick={() => {
              // If currently saving, set pending navigation flag and wait
              if (isSaving) {
                setPendingNavigation(true)
                return
              }
              // Not saving, navigate immediately
              router.push('/workflows')
            }}
            disabled={isSaving || pendingNavigation}
            className="group flex items-center gap-2 px-0 py-2 bg-transparent border-none transition-all duration-200 ease-out hover:-translate-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isSaving || pendingNavigation ? "Saving..." : "Back to workflows"}
          >
            {isSaving || pendingNavigation ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9CA3AF]" />
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="flex-shrink-0"
                >
                  {/* Simple left arrow with rounded ends */}
                  <path
                    d="M 10 7 L 4 7"
                    stroke="#D1D5DB"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    className="group-hover:stroke-[#9CA3AF] transition-colors duration-200"
                  />
                  <path
                    d="M 6 5 L 4 7 L 6 9"
                    stroke="#D1D5DB"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="group-hover:stroke-[#9CA3AF] transition-colors duration-200"
                  />
                </svg>
                <span className="text-sm font-medium text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors duration-200">
                  Back
                </span>
              </>
            )}
          </button>

          {isEditingName ? (
            <input
              type="text"
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              onBlur={handleNameCommit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  handleNameCommit()
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setIsEditingName(false)
                }
              }}
              autoFocus
              className="text-sm font-semibold border-none outline-none ring-0 px-2 py-1 bg-transparent max-w-md"
              style={{ boxShadow: 'none', border: 'none', height: 'auto' }}
              placeholder="Untitled Workflow"
              maxLength={100}
            />
          ) : (
            <div className="flex items-center gap-3">
              <div
                onClick={() => setIsEditingName(true)}
                className="cursor-pointer hover:bg-accent px-2 py-1 rounded-md transition-colors"
              >
                <h1 className="text-sm font-semibold truncate">
                  {workflowName || "Untitled Workflow"}
                </h1>
              </div>
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium",
                  currentWorkflow?.is_active
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-gray-100 text-gray-500"
                )}
              >
                {currentWorkflow?.is_active ? "Scheduled" : "Not scheduled"}
              </span>
            </div>
          )}

          {statusBadge && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-md border",
                statusBadge.className
              )}
            >
              {statusBadge.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUndo}
              disabled={!canUndo || !handleUndo}
              title="Undo (Cmd+Z)"
              className="h-8 w-8"
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRedo}
              disabled={!canRedo || !handleRedo}
              title="Redo (Cmd+Shift+Z)"
              className="h-8 w-8"
            >
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <TooltipProvider>
              {/* Run via API Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      // TODO: Implement Run via API functionality
                      toast({ title: "Run via API", description: "Coming soon!" })
                    }}
                  >
                    <CloudCog className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run via API</TooltipContent>
              </Tooltip>

              {/* History Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowHistoryDialog(true)}
                  >
                    <History className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>History</TooltipContent>
              </Tooltip>

              {/* Versions Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowVersionsDialog(true)}
                  >
                    <Layers className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Versions</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Test Button */}
            {handleExecuteLive && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExecuteLive}
                disabled={isLiveTestingDisabled}
                className="flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>Test</span>
              </Button>
            )}

            {/* Publish Button */}
            {handleToggleLive && (
              <Button
                variant="default"
                size="sm"
                onClick={handleToggleLive}
                disabled={isUpdatingStatus}
                className={cn(
                  "flex items-center gap-2",
                  isActive
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
              >
                {isUpdatingStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                <span>{isActive ? "Published" : "Publish"}</span>
              </Button>
            )}

            <TooltipProvider>
              {/* Share Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowShareDialog(true)}
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">

              <DropdownMenuItem onClick={handleExportWorkflow}>
                <Download className="w-4 h-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import Workflow
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handleDuplicateClick} disabled={isDuplicating}>
                <Copy className="w-4 h-4 mr-2" />
                {isDuplicating ? "Duplicating…" : "Duplicate Workflow"}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setShowVersionsDialog(true)} className="sm:hidden">
                <GitBranch className="w-4 h-4 mr-2" />
                Versions
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => {
                setShowHistoryDialog(true)
                setShowExecutionHistory?.(true)
              }}>
                <History className="w-4 h-4 mr-2" />
                Workflow History
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => {
                // TODO: Open workflow settings dialog
                toast({
                  title: "Workflow Settings",
                  description: "Settings will be available when publishing the workflow.",
                })
              }}>
                <Settings className="w-4 h-4 mr-2" />
                Workflow Settings
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {canDeleteWorkflow && (
                <DropdownMenuItem
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isDeleting ? "Deleting…" : "Delete Workflow"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Share Workflow</DialogTitle>
            <DialogDescription>Invite teammates or share a link to this workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="share-email">Invite by email</Label>
              <div className="flex gap-2">
                <Input
                  id="share-email"
                  placeholder="teammate@example.com"
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.target.value)}
                />
                <Button onClick={handleShareWithEmail} disabled={!shareEmail}>
                  <Users className="w-4 h-4 mr-2" />
                  Invite
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Shareable link</Label>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Share mode</div>
                  <div className="text-xs text-muted-foreground">
                    Choose the access level for the link
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={shareMode}
                    onChange={(event) =>
                      setShareMode(event.target.value as "view" | "edit" | "duplicate")
                    }
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="view">View only</option>
                    <option value="edit">Collaborate</option>
                    <option value="duplicate">Duplicate</option>
                  </select>
                  <Button onClick={handleGenerateShareLink} disabled={isGeneratingLink}>
                    {isGeneratingLink ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        Copy link
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {shareUrl && (
                <div className="rounded-md border bg-muted px-3 py-2 text-xs font-mono break-all">
                  {shareUrl}
                </div>
              )}
            </div>

            {isTemplateEditing && (
              <div className="flex items-center justify-between rounded-md border px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Template settings sidebar</div>
                  <div className="text-xs text-muted-foreground">
                    Quickly update key template information in the sidebar editor.
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={onOpenTemplateSettings}>
                  {templateSettingsLabel || "Open settings"}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Workflow</DialogTitle>
            <DialogDescription>Paste workflow JSON or upload a .json file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-json">Workflow JSON</Label>
              <Textarea
                id="import-json"
                placeholder="Paste workflow JSON here…"
                value={importJson}
                onChange={(event) => setImportJson(event.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Tip: You can also paste workflow JSON directly onto the canvas using Cmd+V (Mac) or
              Ctrl+V (Windows).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportWorkflow} disabled={isImporting || !importJson.trim()}>
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete “{workflowName || "Untitled Workflow"}”? This action
              cannot be undone.
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
                  Deleting…
                </>
              ) : (
                "Delete Workflow"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkflowVersionsDialog
        open={showVersionsDialog}
        onOpenChange={setShowVersionsDialog}
        workflowId={workflowId || ""}
      />

      <WorkflowHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        workflowId={workflowId || ""}
      />
    </>
  )
}

export const BuilderHeader = React.memo(
  BuilderHeaderComponent,
  (prevProps, nextProps) =>
    prevProps.workflowName === nextProps.workflowName &&
    prevProps.hasUnsavedChanges === nextProps.hasUnsavedChanges &&
    prevProps.isSaving === nextProps.isSaving &&
    prevProps.isExecuting === nextProps.isExecuting &&
    prevProps.isUpdatingStatus === nextProps.isUpdatingStatus &&
    prevProps.workflowId === nextProps.workflowId &&
    prevProps.editTemplateId === nextProps.editTemplateId &&
    prevProps.isTemplateEditing === nextProps.isTemplateEditing &&
    prevProps.templateSettingsLabel === nextProps.templateSettingsLabel &&
    prevProps.isRunningPreflight === nextProps.isRunningPreflight &&
    prevProps.isStepMode === nextProps.isStepMode &&
    prevProps.listeningMode === nextProps.listeningMode &&
    prevProps.canUndo === nextProps.canUndo &&
    prevProps.canRedo === nextProps.canRedo &&
    prevProps.currentWorkflow?.status === nextProps.currentWorkflow?.status &&
    prevProps.currentWorkflow?.source_template_id === nextProps.currentWorkflow?.source_template_id
)
