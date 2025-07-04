"use client"

import { create } from "zustand"

interface CollaborationSession {
  id: string
  workflow_id: string
  user_id: string
  session_token: string
  cursor_position: { x: number; y: number }
  selected_nodes: string[]
  is_active: boolean
}

interface Collaborator {
  id: string
  user_id: string
  user_name: string
  user_avatar?: string
  cursor_position: { x: number; y: number }
  selected_nodes: string[]
  color: string
}

interface WorkflowChange {
  id: string
  workflow_id: string
  user_id: string
  change_type: string
  change_data: any
  change_timestamp: string
  version_hash: string
}

interface Conflict {
  id: string
  type: string
  description: string
  changes: WorkflowChange[]
  canAutoResolve: boolean
}

interface ExecutionEvent {
  id: string
  workflow_id: string
  event_type: string
  event_data: any
  timestamp: string
}

interface CollaborationState {
  collaborationSession: CollaborationSession | null
  collaborators: Collaborator[]
  pendingChanges: WorkflowChange[]
  conflicts: Conflict[]
  executionEvents: ExecutionEvent[]
  loading: boolean
  error: string | null
  pollingInterval: NodeJS.Timeout | null
}

interface CollaborationActions {
  joinCollaboration: (workflowId: string) => Promise<void>
  leaveCollaboration: () => Promise<void>
  updateCursorPosition: (position: { x: number; y: number }) => Promise<void>
  updateSelectedNodes: (nodeIds: string[]) => Promise<void>
  applyChange: (changeType: string, changeData: any) => Promise<{ success: boolean; conflicts?: any[] }>
  resolveConflict: (conflictId: string, resolution: any) => Promise<void>
  clearConflicts: () => void
  addExecutionEvent: (event: ExecutionEvent) => void
  clearExecutionEvents: () => void
  setupRealtimeSubscriptions: (workflowId: string) => void
  pollCollaboratorUpdates: (workflowId: string) => void
  cleanupPolling: () => void
}

export const useCollaborationStore = create<CollaborationState & CollaborationActions>((set, get) => ({
  collaborationSession: null,
  collaborators: [],
  pendingChanges: [],
  conflicts: [],
  executionEvents: [],
  loading: false,
  error: null,
  pollingInterval: null,

  joinCollaboration: async (workflowId: string) => {
    set({ loading: true, error: null })

    try {
      const response = await fetch("/api/collaboration/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workflowId }),
      })

      const result = await response.json()

      if (result.success) {
        set({
          collaborationSession: result.session,
          loading: false,
        })

        // Set up real-time subscriptions
        get().setupRealtimeSubscriptions(workflowId)
      } else {
        set({ error: result.error, loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  leaveCollaboration: async () => {
    const { collaborationSession, pollingInterval } = get()
    if (!collaborationSession) return

    // Clean up polling
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    try {
      await fetch("/api/collaboration/leave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionToken: collaborationSession.session_token,
        }),
      })

      set({
        collaborationSession: null,
        collaborators: [],
        pendingChanges: [],
        conflicts: [],
        executionEvents: [],
        pollingInterval: null,
      })
    } catch (error) {
      console.error("Failed to leave collaboration:", error)
    }
  },

  updateCursorPosition: async (position: { x: number; y: number }) => {
    const { collaborationSession } = get()
    if (!collaborationSession) return

    try {
      await fetch("/api/collaboration/cursor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionToken: collaborationSession.session_token,
          position,
        }),
      })

      // Update local session
      set({
        collaborationSession: {
          ...collaborationSession,
          cursor_position: position,
        },
      })
    } catch (error) {
      console.error("Failed to update cursor position:", error)
    }
  },

  updateSelectedNodes: async (nodeIds: string[]) => {
    const { collaborationSession } = get()
    if (!collaborationSession) return

    try {
      await fetch("/api/collaboration/selection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionToken: collaborationSession.session_token,
          selectedNodes: nodeIds,
        }),
      })

      // Update local session
      set({
        collaborationSession: {
          ...collaborationSession,
          selected_nodes: nodeIds,
        },
      })
    } catch (error) {
      console.error("Failed to update selected nodes:", error)
    }
  },

  applyChange: async (changeType: string, changeData: any) => {
    const { collaborationSession } = get()
    if (!collaborationSession) {
      return { success: true } // No collaboration, apply directly
    }

    try {
      const response = await fetch("/api/collaboration/apply-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionToken: collaborationSession.session_token,
          changeType,
          changeData,
        }),
      })

      const result = await response.json()

      if (!result.success && result.conflicts) {
        // Add conflicts to state
        set((state) => ({
          conflicts: [
            ...state.conflicts,
            ...result.conflicts.map((conflict: any) => ({
              id: `conflict-${Date.now()}-${Math.random()}`,
              type: conflict.type,
              description: conflict.description || conflict.message,
              changes: [{ changeType, changeData, timestamp: new Date().toISOString() }],
              canAutoResolve: conflict.canAutoResolve || false,
            })),
          ],
        }))
      }

      return result
    } catch (error: any) {
      console.error("Failed to apply change:", error)
      return { success: false, error: error.message }
    }
  },

  resolveConflict: async (conflictId: string, resolution: any) => {
    try {
      const response = await fetch("/api/collaboration/resolve-conflict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conflictId,
          resolution,
        }),
      })

      const result = await response.json()

      if (result.success) {
        // Remove resolved conflict
        set((state) => ({
          conflicts: state.conflicts.filter((c) => c.id !== conflictId),
        }))
      }
    } catch (error) {
      console.error("Failed to resolve conflict:", error)
    }
  },

  clearConflicts: () => {
    set({ conflicts: [] })
  },

  addExecutionEvent: (event: ExecutionEvent) => {
    set((state) => ({
      executionEvents: [...state.executionEvents, event].slice(-50), // Keep last 50 events
    }))
  },

  clearExecutionEvents: () => {
    set({ executionEvents: [] })
  },

  setupRealtimeSubscriptions: (workflowId) => {
    // Clean up any existing polling
    const { pollingInterval } = get()
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    // Placeholder for real-time logic
    // e.g., using Supabase real-time
    console.log(`Setting up real-time subscriptions for workflow ${workflowId}`)

    // Start polling for collaborator updates with reduced frequency
    const intervalId = setInterval(() => {
        get().pollCollaboratorUpdates(workflowId);
    }, 10000); // Poll every 10 seconds instead of 5

    set({ pollingInterval: intervalId })
  },

  pollCollaboratorUpdates: async (workflowId: string) => {
    try {
      const response = await fetch(`/api/collaboration/collaborators?workflowId=${workflowId}`)
      
      if (!response.ok) {
        console.error("Failed to fetch collaborators:", response.status, response.statusText)
        return
      }

      const result = await response.json()

      // Handle both array response and success object response
      if (Array.isArray(result)) {
        set({ collaborators: result })
      } else if (result.success && Array.isArray(result.collaborators)) {
        set({ collaborators: result.collaborators })
      } else {
        console.warn("Unexpected collaborators response format:", result)
      }
    } catch (error) {
      console.error("Failed to poll collaborator updates:", error)
    }
  },

  cleanupPolling: () => {
    const { pollingInterval } = get()
    if (pollingInterval) {
      clearInterval(pollingInterval)
      set({ pollingInterval: null })
    }
  },
}))
