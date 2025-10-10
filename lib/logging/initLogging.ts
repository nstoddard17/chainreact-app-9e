/**
 * Initialize file logging for the application
 * Import this at the top of your app to capture all logs
 */

import { getLogger, logger } from './fileLogger'

// Only initialize in server-side code
if (typeof window === 'undefined') {
  // Initialize the logger
  const fileLogger = getLogger({
    writeToFile: process.env.ENABLE_FILE_LOGGING === 'true',
    writeToConsole: true,
    maxFileSize: 100, // MB
    logDir: process.env.LOG_DIR || './logs'
  })

  // Log initialization
  if (process.env.ENABLE_FILE_LOGGING === 'true') {
    console.log('📁 File logging enabled')
    console.log(`📝 Logs will be written to: ${fileLogger.getLogFilePath()}`)
    console.log('💡 To view logs in real-time: tail -f', fileLogger.getLogFilePath())
    console.log('💡 To view all logs: cat', fileLogger.getLogFilePath())
    console.log('💡 To share logs: Copy the file at', fileLogger.getLogFilePath())
    console.log('-'.repeat(80))
  } else {
    console.log('📁 File logging disabled. To enable, set ENABLE_FILE_LOGGING=true in .env.local')
  }
}

export { logger }