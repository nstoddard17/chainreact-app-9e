import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface WorkflowOptimizerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflow?: any
}

export function WorkflowOptimizer({ open, onOpenChange, workflow }: WorkflowOptimizerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workflow Optimizer</DialogTitle>
        </DialogHeader>
        <div>
          <p>Optimize your workflows for better performance</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
