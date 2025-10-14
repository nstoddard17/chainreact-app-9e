import { providerRegistry } from '../../domains/integrations/use-cases/provider-registry'
import { actionRegistry } from '../../domains/workflows/use-cases/action-registry'
import { GmailAdapter } from '../providers/gmail-adapter'
import { DiscordAdapter } from '../providers/discord-adapter'
import { SlackAdapter } from '../providers/slack-adapter'
import { AirtableAdapter } from '../providers/airtable-adapter'
import { HubSpotAdapter } from '../providers/hubspot-adapter'
import { TrelloAdapter } from '../providers/trello-adapter'
import { NotionAdapter } from '../providers/notion-adapter'
import { TwitterAdapter } from '../providers/twitter-adapter'
import { FacebookAdapter } from '../providers/facebook-adapter'
import { GoogleCalendarAdapter } from '../providers/google-calendar-adapter'
import { GitHubAdapter } from '../providers/github-adapter'
import { GoogleDriveAdapter } from '../providers/google-drive-adapter'
import { GoogleSheetsAdapter } from '../providers/google-sheets-adapter'
import { GoogleDocsAdapter } from '../providers/google-docs-adapter'
import { MicrosoftTeamsAdapter } from '../providers/microsoft-teams-adapter'
import { MicrosoftOneDriveAdapter } from '../providers/microsoft-onedrive-adapter'
import { MicrosoftOutlookAdapter } from '../providers/microsoft-outlook-adapter'
import { StripeAdapter } from '../providers/stripe-adapter'
import { DropboxAdapter } from '../providers/dropbox-adapter'
import { MailchimpAdapter } from '../providers/mailchimp-adapter'
import { MicrosoftCalendarAdapter } from '../providers/microsoft-calendar-adapter'
import { ZoomAdapter } from '../providers/zoom-adapter'
import { SalesforceAdapter } from '../providers/salesforce-adapter'
import { healthMonitor } from '../health/provider-health-monitor'

import { logger } from '@/lib/utils/logger'

/**
 * Bootstrap all integration providers and actions
 * This should be called at application startup
 */
export function bootstrapProviders(): void {
  logger.debug('🚀 Bootstrapping integration providers...')

  // Register Gmail provider
  registerGmailProvider()

  // Register Discord provider
  registerDiscordProvider()

  // Register Slack provider
  registerSlackProvider()

  // Register Airtable provider
  registerAirtableProvider()

  // Register HubSpot provider
  registerHubSpotProvider()

  // Register Trello provider
  registerTrelloProvider()

  // Register Notion provider
  registerNotionProvider()

  // Register Twitter provider
  registerTwitterProvider()

  // Register Facebook provider
  registerFacebookProvider()

  // Register Google Calendar provider
  registerGoogleCalendarProvider()

  // Register GitHub provider
  registerGitHubProvider()

  // Register Google Drive provider
  registerGoogleDriveProvider()

  // Register Google Sheets provider
  registerGoogleSheetsProvider()

  // Register Google Docs provider
  registerGoogleDocsProvider()

  // Register Microsoft Teams provider
  registerMicrosoftTeamsProvider()

  // Register Microsoft OneDrive provider
  registerMicrosoftOneDriveProvider()

  // Register Microsoft Outlook provider
  registerMicrosoftOutlookProvider()

  // Register Stripe provider
  registerStripeProvider()

  // Register Dropbox provider
  registerDropboxProvider()

  // Register Mailchimp provider
  registerMailchimpProvider()

  // Register Microsoft Calendar provider
  registerMicrosoftCalendarProvider()

  // Register Zoom provider
  registerZoomProvider()

  // Register Salesforce provider
  registerSalesforceProvider()

  // Register other providers here
  // etc.

  logger.debug(`✅ Registered ${providerRegistry.listProviders().length} providers`)
  logger.debug(`✅ Registered ${actionRegistry.listActions().length} actions`)
  
  // Start health monitoring (5 minute intervals)
  if (process.env.NODE_ENV === 'production') {
    logger.debug('🏥 Starting provider health monitoring...')
    healthMonitor.startMonitoring()
  } else {
    logger.debug('🏥 Health monitoring disabled in development mode')
  }
}

function registerGmailProvider(): void {
  const gmailAdapter = new GmailAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    gmailAdapter,
    ['email'], // capability types
    { name: 'Gmail', version: '1.0.0' }
  )

  // Register Gmail actions
  actionRegistry.registerProvider('gmail', [
    {
      actionType: 'send_email',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('gmail')
        if (!provider) throw new Error('Gmail provider not available')
        
        return provider.sendMessage({
          to: [config.parameters.to],
          cc: config.parameters.cc ? [config.parameters.cc] : undefined,
          bcc: config.parameters.bcc ? [config.parameters.bcc] : undefined,
          subject: config.parameters.subject,
          body: config.parameters.body,
          attachments: config.parameters.attachments
        })
      },
      metadata: {
        name: 'Send Email',
        description: 'Send an email via Gmail',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'add_label',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('gmail')
        if (!provider) throw new Error('Gmail provider not available')
        
        return provider.manageLabels({
          type: 'add',
          messageIds: config.parameters.messageIds,
          labelIds: config.parameters.labelIds
        })
      },
      metadata: {
        name: 'Add Label',
        description: 'Add labels to Gmail messages',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'search_emails',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('gmail')
        if (!provider) throw new Error('Gmail provider not available')
        
        return provider.searchMessages({
          from: config.parameters.from,
          to: config.parameters.to,
          subject: config.parameters.subject,
          hasAttachment: config.parameters.hasAttachment,
          labelIds: config.parameters.labelIds,
          limit: config.parameters.limit || 50
        })
      },
      metadata: {
        name: 'Search Emails',
        description: 'Search Gmail messages',
        version: '1.0.0',
        category: 'email'
      }
    }
  ])

  logger.debug('✅ Gmail provider registered with email capabilities')
}

// Template for registering other providers
function registerSlackProvider(): void {
  const slackAdapter = new SlackAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    slackAdapter,
    ['chat'], // capability types
    { name: 'Slack', version: '1.0.0' }
  )

  // Register Slack actions
  actionRegistry.registerProvider('slack', [
    {
      actionType: 'send_message',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('slack')
        if (!provider) throw new Error('Slack provider not available')
        
        return provider.sendMessage({
          channel: config.parameters.channel,
          content: config.parameters.text || config.parameters.message || config.parameters.content,
          blocks: config.parameters.blocks,
          attachments: config.parameters.attachments,
          thread_ts: config.parameters.thread_ts,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Send Message',
        description: 'Send a message to Slack channel',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'create_channel',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('slack')
        if (!provider) throw new Error('Slack provider not available')
        
        return provider.createChannel({
          channelName: config.parameters.channelName,
          isPrivate: config.parameters.isPrivate || false,
          purpose: config.parameters.purpose,
          topic: config.parameters.topic,
          initialMembers: config.parameters.initialMembers || [],
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Channel',
        description: 'Create a new Slack channel',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'get_channels',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('slack')
        if (!provider) throw new Error('Slack provider not available')
        
        return provider.getChannels({
          limit: config.parameters.limit || 50,
          types: config.parameters.types,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Get Channels',
        description: 'Get Slack channels',
        version: '1.0.0',
        category: 'chat'
      }
    }
  ])

  logger.debug('✅ Slack provider registered with chat capabilities')
}

function registerDiscordProvider(): void {
  const discordAdapter = new DiscordAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    discordAdapter,
    ['chat'], // capability types
    { name: 'Discord', version: '1.0.0' }
  )

  // Register Discord actions
  actionRegistry.registerProvider('discord', [
    {
      actionType: 'send_message',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('discord')
        if (!provider) throw new Error('Discord provider not available')
        
        return provider.sendMessage({
          channelId: config.parameters.channelId,
          content: config.parameters.message || config.parameters.content,
          guildId: config.parameters.guildId,
          embed: config.parameters.embed,
          embedTitle: config.parameters.embedTitle,
          embedDescription: config.parameters.embedDescription,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Send Message',
        description: 'Send a message to Discord channel',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'create_channel',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('discord')
        if (!provider) throw new Error('Discord provider not available')
        
        return provider.createChannel({
          guildId: config.parameters.guildId,
          name: config.parameters.name,
          type: config.parameters.type || 0,
          topic: config.parameters.topic,
          parentId: config.parameters.parentId,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Channel',
        description: 'Create a new Discord channel',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'fetch_messages',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('discord')
        if (!provider) throw new Error('Discord provider not available')
        
        return provider.getMessages({
          channelId: config.parameters.channelId,
          limit: config.parameters.limit || 20,
          filterType: config.parameters.filterType,
          filterAuthor: config.parameters.filterAuthor,
          filterContent: config.parameters.filterContent,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Fetch Messages',
        description: 'Fetch messages from Discord channel',
        version: '1.0.0',
        category: 'chat'
      }
    }
  ])

  logger.debug('✅ Discord provider registered with chat capabilities')
}

function registerAirtableProvider(): void {
  const airtableAdapter = new AirtableAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    airtableAdapter,
    ['database'], // capability types
    { name: 'Airtable', version: '1.0.0' }
  )

  // Register Airtable actions
  actionRegistry.registerProvider('airtable', [
    {
      actionType: 'create_record',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('airtable')
        if (!provider) throw new Error('Airtable provider not available')
        
        return provider.createRecord({
          baseId: config.parameters.baseId,
          tableName: config.parameters.tableName,
          fields: config.parameters.fields,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Record',
        description: 'Create a record in Airtable',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'update_record',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('airtable')
        if (!provider) throw new Error('Airtable provider not available')
        
        return provider.updateRecord({
          baseId: config.parameters.baseId,
          tableName: config.parameters.tableName,
          id: config.parameters.recordId,
          fields: config.parameters.fields,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Update Record',
        description: 'Update a record in Airtable',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'list_records',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('airtable')
        if (!provider) throw new Error('Airtable provider not available')
        
        return provider.getRecords({
          baseId: config.parameters.baseId,
          tableName: config.parameters.tableName,
          maxRecords: config.parameters.maxRecords || 100,
          filterByFormula: config.parameters.filterByFormula,
          userId: context.userId
        })
      },
      metadata: {
        name: 'List Records',
        description: 'Get records from Airtable',
        version: '1.0.0',
        category: 'database'
      }
    }
  ])

  logger.debug('✅ Airtable provider registered with database capabilities')
}

function registerHubSpotProvider(): void {
  const hubspotAdapter = new HubSpotAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    hubspotAdapter,
    ['crm'], // capability types
    { name: 'HubSpot', version: '1.0.0' }
  )

  // Register HubSpot actions
  actionRegistry.registerProvider('hubspot', [
    {
      actionType: 'create_contact',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('hubspot')
        if (!provider) throw new Error('HubSpot provider not available')
        
        return provider.createContact({
          email: config.parameters.email,
          name: config.parameters.name,
          phone: config.parameters.phone,
          company: config.parameters.company,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Contact',
        description: 'Create a contact in HubSpot',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'create_deal',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('hubspot')
        if (!provider) throw new Error('HubSpot provider not available')
        
        return provider.createDeal({
          title: config.parameters.title,
          amount: config.parameters.amount,
          stage: config.parameters.stage,
          contactId: config.parameters.contactId,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Deal',
        description: 'Create a deal in HubSpot',
        version: '1.0.0',
        category: 'crm'
      }
    }
  ])

  logger.debug('✅ HubSpot provider registered with CRM capabilities')
}

function registerTrelloProvider(): void {
  const trelloAdapter = new TrelloAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    trelloAdapter,
    ['project'], // capability types
    { name: 'Trello', version: '1.0.0' }
  )

  // Register Trello actions
  actionRegistry.registerProvider('trello', [
    {
      actionType: 'create_list',
      handler: async (config, context) => {
        const provider = providerRegistry.getProjectProvider('trello')
        if (!provider) throw new Error('Trello provider not available')
        
        return provider.createTask({
          title: config.parameters.name,
          projectId: config.parameters.boardId,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create List',
        description: 'Create a list in Trello',
        version: '1.0.0',
        category: 'project'
      }
    },
    {
      actionType: 'create_card',
      handler: async (config, context) => {
        const provider = providerRegistry.getProjectProvider('trello')
        if (!provider) throw new Error('Trello provider not available')
        
        return provider.createTask({
          title: config.parameters.name,
          description: config.parameters.desc,
          projectId: config.parameters.listId,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Card',
        description: 'Create a card in Trello',
        version: '1.0.0',
        category: 'project'
      }
    }
  ])

  logger.debug('✅ Trello provider registered with project capabilities')
}

function registerNotionProvider(): void {
  const notionAdapter = new NotionAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    notionAdapter,
    ['database'], // capability types
    { name: 'Notion', version: '1.0.0' }
  )

  // Register Notion actions
  actionRegistry.registerProvider('notion', [
    {
      actionType: 'create_database',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('notion')
        if (!provider) throw new Error('Notion provider not available')
        
        return provider.createRecord({
          title: config.parameters.title,
          parentPageId: config.parameters.parentPageId,
          fields: config.parameters.properties,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Database',
        description: 'Create a database in Notion',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'create_page',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('notion')
        if (!provider) throw new Error('Notion provider not available')
        
        return provider.createRecord({
          baseId: config.parameters.databaseId,
          fields: config.parameters.properties,
          userId: context.userId
        })
      },
      metadata: {
        name: 'Create Page',
        description: 'Create a page in Notion',
        version: '1.0.0',
        category: 'database'
      }
    }
  ])

  logger.debug('✅ Notion provider registered with database capabilities')
}

function registerTwitterProvider(): void {
  const twitterAdapter = new TwitterAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    twitterAdapter,
    ['social'], // capability types
    { name: 'Twitter/X', version: '1.0.0' }
  )

  // Register Twitter actions
  actionRegistry.registerProvider('twitter', [
    {
      actionType: 'create_post',
      handler: async (config, context) => {
        const provider = providerRegistry.getSocialProvider('twitter')
        if (!provider) throw new Error('Twitter provider not available')
        
        return provider.createPost({
          content: config.parameters.content || config.parameters.text,
          mediaFiles: config.parameters.mediaFiles,
          hashtags: config.parameters.hashtags,
          mentions: config.parameters.mentions
        }, context.userId)
      },
      metadata: {
        name: 'Create Tweet',
        description: 'Post a tweet on Twitter/X',
        version: '1.0.0',
        category: 'social'
      }
    },
    {
      actionType: 'get_mentions',
      handler: async (config, context) => {
        const provider = providerRegistry.getSocialProvider('twitter')
        if (!provider) throw new Error('Twitter provider not available')
        
        return provider.getMentions({
          limit: config.parameters.limit || 20
        }, context.userId)
      },
      metadata: {
        name: 'Get Mentions',
        description: 'Get Twitter mentions',
        version: '1.0.0',
        category: 'social'
      }
    }
  ])

  logger.debug('✅ Twitter provider registered with social capabilities')
}

function registerFacebookProvider(): void {
  const facebookAdapter = new FacebookAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    facebookAdapter,
    ['social'], // capability types
    { name: 'Facebook', version: '1.0.0' }
  )

  // Register Facebook actions
  actionRegistry.registerProvider('facebook', [
    {
      actionType: 'create_post',
      handler: async (config, context) => {
        const provider = providerRegistry.getSocialProvider('facebook')
        if (!provider) throw new Error('Facebook provider not available')
        
        return provider.createPost({
          content: config.parameters.message || config.parameters.content,
          mediaFiles: config.parameters.mediaFiles,
          scheduledTime: config.parameters.scheduledPublishTime ? new Date(config.parameters.scheduledPublishTime) : undefined,
          metadata: {
            pageId: config.parameters.pageId
          }
        }, context.userId)
      },
      metadata: {
        name: 'Create Post',
        description: 'Create a post on Facebook',
        version: '1.0.0',
        category: 'social'
      }
    },
    {
      actionType: 'get_insights',
      handler: async (config, context) => {
        const provider = providerRegistry.getSocialProvider('facebook')
        if (!provider) throw new Error('Facebook provider not available')
        
        return provider.getInsights({
          metric: config.parameters.metric,
          period: config.parameters.period,
          periodCount: config.parameters.periodCount,
          metadata: {
            pageId: config.parameters.pageId
          }
        }, context.userId)
      },
      metadata: {
        name: 'Get Insights',
        description: 'Get Facebook page insights',
        version: '1.0.0',
        category: 'social'
      }
    },
    {
      actionType: 'send_message',
      handler: async (config, context) => {
        const provider = providerRegistry.getSocialProvider('facebook')
        if (!provider) throw new Error('Facebook provider not available')
        
        return provider.sendDirectMessage({
          recipientId: config.parameters.recipientId,
          content: config.parameters.message || config.parameters.content,
          metadata: {
            pageId: config.parameters.pageId
          }
        }, context.userId)
      },
      metadata: {
        name: 'Send Message',
        description: 'Send a direct message on Facebook',
        version: '1.0.0',
        category: 'social'
      }
    }
  ])

  logger.debug('✅ Facebook provider registered with social capabilities')
}

function registerGoogleCalendarProvider(): void {
  const calendarAdapter = new GoogleCalendarAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    calendarAdapter,
    ['calendar'], // capability types
    { name: 'Google Calendar', version: '1.0.0' }
  )

  // Register Google Calendar actions
  actionRegistry.registerProvider('google-calendar', [
    {
      actionType: 'create_event',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('google-calendar')
        if (!provider) throw new Error('Google Calendar provider not available')
        
        return provider.createEvent({
          title: config.parameters.title || config.parameters.summary,
          description: config.parameters.description,
          start: new Date(config.parameters.start || config.parameters.startDateTime),
          end: new Date(config.parameters.end || config.parameters.endDateTime)
        }, context.userId)
      },
      metadata: {
        name: 'Create Event',
        description: 'Create a calendar event in Google Calendar',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'get_events',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('google-calendar')
        if (!provider) throw new Error('Google Calendar provider not available')
        
        return provider.getEvents({
          calendarId: config.parameters.calendarId,
          limit: config.parameters.limit || 250,
          dateRange: config.parameters.startDate && config.parameters.endDate ? {
            start: new Date(config.parameters.startDate),
            end: new Date(config.parameters.endDate)
          } : undefined
        }, context.userId)
      },
      metadata: {
        name: 'Get Events',
        description: 'Get events from Google Calendar',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'get_calendars',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('google-calendar')
        if (!provider) throw new Error('Google Calendar provider not available')
        
        return provider.getCalendars(context.userId)
      },
      metadata: {
        name: 'Get Calendars',
        description: 'Get list of Google calendars',
        version: '1.0.0',
        category: 'calendar'
      }
    }
  ])

  logger.debug('✅ Google Calendar provider registered with calendar capabilities')
}

function registerGitHubProvider(): void {
  const githubAdapter = new GitHubAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    githubAdapter,
    ['devops'], // capability types
    { name: 'GitHub', version: '1.0.0' }
  )

  // Register GitHub actions
  actionRegistry.registerProvider('github', [
    {
      actionType: 'create_repository',
      handler: async (config, context) => {
        const provider = providerRegistry.getDevOpsProvider('github')
        if (!provider) throw new Error('GitHub provider not available')
        
        return provider.createRepository({
          name: config.parameters.name,
          description: config.parameters.description,
          private: config.parameters.private || true
        }, context.userId)
      },
      metadata: {
        name: 'Create Repository',
        description: 'Create a new GitHub repository',
        version: '1.0.0',
        category: 'devops'
      }
    },
    {
      actionType: 'create_issue',
      handler: async (config, context) => {
        const provider = providerRegistry.getDevOpsProvider('github')
        if (!provider) throw new Error('GitHub provider not available')
        
        return provider.createIssue({
          repository: config.parameters.repository,
          title: config.parameters.title,
          body: config.parameters.body,
          labels: config.parameters.labels || [],
          assignees: config.parameters.assignees || [],
          milestone: config.parameters.milestone
        }, context.userId)
      },
      metadata: {
        name: 'Create Issue',
        description: 'Create a new GitHub issue',
        version: '1.0.0',
        category: 'devops'
      }
    },
    {
      actionType: 'create_pull_request',
      handler: async (config, context) => {
        const provider = providerRegistry.getDevOpsProvider('github')
        if (!provider) throw new Error('GitHub provider not available')
        
        return provider.createPullRequest({
          repository: config.parameters.repository,
          title: config.parameters.title,
          body: config.parameters.body,
          head: config.parameters.head,
          base: config.parameters.base || 'main',
          draft: config.parameters.draft || false
        }, context.userId)
      },
      metadata: {
        name: 'Create Pull Request',
        description: 'Create a new GitHub pull request',
        version: '1.0.0',
        category: 'devops'
      }
    },
    {
      actionType: 'get_repositories',
      handler: async (config, context) => {
        const provider = providerRegistry.getDevOpsProvider('github')
        if (!provider) throw new Error('GitHub provider not available')
        
        return provider.getRepositories({
          private: config.parameters.private,
          limit: config.parameters.limit || 30
        }, context.userId)
      },
      metadata: {
        name: 'Get Repositories',
        description: 'Get list of GitHub repositories',
        version: '1.0.0',
        category: 'devops'
      }
    },
    {
      actionType: 'get_issues',
      handler: async (config, context) => {
        const provider = providerRegistry.getDevOpsProvider('github')
        if (!provider) throw new Error('GitHub provider not available')
        
        return provider.getIssues({
          repository: config.parameters.repository,
          state: config.parameters.state || 'open',
          labels: config.parameters.labels,
          assignee: config.parameters.assignee,
          limit: config.parameters.limit || 30
        }, context.userId)
      },
      metadata: {
        name: 'Get Issues',
        description: 'Get list of GitHub issues',
        version: '1.0.0',
        category: 'devops'
      }
    }
  ])

  logger.debug('✅ GitHub provider registered with DevOps capabilities')
}

function registerGoogleDriveProvider(): void {
  const driveAdapter = new GoogleDriveAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    driveAdapter,
    ['file'], // capability types
    { name: 'Google Drive', version: '1.0.0' }
  )

  // Register Google Drive actions
  actionRegistry.registerProvider('google-drive', [
    {
      actionType: 'upload_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('google-drive')
        if (!provider) throw new Error('Google Drive provider not available')
        
        return provider.uploadFile({
          filename: config.parameters.filename || config.parameters.name,
          content: Buffer.from(config.parameters.content || config.parameters.data, 'base64'),
          folderId: config.parameters.folderId || config.parameters.parentId
        }, context.userId)
      },
      metadata: {
        name: 'Upload File',
        description: 'Upload a file to Google Drive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'download_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('google-drive')
        if (!provider) throw new Error('Google Drive provider not available')
        
        return provider.downloadFile(config.parameters.fileId, context.userId)
      },
      metadata: {
        name: 'Download File',
        description: 'Download a file from Google Drive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'list_files',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('google-drive')
        if (!provider) throw new Error('Google Drive provider not available')
        
        return provider.listFiles({
          folderId: config.parameters.folderId,
          name: config.parameters.name || config.parameters.searchTerm,
          limit: config.parameters.limit || 100
        }, context.userId)
      },
      metadata: {
        name: 'List Files',
        description: 'List files in Google Drive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'create_folder',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('google-drive')
        if (!provider) throw new Error('Google Drive provider not available')
        
        return provider.createFolder({
          name: config.parameters.name || config.parameters.folderName,
          parentId: config.parameters.parentId || config.parameters.folderId
        }, context.userId)
      },
      metadata: {
        name: 'Create Folder',
        description: 'Create a folder in Google Drive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'share_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('google-drive')
        if (!provider) throw new Error('Google Drive provider not available')
        
        return provider.shareFile(
          config.parameters.fileId,
          {
            type: config.parameters.permission || config.parameters.type || 'read',
            users: config.parameters.emails || config.parameters.users || [],
            public: config.parameters.public || false
          },
          context.userId
        )
      },
      metadata: {
        name: 'Share File',
        description: 'Share a file in Google Drive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'delete_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('google-drive')
        if (!provider) throw new Error('Google Drive provider not available')
        
        await provider.deleteFile(config.parameters.fileId, context.userId)
        
        return {
          success: true,
          output: { fileId: config.parameters.fileId },
          message: 'File deleted successfully from Google Drive'
        }
      },
      metadata: {
        name: 'Delete File',
        description: 'Delete a file from Google Drive',
        version: '1.0.0',
        category: 'file'
      }
    }
  ])

  logger.debug('✅ Google Drive provider registered with file capabilities')
}

function registerGoogleSheetsProvider(): void {
  const sheetsAdapter = new GoogleSheetsAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    sheetsAdapter,
    ['database'], // capability types
    { name: 'Google Sheets', version: '1.0.0' }
  )

  // Register Google Sheets actions
  actionRegistry.registerProvider('google-sheets', [
    {
      actionType: 'create_record',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('google-sheets')
        if (!provider) throw new Error('Google Sheets provider not available')
        
        return provider.createRecord({
          baseId: config.parameters.spreadsheetId || config.parameters.baseId,
          tableName: config.parameters.sheetName || config.parameters.tableName || 'Sheet1',
          fields: config.parameters.values || config.parameters.fields || config.parameters.data,
          userId: context.userId
        }, context.userId)
      },
      metadata: {
        name: 'Add Row',
        description: 'Add a new row to Google Sheets',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'update_record',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('google-sheets')
        if (!provider) throw new Error('Google Sheets provider not available')
        
        return provider.updateRecord({
          baseId: config.parameters.spreadsheetId || config.parameters.baseId,
          tableName: config.parameters.sheetName || config.parameters.tableName || 'Sheet1',
          id: config.parameters.rowNumber || config.parameters.range || config.parameters.id,
          fields: config.parameters.values || config.parameters.fields || config.parameters.data,
          userId: context.userId
        }, context.userId)
      },
      metadata: {
        name: 'Update Row',
        description: 'Update a row in Google Sheets',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'get_records',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('google-sheets')
        if (!provider) throw new Error('Google Sheets provider not available')
        
        return provider.getRecords({
          baseId: config.parameters.spreadsheetId || config.parameters.baseId,
          tableName: config.parameters.sheetName || config.parameters.tableName || 'Sheet1',
          maxRecords: config.parameters.maxRecords || config.parameters.limit || 100
        }, context.userId)
      },
      metadata: {
        name: 'Get Rows',
        description: 'Get rows from Google Sheets',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'search_records',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('google-sheets')
        if (!provider) throw new Error('Google Sheets provider not available')
        
        return provider.searchRecords({
          baseId: config.parameters.spreadsheetId || config.parameters.baseId,
          tableName: config.parameters.sheetName || config.parameters.tableName || 'Sheet1',
          filter: config.parameters.searchTerm || config.parameters.filter,
          limit: config.parameters.limit || 50
        }, context.userId)
      },
      metadata: {
        name: 'Search Rows',
        description: 'Search rows in Google Sheets',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'get_sheets',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('google-sheets')
        if (!provider) throw new Error('Google Sheets provider not available')
        
        return provider.getTables({
          baseId: config.parameters.spreadsheetId || config.parameters.baseId
        }, context.userId)
      },
      metadata: {
        name: 'Get Sheets',
        description: 'Get all sheets in a Google Spreadsheet',
        version: '1.0.0',
        category: 'database'
      }
    },
    {
      actionType: 'delete_record',
      handler: async (config, context) => {
        const provider = providerRegistry.getDatabaseProvider('google-sheets')
        if (!provider) throw new Error('Google Sheets provider not available')
        
        return provider.deleteRecord({
          baseId: config.parameters.spreadsheetId || config.parameters.baseId,
          tableName: config.parameters.sheetName || config.parameters.tableName || 'Sheet1',
          id: config.parameters.rowNumber || config.parameters.id,
          fields: {},
          userId: context.userId
        }, context.userId)
      },
      metadata: {
        name: 'Delete Row',
        description: 'Delete a row from Google Sheets',
        version: '1.0.0',
        category: 'database'
      }
    }
  ])

  logger.debug('✅ Google Sheets provider registered with database capabilities')
}

function registerGoogleDocsProvider(): void {
  const docsAdapter = new GoogleDocsAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    docsAdapter,
    ['document'], // capability types
    { name: 'Google Docs', version: '1.0.0' }
  )

  // Register Google Docs actions
  actionRegistry.registerProvider('google-docs', [
    {
      actionType: 'create_document',
      handler: async (config, context) => {
        const provider = providerRegistry.getDocumentProvider('google-docs')
        if (!provider) throw new Error('Google Docs provider not available')
        
        return provider.createDocument({
          title: config.parameters.title || config.parameters.name,
          content: config.parameters.content || config.parameters.text,
          parentId: config.parameters.parentId || config.parameters.folderId
        }, context.userId)
      },
      metadata: {
        name: 'Create Document',
        description: 'Create a new Google Doc',
        version: '1.0.0',
        category: 'document'
      }
    },
    {
      actionType: 'update_document',
      handler: async (config, context) => {
        const provider = providerRegistry.getDocumentProvider('google-docs')
        if (!provider) throw new Error('Google Docs provider not available')
        
        const updates: any = {}
        
        if (config.parameters.title) updates.title = config.parameters.title
        if (config.parameters.content) updates.content = config.parameters.content
        if (config.parameters.appendContent) updates.appendContent = config.parameters.appendContent
        if (config.parameters.insertText && config.parameters.insertIndex !== undefined) {
          updates.insertContent = {
            index: config.parameters.insertIndex,
            text: config.parameters.insertText
          }
        }
        if (config.parameters.searchText && config.parameters.replaceText) {
          updates.replaceContent = {
            searchText: config.parameters.searchText,
            replaceText: config.parameters.replaceText
          }
        }
        
        return provider.updateDocument(config.parameters.documentId, updates, context.userId)
      },
      metadata: {
        name: 'Update Document',
        description: 'Update a Google Doc',
        version: '1.0.0',
        category: 'document'
      }
    },
    {
      actionType: 'get_document',
      handler: async (config, context) => {
        const provider = providerRegistry.getDocumentProvider('google-docs')
        if (!provider) throw new Error('Google Docs provider not available')
        
        return provider.getDocument(config.parameters.documentId, context.userId)
      },
      metadata: {
        name: 'Get Document',
        description: 'Get a Google Doc content and metadata',
        version: '1.0.0',
        category: 'document'
      }
    },
    {
      actionType: 'list_documents',
      handler: async (config, context) => {
        const provider = providerRegistry.getDocumentProvider('google-docs')
        if (!provider) throw new Error('Google Docs provider not available')
        
        return provider.getDocuments({
          title: config.parameters.title || config.parameters.searchTerm,
          parentId: config.parameters.parentId || config.parameters.folderId,
          limit: config.parameters.limit || 50
        }, context.userId)
      },
      metadata: {
        name: 'List Documents',
        description: 'List Google Docs',
        version: '1.0.0',
        category: 'document'
      }
    },
    {
      actionType: 'share_document',
      handler: async (config, context) => {
        const provider = providerRegistry.getDocumentProvider('google-docs')
        if (!provider) throw new Error('Google Docs provider not available')
        
        return provider.shareDocument(
          config.parameters.documentId,
          {
            type: config.parameters.permission || config.parameters.type || 'read',
            users: config.parameters.emails || config.parameters.users || [],
            public: config.parameters.public || false
          },
          context.userId
        )
      },
      metadata: {
        name: 'Share Document',
        description: 'Share a Google Doc',
        version: '1.0.0',
        category: 'document'
      }
    },
    {
      actionType: 'export_document',
      handler: async (config, context) => {
        const provider = providerRegistry.getDocumentProvider('google-docs')
        if (!provider) throw new Error('Google Docs provider not available')
        
        return provider.exportDocument(
          config.parameters.documentId,
          {
            type: config.parameters.format || config.parameters.exportFormat || 'pdf'
          },
          context.userId
        )
      },
      metadata: {
        name: 'Export Document',
        description: 'Export a Google Doc to various formats',
        version: '1.0.0',
        category: 'document'
      }
    },
    {
      actionType: 'delete_document',
      handler: async (config, context) => {
        const provider = providerRegistry.getDocumentProvider('google-docs')
        if (!provider) throw new Error('Google Docs provider not available')
        
        await provider.deleteDocument(config.parameters.documentId, context.userId)
        
        return {
          success: true,
          output: { documentId: config.parameters.documentId },
          message: 'Document deleted successfully from Google Drive'
        }
      },
      metadata: {
        name: 'Delete Document',
        description: 'Delete a Google Doc',
        version: '1.0.0',
        category: 'document'
      }
    }
  ])

  logger.debug('✅ Google Docs provider registered with document capabilities')
}

function registerMicrosoftTeamsProvider(): void {
  const teamsAdapter = new MicrosoftTeamsAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    teamsAdapter,
    ['chat'], // capability types
    { name: 'Microsoft Teams', version: '1.0.0' }
  )

  // Register Microsoft Teams actions
  actionRegistry.registerProvider('microsoft-teams', [
    {
      actionType: 'send_message',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('microsoft-teams')
        if (!provider) throw new Error('Microsoft Teams provider not available')
        
        return provider.sendMessage({
          channelId: config.parameters.channelId,
          content: config.parameters.content || config.parameters.message || config.parameters.text,
          mentions: config.parameters.mentions,
          attachments: config.parameters.attachments
        }, context.userId)
      },
      metadata: {
        name: 'Send Message',
        description: 'Send a message to a Microsoft Teams channel',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'create_channel',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('microsoft-teams')
        if (!provider) throw new Error('Microsoft Teams provider not available')
        
        return provider.createChannel({
          name: config.parameters.name,
          description: config.parameters.description,
          private: config.parameters.private || false,
          metadata: {
            teamId: config.parameters.teamId
          }
        }, context.userId)
      },
      metadata: {
        name: 'Create Channel',
        description: 'Create a new channel in Microsoft Teams',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'get_channels',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('microsoft-teams')
        if (!provider) throw new Error('Microsoft Teams provider not available')
        
        return provider.getChannels({
          name: config.parameters.name,
          private: config.parameters.private,
          limit: config.parameters.limit || 50
        }, context.userId)
      },
      metadata: {
        name: 'Get Channels',
        description: 'Get list of Microsoft Teams channels',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'manage_members',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('microsoft-teams')
        if (!provider) throw new Error('Microsoft Teams provider not available')
        
        return provider.manageMembers({
          type: config.parameters.operation || config.parameters.type,
          channelId: config.parameters.channelId,
          memberIds: config.parameters.memberIds || [config.parameters.memberId],
          permissions: config.parameters.permissions
        }, context.userId)
      },
      metadata: {
        name: 'Manage Members',
        description: 'Add, remove, or update members in Microsoft Teams',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'get_members',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('microsoft-teams')
        if (!provider) throw new Error('Microsoft Teams provider not available')
        
        return provider.getMembers(config.parameters.channelId, context.userId)
      },
      metadata: {
        name: 'Get Members',
        description: 'Get list of members in a Microsoft Teams channel',
        version: '1.0.0',
        category: 'chat'
      }
    }
  ])

  logger.debug('✅ Microsoft Teams provider registered with chat capabilities')
}

function registerMicrosoftOneDriveProvider(): void {
  const oneDriveAdapter = new MicrosoftOneDriveAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    oneDriveAdapter,
    ['file'], // capability types
    { name: 'Microsoft OneDrive', version: '1.0.0' }
  )

  // Register Microsoft OneDrive actions
  actionRegistry.registerProvider('microsoft-onedrive', [
    {
      actionType: 'upload_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        return provider.uploadFile({
          filename: config.parameters.filename || config.parameters.name,
          content: config.parameters.content,
          folderId: config.parameters.folderId || config.parameters.parentId
        }, context.userId)
      },
      metadata: {
        name: 'Upload File',
        description: 'Upload a file to Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'download_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        return provider.downloadFile(config.parameters.fileId, context.userId)
      },
      metadata: {
        name: 'Download File',
        description: 'Download a file from Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'list_files',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        return provider.listFiles({
          folderId: config.parameters.folderId || config.parameters.parentId,
          name: config.parameters.name,
          limit: config.parameters.limit || 100
        }, context.userId)
      },
      metadata: {
        name: 'List Files',
        description: 'List files in Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'create_folder',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        return provider.createFolder({
          name: config.parameters.name,
          parentId: config.parameters.parentId || config.parameters.folderId
        }, context.userId)
      },
      metadata: {
        name: 'Create Folder',
        description: 'Create a new folder in Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'share_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        return provider.shareFile(
          config.parameters.fileId,
          {
            type: config.parameters.type || config.parameters.permissions || 'read',
            public: config.parameters.public || false,
            users: config.parameters.users || config.parameters.emails
          },
          context.userId
        )
      },
      metadata: {
        name: 'Share File',
        description: 'Share a file in Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'search_files',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        return provider.searchFiles(
          config.parameters.query || config.parameters.search,
          context.userId
        )
      },
      metadata: {
        name: 'Search Files',
        description: 'Search files in Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'move_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        return provider.moveFile(
          config.parameters.fileId,
          config.parameters.destinationFolderId || config.parameters.parentId,
          context.userId
        )
      },
      metadata: {
        name: 'Move File',
        description: 'Move a file in Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'delete_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('microsoft-onedrive')
        if (!provider) throw new Error('Microsoft OneDrive provider not available')
        
        await provider.deleteFile(config.parameters.fileId, context.userId)
        
        return {
          success: true,
          output: { fileId: config.parameters.fileId },
          message: 'File deleted successfully from Microsoft OneDrive'
        }
      },
      metadata: {
        name: 'Delete File',
        description: 'Delete a file from Microsoft OneDrive',
        version: '1.0.0',
        category: 'file'
      }
    }
  ])

  logger.debug('✅ Microsoft OneDrive provider registered with file capabilities')
}

function registerMicrosoftOutlookProvider(): void {
  const outlookAdapter = new MicrosoftOutlookAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    outlookAdapter,
    ['email'], // capability types
    { name: 'Microsoft Outlook', version: '1.0.0' }
  )

  // Register Microsoft Outlook actions
  actionRegistry.registerProvider('microsoft-outlook', [
    {
      actionType: 'send_email',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('microsoft-outlook')
        if (!provider) throw new Error('Microsoft Outlook provider not available')
        
        return provider.sendMessage({
          to: Array.isArray(config.parameters.to) ? config.parameters.to : [config.parameters.to],
          cc: config.parameters.cc ? (Array.isArray(config.parameters.cc) ? config.parameters.cc : [config.parameters.cc]) : undefined,
          bcc: config.parameters.bcc ? (Array.isArray(config.parameters.bcc) ? config.parameters.bcc : [config.parameters.bcc]) : undefined,
          subject: config.parameters.subject,
          body: config.parameters.body || config.parameters.content || config.parameters.message,
          attachments: config.parameters.attachments
        }, context.userId)
      },
      metadata: {
        name: 'Send Email',
        description: 'Send an email via Microsoft Outlook',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'search_messages',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('microsoft-outlook')
        if (!provider) throw new Error('Microsoft Outlook provider not available')
        
        return provider.searchMessages({
          from: config.parameters.from,
          to: config.parameters.to,
          subject: config.parameters.subject,
          hasAttachment: config.parameters.hasAttachment,
          dateRange: config.parameters.startDate && config.parameters.endDate ? {
            start: new Date(config.parameters.startDate),
            end: new Date(config.parameters.endDate)
          } : undefined,
          limit: config.parameters.limit || 50
        }, context.userId)
      },
      metadata: {
        name: 'Search Messages',
        description: 'Search emails in Microsoft Outlook',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'get_messages',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('microsoft-outlook')
        if (!provider) throw new Error('Microsoft Outlook provider not available')
        
        return provider.getMessages({
          labelIds: config.parameters.labelIds || config.parameters.folderIds,
          limit: config.parameters.limit || 50,
          includeSpam: config.parameters.includeSpam || false
        }, context.userId)
      },
      metadata: {
        name: 'Get Messages',
        description: 'Get emails from Microsoft Outlook',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'manage_labels',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('microsoft-outlook')
        if (!provider) throw new Error('Microsoft Outlook provider not available')
        
        return provider.manageLabels({
          type: config.parameters.operation || config.parameters.type,
          messageIds: config.parameters.messageIds,
          labelIds: config.parameters.labelIds || config.parameters.folderIds,
          labelName: config.parameters.labelName || config.parameters.folderName
        }, context.userId)
      },
      metadata: {
        name: 'Manage Labels',
        description: 'Manage folders/labels in Microsoft Outlook',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'get_contacts',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('microsoft-outlook')
        if (!provider) throw new Error('Microsoft Outlook provider not available')
        
        return provider.getContacts({
          name: config.parameters.name,
          email: config.parameters.email,
          limit: config.parameters.limit || 100
        }, context.userId)
      },
      metadata: {
        name: 'Get Contacts',
        description: 'Get contacts from Microsoft Outlook',
        version: '1.0.0',
        category: 'email'
      }
    }
  ])

  logger.debug('✅ Microsoft Outlook provider registered with email capabilities')
}

function registerStripeProvider(): void {
  const stripeAdapter = new StripeAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    stripeAdapter,
    ['payment'], // capability types
    { name: 'Stripe', version: '1.0.0' }
  )

  // Register Stripe actions
  actionRegistry.registerProvider('stripe', [
    {
      actionType: 'create_payment',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.createPayment({
          amount: config.parameters.amount,
          currency: config.parameters.currency || 'usd',
          customerId: config.parameters.customerId || config.parameters.customer,
          description: config.parameters.description,
          paymentMethodId: config.parameters.paymentMethodId || config.parameters.payment_method,
          confirmationMethod: config.parameters.confirmationMethod || 'automatic',
          metadata: config.parameters.metadata
        }, context.userId)
      },
      metadata: {
        name: 'Create Payment',
        description: 'Create a payment intent with Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'refund_payment',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.refundPayment(
          config.parameters.paymentId || config.parameters.payment_intent,
          config.parameters.amount,
          context.userId
        )
      },
      metadata: {
        name: 'Refund Payment',
        description: 'Refund a payment in Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'get_payment',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.getPayment(config.parameters.paymentId, context.userId)
      },
      metadata: {
        name: 'Get Payment',
        description: 'Get payment details from Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'get_payments',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.getPayments({
          customerId: config.parameters.customerId || config.parameters.customer,
          status: config.parameters.status,
          currency: config.parameters.currency,
          dateRange: config.parameters.startDate && config.parameters.endDate ? {
            start: new Date(config.parameters.startDate),
            end: new Date(config.parameters.endDate)
          } : undefined,
          limit: config.parameters.limit || 10
        }, context.userId)
      },
      metadata: {
        name: 'Get Payments',
        description: 'Get list of payments from Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'create_customer',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.createCustomer({
          email: config.parameters.email,
          name: config.parameters.name,
          description: config.parameters.description,
          phone: config.parameters.phone,
          address: config.parameters.address,
          metadata: config.parameters.metadata
        }, context.userId)
      },
      metadata: {
        name: 'Create Customer',
        description: 'Create a new customer in Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'update_customer',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.updateCustomer(
          config.parameters.customerId,
          {
            email: config.parameters.email,
            name: config.parameters.name,
            description: config.parameters.description,
            phone: config.parameters.phone,
            metadata: config.parameters.metadata
          },
          context.userId
        )
      },
      metadata: {
        name: 'Update Customer',
        description: 'Update an existing customer in Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'get_customer',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.getCustomer(config.parameters.customerId, context.userId)
      },
      metadata: {
        name: 'Get Customer',
        description: 'Get customer details from Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'create_subscription',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.createSubscription({
          customerId: config.parameters.customerId,
          priceId: config.parameters.priceId,
          items: config.parameters.items,
          trialPeriodDays: config.parameters.trialPeriodDays,
          metadata: config.parameters.metadata
        }, context.userId)
      },
      metadata: {
        name: 'Create Subscription',
        description: 'Create a new subscription in Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'cancel_subscription',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.cancelSubscription(config.parameters.subscriptionId, context.userId)
      },
      metadata: {
        name: 'Cancel Subscription',
        description: 'Cancel a subscription in Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'get_subscriptions',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.getSubscriptions({
          customerId: config.parameters.customerId,
          status: config.parameters.status,
          priceId: config.parameters.priceId,
          limit: config.parameters.limit || 10
        }, context.userId)
      },
      metadata: {
        name: 'Get Subscriptions',
        description: 'Get list of subscriptions from Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'create_invoice',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.createInvoice({
          customerId: config.parameters.customerId,
          description: config.parameters.description,
          dueDate: config.parameters.dueDate ? new Date(config.parameters.dueDate) : undefined,
          metadata: config.parameters.metadata
        }, context.userId)
      },
      metadata: {
        name: 'Create Invoice',
        description: 'Create a new invoice in Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    },
    {
      actionType: 'get_invoices',
      handler: async (config, context) => {
        const provider = providerRegistry.getPaymentProvider('stripe')
        if (!provider) throw new Error('Stripe provider not available')
        
        return provider.getInvoices({
          customerId: config.parameters.customerId,
          status: config.parameters.status,
          dateRange: config.parameters.startDate && config.parameters.endDate ? {
            start: new Date(config.parameters.startDate),
            end: new Date(config.parameters.endDate)
          } : undefined,
          limit: config.parameters.limit || 10
        }, context.userId)
      },
      metadata: {
        name: 'Get Invoices',
        description: 'Get list of invoices from Stripe',
        version: '1.0.0',
        category: 'payment'
      }
    }
  ])

  logger.debug('✅ Stripe provider registered with payment capabilities')
}

function registerDropboxProvider(): void {
  const dropboxAdapter = new DropboxAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    dropboxAdapter,
    ['file'], // capability types
    { name: 'Dropbox', version: '1.0.0' }
  )

  // Register Dropbox actions
  actionRegistry.registerProvider('dropbox', [
    {
      actionType: 'upload_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('dropbox')
        if (!provider) throw new Error('Dropbox provider not available')
        
        return provider.uploadFile({
          filename: config.parameters.filename || config.parameters.name,
          content: Buffer.from(config.parameters.content || '', 'base64'),
          folderId: config.parameters.folderId || config.parameters.folder
        }, context.userId)
      },
      metadata: {
        name: 'Upload File',
        description: 'Upload a file to Dropbox',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'download_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('dropbox')
        if (!provider) throw new Error('Dropbox provider not available')
        
        return provider.downloadFile(
          config.parameters.fileId || config.parameters.path,
          context.userId
        )
      },
      metadata: {
        name: 'Download File',
        description: 'Download a file from Dropbox',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'list_files',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('dropbox')
        if (!provider) throw new Error('Dropbox provider not available')
        
        return provider.listFiles({
          folderId: config.parameters.folderId || config.parameters.folder,
          name: config.parameters.name || config.parameters.query,
          limit: config.parameters.limit || 100
        }, context.userId)
      },
      metadata: {
        name: 'List Files',
        description: 'List files in Dropbox',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'create_folder',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('dropbox')
        if (!provider) throw new Error('Dropbox provider not available')
        
        return provider.createFolder({
          name: config.parameters.name,
          parentId: config.parameters.parentId || config.parameters.parent
        }, context.userId)
      },
      metadata: {
        name: 'Create Folder',
        description: 'Create a folder in Dropbox',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'share_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('dropbox')
        if (!provider) throw new Error('Dropbox provider not available')
        
        return provider.shareFile(
          config.parameters.fileId || config.parameters.path,
          {
            type: config.parameters.permission || 'read',
            public: config.parameters.public !== false,
            users: config.parameters.users
          },
          context.userId
        )
      },
      metadata: {
        name: 'Share File',
        description: 'Share a file from Dropbox',
        version: '1.0.0',
        category: 'file'
      }
    },
    {
      actionType: 'delete_file',
      handler: async (config, context) => {
        const provider = providerRegistry.getFileProvider('dropbox')
        if (!provider) throw new Error('Dropbox provider not available')
        
        return provider.deleteFile(
          config.parameters.fileId || config.parameters.path,
          context.userId
        )
      },
      metadata: {
        name: 'Delete File',
        description: 'Delete a file from Dropbox',
        version: '1.0.0',
        category: 'file'
      }
    }
  ])

  logger.debug('✅ Dropbox provider registered with file capabilities')
}

function registerMailchimpProvider(): void {
  const mailchimpAdapter = new MailchimpAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    mailchimpAdapter,
    ['email'], // capability types
    { name: 'Mailchimp', version: '1.0.0' }
  )

  // Register Mailchimp actions
  actionRegistry.registerProvider('mailchimp', [
    {
      actionType: 'send_campaign',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('mailchimp')
        if (!provider) throw new Error('Mailchimp provider not available')
        
        return provider.sendMessage({
          to: [], // Mailchimp campaigns go to lists
          subject: config.parameters.subject || config.parameters.subjectLine,
          body: config.parameters.body || config.parameters.html || config.parameters.content,
          metadata: {
            listId: config.parameters.listId,
            campaignType: config.parameters.campaignType || 'regular'
          }
        }, context.userId)
      },
      metadata: {
        name: 'Send Campaign',
        description: 'Send an email campaign via Mailchimp',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'get_campaigns',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('mailchimp')
        if (!provider) throw new Error('Mailchimp provider not available')
        
        return provider.searchMessages({
          subject: config.parameters.subject,
          limit: config.parameters.limit || 25,
          dateRange: config.parameters.startDate && config.parameters.endDate ? {
            start: new Date(config.parameters.startDate),
            end: new Date(config.parameters.endDate)
          } : undefined
        }, context.userId)
      },
      metadata: {
        name: 'Get Campaigns',
        description: 'Get email campaigns from Mailchimp',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'create_list',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('mailchimp')
        if (!provider) throw new Error('Mailchimp provider not available')
        
        return provider.manageLabels({
          type: 'create',
          labelName: config.parameters.name || config.parameters.listName
        }, context.userId)
      },
      metadata: {
        name: 'Create List',
        description: 'Create a mailing list in Mailchimp',
        version: '1.0.0',
        category: 'email'
      }
    },
    {
      actionType: 'get_subscribers',
      handler: async (config, context) => {
        const provider = providerRegistry.getEmailProvider('mailchimp')
        if (!provider) throw new Error('Mailchimp provider not available')
        
        return provider.getContacts({
          email: config.parameters.email,
          name: config.parameters.name,
          limit: config.parameters.limit || 100
        }, context.userId)
      },
      metadata: {
        name: 'Get Subscribers',
        description: 'Get subscribers from Mailchimp',
        version: '1.0.0',
        category: 'email'
      }
    }
  ])

  logger.debug('✅ Mailchimp provider registered with email capabilities')
}

function registerMicrosoftCalendarProvider(): void {
  const microsoftCalendarAdapter = new MicrosoftCalendarAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    microsoftCalendarAdapter,
    ['calendar'], // capability types
    { name: 'Microsoft Calendar', version: '1.0.0' }
  )

  // Register Microsoft Calendar actions
  actionRegistry.registerProvider('microsoft-calendar', [
    {
      actionType: 'create_event',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('microsoft-calendar')
        if (!provider) throw new Error('Microsoft Calendar provider not available')
        
        return provider.createEvent({
          title: config.parameters.title || config.parameters.subject || config.parameters.summary,
          description: config.parameters.description || config.parameters.body,
          start: new Date(config.parameters.start || config.parameters.startDateTime || config.parameters.startTime),
          end: new Date(config.parameters.end || config.parameters.endDateTime || config.parameters.endTime)
        }, context.userId)
      },
      metadata: {
        name: 'Create Event',
        description: 'Create a calendar event in Microsoft Calendar',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'update_event',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('microsoft-calendar')
        if (!provider) throw new Error('Microsoft Calendar provider not available')
        
        const updates: any = {}
        if (config.parameters.title || config.parameters.subject) {
          updates.title = config.parameters.title || config.parameters.subject
        }
        if (config.parameters.description || config.parameters.body) {
          updates.description = config.parameters.description || config.parameters.body
        }
        if (config.parameters.start || config.parameters.startDateTime) {
          updates.start = new Date(config.parameters.start || config.parameters.startDateTime)
        }
        if (config.parameters.end || config.parameters.endDateTime) {
          updates.end = new Date(config.parameters.end || config.parameters.endDateTime)
        }
        
        return provider.updateEvent(
          config.parameters.eventId,
          updates,
          context.userId
        )
      },
      metadata: {
        name: 'Update Event',
        description: 'Update a calendar event in Microsoft Calendar',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'delete_event',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('microsoft-calendar')
        if (!provider) throw new Error('Microsoft Calendar provider not available')
        
        await provider.deleteEvent(config.parameters.eventId, context.userId)
        
        return {
          success: true,
          output: { eventId: config.parameters.eventId },
          message: 'Event deleted successfully from Microsoft Calendar'
        }
      },
      metadata: {
        name: 'Delete Event',
        description: 'Delete a calendar event from Microsoft Calendar',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'get_events',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('microsoft-calendar')
        if (!provider) throw new Error('Microsoft Calendar provider not available')
        
        return provider.getEvents({
          calendarId: config.parameters.calendarId,
          limit: config.parameters.limit || 50,
          dateRange: config.parameters.startDate && config.parameters.endDate ? {
            start: new Date(config.parameters.startDate),
            end: new Date(config.parameters.endDate)
          } : undefined
        }, context.userId)
      },
      metadata: {
        name: 'Get Events',
        description: 'Get events from Microsoft Calendar',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'get_calendars',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('microsoft-calendar')
        if (!provider) throw new Error('Microsoft Calendar provider not available')
        
        return provider.getCalendars(context.userId)
      },
      metadata: {
        name: 'Get Calendars',
        description: 'Get all calendars from Microsoft Calendar',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'find_meeting_times',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('microsoft-calendar') as any
        if (!provider) throw new Error('Microsoft Calendar provider not available')
        
        return provider.findMeetingTimes(
          config.parameters.attendees || [],
          config.parameters.duration || 60,
          config.parameters.maxCandidates || 20,
          context.userId
        )
      },
      metadata: {
        name: 'Find Meeting Times',
        description: 'Find available meeting times for attendees',
        version: '1.0.0',
        category: 'calendar'
      }
    },
    {
      actionType: 'get_free_busy',
      handler: async (config, context) => {
        const provider = providerRegistry.getCalendarProvider('microsoft-calendar') as any
        if (!provider) throw new Error('Microsoft Calendar provider not available')
        
        return provider.getFreeBusy(
          config.parameters.emails || config.parameters.attendees || [],
          new Date(config.parameters.startTime || config.parameters.start),
          new Date(config.parameters.endTime || config.parameters.end),
          context.userId
        )
      },
      metadata: {
        name: 'Get Free/Busy',
        description: 'Get free/busy information for attendees',
        version: '1.0.0',
        category: 'calendar'
      }
    }
  ])

  logger.debug('✅ Microsoft Calendar provider registered with calendar capabilities')
}

function registerZoomProvider(): void {
  const zoomAdapter = new ZoomAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    zoomAdapter,
    ['chat'], // capability types (treating meetings as chat channels)
    { name: 'Zoom', version: '1.0.0' }
  )

  // Register Zoom actions
  actionRegistry.registerProvider('zoom', [
    {
      actionType: 'create_meeting',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom')
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.createChannel({
          name: config.parameters.topic || config.parameters.name || config.parameters.title,
          description: config.parameters.agenda || config.parameters.description,
          private: config.parameters.waitingRoom || config.parameters.private || false,
          metadata: {
            startTime: config.parameters.startTime || config.parameters.start_time,
            duration: config.parameters.duration || 60,
            password: config.parameters.password,
            settings: config.parameters.settings
          }
        }, context.userId)
      },
      metadata: {
        name: 'Create Meeting',
        description: 'Create a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'start_meeting',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom') as any
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.startMeeting(
          config.parameters.meetingId || config.parameters.channelId,
          context.userId
        )
      },
      metadata: {
        name: 'Start Meeting',
        description: 'Start a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'end_meeting',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom') as any
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.endMeeting(
          config.parameters.meetingId || config.parameters.channelId,
          context.userId
        )
      },
      metadata: {
        name: 'End Meeting',
        description: 'End a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'get_meetings',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom')
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.getChannels({
          name: config.parameters.topic || config.parameters.name,
          limit: config.parameters.limit || 30
        }, context.userId)
      },
      metadata: {
        name: 'Get Meetings',
        description: 'Get Zoom meetings',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'add_participants',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom')
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.manageMembers({
          type: 'add',
          channelId: config.parameters.meetingId || config.parameters.channelId,
          memberIds: config.parameters.emails || config.parameters.participants || []
        }, context.userId)
      },
      metadata: {
        name: 'Add Participants',
        description: 'Add participants to a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'remove_participants',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom')
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.manageMembers({
          type: 'remove',
          channelId: config.parameters.meetingId || config.parameters.channelId,
          memberIds: config.parameters.registrantIds || config.parameters.participantIds || []
        }, context.userId)
      },
      metadata: {
        name: 'Remove Participants',
        description: 'Remove participants from a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'get_participants',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom')
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.getMembers(
          config.parameters.meetingId || config.parameters.channelId,
          context.userId
        )
      },
      metadata: {
        name: 'Get Participants',
        description: 'Get participants of a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'get_recordings',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom') as any
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.getRecordings(
          config.parameters.meetingId || config.parameters.channelId,
          context.userId
        )
      },
      metadata: {
        name: 'Get Recordings',
        description: 'Get recordings of a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    },
    {
      actionType: 'send_chat_message',
      handler: async (config, context) => {
        const provider = providerRegistry.getChatProvider('zoom')
        if (!provider) throw new Error('Zoom provider not available')
        
        return provider.sendMessage({
          channelId: config.parameters.meetingId || config.parameters.channelId,
          content: config.parameters.message || config.parameters.content || config.parameters.text,
          mentions: config.parameters.toParticipant ? [config.parameters.toParticipant] : undefined
        }, context.userId)
      },
      metadata: {
        name: 'Send Chat Message',
        description: 'Send a chat message in a Zoom meeting',
        version: '1.0.0',
        category: 'chat'
      }
    }
  ])

  logger.debug('✅ Zoom provider registered with chat capabilities')
}

function registerSalesforceProvider(): void {
  const salesforceAdapter = new SalesforceAdapter()
  
  // Register provider with capabilities
  providerRegistry.register(
    salesforceAdapter,
    ['crm'], // capability types
    { name: 'Salesforce', version: '1.0.0' }
  )

  // Register Salesforce actions
  actionRegistry.registerProvider('salesforce', [
    {
      actionType: 'create_contact',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce')
        if (!provider) throw new Error('Salesforce provider not available')
        
        return provider.createContact({
          name: config.parameters.name || `${config.parameters.firstName || ''} ${config.parameters.lastName || ''}`.trim(),
          email: config.parameters.email,
          phone: config.parameters.phone,
          company: config.parameters.company || config.parameters.account,
          title: config.parameters.title || config.parameters.jobTitle,
          description: config.parameters.description || config.parameters.notes,
          source: config.parameters.source || config.parameters.leadSource
        }, context.userId)
      },
      metadata: {
        name: 'Create Contact',
        description: 'Create a contact in Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'update_contact',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce')
        if (!provider) throw new Error('Salesforce provider not available')
        
        const updates: any = {}
        if (config.parameters.name || config.parameters.firstName || config.parameters.lastName) {
          updates.name = config.parameters.name || `${config.parameters.firstName || ''} ${config.parameters.lastName || ''}`.trim()
        }
        if (config.parameters.email) updates.email = config.parameters.email
        if (config.parameters.phone) updates.phone = config.parameters.phone
        if (config.parameters.company) updates.company = config.parameters.company
        if (config.parameters.title) updates.title = config.parameters.title
        if (config.parameters.description) updates.description = config.parameters.description
        
        return provider.updateContact(
          config.parameters.contactId || config.parameters.id,
          updates,
          context.userId
        )
      },
      metadata: {
        name: 'Update Contact',
        description: 'Update a contact in Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'delete_contact',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce')
        if (!provider) throw new Error('Salesforce provider not available')
        
        await provider.deleteContact(
          config.parameters.contactId || config.parameters.id,
          context.userId
        )
        
        return {
          success: true,
          output: { contactId: config.parameters.contactId || config.parameters.id },
          message: 'Contact deleted successfully from Salesforce'
        }
      },
      metadata: {
        name: 'Delete Contact',
        description: 'Delete a contact from Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'get_contacts',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce')
        if (!provider) throw new Error('Salesforce provider not available')
        
        return provider.getContacts({
          email: config.parameters.email,
          company: config.parameters.company || config.parameters.account,
          limit: config.parameters.limit || 200
        }, context.userId)
      },
      metadata: {
        name: 'Get Contacts',
        description: 'Get contacts from Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'create_opportunity',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce')
        if (!provider) throw new Error('Salesforce provider not available')
        
        return provider.createDeal({
          title: config.parameters.name || config.parameters.title || config.parameters.opportunityName,
          amount: config.parameters.amount,
          stage: config.parameters.stage || config.parameters.stageName || 'Prospecting',
          description: config.parameters.description || config.parameters.notes,
          closeDate: config.parameters.closeDate ? new Date(config.parameters.closeDate) : undefined,
          source: config.parameters.source || config.parameters.leadSource,
          type: config.parameters.type || config.parameters.opportunityType,
          contactId: config.parameters.contactId
        }, context.userId)
      },
      metadata: {
        name: 'Create Opportunity',
        description: 'Create an opportunity in Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'update_opportunity',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce')
        if (!provider) throw new Error('Salesforce provider not available')
        
        const updates: any = {}
        if (config.parameters.name || config.parameters.title) {
          updates.title = config.parameters.name || config.parameters.title
        }
        if (config.parameters.amount) updates.amount = config.parameters.amount
        if (config.parameters.stage) updates.stage = config.parameters.stage
        if (config.parameters.description) updates.description = config.parameters.description
        if (config.parameters.closeDate) updates.closeDate = new Date(config.parameters.closeDate)
        if (config.parameters.source) updates.source = config.parameters.source
        if (config.parameters.type) updates.type = config.parameters.type
        
        return provider.updateDeal(
          config.parameters.opportunityId || config.parameters.dealId || config.parameters.id,
          updates,
          context.userId
        )
      },
      metadata: {
        name: 'Update Opportunity',
        description: 'Update an opportunity in Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'get_opportunities',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce') as any
        if (!provider) throw new Error('Salesforce provider not available')
        
        return provider.getOpportunities({
          stage: config.parameters.stage || config.parameters.stageName,
          amount: config.parameters.minAmount,
          limit: config.parameters.limit || 200
        }, context.userId)
      },
      metadata: {
        name: 'Get Opportunities',
        description: 'Get opportunities from Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'create_lead',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce') as any
        if (!provider) throw new Error('Salesforce provider not available')
        
        return provider.createLead({
          FirstName: config.parameters.firstName,
          LastName: config.parameters.lastName || 'Unknown',
          Email: config.parameters.email,
          Phone: config.parameters.phone,
          Company: config.parameters.company || 'Unknown',
          Title: config.parameters.title,
          LeadSource: config.parameters.source || config.parameters.leadSource,
          Status: config.parameters.status || 'Open - Not Contacted'
        }, context.userId)
      },
      metadata: {
        name: 'Create Lead',
        description: 'Create a lead in Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    },
    {
      actionType: 'execute_soql',
      handler: async (config, context) => {
        const provider = providerRegistry.getCRMProvider('salesforce') as any
        if (!provider) throw new Error('Salesforce provider not available')
        
        return provider.executeSOQL(
          config.parameters.query || config.parameters.soql,
          context.userId
        )
      },
      metadata: {
        name: 'Execute SOQL',
        description: 'Execute a SOQL query in Salesforce',
        version: '1.0.0',
        category: 'crm'
      }
    }
  ])

  logger.debug('✅ Salesforce provider registered with CRM capabilities')
}

/**
 * Get provider status for health checks
 */
export function getProviderStatus(): Array<{
  providerId: string
  name: string
  types: string[]
  healthy: boolean
  capabilities: any
}> {
  return providerRegistry.listProviders().map(provider => ({
    providerId: provider.providerId,
    name: provider.name,
    types: provider.types,
    healthy: true, // TODO: Implement actual health checks
    capabilities: provider.capabilities
  }))
}

/**
 * Get action registry status
 */
export function getActionStatus(): Array<{
  providerId: string
  actionType: string
  name: string
  category: string
  version: string
}> {
  return actionRegistry.listActions().map(action => ({
    providerId: action.providerId,
    actionType: action.actionType,
    name: action.metadata.name,
    category: action.metadata.category,
    version: action.metadata.version
  }))
}