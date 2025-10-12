import { toast } from "sonner"

import { logger } from '@/lib/utils/logger'

interface ErrorReportOptions {
  context?: string
  userId?: string
  workflowId?: string
  integrationId?: string
  showToast?: boolean
  autoReport?: boolean
}

export class ErrorReporter {
  private static instance: ErrorReporter
  private pendingErrors: Map<string, { count: number; lastOccurred: Date }> = new Map()
  
  private constructor() {}
  
  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter()
    }
    return ErrorReporter.instance
  }
  
  /**
   * Report an error and optionally create a support ticket
   */
  async reportError(
    error: Error | unknown,
    options: ErrorReportOptions = {}
  ): Promise<void> {
    const {
      context = 'Unknown',
      showToast = true,
      autoReport = false,
    } = options
    
    // Extract error details
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    
    // Create a unique key for this error
    const errorKey = `${errorName}-${errorMessage}-${context}`
    
    // Check if this error has been reported recently
    const existingError = this.pendingErrors.get(errorKey)
    if (existingError) {
      const timeSinceLastReport = Date.now() - existingError.lastOccurred.getTime()
      if (timeSinceLastReport < 5 * 60 * 1000) { // 5 minutes
        existingError.count++
        existingError.lastOccurred = new Date()
        
        if (showToast) {
          toast.error(`Error occurred (${existingError.count} times): ${errorMessage}`)
        }
        return // Don't create duplicate tickets
      }
    }
    
    // Log error to console for debugging
    logger.error(`[ErrorReporter] ${context}:`, error)
    
    // Show user-friendly error message
    if (showToast) {
      const actions = autoReport ? [] : [{
        label: 'Report Issue',
        onClick: () => this.createSupportTicket(error, options)
      }]
      
      toast.error(errorMessage, {
        description: `Error in ${context}`,
        action: actions.length > 0 ? actions[0] : undefined,
        duration: 8000,
      })
    }
    
    // Auto-report critical errors
    if (autoReport) {
      await this.createSupportTicket(error, options)
    }
    
    // Track this error
    this.pendingErrors.set(errorKey, {
      count: 1,
      lastOccurred: new Date()
    })
    
    // Clean up old errors after 10 minutes
    setTimeout(() => {
      this.pendingErrors.delete(errorKey)
    }, 10 * 60 * 1000)
  }
  
  /**
   * Create a support ticket for the error
   */
  async createSupportTicket(
    error: Error | unknown,
    options: ErrorReportOptions = {}
  ): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      const errorName = error instanceof Error ? error.name : 'UnknownError'
      const { context = 'Unknown', workflowId, integrationId } = options
      
      // Get browser/system info
      const browserInfo = this.getBrowserSystemInfo()
      
      // Build detailed description
      let description = `An error occurred in the application:\n\n`
      description += `**Error Type:** ${errorName}\n`
      description += `**Error Message:** ${errorMessage}\n`
      description += `**Context:** ${context}\n`
      description += `**Timestamp:** ${new Date().toISOString()}\n`
      description += `**URL:** ${typeof window !== 'undefined' ? window.location.href : 'N/A'}\n`
      
      if (workflowId) {
        description += `**Workflow ID:** ${workflowId}\n`
      }
      if (integrationId) {
        description += `**Integration ID:** ${integrationId}\n`
      }
      
      description += `\n**Stack Trace:**\n\`\`\`\n${errorStack || 'No stack trace available'}\n\`\`\`\n`
      description += `\n**Browser/System Info:**\n${browserInfo}`
      
      // Create the ticket
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: `[Auto-Reported] ${errorName}: ${errorMessage.substring(0, 100)}`,
          description,
          priority: this.determinePriority(error),
          category: 'bug',
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        toast.success(`Support ticket ${data.ticket.ticket_number} created for this error`)
      } else {
        logger.error('Failed to create support ticket for error')
      }
    } catch (ticketError) {
      logger.error('Failed to create support ticket:', ticketError)
      toast.error('Failed to report error. Please contact support manually.')
    }
  }
  
  /**
   * Determine priority based on error type
   */
  private determinePriority(error: Error | unknown): string {
    if (error instanceof Error) {
      // Critical errors
      if (error.name === 'SecurityError' || error.message.includes('authentication')) {
        return 'urgent'
      }
      // Integration or workflow errors
      if (error.message.includes('workflow') || error.message.includes('integration')) {
        return 'high'
      }
      // Network errors
      if (error.name === 'NetworkError' || error.message.includes('fetch')) {
        return 'medium'
      }
    }
    return 'medium'
  }
  
  /**
   * Get formatted browser/system info
   */
  private getBrowserSystemInfo(): string {
    if (typeof navigator === 'undefined') return 'Server-side error'
    
    const userAgent = navigator.userAgent
    const platform = navigator.platform
    
    // Detect browser
    let browser = 'Unknown Browser'
    let browserVersion = ''
    
    if (userAgent.includes('Firefox/')) {
      browser = 'Firefox'
      browserVersion = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || ''
    } else if (userAgent.includes('Edg/')) {
      browser = 'Edge'
      browserVersion = userAgent.match(/Edg\/(\d+\.\d+)/)?.[1] || ''
    } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg')) {
      browser = 'Chrome'
      browserVersion = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || ''
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
      browser = 'Safari'
      browserVersion = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || ''
    }
    
    // Detect OS
    let os = 'Unknown OS'
    if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10'
    else if (userAgent.includes('Windows NT 11.0')) os = 'Windows 11'
    else if (userAgent.includes('Mac OS X')) {
      const version = userAgent.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || ''
      os = `macOS ${version}`
    } else if (userAgent.includes('Linux')) os = 'Linux'
    else if (userAgent.includes('Android')) os = 'Android'
    else if (userAgent.includes('iOS')) os = 'iOS'
    
    // Get screen resolution
    const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'Unknown'
    
    // Get language
    const language = navigator.language || 'Unknown'
    
    return `Browser: ${browser} ${browserVersion}
OS: ${os}
Platform: ${platform}
Screen Resolution: ${screenRes}
Language: ${language}
Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
  }
}

// Export singleton instance
export const errorReporter = ErrorReporter.getInstance()

// Convenience function for quick error reporting
export function reportError(
  error: Error | unknown,
  options?: ErrorReportOptions
): void {
  errorReporter.reportError(error, options).catch(console.error)
}