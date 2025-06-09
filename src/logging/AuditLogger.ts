import type { Database } from "../database/Database"

export class AuditLogger {
  constructor(private db: Database) {}

  /**
   * Log a token-related event
   */
  async logTokenEvent(
    integrationId: string,
    userId: string,
    provider: string,
    eventType: string,
    details?: Record<string, any>,
  ): Promise<string | null> {
    try {
      const result = await this.db.query(
        `INSERT INTO token_audit_logs (
          integration_id, user_id, provider, event_type, event_details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [integrationId, userId, provider, eventType, details || {}, new Date()],
      )

      return result[0]?.id || null
    } catch (error) {
      console.error("Error logging token event:", error)
      return null
    }
  }

  /**
   * Get recent token events for a user
   */
  async getRecentEvents(userId: string, limit = 50): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM token_audit_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      )

      return result || []
    } catch (error) {
      console.error("Error fetching token events:", error)
      return []
    }
  }

  /**
   * Get events for a specific integration
   */
  async getIntegrationEvents(integrationId: string, limit = 50): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM token_audit_logs
         WHERE integration_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [integrationId, limit],
      )

      return result || []
    } catch (error) {
      console.error("Error fetching integration events:", error)
      return []
    }
  }
}
