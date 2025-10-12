/**
 * Trello Board Templates Handler
 * Fetches available board templates from Trello
 */

import { TrelloIntegration } from '../types'
import { createTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

// Predefined Trello board templates
// These are common templates that Trello provides
const TRELLO_BOARD_TEMPLATES = [
  { value: 'basic', label: 'Basic Board' },
  { value: 'kanban', label: 'Kanban Board' },
  { value: 'project-management', label: 'Project Management' },
  { value: 'agile-board', label: 'Agile Board' },
  { value: 'simple-project-board', label: 'Simple Project Board' },
  { value: 'weekly-planner', label: 'Weekly Planner' },
  { value: 'company-overview', label: 'Company Overview' },
  { value: 'design-huddle', label: 'Design Huddle' },
  { value: 'editorial-calendar', label: 'Editorial Calendar' },
  { value: 'meeting-agenda', label: 'Meeting Agenda' },
  { value: 'remote-team-hub', label: 'Remote Team Hub' },
  { value: 'sales-pipeline', label: 'Sales Pipeline' },
  { value: 'team-task-management', label: 'Team Task Management' },
  { value: 'personal-productivity', label: 'Personal Productivity' },
  { value: 'content-calendar', label: 'Content Calendar' },
  { value: 'customer-feedback', label: 'Customer Feedback' },
  { value: 'product-roadmap', label: 'Product Roadmap' },
  { value: 'sprint-planning', label: 'Sprint Planning' },
  { value: 'bug-tracking', label: 'Bug Tracking' },
  { value: 'crm-pipeline', label: 'CRM Pipeline' },
  { value: 'event-planning', label: 'Event Planning' },
  { value: 'goals-and-okrs', label: 'Goals and OKRs' },
  { value: 'hiring-pipeline', label: 'Hiring Pipeline' },
  { value: 'marketing-campaign', label: 'Marketing Campaign' },
  { value: 'portfolio-management', label: 'Portfolio Management' },
  { value: 'research-and-development', label: 'Research & Development' },
  { value: 'social-media-calendar', label: 'Social Media Calendar' },
  { value: 'support-tickets', label: 'Support Tickets' },
  { value: 'user-story-mapping', label: 'User Story Mapping' },
  { value: 'work-from-home', label: 'Work From Home' }
]

export async function getTrelloBoardTemplates(
  integration: TrelloIntegration,
  options: any = {}
): Promise<any[]> {
  try {
    logger.debug('[Trello] Fetching board templates')

    // For board templates, we return the predefined list
    // Trello doesn't have a public API endpoint for templates
    // but these are the common templates they offer
    
    return TRELLO_BOARD_TEMPLATES
  } catch (error: any) {
    logger.error('[Trello] Error fetching board templates:', error)
    throw new Error(`Failed to fetch Trello board templates: ${error.message}`)
  }
}