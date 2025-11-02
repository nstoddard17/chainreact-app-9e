"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { User, Users, Building2, Loader2, Folder, Settings } from "lucide-react"
import { useWorkspaces } from "@/hooks/useWorkspaces"
import { useAuthStore } from "@/stores/authStore"
import { toast } from "sonner"
import { logger } from "@/lib/utils/logger"
import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import Link from "next/link"

interface WorkspaceSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onWorkspaceSelected: (selection: {
    type: 'personal' | 'team' | 'organization',
    id: string | null,
    name: string,
    folder_id?: string | null
  }, saveAsDefault: boolean) => void
  onCancel: () => void
}

interface WorkflowFolder {
  id: string
  name: string
  organization_id: string | null
  is_trash?: boolean
}

export function WorkspaceSelectionModal({
  open,
  onOpenChange,
  onWorkspaceSelected,
  onCancel
}: WorkspaceSelectionModalProps) {
  const { workspaces, loading: workspacesLoading } = useWorkspaces()
  const { updateProfile } = useAuthStore()
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("personal:")
  const [selectedFolder, setSelectedFolder] = useState<string>("")
  const [folders, setFolders] = useState<WorkflowFolder[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch folders when workspace changes
  useEffect(() => {
    const fetchFolders = async () => {
      if (!open || !selectedWorkspace) return

      setLoadingFolders(true)
      setSelectedFolder("") // Reset folder selection

      try {
        // Parse selected workspace to filter folders
        const [workspaceType, workspaceId] = selectedWorkspace.split(':')

        // First ensure the user has a default folder (non-blocking)
        await fetchWithTimeout('/api/workflows/folders/ensure-default', { method: 'POST' }, 5000).catch(() => {
          // Silently fail - folder creation is not critical
        })

        // Then fetch all folders with timeout protection
        const response = await fetchWithTimeout('/api/workflows/folders', {}, 8000)
        if (!response.ok) {
          throw new Error(`Failed to fetch folders: ${response.status}`)
        }
        const data = await response.json()
        if (data.success) {
          // Filter folders by workspace and exclude trash
          const allFolders = data.folders || []
          const filteredFolders = allFolders.filter((folder: WorkflowFolder) => {
            // Exclude trash folder
            if (folder.is_trash) return false

            // For personal workspace: organization_id should be null
            if (workspaceType === 'personal') {
              return !folder.organization_id
            }

            // For team/org workspace: organization_id should match workspace id
            return folder.organization_id === workspaceId
          })

          setFolders(filteredFolders)

          // Auto-select first folder if available
          if (filteredFolders.length > 0) {
            setSelectedFolder(filteredFolders[0].id)
          }
        }
      } catch (error: any) {
        logger.error('[WorkspaceSelectionModal] Failed to fetch folders:', error)
        // Don't throw - allow modal to work without folders
      } finally {
        setLoadingFolders(false)
      }
    }

    fetchFolders()
  }, [selectedWorkspace, open])

  const handleProceed = async () => {
    setSaving(true)
    try {
      // Parse selected workspace (format: "type:id")
      const [workspaceType, workspaceId] = selectedWorkspace.split(':')
      const workspace = workspaces.find(w =>
        w.type === workspaceType && (w.id || '') === workspaceId
      )

      if (!workspace) {
        throw new Error('Selected workspace not found')
      }

      // If user wants to save as default, update profile
      if (saveAsDefault) {
        try {
          await updateProfile({
            default_workspace_type: workspaceType as 'personal' | 'team' | 'organization',
            default_workspace_id: workspaceId || null,
            workflow_creation_mode: 'default' // Switch to default mode since they're setting a default
          })

          toast.success('Default workspace saved', {
            description: `New workflows will be created in ${workspace.name}`
          })

          logger.debug("✅ [WorkspaceSelectionModal] Default workspace updated:", {
            workspaceType,
            workspaceId: workspaceId || null
          })
        } catch (error) {
          logger.error("Failed to update default workspace:", error)
          toast.error("Failed to save default workspace preference")
          // Don't block workflow creation if this fails
        }
      }

      // Call the callback with selected workspace and folder
      onWorkspaceSelected(
        {
          type: workspaceType as 'personal' | 'team' | 'organization',
          id: workspaceId || null,
          name: workspace.name,
          folder_id: selectedFolder || null
        },
        saveAsDefault
      )
    } catch (error: any) {
      logger.error('Failed to process workspace selection:', error)
      toast.error(error?.message || 'Failed to select workspace')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    onCancel()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Choose Workspace</DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>Select where you want to create this workflow</span>
            <Link
              href="/settings?section=workspace"
              className="text-xs text-primary hover:underline flex items-center gap-1"
              onClick={() => onOpenChange(false)}
            >
              <Settings className="w-3 h-3" />
              Change in settings
            </Link>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="workspace">Workspace</Label>
            <Select
              value={selectedWorkspace}
              onValueChange={setSelectedWorkspace}
              disabled={workspacesLoading}
            >
              <SelectTrigger id="workspace">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => {
                  const value = `${workspace.type}:${workspace.id || ''}`
                  const icon = workspace.type === 'personal'
                    ? <User className="w-4 h-4" />
                    : workspace.type === 'team'
                    ? <Users className="w-4 h-4" />
                    : <Building2 className="w-4 h-4" />

                  return (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        {icon}
                        <div className="flex flex-col">
                          <span className="font-medium">{workspace.name}</span>
                          {workspace.description && (
                            <span className="text-xs text-slate-500">
                              {workspace.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <div className="text-xs text-slate-500">
              Choose where this workflow will be created
            </div>
          </div>

          {/* Folder Selection - Only show after workspace is selected */}
          {selectedWorkspace && (
            <div className="space-y-2">
              <Label htmlFor="folder">Folder</Label>
              <Select
                value={selectedFolder}
                onValueChange={setSelectedFolder}
                disabled={loadingFolders || folders.length === 0}
              >
                <SelectTrigger id="folder">
                  <SelectValue placeholder={
                    loadingFolders
                      ? "Loading folders..."
                      : folders.length === 0
                      ? "No folders available"
                      : "Select folder"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4" />
                        <span>{folder.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500">
                {loadingFolders ? (
                  <div className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading folders for selected workspace...</span>
                  </div>
                ) : folders.length === 0 ? (
                  "No folders available in this workspace"
                ) : (
                  "Organize your workflow in a folder"
                )}
              </div>
            </div>
          )}

          {/* Set as Default Checkbox */}
          <div className="flex items-start space-x-2 pt-2">
            <Checkbox
              id="save-as-default"
              checked={saveAsDefault}
              onCheckedChange={(checked) => setSaveAsDefault(checked as boolean)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="save-as-default"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Set as my default workspace
              </Label>
              <p className="text-xs text-slate-500">
                Future workflows will be created here automatically
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleProceed} disabled={saving || workspacesLoading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
