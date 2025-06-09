import type { Database } from "../database/Database"

export class NotificationService {
  constructor(private db: Database) {}

  /**
   * Send a notification to a user about token expiry
   */
  async sendTokenExpiryNotification(userId: string, provider: string, reason: string): Promise<void> {
    try {
      // Create a notification in the database
      await this.db.query(
        `INSERT INTO notifications (
          user_id, type, title, message, metadata, is_read, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          "integration_disconnected",
          `${this.formatProviderName(provider)} integration disconnected`,
          `Your ${this.formatProviderName(provider)} integration has been disconnected. Please reconnect to continue using this integration.`,
          {
            provider,
            reason,
            reconnect_url: `/integrations?provider=${provider}&action=reconnect`,
          },
          false,
          new Date(),
        ],
      )
    } catch (error) {
      console.error("Error sending token expiry notification:", error)
    }
  }

  /**
   * Send a notification to a user about token revocation
   */
  async sendTokenRevocationNotification(userId: string, provider: string): Promise<void> {
    try {
      // Create a notification in the database
      await this.db.query(
        `INSERT INTO notifications (
          user_id, type, title, message, metadata, is_read, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          "integration_revoked",
          `${this.formatProviderName(provider)} access revoked`,
          `Your access to ${this.formatProviderName(provider)} has been revoked. Please reconnect to continue using this integration.`,
          {
            provider,
            reason: "access_revoked",
            reconnect_url: `/integrations?provider=${provider}&action=reconnect`,
          },
          false,
          new Date(),
        ],
      )
    } catch (error) {
      console.error("Error sending token revocation notification:", error)
    }
  }

  /**
   * Format provider name for display
   */
  private formatProviderName(provider: string): string {
    // Handle special cases
    switch (provider.toLowerCase()) {
      case "google":
        return "Google"
      case "gmail":
        return "Gmail"
      case "google-drive":
        return "Google Drive"
      case "google-calendar":
        return "Google Calendar"
      case "microsoft":
        return "Microsoft"
      case "teams":
        return "Microsoft Teams"
      case "onedrive":
        return "OneDrive"
      default:
        // Capitalize first letter of each word
        return provider
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
    }
  }
}
