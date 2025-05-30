import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface AIWorkflowGeneratorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AIWorkflowGenerator({ open, onOpenChange }: AIWorkflowGeneratorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Workflow Generator</DialogTitle>
        </DialogHeader>
        <div>
          <p>Generate workflows using AI</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
