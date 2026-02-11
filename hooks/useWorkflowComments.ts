"use client"

import { useState, useCallback, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"

export interface WorkflowComment {
  id: string
  workflow_id: string
  node_id: string | null
  user_id: string
  content: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolved_by: string | null
  parent_id: string | null
  user_email: string | null
  user_name: string | null
  replies?: WorkflowComment[]
}

interface UseWorkflowCommentsOptions {
  workflowId: string
  nodeId?: string | null
  includeResolved?: boolean
  autoLoad?: boolean
}

export function useWorkflowComments({
  workflowId,
  nodeId,
  includeResolved = false,
  autoLoad = true,
}: UseWorkflowCommentsOptions) {
  const [comments, setComments] = useState<WorkflowComment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Load comments
  const loadComments = useCallback(async () => {
    if (!workflowId) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (nodeId) params.set("nodeId", nodeId)
      if (includeResolved) params.set("includeResolved", "true")

      const url = `/api/workflows/${workflowId}/comments${params.toString() ? `?${params}` : ""}`
      const response = await fetch(url)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to load comments")
      }

      const data = await response.json()
      setComments(data.comments || [])
    } catch (err: any) {
      console.error("Error loading comments:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workflowId, nodeId, includeResolved])

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadComments()
    }
  }, [autoLoad, loadComments])

  // Add a comment
  const addComment = useCallback(
    async (content: string, targetNodeId?: string | null, parentId?: string | null) => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            nodeId: targetNodeId ?? nodeId,
            parentId,
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to add comment")
        }

        const data = await response.json()

        // If it's a reply, add to parent's replies
        if (parentId) {
          setComments((prev) =>
            prev.map((comment) =>
              comment.id === parentId
                ? {
                    ...comment,
                    replies: [...(comment.replies || []), data.comment],
                  }
                : comment
            )
          )
        } else {
          // Add as new top-level comment
          setComments((prev) => [...prev, { ...data.comment, replies: [] }])
        }

        toast({
          title: "Comment Added",
          description: "Your comment has been added",
        })

        return data.comment
      } catch (err: any) {
        console.error("Error adding comment:", err)
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive",
        })
        throw err
      }
    },
    [workflowId, nodeId, toast]
  )

  // Update a comment
  const updateComment = useCallback(
    async (commentId: string, updates: { content?: string; resolve?: boolean }) => {
      try {
        const response = await fetch(
          `/api/workflows/${workflowId}/comments/${commentId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        )

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to update comment")
        }

        const data = await response.json()

        // Update in local state
        const updateInList = (list: WorkflowComment[]): WorkflowComment[] =>
          list.map((comment) => {
            if (comment.id === commentId) {
              return { ...comment, ...data.comment }
            }
            if (comment.replies) {
              return { ...comment, replies: updateInList(comment.replies) }
            }
            return comment
          })

        setComments((prev) => updateInList(prev))

        toast({
          title: updates.resolve !== undefined ? "Comment Updated" : "Comment Edited",
          description: updates.resolve
            ? "Comment has been resolved"
            : updates.resolve === false
              ? "Comment has been reopened"
              : "Your comment has been updated",
        })

        return data.comment
      } catch (err: any) {
        console.error("Error updating comment:", err)
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive",
        })
        throw err
      }
    },
    [workflowId, toast]
  )

  // Delete a comment
  const deleteComment = useCallback(
    async (commentId: string) => {
      try {
        const response = await fetch(
          `/api/workflows/${workflowId}/comments/${commentId}`,
          { method: "DELETE" }
        )

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to delete comment")
        }

        // Remove from local state
        const removeFromList = (list: WorkflowComment[]): WorkflowComment[] =>
          list
            .filter((comment) => comment.id !== commentId)
            .map((comment) => ({
              ...comment,
              replies: comment.replies ? removeFromList(comment.replies) : undefined,
            }))

        setComments((prev) => removeFromList(prev))

        toast({
          title: "Comment Deleted",
          description: "The comment has been removed",
        })
      } catch (err: any) {
        console.error("Error deleting comment:", err)
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive",
        })
        throw err
      }
    },
    [workflowId, toast]
  )

  // Get comments for a specific node
  const getNodeComments = useCallback(
    (targetNodeId: string) => {
      return comments.filter((c) => c.node_id === targetNodeId)
    },
    [comments]
  )

  // Get workflow-level comments (no node associated)
  const getWorkflowComments = useCallback(() => {
    return comments.filter((c) => !c.node_id)
  }, [comments])

  // Get total comment count
  const getTotalCount = useCallback(() => {
    let count = 0
    const countAll = (list: WorkflowComment[]) => {
      list.forEach((c) => {
        count++
        if (c.replies) countAll(c.replies)
      })
    }
    countAll(comments)
    return count
  }, [comments])

  // Get unresolved count
  const getUnresolvedCount = useCallback(() => {
    let count = 0
    const countUnresolved = (list: WorkflowComment[]) => {
      list.forEach((c) => {
        if (!c.resolved_at) count++
        if (c.replies) countUnresolved(c.replies)
      })
    }
    countUnresolved(comments)
    return count
  }, [comments])

  return {
    comments,
    loading,
    error,
    loadComments,
    addComment,
    updateComment,
    deleteComment,
    getNodeComments,
    getWorkflowComments,
    getTotalCount,
    getUnresolvedCount,
  }
}
