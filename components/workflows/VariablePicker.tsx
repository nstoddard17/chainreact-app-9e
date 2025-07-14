import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Search, ChevronRight, Database, Eye, Copy, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkflowTestStore } from '@/stores/workflowTestStore'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'

interface VariablePickerProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableSelect: (variable: string) => void
  fieldType?: string
  trigger?: React.ReactNode
  triggerOutputs?: Record<string, any> // NEW: always-available trigger outputs
}

interface NodeVariable {
  path: string
  label: string
  type: string
  description?: string
  example?: any
  category: 'config' | 'output' | 'schema' | 'trigger'
  originalKey?: string // Track the original config key for Discord lookups
}

interface VariableOption {
  name: string;
  label: string;
  type: string;
  description?: string;
  example?: any;
}

export default function VariablePicker({
  workflowData,
  currentNodeId,
  onVariableSelect,
  fieldType,
  trigger,
  triggerOutputs: propTriggerOutputs
}: VariablePickerProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showTriggerOutputs, setShowTriggerOutputs] = useState(false)
  const { getNodeInputOutput } = useWorkflowTestStore()

  // Get all nodes that come before the current node in the workflow
  const getPreviousNodes = () => {
    if (!workflowData?.nodes || !currentNodeId) return []
    
    // For now, consider all nodes except the current one as "previous"
    // In a more sophisticated implementation, we'd trace the actual execution path
    return workflowData.nodes.filter(node => node.id !== currentNodeId)
  }

  // Extract variables from a node
  const getNodeVariables = (node: any): NodeVariable[] => {
    const variables: NodeVariable[] = []
    
    // 1. Get variables from node's static configuration
    if (node.data?.config) {
      Object.entries(node.data.config).forEach(([key, value]) => {
        // Exclude internal "_label" fields from being shown as variables
        if (key.endsWith('_label')) {
          return
        }

        if (value && typeof value === 'string' && value.trim() !== '') {
          variables.push({
            path: `{{config.${key}}}`,
            label: getFriendlyLabel(node, key),
            type: 'string',
            description: `Configuration value: ${key}`,
            example: value,
            category: 'config',
            originalKey: key // Store the original config key for Discord lookups
          })
        }
      })
    }

    // 2. Get variables from node's test output (if available)
    const testData = getNodeInputOutput(node.id)
    if (testData?.output) {
      extractVariablesFromObject(testData.output, 'data', variables)
    }

    // 3. Get variables from node's output schema (if available)
    const nodeType = getNodeTypeInfo(node)
    if (nodeType && typeof nodeType === 'object' && 'outputSchema' in nodeType) {
      const schema = (nodeType as any).outputSchema
      if (schema) {
        schema.forEach((field: any) => {
          variables.push({
            path: `{{data.${field.name}}}`,
            label: field.label || field.name,
            type: field.type,
            description: field.description,
            example: field.example,
            category: 'schema'
          })
        })
      }
    }

    return variables
  }

  // Recursively extract variables from an object
  const extractVariablesFromObject = (obj: any, prefix: string, variables: NodeVariable[], depth = 0) => {
    if (depth > 3) return // Prevent infinite recursion
    
    Object.entries(obj).forEach(([key, value]) => {
      const path = `{{${prefix}.${key}}}`
      
      if (value === null || value === undefined) {
        variables.push({
          path,
          label: key,
          type: 'null',
          example: value,
          category: 'output'
        })
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        variables.push({
          path,
          label: key,
          type: typeof value,
          example: value,
          category: 'output'
        })
      } else if (Array.isArray(value)) {
        variables.push({
          path,
          label: key,
          type: 'array',
          example: `[${value.length} items]`,
          category: 'output'
        })
        
        // Add array access patterns
        if (value.length > 0) {
          variables.push({
            path: `{{${prefix}.${key}[0]}}`,
            label: `${key}[0] (first item)`,
            type: typeof value[0],
            example: value[0],
            category: 'output'
          })
        }
      } else if (typeof value === 'object') {
        variables.push({
          path,
          label: key,
          type: 'object',
          example: '{...}',
          category: 'output'
        })
        
        // Recursively add nested properties
        extractVariablesFromObject(value, `${prefix}.${key}`, variables, depth + 1)
      }
    })
  }

  // Get node type information from available nodes
  const getNodeTypeInfo = (node: any) => {
    // This would normally come from your node definitions
    // For now, return null - we'll enhance this later
    return null
  }

  // Get trigger outputs for the workflow
  const getTriggerOutputs = (): NodeVariable[] => {
    if (!workflowData?.nodes) return []
    
    const triggerNodes = workflowData.nodes.filter(node => 
      node.id !== currentNodeId && // Exclude current node
      node.data?.isTrigger && // Only trigger nodes
      node.data?.type // Must have a type
    )

    const triggerVariables: NodeVariable[] = []

    triggerNodes.forEach(node => {
      const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
      if (!nodeComponent) return

      // Get realistic outputs based on trigger type
      const outputs = getTriggerOutputsByType(node.data?.type, node.data?.providerId)
      
      outputs.forEach(output => {
        triggerVariables.push({
          path: `{{trigger.${output.name}}}`,
          label: `${node.data?.title || nodeComponent.title}: ${output.label}`,
          type: output.type,
          description: output.description,
          example: output.example,
          category: 'trigger'
        })
      })
    })

    return triggerVariables
  }

  // Get realistic trigger outputs based on trigger type
  const getTriggerOutputsByType = (nodeType: string, providerId?: string): VariableOption[] => {
    const outputs: VariableOption[] = []

    // Gmail triggers
    if (nodeType === 'gmail_trigger_new_email') {
      outputs.push(
        { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd' },
        { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com' },
        { name: 'to', label: 'To', type: 'string', description: 'Recipient email address', example: 'recipient@example.com' },
        { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Meeting tomorrow' },
        { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Hi, let\'s meet tomorrow at 2 PM.' },
        { name: 'receivedAt', label: 'Received At', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z' },
        { name: 'threadId', label: 'Thread ID', type: 'string', description: 'Email thread identifier', example: '17c123456789abcd' },
        { name: 'snippet', label: 'Snippet', type: 'string', description: 'Short preview of email content', example: 'Hi, let\'s meet tomorrow...' },
        { name: 'labelIds', label: 'Labels', type: 'array', description: 'Gmail labels applied to the email', example: ['INBOX', 'IMPORTANT'] },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Email attachments', example: [] }
      )
    } else if (nodeType === 'gmail_trigger_new_attachment') {
      outputs.push(
        { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd' },
        { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com' },
        { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Document attached' },
        { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Please find the attached document.' },
        { name: 'receivedAt', label: 'Received At', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z' },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Email attachments', example: [{ filename: 'document.pdf', size: 1024000 }] }
      )
    } else if (nodeType === 'gmail_trigger_new_label') {
      outputs.push(
        { name: 'labelId', label: 'Label ID', type: 'string', description: 'Unique identifier for the label', example: 'Label_123456789' },
        { name: 'labelName', label: 'Label Name', type: 'string', description: 'Name of the new label', example: 'Important' },
        { name: 'labelType', label: 'Label Type', type: 'string', description: 'Type of the label', example: 'user' },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the label was created', example: '2024-01-15T10:30:00Z' }
      )
    }
    // Discord triggers
    else if (nodeType === 'discord_trigger_new_message') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890123456789' },
        { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!' },
        { name: 'authorId', label: 'Author ID', type: 'string', description: 'ID of the message author', example: '123456789012345678' },
        { name: 'authorName', label: 'Author Name', type: 'string', description: 'Name of the message author', example: 'John Doe' },
        { name: 'authorUsername', label: 'Author Username', type: 'string', description: 'Username of the message author', example: 'johndoe' },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: '1234567890123456789' },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general' },
        { name: 'guildId', label: 'Server ID', type: 'string', description: 'ID of the Discord server', example: '1234567890123456789' },
        { name: 'guildName', label: 'Server Name', type: 'string', description: 'Name of the Discord server', example: 'My Server' },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z' },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Message attachments', example: [] },
        { name: 'embeds', label: 'Embeds', type: 'array', description: 'Message embeds', example: [] }
      )
    }
    // Slack triggers
    else if (nodeType === 'slack_trigger_new_message') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890.123456' },
        { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!' },
        { name: 'senderId', label: 'Sender ID', type: 'string', description: 'ID of the message sender', example: 'U1234567890' },
        { name: 'senderName', label: 'Sender Name', type: 'string', description: 'Name of the message sender', example: 'John Doe' },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: 'C1234567890' },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general' },
        { name: 'workspaceId', label: 'Workspace ID', type: 'string', description: 'ID of the Slack workspace', example: 'T1234567890' },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z' },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Message attachments', example: [] }
      )
    }
    // Teams triggers
    else if (nodeType === 'teams_trigger_new_message' || nodeType === 'teams_trigger_new_message_in_chat') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'The ID of the new message', example: '1234567890' },
        { name: 'content', label: 'Message Content', type: 'string', description: 'The content of the message', example: 'Hello everyone!' },
        { name: 'senderId', label: 'Sender ID', type: 'string', description: 'The ID of the message sender', example: 'U1234567890' },
        { name: 'senderName', label: 'Sender Name', type: 'string', description: 'The name of the message sender', example: 'John Doe' },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'The ID of the channel where the message was posted', example: 'C1234567890' },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'The name of the channel where the message was posted', example: 'general' },
        { name: 'timestamp', label: 'Message Time', type: 'string', description: 'When the message was posted (ISO 8601 format)', example: '2024-01-15T10:30:00Z' },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Array of file attachments in the message', example: [] }
      )
    }
    // Google Calendar triggers
    else if (nodeType === 'google_calendar_trigger_new_event') {
      outputs.push(
        { name: 'eventId', label: 'Event ID', type: 'string', description: 'Unique identifier for the event', example: 'abc123def456' },
        { name: 'summary', label: 'Summary', type: 'string', description: 'Event title/summary', example: 'Team Meeting' },
        { name: 'description', label: 'Description', type: 'string', description: 'Event description', example: 'Weekly team sync meeting' },
        { name: 'startTime', label: 'Start Time', type: 'string', description: 'When the event starts', example: '2024-01-15T10:00:00Z' },
        { name: 'endTime', label: 'End Time', type: 'string', description: 'When the event ends', example: '2024-01-15T11:00:00Z' },
        { name: 'location', label: 'Location', type: 'string', description: 'Event location', example: 'Conference Room A' },
        { name: 'attendees', label: 'Attendees', type: 'array', description: 'List of event attendees', example: ['user1@example.com', 'user2@example.com'] },
        { name: 'organizer', label: 'Organizer', type: 'string', description: 'Event organizer email', example: 'organizer@example.com' },
        { name: 'calendarId', label: 'Calendar ID', type: 'string', description: 'ID of the calendar', example: 'primary' }
      )
    }
    // Google Drive triggers
    else if (nodeType === 'google-drive:new_file_in_folder') {
      outputs.push(
        { name: 'fileId', label: 'File ID', type: 'string', description: 'Unique identifier for the file', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
        { name: 'fileName', label: 'File Name', type: 'string', description: 'Name of the file', example: 'document.pdf' },
        { name: 'fileType', label: 'File Type', type: 'string', description: 'Type of the file', example: 'application/pdf' },
        { name: 'fileSize', label: 'File Size', type: 'number', description: 'Size of the file in bytes', example: 1024000 },
        { name: 'folderId', label: 'Folder ID', type: 'string', description: 'ID of the parent folder', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
        { name: 'folderName', label: 'Folder Name', type: 'string', description: 'Name of the parent folder', example: 'Documents' },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the file was created', example: '2024-01-15T10:30:00Z' },
        { name: 'modifiedAt', label: 'Modified At', type: 'string', description: 'When the file was last modified', example: '2024-01-15T10:30:00Z' },
        { name: 'owner', label: 'Owner', type: 'string', description: 'Email of the file owner', example: 'owner@example.com' }
      )
    }
    // Airtable triggers
    else if (nodeType === 'airtable_trigger_new_record') {
      outputs.push(
        { name: 'recordId', label: 'Record ID', type: 'string', description: 'ID of the record', example: 'rec1234567890' },
        { name: 'tableName', label: 'Table Name', type: 'string', description: 'Name of the table', example: 'Contacts' },
        { name: 'baseId', label: 'Base ID', type: 'string', description: 'ID of the Airtable base', example: 'app1234567890' },
        { name: 'fields', label: 'Fields', type: 'object', description: 'Record fields and values', example: { 'Name': 'John Doe', 'Email': 'john@example.com' } },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the record was created', example: '2024-01-15T10:30:00Z' }
      )
    }
    // GitHub triggers
    else if (nodeType === 'github_trigger_new_issue') {
      outputs.push(
        { name: 'issueId', label: 'Issue ID', type: 'number', description: 'ID of the issue', example: 123 },
        { name: 'issueNumber', label: 'Issue Number', type: 'number', description: 'Issue number in the repository', example: 456 },
        { name: 'title', label: 'Title', type: 'string', description: 'Issue title', example: 'Bug: Login not working' },
        { name: 'body', label: 'Body', type: 'string', description: 'Issue description', example: 'Users cannot log in to the application...' },
        { name: 'author', label: 'Author', type: 'string', description: 'Username of the issue author', example: 'johndoe' },
        { name: 'repository', label: 'Repository', type: 'string', description: 'Repository name', example: 'myapp' },
        { name: 'repositoryOwner', label: 'Repository Owner', type: 'string', description: 'Owner of the repository', example: 'mycompany' },
        { name: 'labels', label: 'Labels', type: 'array', description: 'Issue labels', example: ['bug', 'high-priority'] },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the issue was created', example: '2024-01-15T10:30:00Z' }
      )
    }
    // Notion triggers
    else if (nodeType === 'notion_trigger_new_page') {
      outputs.push(
        { name: 'pageId', label: 'Page ID', type: 'string', description: 'ID of the page', example: '12345678-1234-1234-1234-123456789012' },
        { name: 'pageTitle', label: 'Page Title', type: 'string', description: 'Title of the page', example: 'Meeting Notes' },
        { name: 'databaseId', label: 'Database ID', type: 'string', description: 'ID of the parent database', example: '87654321-4321-4321-4321-210987654321' },
        { name: 'databaseName', label: 'Database Name', type: 'string', description: 'Name of the parent database', example: 'Project Notes' },
        { name: 'properties', label: 'Properties', type: 'object', description: 'Page properties and values', example: { 'Status': 'In Progress', 'Priority': 'High' } },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the page was created', example: '2024-01-15T10:30:00Z' },
        { name: 'lastEditedAt', label: 'Last Edited At', type: 'string', description: 'When the page was last edited', example: '2024-01-15T10:30:00Z' }
      )
    }
    // Twitter triggers
    else if (nodeType === 'twitter_trigger_new_mention') {
      outputs.push(
        { name: 'tweetId', label: 'Tweet ID', type: 'string', description: 'The ID of the tweet that mentioned you', example: '1234567890123456789' },
        { name: 'tweetText', label: 'Tweet Text', type: 'string', description: 'The text content of the tweet', example: 'Great product! @mycompany' },
        { name: 'authorId', label: 'Author ID', type: 'string', description: 'The ID of the user who mentioned you', example: '1234567890123456789' },
        { name: 'authorUsername', label: 'Author Username', type: 'string', description: 'The username of the user who mentioned you', example: 'johndoe' },
        { name: 'authorName', label: 'Author Name', type: 'string', description: 'The display name of the user who mentioned you', example: 'John Doe' },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the tweet was created (ISO 8601 format)', example: '2024-01-15T10:30:00Z' },
        { name: 'retweetCount', label: 'Retweet Count', type: 'number', description: 'Number of retweets', example: 5 },
        { name: 'likeCount', label: 'Like Count', type: 'number', description: 'Number of likes', example: 25 },
        { name: 'replyCount', label: 'Reply Count', type: 'number', description: 'Number of replies', example: 3 }
      )
    }
    // Generic fallback for any trigger
    else {
      // Add provider-specific common outputs as fallback
      if (providerId === 'gmail') {
        outputs.push(
          { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd' },
          { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com' },
          { name: 'to', label: 'To', type: 'string', description: 'Recipient email address', example: 'recipient@example.com' },
          { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Meeting tomorrow' },
          { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Hi, let\'s meet tomorrow at 2 PM.' },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z' }
        )
      } else if (providerId === 'slack' || providerId === 'discord') {
        outputs.push(
          { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890.123456' },
          { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!' },
          { name: 'senderId', label: 'Sender ID', type: 'string', description: 'ID of the message sender', example: 'U1234567890' },
          { name: 'senderName', label: 'Sender Name', type: 'string', description: 'Name of the message sender', example: 'John Doe' },
          { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: 'C1234567890' },
          { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general' },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z' }
        )
      } else if (providerId === 'google-sheets') {
        outputs.push(
          { name: 'spreadsheetId', label: 'Spreadsheet ID', type: 'string', description: 'ID of the spreadsheet', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
          { name: 'sheetName', label: 'Sheet Name', type: 'string', description: 'Name of the sheet', example: 'Sheet1' },
          { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data from the new/updated row', example: { 'A': 'John', 'B': 'Doe', 'C': 'john@example.com' } },
          { name: 'rowNumber', label: 'Row Number', type: 'number', description: 'Row number that was affected', example: 5 },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the change occurred', example: '2024-01-15T10:30:00Z' }
        )
      } else if (providerId === 'airtable') {
        outputs.push(
          { name: 'recordId', label: 'Record ID', type: 'string', description: 'ID of the record', example: 'rec1234567890' },
          { name: 'tableName', label: 'Table Name', type: 'string', description: 'Name of the table', example: 'Contacts' },
          { name: 'fields', label: 'Fields', type: 'object', description: 'Record fields and values', example: { 'Name': 'John Doe', 'Email': 'john@example.com' } },
          { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the record was created', example: '2024-01-15T10:30:00Z' }
        )
      } else {
        // Generic outputs for any trigger
        outputs.push(
          { name: 'id', label: 'ID', type: 'string', description: 'Unique identifier', example: '1234567890' },
          { name: 'type', label: 'Type', type: 'string', description: 'Type of the event', example: nodeType },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the event occurred', example: '2024-01-15T10:30:00Z' },
          { name: 'data', label: 'Data', type: 'object', description: 'Event data', example: { 'key': 'value' } }
        )
      }
    }

    return outputs
  }

  // Get common trigger outputs for different trigger types
  const getCommonTriggerOutputs = (nodeType: string, providerId?: string) => {
    const outputs: { name: string; label: string; type: string; description?: string; example?: any }[] = []

    // Add provider-specific common outputs
    if (providerId === 'gmail') {
      outputs.push(
        { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd' },
        { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com' },
        { name: 'to', label: 'To', type: 'string', description: 'Recipient email address', example: 'recipient@example.com' },
        { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Meeting tomorrow' },
        { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Hi, let\'s meet tomorrow at 2 PM.' },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z' }
      )
    } else if (providerId === 'slack' || providerId === 'discord') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890.123456' },
        { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!' },
        { name: 'senderId', label: 'Sender ID', type: 'string', description: 'ID of the message sender', example: 'U1234567890' },
        { name: 'senderName', label: 'Sender Name', type: 'string', description: 'Name of the message sender', example: 'John Doe' },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: 'C1234567890' },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general' },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z' }
      )
    } else if (providerId === 'google-sheets') {
      outputs.push(
        { name: 'spreadsheetId', label: 'Spreadsheet ID', type: 'string', description: 'ID of the spreadsheet', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
        { name: 'sheetName', label: 'Sheet Name', type: 'string', description: 'Name of the sheet', example: 'Sheet1' },
        { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data from the new/updated row', example: { 'A': 'John', 'B': 'Doe', 'C': 'john@example.com' } },
        { name: 'rowNumber', label: 'Row Number', type: 'number', description: 'Row number that was affected', example: 5 },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the change occurred', example: '2024-01-15T10:30:00Z' }
      )
    } else if (providerId === 'airtable') {
      outputs.push(
        { name: 'recordId', label: 'Record ID', type: 'string', description: 'ID of the record', example: 'rec1234567890' },
        { name: 'tableName', label: 'Table Name', type: 'string', description: 'Name of the table', example: 'Contacts' },
        { name: 'fields', label: 'Fields', type: 'object', description: 'Record fields and values', example: { 'Name': 'John Doe', 'Email': 'john@example.com' } },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the record was created', example: '2024-01-15T10:30:00Z' }
      )
    } else {
      // Generic outputs for any trigger
      outputs.push(
        { name: 'id', label: 'ID', type: 'string', description: 'Unique identifier', example: '1234567890' },
        { name: 'type', label: 'Type', type: 'string', description: 'Type of the event', example: nodeType },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the event occurred', example: '2024-01-15T10:30:00Z' },
        { name: 'data', label: 'Data', type: 'object', description: 'Event data', example: { 'key': 'value' } }
      )
    }

    return outputs
  }

  // Get sample values for trigger fields
  const getSampleTriggerValue = (fieldName: string, nodeType: string) => {
    const fieldNameLower = fieldName.toLowerCase()
    
    if (fieldNameLower.includes('id')) {
      return '1234567890'
    } else if (fieldNameLower.includes('email') || fieldNameLower.includes('from') || fieldNameLower.includes('to')) {
      return 'user@example.com'
    } else if (fieldNameLower.includes('name')) {
      return 'John Doe'
    } else if (fieldNameLower.includes('subject') || fieldNameLower.includes('title')) {
      return 'Sample Title'
    } else if (fieldNameLower.includes('content') || fieldNameLower.includes('body') || fieldNameLower.includes('message')) {
      return 'This is sample content'
    } else if (fieldNameLower.includes('timestamp') || fieldNameLower.includes('time') || fieldNameLower.includes('date')) {
      return '2024-01-15T10:30:00Z'
    } else if (fieldNameLower.includes('url')) {
      return 'https://example.com'
    } else if (fieldNameLower.includes('count') || fieldNameLower.includes('number')) {
      return 42
    } else if (fieldNameLower.includes('amount') || fieldNameLower.includes('price')) {
      return 99.99
    } else if (fieldNameLower.includes('active') || fieldNameLower.includes('enabled')) {
      return true
    }
    
    return 'Sample Value'
  }

  function getFriendlyLabel(node: any, key: string) {
    // 1. Try to get label from configSchema (source of truth from the modal)
    const configSchema = node.data?.configSchema || node.data?.nodeComponent?.configSchema
    if (Array.isArray(configSchema)) {
      const field = configSchema.find(f => f.name === key)
      if (field && field.label) {
        return field.label
      }
    }

    // 2. Fallback to hardcoded Discord mapping if schema fails
    if (node.data?.providerId === "discord") {
      if (key === "guildId") return "Server"
      if (key === "channelId") return "Channel"
      if (key === "messageId") return "Message"
      if (key === "content") return "Message Content"
    }

    // 3. Fallback to the raw key if all else fails
    return key
  }

  function getFriendlyValue(node: any, key: string, value: any) {
    // Discord mapping for IDs
    if (node.data?.providerId === 'discord') {
      // Try to get dynamic options from node data
      const dynamicOptions = node.data?.dynamicOptions || {};
      // Try configSchema for static options
      const configSchema = node.data?.configSchema || node.data?.nodeComponent?.configSchema;
      let label = null;
      if (key === 'guildId' || key === 'channelId' || key === 'messageId') {
        // First, check if there's a saved label in the config (highest priority)
        const config = node.data?.config || {};
        const labelKey = `${key}_label`;
        
        console.log('🔍 VariablePicker getFriendlyValue:', {
          key,
          value,
          labelKey,
          configLabelValue: config[labelKey],
          hasConfigLabel: !!config[labelKey],
          fullConfig: config,
          nodeId: node.id,
          providerId: node.data?.providerId
        });
        
        if (config[labelKey]) {
          console.log('✅ Found saved label:', config[labelKey]);
          return config[labelKey];
        }
        
        // Try dynamic options second
        if (dynamicOptions[key]) {
          const found = dynamicOptions[key].find((opt: any) => (opt.value || opt.id) === value);
          if (found) label = found.label || found.name;
        }
        // Try configSchema static options third
        if (!label && Array.isArray(configSchema)) {
          const field = configSchema.find(f => f.name === key);
          if (field && Array.isArray(field.options)) {
            const found = field.options.find((opt: any) => (typeof opt === 'string' ? opt : opt.value) === value);
            if (found) label = typeof found === 'string' ? found : found.label;
          }
        }
        if (label) return label;
        return value;
      }
      if (key === 'content') {
        return value;
      }
    }
    // Fallback for other integrations
    return value;
  }

  const previousNodes = getPreviousNodes()
  const selectedNode = selectedNodeId ? previousNodes.find(n => n.id === selectedNodeId) : null
  const selectedNodeVariables = selectedNode ? getNodeVariables(selectedNode) : []
  const triggerVariables = getTriggerOutputs()

  // Find trigger outputs from workflow config if not provided
  let triggerOutputsFromConfig: Record<string, any> | undefined = propTriggerOutputs
  if (!triggerOutputsFromConfig && workflowData?.nodes) {
    // Try to find the AI agent node and get its config.triggerOutputs
    const aiAgentNode = workflowData.nodes.find(
      n => n.data?.type && (n.data.type.toLowerCase().includes('aiagent') || n.data.type.toLowerCase().includes('ai_agent'))
    )
    if (aiAgentNode && aiAgentNode.data?.config?.triggerOutputs) {
      triggerOutputsFromConfig = aiAgentNode.data.config.triggerOutputs
    }
  }

  // Build NodeVariable[] for selected trigger outputs
  const selectedTriggerVariables: NodeVariable[] = []
  if (triggerOutputsFromConfig) {
    Object.entries(triggerOutputsFromConfig).forEach(([key, val]) => {
      selectedTriggerVariables.push({
        path: `{{trigger.${key}}}`,
        label: `Trigger: ${key}`,
        type: val.type || 'string',
        description: val.description,
        example: val.example,
        category: 'trigger',
      })
    })
  }

  // Combine all variables
  const allVariables = [...selectedNodeVariables, ...selectedTriggerVariables]

  // Get variables to display based on selection
  const getDisplayVariables = () => {
    if (selectedNodeId === 'trigger-outputs') {
      return triggerVariables
    }
    return selectedNodeVariables
  }

  const displayVariables = getDisplayVariables()

  // Filter variables based on search query
  const filteredVariables = displayVariables.filter((variable: NodeVariable) =>
    variable.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    variable.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    variable.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Filter variables by field type compatibility (basic matching)
  const getCompatibleVariables = () => {
    if (!fieldType) return filteredVariables
    
    return filteredVariables.filter((variable: NodeVariable) => {
      if (fieldType === 'email') {
        // Show email-related variables and any string variables for email fields
        const emailKeywords = ['email', 'from', 'to', 'cc', 'bcc', 'recipient', 'sender', 'address']
        const hasEmailKeyword = emailKeywords.some(keyword => 
          variable.label.toLowerCase().includes(keyword) || 
          variable.path.toLowerCase().includes(keyword)
        )
        return hasEmailKeyword || variable.type === 'string'
      }
      if (fieldType === 'text' || fieldType === 'string') return variable.type === 'string'
      if (fieldType === 'number') return variable.type === 'number'
      if (fieldType === 'file') {
        // Show file-related variables
        const fileKeywords = ['file', 'attachment', 'document', 'upload', 'download', 'path', 'url']
        const hasFileKeyword = fileKeywords.some(keyword => 
          variable.label.toLowerCase().includes(keyword) || 
          variable.path.toLowerCase().includes(keyword)
        )
        return hasFileKeyword || variable.type === 'file' || variable.type === 'string'
      }
      return true // Show all by default
    })
  }

  const handleVariableSelect = (variable: NodeVariable) => {
    // Use the actual value if available, otherwise fall back to the template path
    const valueToInsert = variable.example && typeof variable.example === 'string' && variable.example.trim() !== ''
      ? variable.example
      : variable.path
    
    onVariableSelect(valueToInsert)
    setOpen(false)
    setSearchQuery('')
    setSelectedNodeId(null)
  }

  const getNodeDisplayName = (node: any) => {
    const nodeType = node.data?.isTrigger ? 'Trigger' : 'Action'
    const provider = node.data?.providerId || 'Unknown'
    const title = node.data?.title || node.data?.type || node.type || 'Unknown'
    
    // Capitalize provider names for better display
    const displayProvider = provider.charAt(0).toUpperCase() + provider.slice(1).replace('-', ' ')
    
    return `${nodeType}: ${displayProvider}: ${title}`
  }

  const getNodeIcon = (node: any) => {
    if (node.data?.isTrigger) return '🚀'
    if (node.data?.providerId === 'gmail') return '📧'
    if (node.data?.providerId === 'slack') return '💬'
    if (node.data?.providerId === 'google-sheets') return '📊'
    return '⚙️'
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'config': return 'bg-blue-100 text-blue-800'
      case 'output': return 'bg-green-100 text-green-800'  
      case 'schema': return 'bg-purple-100 text-purple-800'
      case 'trigger': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Database className="w-4 h-4" />
            Browse Variables
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl h-[600px] p-0 flex flex-col">
        <DialogHeader className="px-6 py-3 border-b flex-shrink-0">
          <DialogTitle className="text-lg">Select Variable from Previous Nodes</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-1 h-0 min-h-0">
          {/* Left Panel - Node List */}
          <div className="w-1/3 border-r flex flex-col min-h-0">
            <div className="p-4 border-b flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm text-muted-foreground">Previous Nodes</h3>
                {triggerVariables.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTriggerOutputs(!showTriggerOutputs)}
                    className="h-6 px-2 text-xs"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    {showTriggerOutputs ? 'Hide' : 'Show'} Triggers
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-2">
                {previousNodes.length === 0 && triggerVariables.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No previous nodes found.<br />
                    Add nodes before this one to see available variables.
                  </div>
                ) : (
                  <>
                    {/* Previous Nodes */}
                    {previousNodes
                      .map((node) => {
                        const variables = getNodeVariables(node)
                        return { node, variables }
                      })
                      .filter(({ variables }) => variables.length > 0) // Only show nodes with variables
                      .map(({ node, variables }) => (
                        <div
                          key={node.id}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-colors",
                            selectedNodeId === node.id 
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:bg-muted/50"
                          )}
                          onClick={() => setSelectedNodeId(node.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getNodeIcon(node)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {getNodeDisplayName(node)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {variables.length} variables available
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    
                    {/* Trigger Outputs */}
                    {showTriggerOutputs && triggerVariables.length > 0 && (
                      <div className="mt-4">
                        <div className="px-3 py-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Trigger Outputs
                          </h4>
                        </div>
                        <div
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-colors",
                            selectedNodeId === 'trigger-outputs'
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:bg-muted/50"
                          )}
                          onClick={() => setSelectedNodeId('trigger-outputs')}
                        >
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-orange-500" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                Trigger Variables
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {triggerVariables.length} trigger outputs available
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Variables List */}
          <div className="flex-1 flex flex-col">
            {selectedNode ? (
              <>
                <div className="p-4 border-b space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getNodeIcon(selectedNode)}</span>
                    <h3 className="font-medium">{getNodeDisplayName(selectedNode)}</h3>
                  </div>
                  
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search variables..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-2">
                    {getCompatibleVariables().length === 0 ? (
                      <div className="text-center text-muted-foreground text-sm py-8">
                        {searchQuery ? 'No variables match your search.' : 'No variables available from this node.'}
                      </div>
                    ) : (
                      getCompatibleVariables().map((variable: NodeVariable, index: number) => (
                        <div
                          key={index}
                          className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleVariableSelect(variable)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium">
                                  {variable.label}:
                                </span>
                                <Badge variant="secondary" className={cn("text-xs", getCategoryColor(variable.category))}>
                                  {variable.type}
                                </Badge>
                              </div>
                              
                              {variable.example !== undefined && (
                                <div className="text-sm text-foreground font-mono">
                                  {getFriendlyValue(selectedNode, variable.originalKey || variable.label, variable.example)}
                                </div>
                              )}
                              
                              {variable.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {variable.description}
                                </div>
                              )}
                            </div>
                            
                            <Button variant="ghost" size="sm" className="flex-shrink-0">
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a node to browse its variables</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 