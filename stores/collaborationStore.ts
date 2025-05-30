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
  change_type: string
  change_data: any
  user_id: string
  timestamp: string
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
  event_type: string
  node_id?: string
  event_data: any
  timestamp: string
}

interface CollaborationState {
  collaborationSession: CollaborationSession | null
  activeCollaborators: Collaborator[]
  pendingChanges: WorkflowChange[]
  conflicts: Conflict[]
  executionEvents: ExecutionEvent[]
  loading: boolean
  error: string | null
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
}

export const useCollaborationStore = create<CollaborationState & CollaborationActions>((set, get) => ({
  collaborationSession: null,
  activeCollaborators: [],
  pendingChanges: [],
  conflicts: [],
  executionEvents: [],
  loading: false,
  error: null,

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
    const { collaborationSession } = get()
    if (!collaborationSession) return

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
        activeCollaborators: [],
        pendingChanges: [],
        conflicts: [],
        executionEvents: [],
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

  // Private method for setting up real-time subscriptions
  setupRealtimeSubscriptions: (workflowId: string) => {
    // In a real implementation, this would set up WebSocket or Server-Sent Events
    // For now, we'll simulate with polling
    const pollInterval = setInterval(() => {
      // Poll for collaborator updates
      get().pollCollaboratorUpdates(workflowId)
    }, 2000)

    // Store interval for cleanup
    ;(window as any).collaborationPollInterval = pollInterval
  },

  pollCollaboratorUpdates: async (workflowId: string) => {
    try {
      const response = await fetch(`/api/collaboration/collaborators?workflowId=${workflowId}`)
      const result = await response.json()

      if (result.success) {
        set({ activeCollaborators: result.collaborators })
      }
    } catch (error) {
      console.error("Failed to poll collaborator updates:", error)
    }
  },
}))
