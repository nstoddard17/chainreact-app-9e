/**
 * Format Transformer Action
 * Converts content between different formats (HTML, Markdown, Plain Text, Slack Markdown)
 */

import { ActionResult } from '../index'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'
import { formatRichTextForTarget } from '@/lib/workflows/formatters/richText'
import TurndownService from 'turndown'

/**
 * Detects if content is HTML
 */
function looksLikeHTML(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content)
}

/**
 * Detects if content is Markdown
 */
function looksLikeMarkdown(content: string): boolean {
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m, // Headers
    /\*\*.*\*\*/,  // Bold
    /\*.*\*/,      // Italic
    /_.*_/,        // Italic underscore
    /\[.*\]\(.*\)/, // Links
    /^[-*+]\s/m,   // Lists
    /```/          // Code blocks
  ]
  return markdownPatterns.some(pattern => pattern.test(content))
}

/**
 * Auto-detects the format of content
 */
function detectFormat(content: string): 'html' | 'markdown' | 'plain' {
  if (looksLikeHTML(content)) {
    return 'html'
  }
  if (looksLikeMarkdown(content)) {
    return 'markdown'
  }
  return 'plain'
}

/**
 * Converts HTML to Plain Text
 */
function htmlToPlain(html: string): string {
  const turndown = new TurndownService()
  const markdown = turndown.turndown(html)
  // Remove markdown formatting to get plain text
  return markdown
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to just text
    .replace(/^#+\s/gm, '') // Remove headers
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .trim()
}

/**
 * Converts Markdown to HTML
 */
function markdownToHtml(markdown: string): string {
  // Basic markdown to HTML conversion
  let html = markdown
    // Headers
    .replace(/^######\s(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s(.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  return `<p>${html}</p>`
}

/**
 * Converts Markdown to Plain Text
 */
function markdownToPlain(markdown: string): string {
  return markdown
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim()
}

/**
 * Converts Plain Text to HTML
 */
function plainToHtml(plain: string): string {
  return `<p>${plain.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
}

function findUpstreamAttachments(input: Record<string, any> | undefined): any[] | null {
  if (!input) return null

  if (Array.isArray(input.trigger?.attachments) && input.trigger.attachments.length > 0) {
    return input.trigger.attachments
  }

  if (Array.isArray(input.attachments) && input.attachments.length > 0) {
    return input.attachments
  }

  const inspectObject = (value: any): any[] | null => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const attachments = (value as any).attachments
      if (Array.isArray(attachments) && attachments.length > 0) {
        return attachments
      }
    }
    return null
  }

  const skipKeys = new Set(['trigger', 'config', 'workflowId', 'executionId', 'nodeId', 'testMode', 'previousResults'])

  for (const [key, value] of Object.entries(input)) {
    if (skipKeys.has(key)) continue
    const found = inspectObject(value)
    if (found) {
      return found
    }
  }

  if (input.previousResults && typeof input.previousResults === 'object') {
    for (const value of Object.values(input.previousResults)) {
      const found = inspectObject(value)
      if (found) {
        return found
      }
    }
  }

  return null
}

/**
 * Main format transformation handler
 */
export async function formatTransformer(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve variables in config
    const resolvedConfig = resolveValue(config, input)

    const {
      content,
      sourceFormat = 'auto',
      targetFormat = 'slack_markdown',
      preserveVariables = true
    } = resolvedConfig

    logger.debug('[FormatTransformer] Starting transformation:', {
      sourceFormat,
      targetFormat,
      contentLength: content?.length || 0,
      preserveVariables,
      userId
    })

    // Validate required fields
    if (!content) {
      return {
        success: false,
        output: {},
        message: 'Content is required for format transformation'
      }
    }

    if (!targetFormat) {
      return {
        success: false,
        output: {},
        message: 'Target format is required'
      }
    }

    // Check test mode
    const upstreamAttachments = findUpstreamAttachments(input)

    if (input.testMode) {
      logger.debug('[FormatTransformer] Test mode - simulating transformation')
      const testOutput: Record<string, any> = {
        transformedContent: 'Sample transformed content',
        originalFormat: sourceFormat === 'auto' ? 'html' : sourceFormat,
        targetFormat,
        success: true
      }

      if (upstreamAttachments && upstreamAttachments.length > 0) {
        testOutput.attachments = upstreamAttachments
      }

      return {
        success: true,
        output: testOutput,
        message: 'Format transformation completed (test mode)'
      }
    }
    // Auto-detect source format if needed
    const detectedFormat = sourceFormat === 'auto' ? detectFormat(content) : sourceFormat

    logger.debug('[FormatTransformer] Detected format:', detectedFormat)

    let transformedContent: string = content

    // Perform transformation based on source and target formats
    if (detectedFormat === 'html') {
      switch (targetFormat) {
        case 'slack_markdown':
          transformedContent = formatRichTextForTarget(content, 'slack') || content
          break
        case 'plain':
          transformedContent = htmlToPlain(content)
          break
        case 'markdown':
          const turndown = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced'
          })
          transformedContent = turndown.turndown(content)
          break
        case 'html':
          // No transformation needed
          transformedContent = content
          break
        default:
          throw new Error(`Unsupported target format: ${targetFormat}`)
      }
    } else if (detectedFormat === 'markdown') {
      switch (targetFormat) {
        case 'slack_markdown':
          // Markdown is already close to Slack markdown, but we might need some adjustments
          transformedContent = content
            .replace(/\*\*/g, '*') // Convert bold
            .replace(/\~\~/g, '~')  // Convert strikethrough
          break
        case 'plain':
          transformedContent = markdownToPlain(content)
          break
        case 'html':
          transformedContent = markdownToHtml(content)
          break
        case 'markdown':
          // No transformation needed
          transformedContent = content
          break
        default:
          throw new Error(`Unsupported target format: ${targetFormat}`)
      }
    } else if (detectedFormat === 'plain') {
      switch (targetFormat) {
        case 'slack_markdown':
        case 'markdown':
        case 'plain':
          // Plain text is compatible with all markdown formats
          transformedContent = content
          break
        case 'html':
          transformedContent = plainToHtml(content)
          break
        default:
          throw new Error(`Unsupported target format: ${targetFormat}`)
      }
    }

    // If preserveVariables is false, we could strip {{...}} patterns
    // But by default we keep them as the formatter already does this

    logger.debug('[FormatTransformer] Transformation successful:', {
      originalFormat: detectedFormat,
      targetFormat,
      originalLength: content.length,
      transformedLength: transformedContent.length
    })

    const actionOutput: Record<string, any> = {
      transformedContent,
      originalFormat: detectedFormat,
      targetFormat,
      success: true
    }

    if (upstreamAttachments && upstreamAttachments.length > 0) {
      actionOutput.attachments = upstreamAttachments
    }

    return {
      success: true,
      output: actionOutput,
      message: 'Content transformed successfully'
    }

  } catch (error: any) {
    logger.error('[FormatTransformer] Transformation failed:', error)
    return {
      success: false,
      output: {},
      message: `Failed to transform content: ${error.message}`
    }
  }
}
