import { createClient } from "@supabase/supabase-js"

import { logger } from '@/lib/utils/logger'

export interface CollaborationSession {
  id: string
  workflow_id: string
  user_id: string
  session_token: string
  cursor_position: { x: number; y: number }
  selected_nodes: string[]
  is_active: boolean
  last_activity: string
}

export interface WorkflowChange {
  id: string
  workflow_id: string
  user_id: string
  change_type: "node_add" | "node_update" | "node_delete" | "edge_add" | "edge_delete" | "property_update"
  change_data: any
  change_timestamp: string
  applied: boolean
  conflict_resolution: any
  version_hash: string
}

export interface WorkflowLock {
  id: string
  workflow_id: string
  user_id: string
  lock_type: "node" | "edge" | "property" | "full"
  resource_id: string
  acquired_at: string
  expires_at: string
}

export class RealTimeCollaboration {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

  private collaborationSessions = new Map<string, CollaborationSession>()
  private changeBuffer = new Map<string, WorkflowChange[]>()
  private conflictResolver = new ConflictResolver()

  async joinCollaborationSession(workflowId: string, userId: string): Promise<CollaborationSession> {
    // Generate unique session token
    const sessionToken = this.generateSessionToken()

    // Create collaboration session
    const { data: session, error } = await this.supabase
      .from("collaboration_sessions")
      .insert({
        workflow_id: workflowId,
        user_id: userId,
        session_token: sessionToken,
        cursor_position: { x: 0, y: 0 },
        selected_nodes: [],
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    // Store in memory for quick access
    this.collaborationSessions.set(sessionToken, session)

    // Set up real-time subscriptions
    await this.setupRealtimeSubscriptions(workflowId, sessionToken)

    return session
  }

  async leaveCollaborationSession(sessionToken: string): Promise<void> {
    // Mark session as inactive
    await this.supabase.from("collaboration_sessions").update({ is_active: false }).eq("session_token", sessionToken)

    // Remove from memory
    this.collaborationSessions.delete(sessionToken)

    // Release any locks held by this session
    const session = this.collaborationSessions.get(sessionToken)
    if (session) {
      await this.releaseAllLocks(session.workflow_id, session.user_id)
    }
  }

  async updateCursorPosition(sessionToken: string, position: { x: number; y: number }): Promise<void> {
    const session = this.collaborationSessions.get(sessionToken)
    if (!session) return

    // Update in database
    await this.supabase
      .from("collaboration_sessions")
      .update({
        cursor_position: position,
        last_activity: new Date().toISOString(),
      })
      .eq("session_token", sessionToken)

    // Update in memory
    session.cursor_position = position
    session.last_activity = new Date().toISOString()

    // Broadcast to other collaborators
    await this.broadcastCursorUpdate(session.workflow_id, sessionToken, position)
  }

  async updateSelectedNodes(sessionToken: string, selectedNodes: string[]): Promise<void> {
    const session = this.collaborationSessions.get(sessionToken)
    if (!session) return

    // Update in database
    await this.supabase
      .from("collaboration_sessions")
      .update({
        selected_nodes: selectedNodes,
        last_activity: new Date().toISOString(),
      })
      .eq("session_token", sessionToken)

    // Update in memory
    session.selected_nodes = selectedNodes
    session.last_activity = new Date().toISOString()

    // Broadcast to other collaborators
    await this.broadcastSelectionUpdate(session.workflow_id, sessionToken, selectedNodes)
  }

  async applyWorkflowChange(
    sessionToken: string,
    changeType: WorkflowChange["change_type"],
    changeData: any,
  ): Promise<{ success: boolean; conflicts?: any[] }> {
    const session = this.collaborationSessions.get(sessionToken)
    if (!session) throw new Error("Session not found")

    // Generate version hash for conflict detection
    const versionHash = await this.generateVersionHash(session.workflow_id)

    // Create change record
    const change: Partial<WorkflowChange> = {
      workflow_id: session.workflow_id,
      user_id: session.user_id,
      change_type: changeType,
      change_data: changeData,
      change_timestamp: new Date().toISOString(),
      applied: false,
      version_hash: versionHash,
    }

    // Check for conflicts
    const conflicts = await this.detectConflicts(change as WorkflowChange)

    if (conflicts.length > 0) {
      // Attempt automatic conflict resolution
      const resolution = await this.conflictResolver.resolveConflicts(change as WorkflowChange, conflicts)

      if (resolution.canAutoResolve) {
        change.change_data = resolution.resolvedData
        change.conflict_resolution = resolution
      } else {
        // Return conflicts for manual resolution
        return { success: false, conflicts }
      }
    }

    // Acquire necessary locks
    const lockAcquired = await this.acquireLock(
      session.workflow_id,
      session.user_id,
      this.getLockTypeForChange(changeType),
      this.getResourceIdForChange(changeData),
    )

    if (!lockAcquired) {
      return {
        success: false,
        conflicts: [{ type: "lock_conflict", message: "Resource is locked by another user" }],
      }
    }

    try {
      // Apply change to database
      const { data: savedChange } = await this.supabase.from("workflow_changes").insert(change).select().single()

      // Apply change to workflow
      await this.applyChangeToWorkflow(savedChange)

      // Mark as applied
      await this.supabase.from("workflow_changes").update({ applied: true }).eq("id", savedChange.id)

      // Broadcast change to other collaborators
      await this.broadcastWorkflowChange(session.workflow_id, sessionToken, savedChange)

      // Create snapshot if significant change
      if (this.isSignificantChange(changeType)) {
        await this.createCollaborationSnapshot(session.workflow_id, session.user_id)
      }

      return { success: true }
    } finally {
      // Release lock
      await this.releaseLock(session.workflow_id, session.user_id, this.getResourceIdForChange(changeData))
    }
  }

  private async setupRealtimeSubscriptions(workflowId: string, sessionToken: string): Promise<void> {
    // Subscribe to cursor movements
    this.supabase
      .channel(`workflow_cursors_${workflowId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "collaboration_sessions",
          filter: `workflow_id=eq.${workflowId}`,
        },
        (payload) => {
          if (payload.new.session_token !== sessionToken) {
            this.handleCursorUpdate(payload.new as CollaborationSession)
          }
        },
      )
      .subscribe()

    // Subscribe to workflow changes
    this.supabase
      .channel(`workflow_changes_${workflowId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workflow_changes",
          filter: `workflow_id=eq.${workflowId}`,
        },
        (payload) => {
          this.handleWorkflowChange(payload.new as WorkflowChange, sessionToken)
        },
      )
      .subscribe()

    // Subscribe to execution events
    this.supabase
      .channel(`execution_events_${workflowId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_execution_events",
        },
        (payload) => {
          this.handleExecutionEvent(payload.new)
        },
      )
      .subscribe()
  }

  private async detectConflicts(change: WorkflowChange): Promise<any[]> {
    const conflicts: any[] = []

    // Get recent changes to the same workflow
    const { data: recentChanges } = await this.supabase
      .from("workflow_changes")
      .select("*")
      .eq("workflow_id", change.workflow_id)
      .gte("change_timestamp", new Date(Date.now() - 60000).toISOString()) // Last minute
      .neq("user_id", change.user_id)

    if (!recentChanges) return conflicts

    for (const recentChange of recentChanges) {
      // Check for conflicting changes
      if (this.changesConflict(change, recentChange)) {
        conflicts.push({
          type: "concurrent_edit",
          conflictingChange: recentChange,
          description: `Concurrent ${recentChange.change_type} by another user`,
        })
      }
    }

    // Check version hash conflicts
    const currentHash = await this.generateVersionHash(change.workflow_id)
    if (currentHash !== change.version_hash) {
      conflicts.push({
        type: "version_mismatch",
        description: "Workflow has been modified since your last sync",
      })
    }

    return conflicts
  }

  private changesConflict(change1: WorkflowChange, change2: WorkflowChange): boolean {
    // Same resource being modified
    if (change1.change_type === change2.change_type) {
      const resource1 = this.getResourceIdForChange(change1.change_data)
      const resource2 = this.getResourceIdForChange(change2.change_data)
      return resource1 === resource2
    }

    // Node deletion conflicts with node updates
    if (change1.change_type === "node_delete" && change2.change_type === "node_update") {
      return change1.change_data.nodeId === change2.change_data.nodeId
    }

    return false
  }

  private async acquireLock(
    workflowId: string,
    userId: string,
    lockType: WorkflowLock["lock_type"],
    resourceId: string,
  ): Promise<boolean> {
    try {
      // Check if resource is already locked
      const { data: existingLock } = await this.supabase
        .from("workflow_locks")
        .select("*")
        .eq("workflow_id", workflowId)
        .eq("resource_id", resourceId)
        .gt("expires_at", new Date().toISOString())
        .single()

      if (existingLock && existingLock.user_id !== userId) {
        return false // Resource is locked by another user
      }

      // Acquire lock
      const { error } = await this.supabase.from("workflow_locks").upsert({
        workflow_id: workflowId,
        user_id: userId,
        lock_type: lockType,
        resource_id: resourceId,
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      })

      return !error
    } catch (error) {
      logger.error("Failed to acquire lock:", error)
      return false
    }
  }

  private async releaseLock(workflowId: string, userId: string, resourceId: string): Promise<void> {
    await this.supabase
      .from("workflow_locks")
      .delete()
      .eq("workflow_id", workflowId)
      .eq("user_id", userId)
      .eq("resource_id", resourceId)
  }

  private async releaseAllLocks(workflowId: string, userId: string): Promise<void> {
    await this.supabase.from("workflow_locks").delete().eq("workflow_id", workflowId).eq("user_id", userId)
  }

  private async applyChangeToWorkflow(change: WorkflowChange): Promise<void> {
    // Verify workflow exists
    const { data: workflow } = await this.supabase.from("workflows").select("id").eq("id", change.workflow_id).single()

    if (!workflow) throw new Error("Workflow not found")

    switch (change.change_type) {
      case "node_add": {
        const node = change.change_data.node
        await this.supabase.from("workflow_nodes").insert({
          id: node.id,
          workflow_id: change.workflow_id,
          node_type: node.data?.type || node.type,
          label: node.data?.label || node.data?.title || 'Node',
          position_x: node.position?.x || 0,
          position_y: node.position?.y || 0,
          config: node.data?.config || {},
          is_trigger: node.data?.isTrigger || false,
          provider_id: node.data?.providerId || null
        })
        break
      }

      case "node_update": {
        const updates = change.change_data.updates
        const updateData: any = { updated_at: new Date().toISOString() }
        if (updates.data?.config) updateData.config = updates.data.config
        if (updates.data?.label) updateData.label = updates.data.label
        if (updates.position) {
          updateData.position_x = updates.position.x
          updateData.position_y = updates.position.y
        }
        await this.supabase.from("workflow_nodes").update(updateData).eq("id", change.change_data.nodeId)
        break
      }

      case "node_delete": {
        // Delete node (edges will be cascade deleted)
        await this.supabase.from("workflow_nodes").delete().eq("id", change.change_data.nodeId)
        break
      }

      case "edge_add": {
        const edge = change.change_data.edge
        await this.supabase.from("workflow_edges").insert({
          id: edge.id,
          workflow_id: change.workflow_id,
          source_node_id: edge.source,
          target_node_id: edge.target,
          source_port_id: edge.sourceHandle || 'source',
          target_port_id: edge.targetHandle || 'target'
        })
        break
      }

      case "edge_delete": {
        await this.supabase.from("workflow_edges").delete().eq("id", change.change_data.edgeId)
        break
      }

      case "property_update":
        // Update workflow properties (not nodes/edges)
        break
    }

    // Update workflow timestamp
    await this.supabase
      .from("workflows")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", change.workflow_id)
  }

  private async createCollaborationSnapshot(workflowId: string, userId: string): Promise<void> {
    // Load workflow metadata and nodes/edges from normalized tables
    const [workflowResult, nodesResult, edgesResult] = await Promise.all([
      this.supabase.from("workflows").select("id, name, metadata").eq("id", workflowId).single(),
      this.supabase.from("workflow_nodes").select("*").eq("workflow_id", workflowId).order("display_order"),
      this.supabase.from("workflow_edges").select("*").eq("workflow_id", workflowId)
    ])

    if (!workflowResult.data) return

    const nodes = (nodesResult.data || []).map((n: any) => ({
      id: n.id,
      type: 'custom',  // React Flow component type
      position: { x: n.position_x, y: n.position_y },
      data: {
        type: n.node_type,  // Action type
        label: n.label,
        config: n.config || {},
        isTrigger: n.is_trigger,
        providerId: n.provider_id
      }
    }))

    const connections = (edgesResult.data || []).map((e: any) => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      sourceHandle: e.source_port_id || 'source',
      targetHandle: e.target_port_id || 'target'
    }))

    await this.supabase.from("workflow_snapshots").insert({
      workflow_id: workflowId,
      snapshot_data: {
        nodes,
        connections,
        metadata: workflowResult.data.metadata,
      },
      snapshot_type: "collaboration",
      created_by: userId,
    })
  }

  private async generateVersionHash(workflowId: string): Promise<string> {
    // Query normalized tables in parallel
    const [workflowResult, nodesResult, edgesResult] = await Promise.all([
      this.supabase.from("workflows").select("updated_at").eq("id", workflowId).single(),
      this.supabase.from("workflow_nodes").select("id, updated_at").eq("workflow_id", workflowId),
      this.supabase.from("workflow_edges").select("id, updated_at").eq("workflow_id", workflowId)
    ])

    if (!workflowResult.data) return ""

    // Simple hash generation - in production, use a proper hashing algorithm
    const content = JSON.stringify({
      nodeIds: (nodesResult.data || []).map((n: any) => n.id).sort(),
      edgeIds: (edgesResult.data || []).map((e: any) => e.id).sort(),
      updated_at: workflowResult.data.updated_at,
    })

    return btoa(content).slice(0, 16)
  }

  private generateSessionToken(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getLockTypeForChange(changeType: WorkflowChange["change_type"]): WorkflowLock["lock_type"] {
    switch (changeType) {
      case "node_add":
      case "node_update":
      case "node_delete":
        return "node"
      case "edge_add":
      case "edge_delete":
        return "edge"
      case "property_update":
        return "property"
      default:
        return "node"
    }
  }

  private getResourceIdForChange(changeData: any): string {
    return changeData.nodeId || changeData.edgeId || changeData.propertyPath || "workflow"
  }

  private isSignificantChange(changeType: WorkflowChange["change_type"]): boolean {
    return ["node_add", "node_delete", "edge_add", "edge_delete"].includes(changeType)
  }

  private async broadcastCursorUpdate(
    workflowId: string,
    sessionToken: string,
    position: { x: number; y: number },
  ): Promise<void> {
    // In production, use WebSocket or Server-Sent Events
    logger.debug("Broadcasting cursor update:", { workflowId, sessionToken, position })
  }

  private async broadcastSelectionUpdate(
    workflowId: string,
    sessionToken: string,
    selectedNodes: string[],
  ): Promise<void> {
    // In production, use WebSocket or Server-Sent Events
    logger.debug("Broadcasting selection update:", { workflowId, sessionToken, selectedNodes })
  }

  private async broadcastWorkflowChange(
    workflowId: string,
    sessionToken: string,
    change: WorkflowChange,
  ): Promise<void> {
    // In production, use WebSocket or Server-Sent Events
    logger.debug("Broadcasting workflow change:", { workflowId, sessionToken, change })
  }

  private handleCursorUpdate(session: CollaborationSession): void {
    // Handle incoming cursor updates from other users
    logger.debug("Received cursor update:", session)
  }

  private handleWorkflowChange(change: WorkflowChange, currentSessionToken: string): void {
    // Handle incoming workflow changes from other users
    logger.debug("Received workflow change:", change)
  }

  private handleExecutionEvent(event: any): void {
    // Handle live execution events
    logger.debug("Received execution event:", event)
  }
}

// Conflict resolution system
class ConflictResolver {
  async resolveConflicts(
    change: WorkflowChange,
    conflicts: any[],
  ): Promise<{
    canAutoResolve: boolean
    resolvedData?: any
    requiresManualResolution?: boolean
  }> {
    // Simple conflict resolution strategies
    for (const conflict of conflicts) {
      switch (conflict.type) {
        case "concurrent_edit":
          // Try to merge changes if they don't overlap
          const merged = this.tryMergeChanges(change, conflict.conflictingChange)
          if (merged) {
            return {
              canAutoResolve: true,
              resolvedData: merged,
            }
          }
          break

        case "version_mismatch":
          // Attempt to rebase changes on latest version
          const rebased = await this.rebaseChange(change)
          if (rebased) {
            return {
              canAutoResolve: true,
              resolvedData: rebased,
            }
          }
          break
      }
    }

    return {
      canAutoResolve: false,
      requiresManualResolution: true,
    }
  }

  private tryMergeChanges(change1: WorkflowChange, change2: WorkflowChange): any | null {
    // Simple merge strategy - in production, implement sophisticated merging
    if (change1.change_type === "node_update" && change2.change_type === "node_update") {
      const nodeId1 = change1.change_data.nodeId
      const nodeId2 = change2.change_data.nodeId

      if (nodeId1 !== nodeId2) {
        // Different nodes, no conflict
        return change1.change_data
      }

      // Same node, try to merge updates
      const updates1 = change1.change_data.updates
      const updates2 = change2.change_data.updates

      // Check if updates conflict
      const conflictingKeys = Object.keys(updates1).filter((key) => key in updates2 && updates1[key] !== updates2[key])

      if (conflictingKeys.length === 0) {
        // No conflicting properties, merge them
        return {
          ...change1.change_data,
          updates: { ...updates2, ...updates1 },
        }
      }
    }

    return null
  }

  private async rebaseChange(change: WorkflowChange): Promise<any | null> {
    // Attempt to rebase change on current workflow state
    // This is a simplified implementation
    return change.change_data
  }
}
