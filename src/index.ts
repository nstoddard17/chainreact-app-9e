import { Database } from "./database/Database"
import { EncryptionService } from "./security/EncryptionService"
import { TokenRepository } from "./repositories/TokenRepository"
import { TokenManagerService } from "./services/TokenManagerService"
import { NotificationService } from "./notifications/NotificationService"
import { AuditLogger } from "./logging/AuditLogger"
import { ProviderRegistry } from "./providers/ProviderRegistry"
import { TokenRefreshWorker } from "./workers/TokenRefreshWorker"

// Load environment variables
require("dotenv").config()

// Initialize services
const db = new Database({
  host: process.env.DB_HOST || "localhost",
  port: Number.parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "oauth_manager",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
})

const encryptionService = new EncryptionService(
  process.env.ENCRYPTION_MASTER_KEY || "default-key-that-is-at-least-32-chars",
)

const tokenRepository = new TokenRepository(db, encryptionService)
const auditLogger = new AuditLogger(db)
const notificationService = new NotificationService(db)
const providerRegistry = new ProviderRegistry()

// Initialize the token manager
const tokenManager = new TokenManagerService(
  tokenRepository,
  encryptionService,
  notificationService,
  auditLogger,
  providerRegistry,
)

// Initialize the token refresh worker
const tokenRefreshWorker = new TokenRefreshWorker(tokenManager, auditLogger)

// Schedule the token refresh job to run every 5 minutes
tokenRefreshWorker.scheduleJob("*/5 * * * *")

// Export the token manager for use in other parts of the application
export { tokenManager }
