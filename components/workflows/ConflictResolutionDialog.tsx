"use client"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, GitMerge, X } from "lucide-react"

interface Conflict {
  id: string
  type: string
  description: string
  changes: any[]
  canAutoResolve: boolean
}

interface ConflictResolutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: Conflict[]
  onResolve: (conflictId: string, resolution: any) => Promise<void>
}

export function ConflictResolutionDialog({ open, onOpenChange, conflicts, onResolve }: ConflictResolutionDialogProps) {
  const handleAutoResolve = async (conflict: Conflict) => {
    await onResolve(conflict.id, { type: "auto", strategy: "merge" })
  }

  const handleManualResolve = async (conflict: Conflict, strategy: string) => {
    await onResolve(conflict.id, { type: "manual", strategy })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            Resolve Conflicts
          </DialogTitle>
          <DialogDescription>
            Multiple users have made conflicting changes. Choose how to resolve each conflict.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-96">
          <div className="space-y-4">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="destructive" className="text-xs">
                        {conflict.type.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{conflict.description}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {conflict.canAutoResolve && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAutoResolve(conflict)}
                      className="flex items-center gap-1"
                    >
                      <GitMerge className="w-3 h-3" />
                      Auto Merge
                    </Button>
                  )}

                  <Button size="sm" variant="outline" onClick={() => handleManualResolve(conflict, "keep_mine")}>
                    Keep My Changes
                  </Button>

                  <Button size="sm" variant="outline" onClick={() => handleManualResolve(conflict, "keep_theirs")}>
                    Keep Their Changes
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleManualResolve(conflict, "discard")}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Discard
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
