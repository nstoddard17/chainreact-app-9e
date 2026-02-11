"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MessageSquare } from "lucide-react"
import { WorkflowCommentsPanel } from "./WorkflowCommentsPanel"

interface WorkflowCommentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  nodeId?: string | null
  nodeName?: string
}

/**
 * Dialog wrapper for the workflow comments panel
 */
export function WorkflowCommentsDialog({
  open,
  onOpenChange,
  workflowId,
  nodeId,
  nodeName,
}: WorkflowCommentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {nodeName ? `Comments: ${nodeName}` : "Workflow Comments"}
          </DialogTitle>
        </DialogHeader>
        <WorkflowCommentsPanel
          workflowId={workflowId}
          nodeId={nodeId}
          nodeName={nodeName}
          className="h-[70vh]"
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
