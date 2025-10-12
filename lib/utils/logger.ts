/**
 * Centralized Logging Utility
 *
 * Provides environment-based log level control to reduce production log noise
 * while maintaining debuggability.
 *
 * Usage:
 *   import { logger } from '@/lib/utils/logger'
 *   logger.info('User logged in', { userId })
 *   logger.debug('Token refresh', { provider })
 *   logger.trace('Full payload', { data })
 *
 * Environment Variables:
 *   LOG_LEVEL=INFO (production default)
 *   LOG_LEVEL=DEBUG (development)
 *   LOG_LEVEL=TRACE (troubleshooting)
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.TRACE]: 'TRACE'
}

/**
 * Parse log level from environment variable
 * Defaults to INFO for production safety
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO'

  switch (level) {
    case 'ERROR':
      return LogLevel.ERROR
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN
    case 'INFO':
      return LogLevel.INFO
    case 'DEBUG':
      return LogLevel.DEBUG
    case 'TRACE':
      return LogLevel.TRACE
    default:
      // Unknown level, default to INFO
      console.warn(`Unknown LOG_LEVEL: ${level}, defaulting to INFO`)
      return LogLevel.INFO
  }
}

/**
 * Format timestamp for logs
 * Returns ISO 8601 format: 2025-10-12T17:48:49.320Z
 */
function formatTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Check if a log level should be output
 */
function shouldLog(messageLevel: LogLevel, currentLevel: LogLevel): boolean {
  return messageLevel <= currentLevel
}

/**
 * Format log message with consistent structure
 */
function formatMessage(level: LogLevel, message: string, meta?: any): string {
  const timestamp = formatTimestamp()
  const levelName = LOG_LEVEL_NAMES[level]

  let output = `${timestamp} [${levelName}] ${message}`

  // Add metadata if present
  if (meta !== undefined) {
    if (typeof meta === 'object' && meta !== null) {
      try {
        // Pretty print objects for readability
        output += ` ${JSON.stringify(meta)}`
      } catch (err) {
        // Handle circular references
        output += ` [Object with circular reference]`
      }
    } else {
      output += ` ${meta}`
    }
  }

  return output
}

/**
 * Logger class with level-based methods
 */
class Logger {
  private currentLevel: LogLevel

  constructor() {
    this.currentLevel = getLogLevel()
  }

  /**
   * Get current log level (for testing)
   */
  getLevel(): LogLevel {
    return this.currentLevel
  }

  /**
   * Set log level programmatically (for testing)
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level
  }

  /**
   * ERROR: Critical failures, unrecoverable errors
   */
  error(message: string, meta?: any): void {
    if (shouldLog(LogLevel.ERROR, this.currentLevel)) {
      console.error(formatMessage(LogLevel.ERROR, message, meta))
    }
  }

  /**
   * WARN: Potential issues, recoverable errors
   */
  warn(message: string, meta?: any): void {
    if (shouldLog(LogLevel.WARN, this.currentLevel)) {
      console.warn(formatMessage(LogLevel.WARN, message, meta))
    }
  }

  /**
   * INFO: Important user-facing events (production default)
   */
  info(message: string, meta?: any): void {
    if (shouldLog(LogLevel.INFO, this.currentLevel)) {
      console.log(formatMessage(LogLevel.INFO, message, meta))
    }
  }

  /**
   * DEBUG: Technical details for debugging
   */
  debug(message: string, meta?: any): void {
    if (shouldLog(LogLevel.DEBUG, this.currentLevel)) {
      console.log(formatMessage(LogLevel.DEBUG, message, meta))
    }
  }

  /**
   * TRACE: Everything (variable dumps, full payloads)
   */
  trace(message: string, meta?: any): void {
    if (shouldLog(LogLevel.TRACE, this.currentLevel)) {
      console.log(formatMessage(LogLevel.TRACE, message, meta))
    }
  }

  /**
   * Conditional logging - only execute callback if level is enabled
   * Useful for expensive operations like JSON.stringify on large objects
   *
   * @example
   * logger.ifDebug(() => {
   *   logger.debug('Expensive operation', complexCalculation())
   * })
   */
  ifError(callback: () => void): void {
    if (shouldLog(LogLevel.ERROR, this.currentLevel)) {
      callback()
    }
  }

  ifWarn(callback: () => void): void {
    if (shouldLog(LogLevel.WARN, this.currentLevel)) {
      callback()
    }
  }

  ifInfo(callback: () => void): void {
    if (shouldLog(LogLevel.INFO, this.currentLevel)) {
      callback()
    }
  }

  ifDebug(callback: () => void): void {
    if (shouldLog(LogLevel.DEBUG, this.currentLevel)) {
      callback()
    }
  }

  ifTrace(callback: () => void): void {
    if (shouldLog(LogLevel.TRACE, this.currentLevel)) {
      callback()
    }
  }
}

/**
 * Singleton logger instance
 * Import and use throughout the application
 */
export const logger = new Logger()

/**
 * Export for testing and special cases
 */
export { Logger }
