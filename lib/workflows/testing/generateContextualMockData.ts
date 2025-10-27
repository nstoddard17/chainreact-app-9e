import { logger } from '@/lib/utils/logger'
import { formatRichTextForTarget } from '@/lib/workflows/formatters/richText'
import OpenAI from 'openai'

interface MockDataContext {
  nodeType: string
  nodeTitle: string
  providerId?: string
  userPrompt?: string
  previousNodeOutput?: any
  workflowContext?: string
  nodeConfig?: any
}

/**
 * Generates smart, contextual mock data for testing workflow nodes
 * Mock data is dynamically created based on the user's request and workflow context
 */
export async function generateContextualMockData(context: MockDataContext): Promise<any> {
  const {
    nodeType,
    nodeTitle,
    providerId,
    userPrompt,
    previousNodeOutput,
    workflowContext,
    nodeConfig
  } = context

  try {
    // For trigger nodes, generate event-like data
    if (nodeType.includes('trigger')) {
      return generateTriggerMockData(context)
    }

    // For action nodes that depend on previous output
    if (previousNodeOutput) {
      return transformPreviousOutput(previousNodeOutput, context)
    }

    // Generate fresh mock data based on context
    return await generateAIMockData(context)
  } catch (error) {
    logger.error('Failed to generate contextual mock data', { error, context })
    return generateFallbackMockData(nodeType, providerId)
  }
}

/**
 * Generate mock data for trigger nodes based on their type
 */
function generateTriggerMockData(context: MockDataContext): any {
  const { providerId, nodeType, userPrompt } = context

  // Extract context from user prompt
  const hasOrderContext = userPrompt?.toLowerCase().includes('order')
  const hasCustomerContext = userPrompt?.toLowerCase().includes('customer')
  const hasEmailContext = userPrompt?.toLowerCase().includes('email')
  const hasInvoiceContext = userPrompt?.toLowerCase().includes('invoice')

  switch (providerId) {
    case 'shopify':
      if (hasOrderContext) {
        return {
          id: 'order-123456',
          order_number: '1001',
          customer: {
            email: 'john.doe@example.com',
            first_name: 'John',
            last_name: 'Doe'
          },
          total_price: '150.00',
          currency: 'USD',
          line_items: [
            {
              title: 'Sample Product',
              quantity: 2,
              price: '75.00'
            }
          ],
          created_at: new Date().toISOString()
        }
      }
      break

    case 'gmail':
      return {
        id: 'msg-123456',
        threadId: 'thread-123',
        from: hasCustomerContext ? 'customer@example.com' : 'sender@example.com',
        to: 'recipient@example.com',
        subject: hasOrderContext ? 'Order Inquiry #1001' : 'Sample Email Subject',
        body: hasOrderContext
          ? 'I have a question about my order #1001'
          : 'This is a sample email body for testing',
        date: new Date().toISOString(),
        attachments: []
      }

    case 'stripe':
      if (hasInvoiceContext) {
        return {
          id: 'inv_123456',
          amount_paid: 10000, // in cents
          currency: 'usd',
          customer_email: 'customer@example.com',
          customer_name: 'John Doe',
          status: 'paid',
          created: Date.now() / 1000
        }
      }
      break

    case 'slack':
      return {
        event: {
          type: 'message',
          user: 'U123456',
          text: hasOrderContext ? 'Question about order #1001' : 'Test message',
          channel: 'C123456',
          ts: String(Date.now() / 1000)
        },
        user: {
          id: 'U123456',
          name: 'testuser',
          real_name: 'Test User'
        }
      }

    case 'airtable':
      return {
        id: 'rec123456',
        fields: {
          Name: hasCustomerContext ? 'John Doe' : 'Sample Record',
          Status: 'Active',
          Created: new Date().toISOString(),
          ...(hasOrderContext && { OrderNumber: '1001', Amount: 150 })
        },
        createdTime: new Date().toISOString()
      }
  }

  // Generic trigger data
  return {
    id: 'event-123456',
    type: nodeType,
    timestamp: new Date().toISOString(),
    data: {
      source: providerId,
      message: 'Sample event data for testing'
    }
  }
}

/**
 * Transform previous node's output for the current node
 */
function transformPreviousOutput(previousOutput: any, context: MockDataContext): any {
  const { nodeType, nodeConfig } = context

  if (nodeType === 'format_transformer') {
    const rawBody = extractEmailBody(previousOutput) || sampleEmailBody()
    const targetFormat = nodeConfig?.targetFormat || 'slack_markdown'
    const originalFormat = looksLikeHtml(rawBody) ? 'html' : 'plain'
    let transformedContent = rawBody

    if (targetFormat === 'slack_markdown') {
      transformedContent = formatRichTextForTarget(rawBody, 'slack') || rawBody
    }

    const attachments =
      Array.isArray(previousOutput?.attachments) && previousOutput.attachments.length > 0
        ? previousOutput.attachments
        : Array.isArray(previousOutput?.data?.attachments)
          ? previousOutput.data.attachments
          : undefined

    const result: Record<string, any> = {
      transformedContent,
      originalFormat,
      targetFormat,
      success: true
    }

    if (attachments) {
      result.attachments = attachments
    }

    return result
  }

  // For filter nodes, return a subset
  if (nodeType === 'filter' || nodeType === 'if_condition') {
    if (Array.isArray(previousOutput)) {
      // Return half the items to show filtering worked
      return previousOutput.slice(0, Math.ceil(previousOutput.length / 2))
    }
    // For single items, return it if it would pass a generic filter
    return previousOutput
  }

  // For transformation nodes, modify the data
  if (nodeType === 'transform' || nodeType === 'format') {
    if (typeof previousOutput === 'object') {
      return {
        ...previousOutput,
        _transformed: true,
        _transformedAt: new Date().toISOString()
      }
    }
    return {
      original: previousOutput,
      transformed: true,
      transformedAt: new Date().toISOString()
    }
  }

  // For aggregation nodes
  if (nodeType === 'aggregate' || nodeType === 'merge') {
    if (Array.isArray(previousOutput)) {
      return {
        count: previousOutput.length,
        items: previousOutput,
        aggregatedAt: new Date().toISOString()
      }
    }
  }

  // Default: pass through with minor modifications
  return {
    ...previousOutput,
    _processedBy: context.nodeTitle,
    _processedAt: new Date().toISOString()
  }
}

function extractEmailBody(payload: any): string | null {
  if (!payload) return null
  if (typeof payload === 'string') return payload
  if (typeof payload.body === 'string') return payload.body
  if (typeof payload.data?.body === 'string') return payload.data.body
  if (typeof payload.transformedContent === 'string') return payload.transformedContent
  return null
}

function looksLikeHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content)
}

function sampleEmailBody(): string {
  return `<p>Hi team,</p>
<p>Quick reminder that our status updates go out every Friday. Please review the attached summary and highlight any blockers.</p>
<p>Thanks,<br/>Automation</p>`
}

/**
 * Use AI to generate contextual mock data
 */
async function generateAIMockData(context: MockDataContext): Promise<any> {
  const { nodeType, nodeTitle, providerId, userPrompt, workflowContext } = context

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const prompt = `Generate realistic mock data for testing a workflow node.

Node Information:
- Type: ${nodeType}
- Title: ${nodeTitle}
- Provider: ${providerId || 'generic'}

User's Original Request: "${userPrompt || 'No context provided'}"
Workflow Context: "${workflowContext || 'No workflow context'}"

Generate JSON mock data that:
1. Matches what this node type would actually receive
2. Is relevant to the user's workflow context
3. Contains realistic values (not just "test" or "sample")
4. Includes 2-3 items if it should be an array

Return ONLY valid JSON, no explanation.`

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })

    const mockData = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return mockData
  } catch (error) {
    logger.error('AI mock data generation failed', { error })
    throw error
  }
}

/**
 * Generate fallback mock data when other methods fail
 */
function generateFallbackMockData(nodeType: string, providerId?: string): any {
  // Provider-specific fallbacks
  const providerData: Record<string, any> = {
    gmail: {
      id: 'msg-fallback',
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test Email',
      body: 'This is test content',
      date: new Date().toISOString()
    },
    slack: {
      text: 'Test message',
      channel: '#general',
      user: 'testuser',
      timestamp: Date.now()
    },
    shopify: {
      id: 'order-fallback',
      order_number: '9999',
      total_price: '100.00',
      customer: { email: 'test@example.com' }
    },
    stripe: {
      id: 'ch_fallback',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded'
    },
    airtable: {
      id: 'rec_fallback',
      fields: {
        Name: 'Test Record',
        Status: 'Active'
      }
    }
  }

  if (providerId && providerData[providerId]) {
    return providerData[providerId]
  }

  // Generic fallback
  return {
    id: 'fallback-123',
    type: nodeType,
    data: 'Sample fallback data',
    timestamp: new Date().toISOString()
  }
}

/**
 * Helper function to format field names
 */
function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}
