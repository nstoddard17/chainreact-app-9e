import { getAdminSupabaseClient } from "@/lib/supabase/admin"

export class TokenAuditLogger {
  /**
   * Logs a token event to the audit log
   */
  static async logEvent(
    integrationId: string,
    userId: string,
    provider: string,
    eventType: string,
    details?: Record<string, any>,
  ): Promise<string | null> {
    try {
      const supabase = getAdminSupabaseClient()
      if (!supabase) {
        console.error("Failed to create database client for audit logging")
        return null
      }

      const { data, error } = await supabase.rpc("log_token_event", {
        p_integration_id: integrationId,
        p_user_id: userId,
        p_provider: provider,
        p_event_type: eventType,
        p_event_details: details || {},
      })

      if (error) {
        console.error("Error logging token event:", error)
        return null
      }

      return data
    } catch (error) {
      console.error("Error in token audit logger:", error)
      return null
    }
  }

  /**
   * Gets recent token events for a user
   */
  static async getRecentEvents(userId: string, limit = 50): Promise<any[]> {
    try {
      const supabase = getAdminSupabaseClient()
      if (!supabase) {
        console.error("Failed to create database client for audit logging")
        return []
      }

      const { data, error } = await supabase
        .from("token_audit_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit)

      if (error) {
        console.error("Error fetching token events:", error)
        return []
      }

      return data || []
    } catch (error) {
      console.error("Error in token audit logger:", error)
      return []
    }
  }

  /**
   * Gets events for a specific integration
   */
  static async getIntegrationEvents(integrationId: string, limit = 50): Promise<any[]> {
    try {
      const supabase = getAdminSupabaseClient()
      if (!supabase) {
        console.error("Failed to create database client for audit logging")
        return []
      }

      const { data, error } = await supabase
        .from("token_audit_logs")
        .select("*")
        .eq("integration_id", integrationId)
        .order("created_at", { ascending: false })
        .limit(limit)

      if (error) {
        console.error("Error fetching integration events:", error)
        return []
      }

      return data || []
    } catch (error) {
      console.error("Error in token audit logger:", error)
      return []
    }
  }
}
