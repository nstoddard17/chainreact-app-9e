import fs from 'fs'
import path from 'path'
import { format } from 'date-fns'

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success'

interface LogOptions {
  writeToFile?: boolean
  writeToConsole?: boolean
  maxFileSize?: number // in MB
  logDir?: string
}

class FileLogger {
  private logDir: string
  private currentLogFile: string | null = null
  private writeToFile: boolean
  private writeToConsole: boolean
  private maxFileSize: number
  private logStream: fs.WriteStream | null = null
  private originalConsole: {
    log: typeof console.log
    error: typeof console.error
    warn: typeof console.warn
    info: typeof console.info
    debug: typeof console.debug
  }

  constructor(options: LogOptions = {}) {
    // Check environment variable to enable/disable file logging
    this.writeToFile = process.env.ENABLE_FILE_LOGGING === 'true' || options.writeToFile !== false
    this.writeToConsole = options.writeToConsole !== false
    this.maxFileSize = (options.maxFileSize || 50) * 1024 * 1024 // Convert MB to bytes

    // Create logs directory
    this.logDir = options.logDir || path.join(process.cwd(), 'logs')
    if (this.writeToFile) {
      this.ensureLogDirectory()
      this.initializeLogFile()
    }

    // Store original console methods
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    }

    // Only intercept console methods if file logging is enabled
    if (this.writeToFile) {
      this.interceptConsole()
    }
  }

  private ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private initializeLogFile() {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss')
    this.currentLogFile = path.join(this.logDir, `workflow_${timestamp}.log`)

    // Create write stream with append flag
    this.logStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' })

    // Write header to log file
    this.writeToLogFile(`=== Log Session Started: ${new Date().toISOString()} ===\n`)
    this.writeToLogFile(`Node Version: ${process.version}\n`)
    this.writeToLogFile(`Platform: ${process.platform}\n`)
    this.writeToLogFile(`Working Directory: ${process.cwd()}\n`)
    this.writeToLogFile(`${'='.repeat(80)}\n\n`)
  }

  private writeToLogFile(message: string) {
    if (this.logStream && this.writeToFile) {
      // Check file size and rotate if needed
      if (this.currentLogFile && fs.existsSync(this.currentLogFile)) {
        const stats = fs.statSync(this.currentLogFile)
        if (stats.size > this.maxFileSize) {
          this.rotateLogFile()
        }
      }

      this.logStream.write(message)
    }
  }

  private rotateLogFile() {
    // Close current stream
    if (this.logStream) {
      this.logStream.end()
    }

    // Create new log file
    this.initializeLogFile()

    // Log rotation notice
    this.writeToLogFile(`=== Log Rotated from Previous File ===\n\n`)
  }

  private formatLogMessage(level: LogLevel, args: any[]): string {
    const timestamp = new Date().toISOString()
    const levelStr = level.toUpperCase().padEnd(7)

    // Convert arguments to strings, handling objects and errors
    const messages = args.map(arg => {
      if (typeof arg === 'object') {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`
        }
        try {
          return JSON.stringify(arg, null, 2)
        } catch (e) {
          return String(arg)
        }
      }
      return String(arg)
    }).join(' ')

    return `[${timestamp}] [${levelStr}] ${messages}\n`
  }

  private interceptConsole() {
    // Intercept console.log
    console.log = (...args) => {
      if (this.writeToConsole) {
        this.originalConsole.log.apply(console, args)
      }
      this.writeToLogFile(this.formatLogMessage('info', args))
    }

    // Intercept console.error
    console.error = (...args) => {
      if (this.writeToConsole) {
        this.originalConsole.error.apply(console, args)
      }
      this.writeToLogFile(this.formatLogMessage('error', args))
    }

    // Intercept console.warn
    console.warn = (...args) => {
      if (this.writeToConsole) {
        this.originalConsole.warn.apply(console, args)
      }
      this.writeToLogFile(this.formatLogMessage('warn', args))
    }

    // Intercept console.info
    console.info = (...args) => {
      if (this.writeToConsole) {
        this.originalConsole.info.apply(console, args)
      }
      this.writeToLogFile(this.formatLogMessage('info', args))
    }

    // Intercept console.debug
    console.debug = (...args) => {
      if (this.writeToConsole) {
        this.originalConsole.debug.apply(console, args)
      }
      this.writeToLogFile(this.formatLogMessage('debug', args))
    }
  }

  public log(level: LogLevel, ...args: any[]) {
    const colorMap = {
      debug: colors.dim,
      info: colors.blue,
      warn: colors.yellow,
      error: colors.red,
      success: colors.green,
    }

    const color = colorMap[level] || colors.white

    // Write to console with color
    if (this.writeToConsole) {
      const prefix = `${color}[${level.toUpperCase()}]${colors.reset}`
      this.originalConsole.log(prefix, ...args)
    }

    // Write to file
    this.writeToLogFile(this.formatLogMessage(level, args))
  }

  public getLogFilePath(): string | null {
    return this.currentLogFile
  }

  public getAllLogFiles(): string[] {
    if (!fs.existsSync(this.logDir)) {
      return []
    }

    return fs.readdirSync(this.logDir)
      .filter(file => file.endsWith('.log'))
      .map(file => path.join(this.logDir, file))
      .sort((a, b) => {
        const statA = fs.statSync(a)
        const statB = fs.statSync(b)
        return statB.mtime.getTime() - statA.mtime.getTime()
      })
  }

  public getLatestLogContent(lines?: number): string {
    if (!this.currentLogFile || !fs.existsSync(this.currentLogFile)) {
      return 'No log file available'
    }

    const content = fs.readFileSync(this.currentLogFile, 'utf-8')

    if (lines) {
      const allLines = content.split('\n')
      return allLines.slice(-lines).join('\n')
    }

    return content
  }

  public clearOldLogs(daysToKeep: number = 7) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
    const logFiles = this.getAllLogFiles()

    logFiles.forEach(file => {
      const stats = fs.statSync(file)
      if (stats.mtime.getTime() < cutoffTime) {
        fs.unlinkSync(file)
        this.log('info', `Deleted old log file: ${path.basename(file)}`)
      }
    })
  }

  public close() {
    // Restore original console methods
    if (this.writeToFile) {
      console.log = this.originalConsole.log
      console.error = this.originalConsole.error
      console.warn = this.originalConsole.warn
      console.info = this.originalConsole.info
      console.debug = this.originalConsole.debug
    }

    // Close log stream
    if (this.logStream) {
      this.writeToLogFile(`\n=== Log Session Ended: ${new Date().toISOString()} ===\n`)
      this.logStream.end()
      this.logStream = null
    }
  }
}

// Create singleton instance
let loggerInstance: FileLogger | null = null

export function getLogger(options?: LogOptions): FileLogger {
  if (!loggerInstance) {
    loggerInstance = new FileLogger(options)
  }
  return loggerInstance
}

// Helper function to log with sections (like your webhook logs)
export function logSection(title: string, data: any, color: string = colors.cyan) {
  const logger = getLogger()
  const separator = '='.repeat(60)

  if (logger['writeToConsole']) {
    console.log(`${color}${separator}${colors.reset}`)
    console.log(`${color}${title}${colors.reset}`)
    console.log(`${color}${separator}${colors.reset}`)

    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
        console.log(`${colors.bright}${key}:${colors.reset} ${valueStr}`)
      })
    } else {
      console.log(data)
    }

    console.log(`${color}${separator}${colors.reset}\n`)
  }

  // Also write structured version to file
  logger['writeToLogFile'](`\n${'='.repeat(60)}\n`)
  logger['writeToLogFile'](`${title}\n`)
  logger['writeToLogFile'](`${'='.repeat(60)}\n`)
  logger['writeToLogFile'](`${JSON.stringify(data, null, 2) }\n`)
  logger['writeToLogFile'](`${'='.repeat(60)}\n\n`)
}

// Export convenience methods
export const logger = {
  debug: (...args: any[]) => getLogger().log('debug', ...args),
  info: (...args: any[]) => getLogger().log('info', ...args),
  warn: (...args: any[]) => getLogger().log('warn', ...args),
  error: (...args: any[]) => getLogger().log('error', ...args),
  success: (...args: any[]) => getLogger().log('success', ...args),
  section: logSection,
  getLogFile: () => getLogger().getLogFilePath(),
  getLatestLogs: (lines?: number) => getLogger().getLatestLogContent(lines),
  clearOldLogs: (days?: number) => getLogger().clearOldLogs(days),
}

// Initialize logger on module load if enabled
if (process.env.ENABLE_FILE_LOGGING === 'true') {
  const logger = getLogger()
  logger.log('info', 'File logging initialized')
  logger.log('info', `Log file: ${logger.getLogFilePath()}`)

  // Clean up old logs on startup (keep last 7 days)
  logger.clearOldLogs(7)

  // Handle process exit
  process.on('exit', () => {
    logger.close()
  })

  process.on('SIGINT', () => {
    logger.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    logger.close()
    process.exit(0)
  })
}