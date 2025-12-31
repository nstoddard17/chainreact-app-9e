"use client"

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Play,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  FileText,
  Languages,
  Filter,
  BarChart3,
  Mail,
  RefreshCw,
  Edit3
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UpstreamNodeData {
  nodeId: string
  nodeType: string
  providerId: string
  title: string
  // Real sample data from last test/execution
  sampleData?: Record<string, any>
  // Output schema for this node
  outputSchema?: Array<{ name: string; type: string; label?: string }>
}

interface InlineTestPreviewProps {
  actionType: string
  config: Record<string, any>
  workflowId?: string
  nodeId?: string
  onRunTest?: () => void | Promise<any>
  isTestingNode?: boolean
  lastTestResult?: any
  // Callback to switch to results tab after test
  onSwitchToResults?: () => void
  // Data from upstream nodes (like Zapier's "data from previous step")
  upstreamNodes?: UpstreamNodeData[]
}

/**
 * Inline Test Preview Component
 *
 * Shows a "Try It" section directly in the config modal that:
 * 1. Displays sample input based on action type
 * 2. Has a prominent "Try It" button
 * 3. Shows results inline formatted for the action type
 *
 * This makes testing discoverable without navigating to a separate tab.
 */
import { Input } from '@/components/ui/input'

/**
 * Natural Input Display - Shows data in a human-readable format (not JSON)
 * Adapts based on the data type (email, message, record, etc.)
 */
function NaturalInputDisplay({ data, providerId }: { data: Record<string, any>; providerId?: string }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-muted/20 p-3 text-center">
        <p className="text-[10px] text-muted-foreground">No sample data</p>
      </div>
    )
  }

  // Email format (Gmail, Outlook, etc.)
  if (data.subject || data.from || data.body) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Email header */}
        <div className="bg-muted/30 px-3 py-2 border-b border-border space-y-1">
          {data.from && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-12">From:</span>
              <span className="text-xs font-medium truncate">{data.from}</span>
            </div>
          )}
          {data.to && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-12">To:</span>
              <span className="text-xs truncate">{data.to}</span>
            </div>
          )}
          {data.subject && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-12">Subject:</span>
              <span className="text-xs font-semibold truncate">{data.subject}</span>
            </div>
          )}
        </div>
        {/* Email body - auto-expands to show all content */}
        {data.body && (
          <div className="px-3 py-2">
            <p className="text-xs text-foreground whitespace-pre-wrap">{data.body}</p>
          </div>
        )}
      </div>
    )
  }

  // Chat message format (Slack, Discord, Teams)
  if (data.text || data.content || data.message) {
    const messageText = data.text || data.content || data.message
    const author = data.user || data.author || data.sender || 'User'
    const channel = data.channel || ''

    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-start gap-2">
          {/* Avatar placeholder */}
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
            {String(author).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">{author}</span>
              {channel && (
                <span className="text-[10px] text-muted-foreground">in {channel}</span>
              )}
            </div>
            <p className="text-xs text-foreground mt-1 whitespace-pre-wrap">{messageText}</p>
          </div>
        </div>
      </div>
    )
  }

  // Record/Database format (Airtable, Notion, HubSpot)
  if (data.fields || data.firstname || data.title || data.Name) {
    const fields = data.fields || data
    const displayFields = Object.entries(fields).filter(([key]) =>
      !['id', 'createdTime', 'timestamp'].includes(key)
    ).slice(0, 5)

    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {displayFields.map(([key, value]) => (
            <div key={key} className="flex items-center px-3 py-1.5">
              <span className="text-[10px] text-muted-foreground w-24 flex-shrink-0">{key}</span>
              <span className="text-xs text-foreground truncate">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
          {Object.keys(fields).length > 5 && (
            <div className="px-3 py-1 text-[10px] text-muted-foreground">
              +{Object.keys(fields).length - 5} more fields
            </div>
          )}
        </div>
      </div>
    )
  }

  // Generic text format
  if (data.text) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs text-foreground whitespace-pre-wrap">{data.text}</p>
      </div>
    )
  }

  // Fallback - show as key-value pairs
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="divide-y divide-border">
        {Object.entries(data).slice(0, 4).map(([key, value]) => (
          <div key={key} className="flex items-center px-3 py-1.5">
            <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0">{key}</span>
            <span className="text-xs text-foreground truncate">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Auto-expanding textarea component
 */
function AutoExpandTextarea({
  value,
  onChange,
  placeholder,
  className
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Auto-resize on value change
  React.useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.max(60, textarea.scrollHeight)}px`
    }
  }, [value])

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
        // Resize on input
        e.target.style.height = 'auto'
        e.target.style.height = `${Math.max(60, e.target.scrollHeight)}px`
      }}
      className={cn("text-xs resize-none overflow-hidden", className)}
      placeholder={placeholder}
      style={{ minHeight: '60px' }}
    />
  )
}

/**
 * Natural Input Editor - Editable form that looks natural (not JSON)
 */
function NaturalInputEditor({
  data,
  onChange,
  providerId
}: {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  providerId?: string
}) {
  const handleFieldChange = (key: string, value: string) => {
    onChange({ ...data, [key]: value })
  }

  // Email format
  if (data.subject !== undefined || data.from !== undefined || data.body !== undefined) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">From</Label>
            <Input
              value={data.from || ''}
              onChange={(e) => handleFieldChange('from', e.target.value)}
              className="h-7 text-xs"
              placeholder="sender@example.com"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">To</Label>
            <Input
              value={data.to || ''}
              onChange={(e) => handleFieldChange('to', e.target.value)}
              className="h-7 text-xs"
              placeholder="recipient@example.com"
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Subject</Label>
          <Input
            value={data.subject || ''}
            onChange={(e) => handleFieldChange('subject', e.target.value)}
            className="h-7 text-xs"
            placeholder="Email subject"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Body</Label>
          <AutoExpandTextarea
            value={data.body || ''}
            onChange={(value) => handleFieldChange('body', value)}
            placeholder="Email body..."
          />
        </div>
      </div>
    )
  }

  // Chat message format
  if (data.text !== undefined || data.content !== undefined || data.message !== undefined) {
    const textKey = data.text !== undefined ? 'text' : data.content !== undefined ? 'content' : 'message'
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">User/Author</Label>
            <Input
              value={data.user || data.author || data.sender || ''}
              onChange={(e) => handleFieldChange(data.user !== undefined ? 'user' : 'author', e.target.value)}
              className="h-7 text-xs"
              placeholder="username"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Channel</Label>
            <Input
              value={data.channel || ''}
              onChange={(e) => handleFieldChange('channel', e.target.value)}
              className="h-7 text-xs"
              placeholder="#general"
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Message</Label>
          <AutoExpandTextarea
            value={data[textKey] || ''}
            onChange={(value) => handleFieldChange(textKey, value)}
            placeholder="Message content..."
          />
        </div>
      </div>
    )
  }

  // Generic key-value editor
  return (
    <div className="space-y-2">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <Label className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</Label>
          {typeof value === 'string' && value.length > 50 ? (
            <AutoExpandTextarea
              value={String(value)}
              onChange={(newValue) => handleFieldChange(key, newValue)}
            />
          ) : (
            <Input
              value={String(value || '')}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className="h-7 text-xs"
            />
          )}
        </div>
      ))}
    </div>
  )
}

// Sample data templates by provider type (fallback when no real data)
const SAMPLE_DATA_BY_PROVIDER: Record<string, Array<{ label: string; data: Record<string, any> }>> = {
  gmail: [
    {
      label: 'Customer Inquiry',
      data: {
        from: 'john.doe@example.com',
        to: 'support@yourcompany.com',
        subject: 'Question about my order',
        body: 'Hi there,\n\nI placed an order last week (Order #12345) and haven\'t received any shipping updates yet. Could you please let me know the status?\n\nThanks,\nJohn',
        date: new Date().toISOString(),
      }
    },
    {
      label: 'Support Request',
      data: {
        from: 'jane.smith@email.com',
        to: 'help@yourcompany.com',
        subject: 'Issue with login',
        body: 'Hello,\n\nI\'m unable to log into my account. I\'ve tried resetting my password but still getting an error. Can you help?\n\nBest,\nJane',
        date: new Date().toISOString(),
      }
    },
    {
      label: 'Feedback Email',
      data: {
        from: 'mike.wilson@gmail.com',
        to: 'feedback@yourcompany.com',
        subject: 'Great experience!',
        body: 'Just wanted to say your product has been amazing. The customer service is top-notch. Keep up the good work!',
        date: new Date().toISOString(),
      }
    }
  ],
  slack: [
    {
      label: 'Channel Message',
      data: {
        user: 'sarah.johnson',
        channel: '#general',
        text: 'Hey team, quick reminder about the standup at 10am tomorrow. Please come prepared with your updates!',
        timestamp: new Date().toISOString(),
      }
    },
    {
      label: 'Direct Message',
      data: {
        user: 'tom.chen',
        channel: 'DM',
        text: 'Can you review my PR when you get a chance? It\'s the authentication refactor we discussed.',
        timestamp: new Date().toISOString(),
      }
    }
  ],
  discord: [
    {
      label: 'Server Message',
      data: {
        author: 'GameMaster#1234',
        channel: 'general-chat',
        content: 'Anyone up for a game tonight? Looking for 3 more players for the raid.',
        timestamp: new Date().toISOString(),
      }
    }
  ],
  airtable: [
    {
      label: 'New Record',
      data: {
        id: 'rec123ABC',
        fields: {
          Name: 'John Smith',
          Email: 'john@example.com',
          Status: 'Active',
          'Created Date': new Date().toISOString(),
        }
      }
    }
  ],
  notion: [
    {
      label: 'Database Item',
      data: {
        id: 'page-123',
        title: 'Project Alpha',
        status: 'In Progress',
        assignee: 'Sarah Johnson',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }
    }
  ],
  hubspot: [
    {
      label: 'New Contact',
      data: {
        email: 'lead@company.com',
        firstname: 'Alex',
        lastname: 'Thompson',
        company: 'Tech Corp',
        phone: '(555) 123-4567',
      }
    }
  ],
  default: [
    {
      label: 'Generic Input',
      data: {
        text: 'This is sample input text for testing the AI agent. You can edit this to test with different content.',
        timestamp: new Date().toISOString(),
      }
    }
  ]
}

// Get sample templates for action type (when no upstream node)
const SAMPLE_DATA_BY_ACTION: Record<string, Array<{ label: string; data: Record<string, any> }>> = {
  respond: [
    {
      label: 'Customer Question',
      data: {
        from: 'john.doe@example.com',
        subject: 'Question about my order',
        body: 'Hi there,\n\nI placed an order last week (Order #12345) and haven\'t received any shipping updates yet. Could you please let me know the status?\n\nThanks,\nJohn',
      }
    },
    {
      label: 'Complaint',
      data: {
        from: 'upset.customer@email.com',
        subject: 'Disappointed with service',
        body: 'I\'ve been waiting 2 weeks for my refund and still nothing. This is unacceptable. I want this resolved immediately.',
      }
    },
  ],
  extract: [
    {
      label: 'Contact Info',
      data: {
        text: 'Dear Support Team,\n\nMy name is Jane Smith and I\'m writing about order #98765.\nYou can reach me at jane.smith@email.com or call me at (555) 123-4567.\nThe order total was $299.99 and was placed on November 15, 2024.\n\nBest regards,\nJane Smith',
      }
    },
    {
      label: 'Invoice Data',
      data: {
        text: 'Invoice #INV-2024-001\nDate: November 28, 2024\nBill To: Acme Corp\nAmount: $1,500.00\nDue Date: December 28, 2024\nPayment Terms: Net 30',
      }
    },
  ],
  summarize: [
    {
      label: 'Meeting Notes',
      data: {
        text: 'Meeting Notes - Q4 Planning Session\n\nAttendees: Marketing, Sales, Product teams\n\nKey Discussion Points:\n1. Q3 revenue exceeded targets by 15%\n2. New product launch scheduled for January\n3. Customer feedback indicates need for better onboarding\n4. Budget allocation for Q4: 40% marketing, 35% product, 25% ops\n\nAction Items:\n- Sarah to finalize marketing campaign by Friday\n- Dev team to prioritize onboarding improvements',
      }
    },
    {
      label: 'Article',
      data: {
        text: 'The Future of AI in Business\n\nArtificial intelligence is transforming how companies operate. From automating routine tasks to providing deep insights from data, AI tools are becoming essential for competitive advantage. Key trends include: natural language processing for customer service, predictive analytics for sales forecasting, and machine learning for personalized marketing. Companies that embrace these technologies early are seeing significant ROI improvements.',
      }
    },
  ],
  classify: [
    {
      label: 'Support Ticket',
      data: {
        text: 'I\'ve been trying to use the export feature but it keeps failing with an error message. I\'ve tried refreshing the page and clearing my cache but nothing works. This is blocking my work and I need this resolved urgently!',
      }
    },
    {
      label: 'Product Review',
      data: {
        text: 'Absolutely love this product! It exceeded my expectations. The quality is amazing and shipping was super fast. Would definitely recommend to anyone looking for a reliable solution.',
      }
    },
  ],
  translate: [
    {
      label: 'Business Email',
      data: {
        text: 'Hello! Thank you for your interest in our product. We\'re excited to help you get started. Please let us know if you have any questions about our features or pricing.',
      }
    },
    {
      label: 'Marketing Copy',
      data: {
        text: 'Discover the future of productivity. Our innovative solution helps teams collaborate seamlessly, automate workflows, and achieve more in less time.',
      }
    },
  ],
  generate: [
    {
      label: 'Product Description',
      data: {
        product: 'Premium Wireless Headphones',
        features: 'Active noise cancellation, 30-hour battery life, Bluetooth 5.0',
        audience: 'Remote workers and commuters',
        tone: 'Professional but friendly',
      }
    },
    {
      label: 'Email Draft',
      data: {
        purpose: 'Follow-up after sales call',
        recipient: 'Potential customer',
        key_points: 'Thank them for their time, recap main benefits discussed, propose next steps',
      }
    },
  ],
  custom: [
    {
      label: 'Customer Email',
      data: {
        from: 'customer@example.com',
        subject: 'Question about your service',
        body: 'Hi there,\n\nI was looking at your website and had a few questions about how your service works. Could you explain the pricing model and whether there\'s a free trial available?\n\nThanks,\nAlex',
      }
    },
    {
      label: 'Support Message',
      data: {
        text: 'I\'ve been using your app for about a month now and I\'m having trouble with the export feature. Every time I try to export my data, it shows an error. I\'ve already tried restarting and clearing the cache.',
        user: 'frustrated_user',
        channel: '#support',
      }
    },
    {
      label: 'Generic Text',
      data: {
        text: 'This is sample input text for testing. You can edit this content to match what your AI agent will process in production.',
        timestamp: new Date().toISOString(),
      }
    },
  ],
}

export function InlineTestPreview({
  actionType,
  config,
  workflowId,
  nodeId,
  onRunTest,
  isTestingNode = false,
  lastTestResult,
  onSwitchToResults,
  upstreamNodes = []
}: InlineTestPreviewProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [showSampleInput, setShowSampleInput] = useState(false)
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0)
  const [customSampleData, setCustomSampleData] = useState<Record<string, any> | null>(null)
  const [testResult, setTestResult] = useState<any>(lastTestResult || null)
  const [isRunning, setIsRunning] = useState(false)
  const [showResultsHint, setShowResultsHint] = useState(false)
  const [dataSource, setDataSource] = useState<'upstream' | 'samples'>('upstream')

  // Get the primary upstream node (usually trigger or immediate predecessor)
  const primaryUpstream = upstreamNodes[0]
  const hasRealData = primaryUpstream?.sampleData && Object.keys(primaryUpstream.sampleData).length > 0

  // Get sample templates based on upstream provider or action type
  const getSampleTemplates = useCallback(() => {
    // If we have real data from upstream, use it as the first option
    if (hasRealData && primaryUpstream) {
      return [{
        label: `Real data from ${primaryUpstream.title}`,
        data: primaryUpstream.sampleData!,
        isRealData: true
      }]
    }

    // Otherwise, use provider-specific samples if we know the upstream type
    if (primaryUpstream?.providerId) {
      const providerSamples = SAMPLE_DATA_BY_PROVIDER[primaryUpstream.providerId]
      if (providerSamples) {
        return providerSamples.map(s => ({ ...s, isRealData: false }))
      }
    }

    // Fall back to action-type samples
    const actionSamples = SAMPLE_DATA_BY_ACTION[actionType]
    if (actionSamples) {
      return actionSamples.map(s => ({ ...s, isRealData: false }))
    }

    // Ultimate fallback
    return SAMPLE_DATA_BY_PROVIDER.default.map(s => ({ ...s, isRealData: false }))
  }, [actionType, primaryUpstream, hasRealData])

  const sampleTemplates = getSampleTemplates()
  const currentSample = customSampleData || sampleTemplates[selectedSampleIndex]?.data || {}

  // Run the test
  const handleRunTest = async () => {
    if (!onRunTest) return

    setIsRunning(true)
    setShowResultsHint(false)
    try {
      const result = await onRunTest()
      // If the test function returns a result, use it
      if (result && typeof result === 'object') {
        setTestResult(result)
      } else {
        // Otherwise, show hint to check Results tab
        setShowResultsHint(true)
        // Auto-switch to results tab if callback provided
        if (onSwitchToResults) {
          setTimeout(() => onSwitchToResults(), 500)
        }
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        error: error.message || 'Test failed'
      })
    } finally {
      setIsRunning(false)
    }
  }

  // Get icon for action type
  const getActionIcon = () => {
    switch (actionType) {
      case 'respond': return <Mail className="h-4 w-4" />
      case 'extract': return <FileText className="h-4 w-4" />
      case 'summarize': return <BarChart3 className="h-4 w-4" />
      case 'classify': return <Filter className="h-4 w-4" />
      case 'translate': return <Languages className="h-4 w-4" />
      case 'generate': return <Sparkles className="h-4 w-4" />
      default: return <Sparkles className="h-4 w-4" />
    }
  }

  // Render result based on action type
  const renderResult = () => {
    if (!testResult) return null

    if (!testResult.success) {
      return (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Test Failed</span>
          </div>
          {testResult.error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              {testResult.error}
            </p>
          )}
        </div>
      )
    }

    const data = testResult.data || testResult

    // Action-specific result formatting
    switch (actionType) {
      case 'respond':
        return (
          <div className="space-y-3">
            {data.email_subject && (
              <div>
                <Label className="text-[10px] text-muted-foreground">Subject</Label>
                <p className="text-sm font-medium">{data.email_subject}</p>
              </div>
            )}
            <div>
              <Label className="text-[10px] text-muted-foreground">Response</Label>
              <div className="mt-1 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm whitespace-pre-wrap">{data.response || data.output}</p>
              </div>
            </div>
          </div>
        )

      case 'extract':
        const extracted = data.extracted || data
        return (
          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground">Extracted Fields</Label>
            <div className="grid gap-2">
              {Object.entries(extracted).filter(([key]) =>
                !['success', 'tokensUsed', 'costIncurred', 'executionTime', 'modelUsed', 'actionType', 'output', 'data'].includes(key)
              ).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 rounded border border-border bg-muted/30 p-2">
                  <Badge variant="outline" className="text-[9px] font-mono shrink-0">{key}</Badge>
                  <span className="text-xs text-foreground">{String(value) || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'summarize':
        return (
          <div>
            <Label className="text-[10px] text-muted-foreground">Summary</Label>
            <div className="mt-1 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm whitespace-pre-wrap">{data.summary || data.output}</p>
            </div>
          </div>
        )

      case 'classify':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">Category</Label>
                <Badge className="mt-1 text-sm">{data.category || '—'}</Badge>
              </div>
              {data.confidence !== undefined && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">Confidence</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(data.confidence || 0) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono">{Math.round((data.confidence || 0) * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
            {data.reasoning && (
              <div>
                <Label className="text-[10px] text-muted-foreground">Reasoning</Label>
                <p className="text-xs text-muted-foreground mt-1">{data.reasoning}</p>
              </div>
            )}
          </div>
        )

      case 'translate':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-muted-foreground">Translation</Label>
              {data.target_language && (
                <Badge variant="outline" className="text-[9px]">{data.target_language}</Badge>
              )}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm whitespace-pre-wrap">{data.translation || data.output}</p>
            </div>
          </div>
        )

      case 'generate':
      default:
        return (
          <div>
            <Label className="text-[10px] text-muted-foreground">Generated Content</Label>
            <div className="mt-1 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm whitespace-pre-wrap">{data.output}</p>
            </div>
          </div>
        )
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 hover:bg-primary/10 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              {getActionIcon()}
              <span className="text-sm font-medium">Try It</span>
              <Badge variant="secondary" className="text-[9px]">Preview</Badge>
            </div>
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3">
            {/* Sample Input Section - Like Zapier's "Data from previous step" */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  {hasRealData ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Data from {primaryUpstream?.title}
                    </>
                  ) : (
                    'Sample Input'
                  )}
                </Label>
                <button
                  onClick={() => setShowSampleInput(!showSampleInput)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Edit3 className="h-3 w-3" />
                  {showSampleInput ? 'Hide' : 'Edit'}
                </button>
              </div>

              {/* Sample Selector - Multiple options like Zapier */}
              {sampleTemplates.length > 1 && !showSampleInput && (
                <div className="flex flex-wrap gap-1">
                  {sampleTemplates.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedSampleIndex(idx)
                        setCustomSampleData(null)
                      }}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded-md border transition-all",
                        selectedSampleIndex === idx && !customSampleData
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Real data badge */}
              {hasRealData && sampleTemplates[0]?.isRealData && !showSampleInput && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <Badge variant="outline" className="text-[9px] border-emerald-500/30 bg-emerald-500/10">
                    Real Data
                  </Badge>
                  <span>from last test run</span>
                </div>
              )}

              {/* Natural Display Format - looks like an email/message, not JSON */}
              {showSampleInput ? (
                <NaturalInputEditor
                  data={customSampleData || currentSample}
                  onChange={setCustomSampleData}
                  providerId={primaryUpstream?.providerId}
                />
              ) : (
                <NaturalInputDisplay
                  data={currentSample}
                  providerId={primaryUpstream?.providerId}
                />
              )}
            </div>

            {/* Try It Button */}
            <Button
              onClick={handleRunTest}
              disabled={isRunning || isTestingNode}
              className="w-full"
              size="sm"
            >
              {isRunning || isTestingNode ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Running...
                </>
              ) : testResult ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Try Again
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-2" />
                  Try It
                </>
              )}
            </Button>

            {/* Results Hint - When test runs but doesn't return inline results */}
            {showResultsHint && !testResult && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/30 p-3">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-medium">Test Running</span>
                </div>
                <p className="text-[10px] text-orange-600 dark:text-orange-400 mt-1">
                  Check the <strong>Results</strong> tab to see output when complete.
                </p>
                {onSwitchToResults && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 mt-1 text-[10px] text-orange-600 dark:text-orange-400"
                    onClick={onSwitchToResults}
                  >
                    Go to Results →
                  </Button>
                )}
              </div>
            )}

            {/* Results Section */}
            {testResult && (
              <div className={cn(
                "rounded-lg border p-3 transition-all",
                testResult.success !== false
                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30"
                  : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30"
              )}>
                {testResult.success !== false && (
                  <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-medium">Success</span>
                    {testResult.data?.executionTime && (
                      <span className="text-[10px] text-muted-foreground">
                        ({testResult.data.executionTime}ms)
                      </span>
                    )}
                  </div>
                )}
                {renderResult()}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
