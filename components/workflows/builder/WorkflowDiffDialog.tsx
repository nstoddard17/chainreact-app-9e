"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Minus,
  PenLine,
  AlertTriangle,
  Save,
  Loader2,
} from "lucide-react"
import type { WorkflowDiff, WorkflowDiffItem } from "@/lib/workflows/validation/workflowDiff"

interface WorkflowDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSaving: boolean
  diff: WorkflowDiff
}

function DiffIcon({ type }: { type: WorkflowDiffItem["type"] }) {
  switch (type) {
    case "added":
      return <Plus className="w-3.5 h-3.5 text-green-500" />
    case "removed":
      return <Minus className="w-3.5 h-3.5 text-red-500" />
    case "modified":
      return <PenLine className="w-3.5 h-3.5 text-amber-500" />
  }
}

function diffItemClass(type: WorkflowDiffItem["type"]): string {
  switch (type) {
    case "added":
      return "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30"
    case "removed":
      return "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30"
    case "modified":
      return "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
  }
}

export function WorkflowDiffDialog({
  open,
  onOpenChange,
  onConfirm,
  isSaving,
  diff,
}: WorkflowDiffDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Active Workflow Changed
          </DialogTitle>
          <DialogDescription>
            This workflow is currently active. Saving will apply these changes immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 max-h-[50vh] overflow-y-auto">
          <p className="text-sm text-muted-foreground mb-3">
            {diff.summary}
          </p>

          {diff.items.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-sm rounded-md border px-3 py-2 ${diffItemClass(item.type)}`}
            >
              <DiffIcon type={item.type} />
              <span>{item.description}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSaving}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
