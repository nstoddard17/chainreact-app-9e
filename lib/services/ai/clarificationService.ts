/**
 * Clarification Service
 * Detects ambiguous requests and generates clarifying questions
 */

import { conversationStateManager, QuestionOption } from './conversationStateManager'
import { Integration } from './aiIntentAnalysisService'
import { logger } from '@/lib/utils/logger'

export interface ClarificationResult {
  needsClarification: boolean
  questionId?: string
  question?: string
  options?: QuestionOption[]
  reason?: string
}

export class ClarificationService {
  /**
   * Check if multiple databases/tables exist for Notion query
   */
  async checkNotionDatabases(
    userId: string,
    conversationId: string,
    integrations: Integration[]
  ): Promise<ClarificationResult> {
    try {
      const notionIntegration = integrations.find(i => i.provider === 'notion')
      if (!notionIntegration) {
        return { needsClarification: false }
      }

      // In a real implementation, we'd query Notion API for databases
      // For now, we'll simulate finding multiple databases

      // Store original request context
      conversationStateManager.setState(conversationId, 'intent', 'query_notion_tasks')
      conversationStateManager.setState(conversationId, 'provider', 'notion')

      // Generate clarifying question
      const questionId = conversationStateManager.setPendingQuestion(
        conversationId,
        'choice',
        'You have multiple task databases in Notion. Which one would you like to see?',
        [
          {
            id: 'work_tasks',
            label: 'Work Tasks',
            value: 'database_id_1',
            description: '127 tasks',
            icon: 'briefcase'
          },
          {
            id: 'personal_tasks',
            label: 'Personal Tasks',
            value: 'database_id_2',
            description: '43 tasks',
            icon: 'user'
          },
          {
            id: 'project_tasks',
            label: 'Project Tasks',
            value: 'database_id_3',
            description: '89 tasks',
            icon: 'folder'
          },
          {
            id: 'all_tasks',
            label: 'All Tasks',
            value: 'all',
            description: 'Show everything',
            icon: 'list'
          }
        ],
        {
          provider: 'notion',
          action: 'query_database'
        }
      )

      return {
        needsClarification: true,
        questionId,
        question: 'You have multiple task databases in Notion. Which one would you like to see?',
        reason: 'multiple_databases_found'
      }

    } catch (error) {
      logger.error('Error checking Notion databases:', error)
      return { needsClarification: false }
    }
  }

  /**
   * Check if multiple Airtable bases/tables exist
   */
  async checkAirtableTables(
    userId: string,
    conversationId: string,
    integrations: Integration[]
  ): Promise<ClarificationResult> {
    const airtableIntegration = integrations.find(i => i.provider === 'airtable')
    if (!airtableIntegration) {
      return { needsClarification: false }
    }

    // Simulate finding multiple tables
    conversationStateManager.setState(conversationId, 'intent', 'query_airtable')
    conversationStateManager.setState(conversationId, 'provider', 'airtable')

    const questionId = conversationStateManager.setPendingQuestion(
      conversationId,
      'choice',
      'Which Airtable table would you like to view?',
      [
        {
          id: 'contacts',
          label: 'Contacts',
          value: { baseId: 'base1', tableName: 'Contacts' },
          description: '342 records',
          icon: 'users'
        },
        {
          id: 'projects',
          label: 'Projects',
          value: { baseId: 'base1', tableName: 'Projects' },
          description: '56 records',
          icon: 'folder'
        },
        {
          id: 'tasks',
          label: 'Tasks',
          value: { baseId: 'base2', tableName: 'Tasks' },
          description: '189 records',
          icon: 'check-square'
        }
      ],
      {
        provider: 'airtable',
        action: 'list_records'
      }
    )

    return {
      needsClarification: true,
      questionId,
      question: 'Which Airtable table would you like to view?',
      reason: 'multiple_tables_found'
    }
  }

  /**
   * Check if email query is ambiguous (multiple folders, date ranges, etc.)
   */
  async checkEmailQuery(
    userId: string,
    conversationId: string,
    message: string,
    integrations: Integration[]
  ): Promise<ClarificationResult> {
    const emailIntegration = integrations.find(i => i.provider === 'gmail' || i.provider === 'microsoft-outlook')
    if (!emailIntegration) {
      return { needsClarification: false }
    }

    // If query mentions "emails" without specifying folder/time
    const isGeneric = /^(show|get|find|list|display)\s+(my\s+)?emails?$/i.test(message.trim())

    if (isGeneric) {
      conversationStateManager.setState(conversationId, 'intent', 'query_emails')
      conversationStateManager.setState(conversationId, 'provider', emailIntegration.provider)

      const questionId = conversationStateManager.setPendingQuestion(
        conversationId,
        'choice',
        'Which emails would you like to see?',
        [
          {
            id: 'unread',
            label: 'Unread Emails',
            value: { folder: 'inbox', filter: 'is:unread' },
            description: 'Recent unread messages',
            icon: 'mail'
          },
          {
            id: 'inbox',
            label: 'Inbox',
            value: { folder: 'inbox', limit: 20 },
            description: 'Last 20 messages',
            icon: 'inbox'
          },
          {
            id: 'today',
            label: 'Today',
            value: { folder: 'inbox', filter: 'after:today' },
            description: 'Emails from today',
            icon: 'calendar'
          },
          {
            id: 'important',
            label: 'Important',
            value: { folder: 'inbox', filter: 'is:important' },
            description: 'Flagged messages',
            icon: 'star'
          }
        ],
        {
          provider: emailIntegration.provider,
          action: 'get_emails'
        }
      )

      return {
        needsClarification: true,
        questionId,
        question: 'Which emails would you like to see?',
        reason: 'ambiguous_email_query'
      }
    }

    return { needsClarification: false }
  }

  /**
   * Check if file search needs clarification
   */
  async checkFileQuery(
    userId: string,
    conversationId: string,
    message: string,
    integrations: Integration[]
  ): Promise<ClarificationResult> {
    const fileIntegrations = integrations.filter(i =>
      i.provider === 'google-drive' || i.provider === 'microsoft-onedrive' || i.provider === 'dropbox'
    )

    if (fileIntegrations.length === 0) {
      return { needsClarification: false }
    }

    // If user has multiple file providers
    if (fileIntegrations.length > 1) {
      const isGeneric = /^(show|get|find|list|search)\s+(my\s+)?files?/i.test(message.trim())

      if (isGeneric) {
        conversationStateManager.setState(conversationId, 'intent', 'query_files')

        const questionId = conversationStateManager.setPendingQuestion(
          conversationId,
          'choice',
          'Where would you like to search for files?',
          fileIntegrations.map(integration => ({
            id: integration.provider,
            label: integration.provider === 'google-drive' ? 'Google Drive' :
                   integration.provider === 'microsoft-onedrive' ? 'OneDrive' :
                   'Dropbox',
            value: { provider: integration.provider },
            description: integration.provider,
            icon: 'folder'
          })),
          {
            action: 'search_files'
          }
        )

        return {
          needsClarification: true,
          questionId,
          question: 'Where would you like to search for files?',
          reason: 'multiple_file_providers'
        }
      }
    }

    return { needsClarification: false }
  }

  /**
   * Master function to check for any type of ambiguity
   */
  async checkForAmbiguity(
    userId: string,
    conversationId: string,
    message: string,
    intent: any,
    integrations: Integration[]
  ): Promise<ClarificationResult> {
    // Check by intent type
    if (intent.intent === 'productivity' && (message.toLowerCase().includes('notion') || intent.specifiedIntegration === 'notion')) {
      return this.checkNotionDatabases(userId, conversationId, integrations)
    }

    if (intent.intent === 'productivity' && (message.toLowerCase().includes('airtable') || intent.specifiedIntegration === 'airtable')) {
      return this.checkAirtableTables(userId, conversationId, integrations)
    }

    if (intent.intent === 'email' && intent.action === 'get_emails') {
      return this.checkEmailQuery(userId, conversationId, message, integrations)
    }

    if (intent.intent === 'file' && (intent.action === 'search_files' || intent.action === 'list_files')) {
      return this.checkFileQuery(userId, conversationId, message, integrations)
    }

    return { needsClarification: false }
  }

  /**
   * Process user's answer to a clarifying question
   */
  async processAnswer(
    conversationId: string,
    selectedOptionId: string
  ): Promise<{ intent: any, parameters: any }> {
    const pendingQuestion = conversationStateManager.getPendingQuestion(conversationId)

    if (!pendingQuestion) {
      throw new Error('No pending question found')
    }

    const selectedOption = pendingQuestion.options.find(opt => opt.id === selectedOptionId)

    if (!selectedOption) {
      throw new Error('Invalid option selected')
    }

    // Get stored context
    const provider = conversationStateManager.getState(conversationId, 'provider')
    const originalIntent = conversationStateManager.getState(conversationId, 'intent')

    // Build intent based on selection
    const intent = {
      intent: pendingQuestion.context.provider === 'notion' ? 'productivity' :
              pendingQuestion.context.provider === 'airtable' ? 'productivity' :
              pendingQuestion.context.action === 'get_emails' ? 'email' :
              pendingQuestion.context.action === 'search_files' ? 'file' :
              originalIntent,
      action: pendingQuestion.context.action,
      specifiedIntegration: provider,
      parameters: selectedOption.value
    }

    // Clear the pending question
    conversationStateManager.clearPendingQuestion(conversationId)

    return { intent, parameters: selectedOption.value }
  }
}

export const clarificationService = new ClarificationService()
