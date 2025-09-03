import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface UnsavedChangesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
  onDiscard: () => void
}

export function UnsavedChangesModal({ open, onOpenChange, onSave, onDiscard }: UnsavedChangesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes in your workflow. Would you like to save them before leaving?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDiscard}>
            Discard Changes
          </Button>
          <Button onClick={onSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}