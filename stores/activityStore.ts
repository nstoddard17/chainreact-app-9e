import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"
import { TokenAuditLogger } from "@/lib/integrations/TokenAuditLogger"

export interface Activity {
  id: string
  type: "workflow_execution" | "integration_connect" | "integration_disconnect" | "workflow_create" | "workflow_delete" | "workflow_update"
  title: string
  description: string
  status: "success" | "error" | "pending" | "running"
  timestamp: string
  metadata?: Record<string, any>
  source: "executions" | "token_audit" | "workflow_audit"
}

interface ActivityState {
  activities: Activity[]
  loading: boolean
  error: string | null
  fetchActivities: () => Promise<void>
}

export const useActivityStore = create<ActivityState>((set) => ({
  activities: [],
  loading: false,
  error: null,

  fetchActivities: async () => {
    set({ loading: true, error: null })
    
    try {
      const supabase = getSupabaseClient()
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ activities: [], loading: false })
        return
      }

      // Fetch workflow executions
      const executionsResponse = await fetch("/api/analytics/executions")
      const executions = executionsResponse.ok ? await executionsResponse.json() : []

      // Fetch token audit logs
      const tokenEvents = await TokenAuditLogger.getRecentEvents(user.id, 20)

      // Fetch workflow audit logs (if they exist)
      const { data: workflowEvents } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("user_id", user.id)
        .in("event_type", ["workflow_created", "workflow_deleted", "workflow_updated"])
        .order("created_at", { ascending: false })
        .limit(20)

      // Combine and transform all activities
      const allActivities: Activity[] = []

      // Add workflow executions
      executions.forEach((execution: any) => {
        allActivities.push({
          id: execution.id,
          type: "workflow_execution",
          title: `Workflow executed`,
          description: `Workflow ${execution.id.slice(0, 8)} was executed`,
          status: execution.status === "success" ? "success" : execution.status === "error" ? "error" : "running",
          timestamp: execution.started_at,
          metadata: { execution },
          source: "executions"
        })
      })

      // Add integration events
      tokenEvents.forEach((event: any) => {
        let type: Activity["type"] = "integration_connect"
        let title = "Integration connected"
        let description = `${event.provider} integration was connected`

        if (event.event_type === "disconnect") {
          type = "integration_disconnect"
          title = "Integration disconnected"
          description = `${event.provider} integration was disconnected`
        } else if (event.event_type === "reconnect") {
          title = "Integration reconnected"
          description = `${event.provider} integration was reconnected`
        }

        allActivities.push({
          id: event.id,
          type,
          title,
          description,
          status: "success",
          timestamp: event.created_at,
          metadata: { event },
          source: "token_audit"
        })
      })

      // Add workflow events
      if (workflowEvents) {
        workflowEvents.forEach((event: any) => {
          let type: Activity["type"] = "workflow_create"
          let title = "Workflow created"
          let description = "A new workflow was created"

          if (event.event_type === "workflow_deleted") {
            type = "workflow_delete"
            title = "Workflow deleted"
            description = "A workflow was deleted"
          } else if (event.event_type === "workflow_updated") {
            type = "workflow_update"
            title = "Workflow updated"
            description = "A workflow was updated"
          }

          allActivities.push({
            id: event.id,
            type,
            title,
            description,
            status: "success",
            timestamp: event.created_at,
            metadata: { event },
            source: "workflow_audit"
          })
        })
      }

      // Sort by timestamp (most recent first) and limit to 20 items
      const sortedActivities = allActivities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20)

      set({ activities: sortedActivities, loading: false })
    } catch (error: any) {
      console.error("Error fetching activities:", error)
      set({ 
        activities: [], 
        loading: false, 
        error: error.message || "Failed to load activities" 
      })
    }
  }
})) 