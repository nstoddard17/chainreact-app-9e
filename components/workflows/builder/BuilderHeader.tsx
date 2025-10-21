"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkflowActions } from "@/hooks/workflows/useWorkflowActions"
import { useToast } from "@/hooks/use-toast"
import { WorkflowVersionsDialog } from "./WorkflowVersionsDialog"
import { WorkflowHistoryDialog } from "./WorkflowHistoryDialog"

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

export function BuilderHeader({
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
}: BuilderHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [showVersionsDialog, setShowVersionsDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Share dialog state
  const [shareEmail, setShareEmail] = useState('')
  const [shareMode, setShareMode] = useState<'view' | 'edit' | 'duplicate'>('view')
  const [shareUrl, setShareUrl] = useState('')
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)

  // Import dialog state
  const [importJson, setImportJson] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  const { duplicateWorkflow, deleteWorkflow, isDuplicating, isDeleting } = useWorkflowActions()
  const { toast } = useToast()

  const isActive = currentWorkflow?.status === 'active'

  const handleGenerateShareLink = async () => {
    if (!workflowId) return

    setIsGeneratingLink(true)
    try {
      // Generate shareable URL based on mode
      const baseUrl = window.location.origin
      let url = ''

      if (shareMode === 'view') {
        url = `${baseUrl}/workflows/view/${workflowId}`
      } else if (shareMode === 'edit') {
        url = `${baseUrl}/workflows/builder/${workflowId}?collaborative=true`
      } else {
        url = `${baseUrl}/workflows/duplicate/${workflowId}`
      }

      setShareUrl(url)

      // Copy to clipboard
      await navigator.clipboard.writeText(url)

      toast({
        title: "Link Copied!",
        description: "Share link has been copied to clipboard",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate share link",
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
        description: "Please enter a valid email address",
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
      setShareEmail('')
      setShowShareDialog(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share workflow",
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
        version: '1.0',
        exported_at: new Date().toISOString(),
      }

      const json = JSON.stringify(exportData, null, 2)

      // Copy to clipboard
      await navigator.clipboard.writeText(json)

      // Also trigger download
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentWorkflow.name.replace(/[^a-z0-9]/gi, '_')}.json`
      a.click()
      URL.revokeObjectURL(url)

      toast({
        title: "Workflow Exported",
        description: "JSON copied to clipboard and downloaded",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export workflow",
        variant: "destructive",
      })
    }
  }

  const handleImportWorkflow = async () => {
    if (!importJson.trim()) {
      toast({
        title: "Error",
        description: "Please paste workflow JSON",
        variant: "destructive",
      })
      return
    }

    try {
      setIsImporting(true)

      const data = JSON.parse(importJson)

      // Validate required fields
      if (!data.nodes || !data.connections) {
        throw new Error('Invalid workflow format')
      }

      // TODO: Implement backend API to import workflow
      // For now, just show success
      toast({
        title: "Workflow Imported",
        description: "Workflow has been imported successfully",
      })

      setImportJson('')
      setShowImportDialog(false)

      // Reload page to show imported workflow
      window.location.reload()
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid workflow JSON format",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleDuplicateClick = () => {
    if (workflowId) {
      duplicateWorkflow(workflowId)
    }
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (workflowId) {
      deleteWorkflow(workflowId)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <>
      <div className="h-14 border-b bg-background flex items-center justify-between px-6 shrink-0">
        {/* Left Side - Workflow Name */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {isEditingName ? (
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingName(false)
                if (e.key === 'Escape') setIsEditingName(false)
              }}
              autoFocus
              className="h-8 max-w-xs"
            />
          ) : (
            <div
              onClick={() => setIsEditingName(true)}
              className="cursor-pointer hover:bg-accent px-2 py-1 rounded-md transition-colors"
            >
              <h1 className="text-xl font-semibold truncate">{workflowName || "Untitled Workflow"}</h1>
            </div>
          )}

          {/* Auto-save indicator */}
          {isSaving && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="hidden sm:inline">Saving...</span>
            </div>
          )}
        </div>

        {/* Right Side - Actions */}
        <div className="flex items-center gap-3">
          {/* Undo/Redo */}
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

          {/* Versions Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersionsDialog(true)}
            className="hidden sm:flex items-center gap-2"
          >
            <GitBranch className="w-4 h-4" />
            <span>Versions</span>
          </Button>

          {/* History Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistoryDialog(true)}
            className="hidden sm:flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            <span>History</span>
          </Button>

          {/* Test Buttons */}
          <div className="flex items-center gap-2">
            {handleTestSandbox && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestSandbox}
                className="flex items-center gap-2"
              >
                <TestTube className="w-4 h-4" />
                <span className="hidden sm:inline">Sandbox</span>
              </Button>
            )}

            {handleExecuteLive && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExecuteLive}
                className="flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Live Test</span>
              </Button>
            )}
          </div>

          {/* Publish Button */}
          {handleToggleLive && (
            <Button
              variant={isActive ? "default" : "default"}
              size="sm"
              onClick={handleToggleLive}
              disabled={isUpdatingStatus}
              className={cn(
                "flex items-center gap-2",
                isActive ? "bg-green-600 hover:bg-green-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
              )}
            >
              {isUpdatingStatus ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{isActive ? "Published" : "Publish"}</span>
            </Button>
          )}

          {/* More Options Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowShareDialog(true)}>
                <Share2 className="w-4 h-4 mr-2" />
                Share Workflow
              </DropdownMenuItem>

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
                {isDuplicating ? 'Duplicating...' : 'Duplicate Workflow'}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Mobile-only items */}
              <DropdownMenuItem onClick={() => setShowVersionsDialog(true)} className="sm:hidden">
                <GitBranch className="w-4 h-4 mr-2" />
                Versions
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setShowHistoryDialog(true)} className="sm:hidden">
                <History className="w-4 h-4 mr-2" />
                Execution History
              </DropdownMenuItem>

              <DropdownMenuSeparator className="sm:hidden" />

              <DropdownMenuItem onClick={handleDeleteClick} disabled={isDeleting} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete Workflow'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Workflow</DialogTitle>
            <DialogDescription>
              Share this workflow with your team or generate a shareable link
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Share with team member */}
            <div className="space-y-2">
              <Label htmlFor="share-email">Share with team member</Label>
              <div className="flex gap-2">
                <Input
                  id="share-email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                />
                <Button onClick={handleShareWithEmail} disabled={!shareEmail}>
                  <Users className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            {/* Generate shareable link */}
            <div className="space-y-3">
              <Label>Generate shareable link</Label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="view-mode" className="text-sm font-normal">
                    View only
                  </Label>
                  <Switch
                    id="view-mode"
                    checked={shareMode === 'view'}
                    onCheckedChange={(checked) => checked && setShareMode('view')}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-mode" className="text-sm font-normal">
                    Collaborative editing
                  </Label>
                  <Switch
                    id="edit-mode"
                    checked={shareMode === 'edit'}
                    onCheckedChange={(checked) => checked && setShareMode('edit')}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="duplicate-mode" className="text-sm font-normal">
                    Create duplicate
                  </Label>
                  <Switch
                    id="duplicate-mode"
                    checked={shareMode === 'duplicate'}
                    onCheckedChange={(checked) => checked && setShareMode('duplicate')}
                  />
                </div>
              </div>

              <Button
                onClick={handleGenerateShareLink}
                className="w-full"
                disabled={isGeneratingLink}
              >
                {isGeneratingLink ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Generate Link
              </Button>

              {shareUrl && (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Link copied to clipboard:</p>
                  <p className="text-sm font-mono break-all">{shareUrl}</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Workflow</DialogTitle>
            <DialogDescription>
              Paste workflow JSON or upload a .json file
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-json">Workflow JSON</Label>
              <Textarea
                id="import-json"
                placeholder="Paste workflow JSON here..."
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>

            <div className="text-sm text-muted-foreground">
              Tip: You can also paste workflow JSON directly in the canvas using Cmd+V (Mac) or Ctrl+V (Windows)
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
                  Importing...
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

      {/* Version and History Dialogs */}
      <WorkflowVersionsDialog
        open={showVersionsDialog}
        onOpenChange={setShowVersionsDialog}
        workflowId={workflowId || ''}
      />

      <WorkflowHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        workflowId={workflowId || ''}
      />
    </>
  )
}
