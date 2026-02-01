/**
 * Template Matching for Common Workflow Patterns
 *
 * Reduces LLM costs by using predefined templates for common workflows.
 * Supports both built-in templates and dynamically-learned templates.
 * Cost: $0.00 for template matches, $0.01-0.05 for LLM fallback
 */

import type { PlanNode } from '@/src/lib/workflows/builder/BuildState'
import { loadDynamicTemplates } from './dynamicTemplates'

// Export PlanNode for use in other modules
export type { PlanNode }

/**
 * Workflow template definition
 */
export interface WorkflowTemplate {
  id: string
  patterns: RegExp[] // Regex patterns to match user prompts
  description: string
  plan: (providerId: string) => PlanNode[]
  requiresProvider?: string[] // ['email', 'calendar', etc.]
}

// Cache for dynamic templates (refreshed periodically)
let dynamicTemplatesCache: WorkflowTemplate[] = []
let lastDynamicTemplateLoad = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Common workflow templates
 * Add more as you discover popular patterns
 *
 * IMPORTANT: More specific templates (with AI nodes) should be listed FIRST
 * so they match before generic patterns like "email-to-slack"
 */
const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ============================================
  // AI NODE TEMPLATES (must be first - more specific)
  // ============================================

  {
    id: 'email-summarize-slack',
    patterns: [
      /email.*summarize.*slack/i,
      /gmail.*summarize.*slack/i,
      /summarize.*email.*slack/i,
      /email.*summary.*slack/i,
      /email.*tldr.*slack/i,
      /email.*digest.*slack/i,
    ],
    description: 'Summarize emails and send to Slack',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Email',
        nodeType: `${emailProvider}_trigger_new_email`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Summarize Text',
        nodeType: 'ai_summarize',
        providerId: 'ai',
      },
      {
        id: 'action-2',
        title: 'Send Message to Channel',
        nodeType: 'slack_action_send_message',
        providerId: 'slack',
      },
    ],
  },

  {
    id: 'email-extract-sheets',
    patterns: [
      /email.*extract.*sheet/i,
      /gmail.*extract.*sheet/i,
      /extract.*email.*sheet/i,
      /pull.*data.*email.*sheet/i,
      /email.*data.*sheet/i,
    ],
    description: 'Extract data from emails to Google Sheets',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Email',
        nodeType: `${emailProvider}_trigger_new_email`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Extract Data',
        nodeType: 'ai_extract',
        providerId: 'ai',
      },
      {
        id: 'action-2',
        title: 'Append Row',
        nodeType: 'google_sheets_action_append_row',
        providerId: 'google-sheets',
      },
    ],
  },

  {
    id: 'email-classify-slack',
    patterns: [
      /email.*classify.*slack/i,
      /gmail.*classify.*slack/i,
      /classify.*email.*slack/i,
      /categorize.*email.*slack/i,
      /triage.*email.*slack/i,
      /sort.*email.*slack/i,
    ],
    description: 'Classify emails and notify Slack',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Email',
        nodeType: `${emailProvider}_trigger_new_email`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Classify Text',
        nodeType: 'ai_classify',
        providerId: 'ai',
      },
      {
        id: 'action-2',
        title: 'Send Message to Channel',
        nodeType: 'slack_action_send_message',
        providerId: 'slack',
      },
    ],
  },

  {
    id: 'email-sentiment-slack',
    patterns: [
      /email.*sentiment.*slack/i,
      /gmail.*sentiment.*slack/i,
      /sentiment.*email.*slack/i,
      /analyze.*tone.*email/i,
      /email.*mood.*slack/i,
    ],
    description: 'Analyze email sentiment and notify Slack',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Email',
        nodeType: `${emailProvider}_trigger_new_email`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Analyze Sentiment',
        nodeType: 'ai_sentiment',
        providerId: 'ai',
      },
      {
        id: 'action-2',
        title: 'Send Message to Channel',
        nodeType: 'slack_action_send_message',
        providerId: 'slack',
      },
    ],
  },

  {
    id: 'email-translate-reply',
    patterns: [
      /email.*translate/i,
      /gmail.*translate/i,
      /translate.*email/i,
      /email.*spanish/i,
      /email.*french/i,
      /email.*german/i,
    ],
    description: 'Translate emails',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Email',
        nodeType: `${emailProvider}_trigger_new_email`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Translate Text',
        nodeType: 'ai_translate',
        providerId: 'ai',
      },
      {
        id: 'action-2',
        title: 'Send Email',
        nodeType: `${emailProvider}_action_send_email`,
        providerId: emailProvider,
      },
    ],
  },

  // ============================================
  // BASIC TEMPLATES (less specific - checked after AI templates)
  // ============================================

  {
    id: 'email-to-slack',
    patterns: [
      /email.*slack/i,
      /gmail.*slack/i,
      /when.*email.*send.*slack/i,
      /forward.*email.*slack/i,
    ],
    description: 'Forward emails to Slack',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Email',
        nodeType: `${emailProvider}_trigger_new_email`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Send Message to Channel',
        nodeType: 'slack_action_send_message',
        providerId: 'slack',
      },
    ],
  },

  {
    id: 'email-to-notion',
    patterns: [
      /email.*notion/i,
      /gmail.*notion/i,
      /when.*email.*create.*notion/i,
      /save.*email.*notion/i,
    ],
    description: 'Save emails to Notion',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Email',
        nodeType: `${emailProvider}_trigger_new_email`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Create Page',
        nodeType: 'notion_action_create_page',
        providerId: 'notion',
      },
    ],
  },

  {
    id: 'labeled-email-to-slack',
    patterns: [
      /label.*email.*slack/i,
      /tagged.*email.*slack/i,
      /when.*email.*labeled.*slack/i,
    ],
    description: 'Send labeled emails to Slack',
    requiresProvider: ['email'],
    plan: (emailProvider: string) => [
      {
        id: 'trigger-1',
        title: 'Email Labeled',
        nodeType: `${emailProvider}_trigger_email_labeled`,
        providerId: emailProvider,
      },
      {
        id: 'action-1',
        title: 'Send Message to Channel',
        nodeType: 'slack_action_send_message',
        providerId: 'slack',
      },
    ],
  },

  {
    id: 'form-submission-to-slack',
    patterns: [
      /form.*slack/i,
      /typeform.*slack/i,
      /when.*submit.*form.*slack/i,
    ],
    description: 'Send form submissions to Slack',
    plan: () => [
      {
        id: 'trigger-1',
        title: 'New Form Response',
        nodeType: 'typeform_trigger_new_response',
        providerId: 'typeform',
      },
      {
        id: 'action-1',
        title: 'Send Message to Channel',
        nodeType: 'slack_action_send_message',
        providerId: 'slack',
      },
    ],
  },

  {
    id: 'calendar-event-to-slack',
    patterns: [
      /calendar.*slack/i,
      /meeting.*slack/i,
      /when.*event.*slack/i,
      /new.*event.*slack/i,
    ],
    description: 'Send calendar events to Slack',
    requiresProvider: ['calendar'],
    plan: (calendarProvider: string) => [
      {
        id: 'trigger-1',
        title: 'New Event',
        nodeType: `${calendarProvider}_trigger_new_event`,
        providerId: calendarProvider,
      },
      {
        id: 'action-1',
        title: 'Send Message to Channel',
        nodeType: 'slack_action_send_message',
        providerId: 'slack',
      },
    ],
  },

  // Add more templates as you discover common patterns
]

/**
 * Get all available templates (built-in + dynamic)
 * Caches dynamic templates for 5 minutes
 */
async function getAllTemplates(): Promise<WorkflowTemplate[]> {
  const now = Date.now()

  // Refresh cache if expired
  if (now - lastDynamicTemplateLoad > CACHE_DURATION) {
    try {
      // Add timeout to prevent hanging on database issues
      // Use 10 seconds to give slow connections a chance
      const timeoutPromise = new Promise<WorkflowTemplate[]>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Dynamic templates load timeout'))
        }, 10000)
        // Allow the timeout to be cleared if we don't need it
        return () => clearTimeout(timeoutId)
      })

      dynamicTemplatesCache = await Promise.race([
        loadDynamicTemplates().catch(() => []), // Silently return empty on error
        timeoutPromise
      ])
      lastDynamicTemplateLoad = now
    } catch (error) {
      // Silently continue with just built-in templates - don't show error to user
      console.warn('[TemplateMatching] Using built-in templates only (dynamic templates unavailable)')
      dynamicTemplatesCache = []
      lastDynamicTemplateLoad = now // Mark as loaded to prevent retrying immediately
    }
  }

  // Return built-in templates + cached dynamic templates
  return [...WORKFLOW_TEMPLATES, ...dynamicTemplatesCache]
}

/**
 * Match user prompt to a template
 * Returns null if no template matches (fallback to LLM)
 * Checks both built-in and dynamic templates
 */
export async function matchTemplate(
  prompt: string,
  providerId?: string
): Promise<{ template: WorkflowTemplate; plan: PlanNode[] } | null> {
  const allTemplates = await getAllTemplates()

  for (const template of allTemplates) {
    // Check if any pattern matches
    const matches = template.patterns.some(pattern => pattern.test(prompt))

    if (matches) {
      // If template requires a provider (like email), pass it in
      const plan = template.requiresProvider && providerId
        ? template.plan(providerId)
        : template.plan('')

      return { template, plan }
    }
  }

  return null
}

/**
 * Estimate cost savings from template matching
 */
export function estimateTemplateCoverage(prompts: string[]): {
  matched: number
  total: number
  savingsPercent: number
  estimatedSavings: number // in dollars
} {
  let matched = 0

  for (const prompt of prompts) {
    if (matchTemplate(prompt)) {
      matched++
    }
  }

  const savingsPercent = (matched / prompts.length) * 100
  const estimatedSavings = matched * 0.03 // Assume $0.03 per LLM call avoided

  return {
    matched,
    total: prompts.length,
    savingsPercent,
    estimatedSavings,
  }
}

/**
 * Analytics: Track template usage
 */
export function logTemplateMatch(templateId: string, prompt: string) {
  console.log(`[Template Match] ✅ Used template "${templateId}" for prompt: "${prompt}"`)
  console.log('[Template Match] Cost saved: $0.03 (no LLM call)')
}

export function logTemplateMiss(prompt: string) {
  console.log(`[Template Match] ❌ No template found for: "${prompt}"`)
  console.log('[Template Match] Fallback to LLM (cost: ~$0.03)')
}
