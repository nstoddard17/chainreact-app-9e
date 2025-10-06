/**
 * Backend logger to capture server-side logs and make them available to the frontend
 * Used primarily during test mode execution to capture all backend logs
 */

export interface BackendLogEntry {
  timestamp: string
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  details?: any
  source?: 'backend' | 'execution' | 'webhook'
}

class BackendLogger {
  private static instance: BackendLogger
  private logs: Map<string, BackendLogEntry[]> = new Map()
  private maxLogsPerSession = 1000
  private recentConsoleLogs: Map<string, { count: number; lastSeen: number }> = new Map()
  private LOG_DEDUP_WINDOW = 2000 // 2 second window for deduplication

  private constructor() {}

  static getInstance(): BackendLogger {
    if (!BackendLogger.instance) {
      BackendLogger.instance = new BackendLogger()
    }
    return BackendLogger.instance
  }

  /**
   * Add a log entry for a specific execution session
   */
  addLog(sessionId: string, entry: Omit<BackendLogEntry, 'timestamp'>): void {
    const logEntry: BackendLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    }

    if (!this.logs.has(sessionId)) {
      this.logs.set(sessionId, [])
    }

    const sessionLogs = this.logs.get(sessionId)!
    sessionLogs.push(logEntry)

    // Keep only the last N logs to prevent memory issues
    if (sessionLogs.length > this.maxLogsPerSession) {
      sessionLogs.shift()
    }

    // Create a normalized key for console deduplication
    let consoleKey = entry.message

    // For trigger deactivation logs, normalize to detect repetition
    if (entry.message.includes('Deactivating') ||
        entry.message.includes('Deactivated') ||
        entry.message.includes('No active') ||
        entry.message.includes('Registered trigger provider')) {
      // Remove workflow IDs and other unique identifiers to group similar logs
      consoleKey = entry.message.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'ID')
    }

    const now = Date.now()
    const existing = this.recentConsoleLogs.get(consoleKey)

    // Check if this is a duplicate within the dedup window
    let shouldLogToConsole = true
    if (existing && now - existing.lastSeen < this.LOG_DEDUP_WINDOW) {
      existing.count++
      existing.lastSeen = now

      // If this is the second occurrence, show it's repeating
      if (existing.count === 2) {
        console.log(`[Backend] Previous message is repeating (${existing.count}x)...`)
      }

      shouldLogToConsole = false
    } else {
      // Track this new log
      this.recentConsoleLogs.set(consoleKey, { count: 1, lastSeen: now })

      // Clean up old entries periodically
      if (this.recentConsoleLogs.size > 50) {
        for (const [key, data] of this.recentConsoleLogs.entries()) {
          if (now - data.lastSeen > this.LOG_DEDUP_WINDOW * 2) {
            this.recentConsoleLogs.delete(key)
          }
        }
      }
    }

    // Only log to console if not a duplicate
    if (shouldLogToConsole) {
      const consoleMethod = entry.level === 'error' ? console.error :
                           entry.level === 'warning' ? console.warn :
                           console.log

      consoleMethod(`[Backend ${entry.level.toUpperCase()}] ${entry.message}`, entry.details)
    }
  }

  /**
   * Get logs for a specific session
   */
  getLogs(sessionId: string, since?: string): BackendLogEntry[] {
    const sessionLogs = this.logs.get(sessionId) || []

    if (since) {
      const sinceTime = new Date(since).getTime()
      return sessionLogs.filter(log => new Date(log.timestamp).getTime() > sinceTime)
    }

    return sessionLogs
  }

  /**
   * Clear logs for a session
   */
  clearLogs(sessionId: string): void {
    this.logs.delete(sessionId)
  }

  /**
   * Clear old logs to prevent memory leaks
   */
  clearOldLogs(maxAge: number = 3600000): void { // Default 1 hour
    const now = Date.now()

    for (const [sessionId, logs] of this.logs.entries()) {
      if (logs.length === 0) {
        this.logs.delete(sessionId)
        continue
      }

      const lastLog = logs[logs.length - 1]
      const lastLogTime = new Date(lastLog.timestamp).getTime()

      if (now - lastLogTime > maxAge) {
        this.logs.delete(sessionId)
      }
    }
  }
}

// Export singleton instance
export const backendLogger = BackendLogger.getInstance()

// Helper functions for common log types
export function logInfo(sessionId: string, message: string, details?: any): void {
  backendLogger.addLog(sessionId, {
    level: 'info',
    message,
    details,
    source: 'backend'
  })
}

export function logError(sessionId: string, message: string, details?: any): void {
  backendLogger.addLog(sessionId, {
    level: 'error',
    message,
    details,
    source: 'backend'
  })
}

export function logWarning(sessionId: string, message: string, details?: any): void {
  backendLogger.addLog(sessionId, {
    level: 'warning',
    message,
    details,
    source: 'backend'
  })
}

export function logSuccess(sessionId: string, message: string, details?: any): void {
  backendLogger.addLog(sessionId, {
    level: 'success',
    message,
    details,
    source: 'backend'
  })
}

// Clean up old logs periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    backendLogger.clearOldLogs()
  }, 600000) // Clean up every 10 minutes
}