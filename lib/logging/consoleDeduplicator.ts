/**
 * Console deduplicator for backend/terminal logs
 * Prevents repetitive logs from spamming the terminal
 */

const recentLogs = new Map<string, { count: number; lastSeen: number; firstMessage: string }>()
const LOG_DEDUP_WINDOW = 2000 // 2 second window for deduplication

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
}

/**
 * Safe write wrapper to handle EPIPE errors
 */
function safeWrite(fn: Function, args: any[]) {
  try {
    fn.apply(console, args)
  } catch (error: any) {
    // Ignore EPIPE errors (broken pipe) which occur when stdout/stderr is closed
    if (error?.code !== 'EPIPE') {
      // For other errors, attempt to report them but ignore if that also fails
      try {
        process.stderr.write(`Console write error: ${error?.message}\n`)
      } catch {
        // Silently ignore if we can't even write the error
      }
    }
  }
}

/**
 * Initialize console deduplication
 * Call this once at application startup
 */
export function initConsoleDeduplication() {
  // Intercept console.log
  console.log = (...args: any[]) => {
    const message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])

    if (shouldLog(message, args, 'log')) {
      safeWrite(originalConsole.log, args)
    }
  }

  // Intercept console.error
  console.error = (...args: any[]) => {
    const message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])

    if (shouldLog(message, args, 'error')) {
      safeWrite(originalConsole.error, args)
    }
  }

  // Intercept console.warn
  console.warn = (...args: any[]) => {
    const message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])

    if (shouldLog(message, args, 'warn')) {
      safeWrite(originalConsole.warn, args)
    }
  }

  // Intercept console.info
  console.info = (...args: any[]) => {
    const message = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])

    if (shouldLog(message, args, 'info')) {
      safeWrite(originalConsole.info, args)
    }
  }
}

function shouldLog(message: string, args: any[], level: string): boolean {
  // Create a normalized key for deduplication
  let logKey = message

  // For trigger deactivation logs and other repetitive patterns, normalize to detect repetition
  if (
    message.includes('Deactivating') ||
    message.includes('Deactivated') ||
    message.includes('No active') ||
    message.includes('Registered trigger provider') ||
    message.includes('Compiling') ||
    message.includes('GET /api') ||
    message.includes('POST /api') ||
    message.includes('DELETE /api') ||
    message.includes('PUT /api')
  ) {
    // Remove workflow IDs and other unique identifiers to group similar logs
    logKey = message
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/\d{13,}/g, 'TIMESTAMP') // Replace timestamps
      .replace(/\d+ms/g, 'Xms') // Replace millisecond durations
  } else {
    // For other logs, include args in the key for exact matching
    logKey = message + JSON.stringify(args.slice(1))
  }

  const now = Date.now()
  const existing = recentLogs.get(logKey)

  if (existing && now - existing.lastSeen < LOG_DEDUP_WINDOW) {
    // Update count and last seen time
    existing.count++
    existing.lastSeen = now

    // If this is becoming repetitive, show a count
    if (existing.count === 2) {
      safeWrite(originalConsole.log, [`⚡ Previous message is repeating...`])
    } else if (existing.count % 10 === 0) {
      // Every 10 repetitions, show a count
      safeWrite(originalConsole.log, [`⚡ Previous message repeated ${existing.count} times`])
    }

    return false // Don't log the duplicate
  }

  // Clean up old entries periodically
  if (recentLogs.size > 100) {
    for (const [key, data] of recentLogs.entries()) {
      if (now - data.lastSeen > LOG_DEDUP_WINDOW * 2) {
        recentLogs.delete(key)
      }
    }
  }

  // Track this new log
  recentLogs.set(logKey, { count: 1, lastSeen: now, firstMessage: message })

  return true // Log this message
}

// Export function to manually reset deduplication if needed
export function resetDeduplication() {
  recentLogs.clear()
}