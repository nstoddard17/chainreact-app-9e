"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { useWorkflows } from "@/hooks/use-workflows"
import { Workflow } from "@/stores/cachedWorkflowStore"

interface WorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflow?: Workflow | null // If provided, we're editing; otherwise creating
  onSuccess?: () => void // Callback after successful create/update
}

export default function WorkflowDialog({ 
  open, 
  onOpenChange, 
  workflow,
  onSuccess 
}: WorkflowDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const { createNewWorkflow, updateWorkflowById } = useWorkflows()
  const router = useRouter()
  
  const isEditMode = !!workflow

  // Reset form when dialog opens/closes or workflow changes
  useEffect(() => {
    if (open) {
      if (workflow) {
        setName(workflow.name || "")
        setDescription(workflow.description || "")
      } else {
        setName("")
        setDescription("")
      }
    }
  }, [open, workflow])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      if (isEditMode && workflow) {
        // Update existing workflow
        await updateWorkflowById(workflow.id, {
          name: name.trim(),
          description: description.trim()
        })
        
        onOpenChange(false)
        setName("")
        setDescription("")
        
        if (onSuccess) {
          onSuccess()
        }
      } else {
        // Create new workflow
        const newWorkflow = await createNewWorkflow(name.trim(), description.trim())
        
        if (!newWorkflow || !newWorkflow.id) {
          throw new Error("Workflow created but no ID returned")
        }
        
        console.log("✅ [WorkflowDialog] New workflow created:", {
          id: newWorkflow.id,
          name: newWorkflow.name,
          user_id: newWorkflow.user_id
        })
        
        onOpenChange(false)
        setName("")
        setDescription("")
        
        // Add a small delay to ensure the database has propagated the new workflow
        setTimeout(() => {
          console.log("🚀 [WorkflowDialog] Navigating to workflow builder:", newWorkflow.id)
          // Navigate to the workflow builder for new workflows
          router.push(`/workflows/builder?id=${newWorkflow.id}`)
        }, 100)
      }
    } catch (error: any) {
      console.error(`Failed to ${isEditMode ? 'update' : 'create'} workflow:`, error)
      // Show user-friendly error message
      const errorMessage = error?.message || `Failed to ${isEditMode ? 'update' : 'create'} workflow. Please try again.`
      alert(errorMessage) // You might want to replace this with a toast notification
      setLoading(false) // Make sure to stop loading on error
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Workflow' : 'Create New Workflow'}</DialogTitle>
            <DialogDescription>
              {isEditMode 
                ? 'Update your workflow name and description.'
                : 'Give your workflow a name and description to get started.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter workflow name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (max 150 characters)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => {
                  const value = e.target.value
                  if (value.length <= 150) {
                    setDescription(value)
                  }
                }}
                placeholder="Describe what this workflow does"
                rows={3}
                maxLength={150}
              />
              <div className="text-xs text-slate-500 text-right">
                {description.length}/150 characters
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                isEditMode ? 'Update' : 'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}