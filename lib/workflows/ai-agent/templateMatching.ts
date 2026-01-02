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
 */
const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
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
      const timeoutPromise = new Promise<WorkflowTemplate[]>((_, reject) =>
        setTimeout(() => reject(new Error('Dynamic templates load timeout')), 5000)
      )
      dynamicTemplatesCache = await Promise.race([
        loadDynamicTemplates(),
        timeoutPromise
      ])
      lastDynamicTemplateLoad = now
    } catch (error) {
      console.error('[TemplateMatching] Failed to load dynamic templates:', error)
      // Continue with just built-in templates
      dynamicTemplatesCache = []
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
