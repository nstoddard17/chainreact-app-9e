"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useWorkflowStore } from "@/stores/workflowStore"

// Tag color options
export const TAG_COLORS = {
  gray: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-200 dark:border-gray-700' },
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800' },
  lime: { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-300', border: 'border-lime-200 dark:border-lime-800' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  teal: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
  sky: { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  fuchsia: { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-800' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-800' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
} as const

export type TagColorName = keyof typeof TAG_COLORS

export interface TagSetting {
  id: string
  tag_name: string
  color: TagColorName
}

interface UseWorkflowTagsReturn {
  // All unique tags across workflows
  allTags: string[]
  // Tag settings (colors)
  tagSettings: TagSetting[]
  // Loading state
  isLoading: boolean
  // Add tag to workflow
  addTag: (workflowId: string, tag: string) => Promise<void>
  // Remove tag from workflow
  removeTag: (workflowId: string, tag: string) => Promise<void>
  // Set tags for workflow (replace all)
  setTags: (workflowId: string, tags: string[]) => Promise<void>
  // Get tags for a workflow
  getWorkflowTags: (workflowId: string) => string[]
  // Get color for a tag
  getTagColor: (tag: string) => TagColorName
  // Set tag color
  setTagColor: (tag: string, color: TagColorName) => Promise<void>
  // Delete tag globally
  deleteTag: (tag: string) => Promise<void>
  // Create new tag
  createTag: (tag: string, color?: TagColorName) => Promise<void>
  // Filter workflows by tag
  filterByTag: (tag: string) => string[] // Returns workflow IDs
}

/**
 * Hook for managing workflow tags
 */
export function useWorkflowTags(): UseWorkflowTagsReturn {
  const { user } = useAuthStore()
  const { workflows, setWorkflows } = useWorkflowStore()
  const [tagSettings, setTagSettings] = useState<TagSetting[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Get all unique tags from workflows
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    workflows.forEach((workflow) => {
      const workflowTags = (workflow as any).tags || []
      workflowTags.forEach((tag: string) => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [workflows])

  // Fetch tag settings
  useEffect(() => {
    if (!user) return

    const fetchTagSettings = async () => {
      try {
        const response = await fetch('/api/workflow-tags/settings')
        if (response.ok) {
          const data = await response.json()
          setTagSettings(data.settings || [])
        }
      } catch (error) {
        console.error('Failed to fetch tag settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTagSettings()
  }, [user])

  // Get tags for a specific workflow
  const getWorkflowTags = useCallback((workflowId: string): string[] => {
    const workflow = workflows.find((w) => w.id === workflowId)
    return (workflow as any)?.tags || []
  }, [workflows])

  // Get color for a tag
  const getTagColor = useCallback((tag: string): TagColorName => {
    const setting = tagSettings.find((s) => s.tag_name === tag)
    return (setting?.color as TagColorName) || 'gray'
  }, [tagSettings])

  // Add tag to workflow
  const addTag = useCallback(async (workflowId: string, tag: string) => {
    const currentTags = getWorkflowTags(workflowId)
    if (currentTags.includes(tag)) return

    const newTags = [...currentTags, tag]

    try {
      const response = await fetch(`/api/workflows/${workflowId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })

      if (response.ok) {
        // Update local state
        const updatedWorkflows = workflows.map((w) =>
          w.id === workflowId ? { ...w, tags: newTags } : w
        )
        setWorkflows(updatedWorkflows)
      }
    } catch (error) {
      console.error('Failed to add tag:', error)
      throw error
    }
  }, [workflows, getWorkflowTags, setWorkflows])

  // Remove tag from workflow
  const removeTag = useCallback(async (workflowId: string, tag: string) => {
    const currentTags = getWorkflowTags(workflowId)
    const newTags = currentTags.filter((t) => t !== tag)

    try {
      const response = await fetch(`/api/workflows/${workflowId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })

      if (response.ok) {
        const updatedWorkflows = workflows.map((w) =>
          w.id === workflowId ? { ...w, tags: newTags } : w
        )
        setWorkflows(updatedWorkflows)
      }
    } catch (error) {
      console.error('Failed to remove tag:', error)
      throw error
    }
  }, [workflows, getWorkflowTags, setWorkflows])

  // Set all tags for workflow
  const setTags = useCallback(async (workflowId: string, tags: string[]) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })

      if (response.ok) {
        const updatedWorkflows = workflows.map((w) =>
          w.id === workflowId ? { ...w, tags } : w
        )
        setWorkflows(updatedWorkflows)
      }
    } catch (error) {
      console.error('Failed to set tags:', error)
      throw error
    }
  }, [workflows, setWorkflows])

  // Set tag color
  const setTagColor = useCallback(async (tag: string, color: TagColorName) => {
    try {
      const response = await fetch('/api/workflow-tags/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_name: tag, color }),
      })

      if (response.ok) {
        setTagSettings((prev) => {
          const existing = prev.find((s) => s.tag_name === tag)
          if (existing) {
            return prev.map((s) => (s.tag_name === tag ? { ...s, color } : s))
          }
          return [...prev, { id: Date.now().toString(), tag_name: tag, color }]
        })
      }
    } catch (error) {
      console.error('Failed to set tag color:', error)
      throw error
    }
  }, [])

  // Delete tag globally (remove from all workflows)
  const deleteTag = useCallback(async (tag: string) => {
    try {
      const response = await fetch(`/api/workflow-tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        // Remove tag from all workflows locally
        const updatedWorkflows = workflows.map((w) => ({
          ...w,
          tags: ((w as any).tags || []).filter((t: string) => t !== tag),
        }))
        setWorkflows(updatedWorkflows)

        // Remove tag setting
        setTagSettings((prev) => prev.filter((s) => s.tag_name !== tag))
      }
    } catch (error) {
      console.error('Failed to delete tag:', error)
      throw error
    }
  }, [workflows, setWorkflows])

  // Create new tag
  const createTag = useCallback(async (tag: string, color: TagColorName = 'gray') => {
    await setTagColor(tag, color)
  }, [setTagColor])

  // Filter workflows by tag
  const filterByTag = useCallback((tag: string): string[] => {
    return workflows
      .filter((w) => ((w as any).tags || []).includes(tag))
      .map((w) => w.id)
  }, [workflows])

  return {
    allTags,
    tagSettings,
    isLoading,
    addTag,
    removeTag,
    setTags,
    getWorkflowTags,
    getTagColor,
    setTagColor,
    deleteTag,
    createTag,
    filterByTag,
  }
}
