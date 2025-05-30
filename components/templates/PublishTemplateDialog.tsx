import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface PublishTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflow?: any
}

export function PublishTemplateDialog({ open, onOpenChange, workflow }: PublishTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Template</DialogTitle>
        </DialogHeader>
        <div>
          <p>Publish your workflow as a template</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
