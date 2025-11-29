import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SECRET_KEY ||= 'test-service-role'
process.env.OPENAI_API_KEY ||= 'test-openai-key'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= 'test-anon-key'

console.log = () => {}

interface IntentAnalysisResult {
  intent: string
  action: string
  parameters: Record<string, any>
  requiresConfirmation?: boolean
  clarification?: string
  specifiedIntegration?: string
}

interface Integration {
  id: string
  provider: string
  status: string
  user_id: string
  access_token?: string
  refresh_token?: string
}

const baseIntent: IntentAnalysisResult = {
  intent: 'email_action',
  action: 'send_email',
  parameters: {},
}

const gmailIntegration: Integration = {
  id: 'gmail-1',
  provider: 'gmail',
  status: 'connected',
  user_id: 'user-1',
}

test('EmailActionHandler returns friendly error when provider missing', async () => {
  const { EmailActionHandler } = await import('@/lib/services/ai/handlers/emailActionHandler')
  const handler = new EmailActionHandler(async () => {
    throw new Error('Should not execute action when no integration is connected')
  })
  const result = await handler.handleAction(
    baseIntent,
    [],
    'user-1',
    {}
  )

  assert.match(result.content, /connect/i)
  assert.equal(result.metadata.integrationType, 'email')
})

test('EmailActionHandler (send) delegates to workflow action', async () => {
  const { EmailActionHandler } = await import('@/lib/services/ai/handlers/emailActionHandler')
  const captured: Array<{ actionType: string; config: Record<string, any> }> = []
  const handler = new EmailActionHandler(async (_userId, actionType, config) => {
    captured.push({
      actionType,
      config: JSON.parse(JSON.stringify(config))
    })
    return {
      success: true,
      output: {},
      message: 'ok',
    }
  })

  await handler.handleAction(
    {
      ...baseIntent,
      parameters: {
        to: 'someone@example.com',
        subject: 'Hello',
        body: 'Test',
      },
    },
    [gmailIntegration],
    'user-1',
    {}
  )

  assert.equal(captured.length, 1)
  assert.equal(captured[0].actionType, 'gmail_action_send_email')
  assert.equal(captured[0].config.subject, 'Hello')
})

test('CommunicationActionHandler validates channel requirement', async () => {
  const { CommunicationActionHandler } = await import('@/lib/services/ai/handlers/communicationActionHandler')
  const handler = new CommunicationActionHandler(async () => {
    throw new Error('Should not execute action without a channel')
  })
  const intent: IntentAnalysisResult = {
    intent: 'communication_action',
    action: 'send_message',
    parameters: {
      platform: 'slack',
      message: 'Hello team!',
    },
  }

  const integration: Integration = {
    id: 'slack-1',
    provider: 'slack',
    status: 'connected',
    user_id: 'user-1',
  }

  const result = await handler.handleAction(intent, [integration], 'user-1', {})
  assert.match(result.content, /channel/i)
})

test('CRMActionHandler creates contact through workflow action bridge', async () => {
  const { CRMActionHandler } = await import('@/lib/services/ai/handlers/crmActionHandler')
  const captured: Array<{ actionType: string; config: Record<string, any> }> = []
  const handler = new CRMActionHandler(async (_userId, actionType, config) => {
    captured.push({
      actionType,
      config: JSON.parse(JSON.stringify(config))
    })
    return {
      success: true,
      output: { contact: { id: 'contact-1' } },
      message: 'created',
    }
  })

  const intent: IntentAnalysisResult = {
    intent: 'crm_action',
    action: 'create_contact',
    parameters: {
      email: 'lead@example.com',
      firstName: 'Lead',
    },
  }

  const integration: Integration = {
    id: 'hubspot-1',
    provider: 'hubspot',
    status: 'connected',
    user_id: 'user-1',
  }

  const result = await handler.handleAction(intent, [integration], 'user-1', {})

  assert.equal(result.metadata?.type, 'crm_action')
  assert.equal(captured.length, 1)
  assert.equal(captured[0].actionType, 'hubspot_action_create_contact')
  assert.equal(captured[0].config.email, 'lead@example.com')
})

test('CommunicationActionHandler fetches Mailchimp subscribers', async () => {
  const { CommunicationActionHandler } = await import('@/lib/services/ai/handlers/communicationActionHandler')
  const captured: Array<{ actionType: string; config: Record<string, any> }> = []
  const handler = new CommunicationActionHandler(async (_userId, actionType, config) => {
    captured.push({ actionType, config })
    return {
      success: true,
      output: { subscribers: [{ id: 'sub-1' }], count: 1 },
      message: 'ok'
    }
  })

  const intent: IntentAnalysisResult = {
    intent: 'communication_query',
    action: 'get_subscribers',
    parameters: {
      provider: 'mailchimp',
      audienceId: 'aud-1'
    }
  }

  const integration: Integration = {
    id: 'mailchimp-1',
    provider: 'mailchimp',
    status: 'connected',
    user_id: 'user-1'
  }

  const result = await handler.handleQuery(intent, [integration], 'user-1', {})

  assert.equal(captured.length, 1)
  assert.equal(captured[0].actionType, 'mailchimp_action_get_subscribers')
  assert.equal(result.metadata.provider, 'mailchimp')
})

test('FileActionHandler routes Dropbox uploads through workflow actions', async () => {
  const { FileActionHandler } = await import('@/lib/services/ai/handlers/fileActionHandler')
  const captured: Array<{ actionType: string; config: Record<string, any> }> = []
  const handler = new FileActionHandler(async (_userId, actionType, config) => {
    captured.push({ actionType, config })
    return {
      success: true,
      output: { file: { name: config.fileName || 'file' } },
      message: 'uploaded'
    }
  })

  const intent: IntentAnalysisResult = {
    intent: 'file_action',
    action: 'upload_file',
    parameters: {
      provider: 'dropbox',
      fileName: 'notes.txt',
      uploadedFiles: [{ filePath: 'tmp/path', fileName: 'notes.txt', isTemporary: true }]
    }
  }

  const integration: Integration = {
    id: 'dropbox-1',
    provider: 'dropbox',
    status: 'connected',
    user_id: 'user-1'
  }

  const result = await handler.handleAction(intent, [integration], 'user-1', {})

  assert.equal(result.metadata.provider, 'dropbox')
  assert.equal(captured.length, 1)
  assert.equal(captured[0].actionType, 'dropbox_action_upload_file')
})

test('SocialActionHandler posts updates to Facebook', async () => {
  const { SocialActionHandler } = await import('@/lib/services/ai/handlers/socialActionHandler')
  const captured: Array<{ actionType: string; config: Record<string, any> }> = []
  const handler = new SocialActionHandler(async (_userId, actionType, config) => {
    captured.push({ actionType, config })
    return {
      success: true,
      output: { post: { id: 'fb-post-1' } },
      message: 'posted'
    }
  })

  const intent: IntentAnalysisResult = {
    intent: 'social_action',
    action: 'post_update',
    parameters: {
      provider: 'facebook',
      pageId: 'page-1',
      message: 'Launching a new feature!'
    }
  }

  const integration: Integration = {
    id: 'facebook-1',
    provider: 'facebook',
    status: 'connected',
    user_id: 'user-1'
  }

  const result = await handler.handleAction(intent, [integration], 'user-1', {})

  assert.equal(result.metadata.provider, 'facebook')
  assert.equal(captured.length, 1)
  assert.equal(captured[0].actionType, 'facebook_action_create_post')
})

test('ProductivityActionHandler creates Notion pages through workflow actions', async () => {
  const { ProductivityActionHandler } = await import('@/lib/services/ai/handlers/productivityActionHandler')
  const captured: Array<{ actionType: string; config: Record<string, any> }> = []
  const handler = new ProductivityActionHandler(async (_userId, actionType, config) => {
    captured.push({ actionType, config })
    return {
      success: true,
      output: { page: { id: 'notion-page-1' } },
      message: 'created'
    }
  })

  const intent: IntentAnalysisResult = {
    intent: 'productivity_action',
    action: 'create_page',
    parameters: {
      provider: 'notion',
      databaseId: 'db-1',
      title: 'Release Notes'
    }
  }

  const integration: Integration = {
    id: 'notion-1',
    provider: 'notion',
    status: 'connected',
    user_id: 'user-1'
  }

  const result = await handler.handleAction(intent, [integration], 'user-1', {})

  assert.equal(result.metadata.provider, 'notion')
  assert.equal(captured.length, 1)
  assert.equal(captured[0].actionType, 'notion_action_create_page')
})

test('ProductivityActionHandler fetches Trello cards', async () => {
  const { ProductivityActionHandler } = await import('@/lib/services/ai/handlers/productivityActionHandler')
  const captured: Array<{ actionType: string; config: Record<string, any> }> = []
  const handler = new ProductivityActionHandler(async (_userId, actionType, config) => {
    captured.push({ actionType, config })
    return {
      success: true,
      output: { cards: [{ id: 'card-1' }], count: 1 },
      message: 'ok'
    }
  })

  const intent: IntentAnalysisResult = {
    intent: 'productivity_query',
    action: 'list_records',
    parameters: {
      provider: 'trello',
      boardId: 'board-1'
    }
  }

  const integration: Integration = {
    id: 'trello-1',
    provider: 'trello',
    status: 'connected',
    user_id: 'user-1'
  }

  const result = await handler.handleQuery(intent, [integration], 'user-1', {})

  assert.equal(result.metadata.provider, 'trello')
  assert.equal(captured.length, 1)
  assert.equal(captured[0].actionType, 'trello_action_get_cards')
})
