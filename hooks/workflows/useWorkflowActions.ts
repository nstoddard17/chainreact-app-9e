import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useToast } from '@/hooks/use-toast'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowNode, WorkflowConnection } from '@/stores/workflowStore'

export function useWorkflowActions() {
  const router = useRouter()
  const { toast } = useToast()
  const { fetchWorkflows } = useWorkflowStore()
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Duplicate workflow
  const duplicateWorkflow = useCallback(async (workflowId: string) => {
    if (!workflowId) {
      toast({
        title: "Error",
        description: "No workflow to duplicate",
        variant: "destructive",
      })
      return
    }

    try {
      setIsDuplicating(true)

      // Get the current workflow
      const { data: workflow, error: fetchError } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single()

      if (fetchError || !workflow) {
        throw new Error('Failed to fetch workflow')
      }

      // Create a copy with a new name
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      const newWorkflow = {
        name: `${workflow.name} (Copy)`,
        description: workflow.description,
        status: 'paused', // New workflows start paused
        is_enabled: false,
        nodes: workflow.nodes,
        connections: workflow.connections,
        user_id: user.id,
        organization_id: workflow.organization_id,
      }

      const { data: duplicated, error: insertError } = await supabase
        .from('workflows')
        .insert(newWorkflow)
        .select()
        .single()

      if (insertError || !duplicated) {
        throw insertError || new Error('Failed to duplicate workflow')
      }

      // Refresh the workflows list
      await fetchWorkflows()

      toast({
        title: "Success",
        description: "Workflow duplicated successfully",
      })

      // Navigate to the new workflow
      router.push(`/workflows/builder?id=${duplicated.id}`)

    } catch (error) {
      console.error('Error duplicating workflow:', error)
      toast({
        title: "Error",
        description: "Failed to duplicate workflow",
        variant: "destructive",
      })
    } finally {
      setIsDuplicating(false)
    }
  }, [router, toast, fetchWorkflows])

  // Delete workflow
  const deleteWorkflow = useCallback(async (workflowId: string) => {
    if (!workflowId) {
      toast({
        title: "Error",
        description: "No workflow to delete",
        variant: "destructive",
      })
      return
    }

    try {
      setIsDeleting(true)

      // Delete the workflow
      const { error } = await supabase
        .from('workflows')
        .delete()
        .eq('id', workflowId)

      if (error) {
        throw error
      }

      // Refresh the workflows list
      await fetchWorkflows()

      toast({
        title: "Success",
        description: "Workflow deleted successfully",
      })

      // Navigate back to workflows list
      router.push('/workflows')

    } catch (error) {
      console.error('Error deleting workflow:', error)
      toast({
        title: "Error",
        description: "Failed to delete workflow",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }, [router, toast, fetchWorkflows])

  // Share workflow (generate shareable link)
  const shareWorkflow = useCallback(async (workflowId: string) => {
    if (!workflowId) {
      toast({
        title: "Error",
        description: "No workflow to share",
        variant: "destructive",
      })
      return
    }

    try {
      // For now, just copy the current URL to clipboard
      const shareUrl = `${window.location.origin}/workflows/builder?id=${workflowId}`

      await navigator.clipboard.writeText(shareUrl)

      toast({
        title: "Link Copied!",
        description: "Workflow link has been copied to clipboard",
      })

      // TODO: Implement more advanced sharing features like:
      // - Generate public view-only links
      // - Share with specific users
      // - Export as JSON
      // - Share to template library

    } catch (error) {
      console.error('Error sharing workflow:', error)
      toast({
        title: "Error",
        description: "Failed to copy workflow link",
        variant: "destructive",
      })
    }
  }, [toast])

  return {
    duplicateWorkflow,
    deleteWorkflow,
    shareWorkflow,
    isDuplicating,
    isDeleting,
  }
}