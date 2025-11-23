"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GitBranch, Clock, User, RotateCcw, Loader2, Eye } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface WorkflowVersion {
  id: string
  version_number: number
  created_at: string
  created_by: string
  change_summary?: string
  is_published: boolean
  nodes_count: number
  changes?: {
    added?: number
    modified?: number
    removed?: number
  }
}

interface WorkflowVersionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  onRestoreVersion?: (versionId: string) => void
}

export function WorkflowVersionsDialog({
  open,
  onOpenChange,
  workflowId,
  onRestoreVersion,
}: WorkflowVersionsDialogProps) {
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    if (open && workflowId) {
      loadVersions()
    }
  }, [open, workflowId])

  const loadVersions = async () => {
    try {
      setLoading(true)

      // Fetch versions from workflow_versions table
      const { data, error } = await supabase
        .from('workflow_versions')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })

      if (error) throw error

      setVersions(data || [])
    } catch (error: any) {
      console.error('Error loading versions:', error)
      toast({
        title: "Error",
        description: "Failed to load workflow versions",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (versionId: string) => {
    if (!onRestoreVersion) return

    setRestoringId(versionId)
    try {
      await onRestoreVersion(versionId)
      toast({
        title: "Version Restored",
        description: "Workflow has been restored to this version",
      })
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to restore version",
        variant: "destructive",
      })
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of this workflow
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No version history yet</p>
            <p className="text-sm mt-2">Versions are saved automatically when you make changes</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Version Header */}
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={index === 0 ? "default" : "secondary"}>
                          v{version.version_number}
                        </Badge>
                        {index === 0 && (
                          <Badge variant="outline" className="text-xs">
                            Current
                          </Badge>
                        )}
                        {version.is_published && (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600">
                            Published
                          </Badge>
                        )}
                      </div>

                      {/* Change Summary */}
                      {version.change_summary && (
                        <p className="text-sm font-medium mb-2">
                          {version.change_summary}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{version.created_by || 'System'}</span>
                        </div>
                        {version.nodes_count > 0 && (
                          <span>{version.nodes_count} nodes</span>
                        )}
                      </div>

                      {/* Changes Breakdown */}
                      {version.changes && (
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          {version.changes.added !== undefined && version.changes.added > 0 && (
                            <span className="text-green-600">+{version.changes.added} added</span>
                          )}
                          {version.changes.modified !== undefined && version.changes.modified > 0 && (
                            <span className="text-blue-600">~{version.changes.modified} modified</span>
                          )}
                          {version.changes.removed !== undefined && version.changes.removed > 0 && (
                            <span className="text-red-600">-{version.changes.removed} removed</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {index !== 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(version.id)}
                          disabled={restoringId === version.id}
                        >
                          {restoringId === version.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Restore
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
