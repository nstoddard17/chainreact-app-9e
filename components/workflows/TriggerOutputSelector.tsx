"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  Database, 
  Eye, 
  Copy, 
  Zap, 
  MessageSquare, 
  Mail, 
  FileText, 
  Calendar,
  Users,
  ShoppingCart,
  Video,
  AtSign,
  Bell,
  Settings,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

interface TriggerOutputSelectorProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onOutputSelect: (outputs: Record<string, any>) => void
  trigger?: React.ReactNode
}

interface TriggerOutput {
  nodeId: string
  nodeType: string
  nodeTitle: string
  providerId?: string
  outputs: {
    name: string
    label: string
    type: string
    description?: string
    example?: any
    selected: boolean
    alias?: string
    transform?: string
  }[]
}

export default function TriggerOutputSelector({
  workflowData,
  currentNodeId,
  onOutputSelect,
  trigger
}: TriggerOutputSelectorProps) {
  const [open, setOpen] = useState(false)
  const [selectedOutputs, setSelectedOutputs] = useState<Record<string, any>>({})
  const [triggerOutputs, setTriggerOutputs] = useState<TriggerOutput[]>([])

  // Get trigger nodes from the workflow
  const getTriggerNodes = () => {
    if (!workflowData?.nodes) return []
    
    return workflowData.nodes.filter(node => 
      node.id !== currentNodeId && // Exclude current node
      node.data?.isTrigger && // Only trigger nodes
      node.data?.type // Must have a type
    )
  }

  // Generate sample outputs for trigger nodes
  const generateTriggerOutputs = () => {
    const triggerNodes = getTriggerNodes()
    const outputs: TriggerOutput[] = []

    triggerNodes.forEach(node => {
      const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
      if (!nodeComponent) return

      const nodeOutputs: TriggerOutput['outputs'] = []

      // Add outputs from outputSchema if available
      if (nodeComponent.outputSchema) {
        nodeComponent.outputSchema.forEach(field => {
          nodeOutputs.push({
            name: field.name,
            label: field.label,
            type: field.type,
            description: field.description,
            example: field.example,
            selected: false,
            alias: field.name,
            transform: 'none'
          })
        })
      }

      // Add outputs from payloadSchema if available (for triggers)
      if (nodeComponent.payloadSchema) {
        Object.entries(nodeComponent.payloadSchema).forEach(([key, description]) => {
          // Skip if already added from outputSchema
          if (nodeOutputs.some(o => o.name === key)) return
          
          nodeOutputs.push({
            name: key,
            label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
            type: 'string', // Default to string for payload schema
            description: typeof description === 'string' ? description : undefined,
            example: getSampleValue(key, node.data?.type),
            selected: false,
            alias: key,
            transform: 'none'
          })
        })
      }

      // Add common trigger outputs if no specific schema
      if (nodeOutputs.length === 0) {
        const commonOutputs = getCommonTriggerOutputs(node.data?.type, node.data?.providerId)
        commonOutputs.forEach(output => {
          nodeOutputs.push({
            ...output,
            selected: false,
            alias: output.name,
            transform: 'none'
          })
        })
      }

      if (nodeOutputs.length > 0) {
        outputs.push({
          nodeId: node.id,
          nodeType: node.data?.type,
          nodeTitle: node.data?.title || nodeComponent.title,
          providerId: node.data?.providerId,
          outputs: nodeOutputs
        })
      }
    })

    return outputs
  }

  // Get common outputs for different trigger types
  const getCommonTriggerOutputs = (nodeType: string, providerId?: string) => {
    const outputs: TriggerOutput['outputs'] = []

    // Gmail triggers
    if (nodeType === 'gmail_trigger_new_email') {
      outputs.push(
        { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd', selected: false },
        { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com', selected: false },
        { name: 'to', label: 'To', type: 'string', description: 'Recipient email address', example: 'recipient@example.com', selected: false },
        { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Meeting tomorrow', selected: false },
        { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Hi, let\'s meet tomorrow at 2 PM.', selected: false },
        { name: 'receivedAt', label: 'Received At', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'threadId', label: 'Thread ID', type: 'string', description: 'Email thread identifier', example: '17c123456789abcd', selected: false },
        { name: 'snippet', label: 'Snippet', type: 'string', description: 'Short preview of email content', example: 'Hi, let\'s meet tomorrow...', selected: false },
        { name: 'labelIds', label: 'Labels', type: 'array', description: 'Gmail labels applied to the email', example: ['INBOX', 'IMPORTANT'], selected: false },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Email attachments', example: [], selected: false }
      )
    } else if (nodeType === 'gmail_trigger_new_attachment') {
      outputs.push(
        { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd', selected: false },
        { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com', selected: false },
        { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Document attached', selected: false },
        { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Please find the attached document.', selected: false },
        { name: 'receivedAt', label: 'Received At', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Email attachments', example: [{ filename: 'document.pdf', size: 1024000 }], selected: false }
      )
    } else if (nodeType === 'gmail_trigger_new_label') {
      outputs.push(
        { name: 'labelId', label: 'Label ID', type: 'string', description: 'Unique identifier for the label', example: 'Label_123456789', selected: false },
        { name: 'labelName', label: 'Label Name', type: 'string', description: 'Name of the new label', example: 'Important', selected: false },
        { name: 'labelType', label: 'Label Type', type: 'string', description: 'Type of the label', example: 'user', selected: false },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the label was created', example: '2024-01-15T10:30:00Z', selected: false }
      )
    }
    // Discord triggers
    else if (nodeType === 'discord_trigger_new_message') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890123456789', selected: false },
        { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!', selected: false },
        { name: 'authorId', label: 'Author ID', type: 'string', description: 'ID of the message author', example: '123456789012345678', selected: false },
        { name: 'authorName', label: 'Author Name', type: 'string', description: 'Name of the message author', example: 'John Doe', selected: false },
        { name: 'authorUsername', label: 'Author Username', type: 'string', description: 'Username of the message author', example: 'johndoe', selected: false },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: '1234567890123456789', selected: false },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general', selected: false },
        { name: 'guildId', label: 'Server ID', type: 'string', description: 'ID of the Discord server', example: '1234567890123456789', selected: false },
        { name: 'guildName', label: 'Server Name', type: 'string', description: 'Name of the Discord server', example: 'My Server', selected: false },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Message attachments', example: [], selected: false },
        { name: 'embeds', label: 'Embeds', type: 'array', description: 'Message embeds', example: [], selected: false }
      )
    }
    // Slack triggers
    else if (nodeType === 'slack_trigger_new_message') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890.123456', selected: false },
        { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!', selected: false },
        { name: 'senderId', label: 'Sender ID', type: 'string', description: 'ID of the message sender', example: 'U1234567890', selected: false },
        { name: 'senderName', label: 'Sender Name', type: 'string', description: 'Name of the message sender', example: 'John Doe', selected: false },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: 'C1234567890', selected: false },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general', selected: false },
        { name: 'workspaceId', label: 'Workspace ID', type: 'string', description: 'ID of the Slack workspace', example: 'T1234567890', selected: false },
        { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Message attachments', example: [], selected: false }
      )
    }
    // Teams triggers
    else if (nodeType === 'teams_trigger_new_message' || nodeType === 'teams_trigger_new_message_in_chat') {
      outputs.push(
        { name: 'messageId', label: 'Message ID', type: 'string', description: 'The ID of the new message', example: '1234567890', selected: false },
        { name: 'content', label: 'Message Content', type: 'string', description: 'The content of the message', example: 'Hello everyone!', selected: false },
        { name: 'senderId', label: 'Sender ID', type: 'string', description: 'The ID of the message sender', example: 'U1234567890', selected: false },
        { name: 'senderName', label: 'Sender Name', type: 'string', description: 'The name of the message sender', example: 'John Doe', selected: false },
        { name: 'channelId', label: 'Channel ID', type: 'string', description: 'The ID of the channel where the message was posted', example: 'C1234567890', selected: false },
        { name: 'channelName', label: 'Channel Name', type: 'string', description: 'The name of the channel where the message was posted', example: 'general', selected: false },
        { name: 'timestamp', label: 'Message Time', type: 'string', description: 'When the message was posted (ISO 8601 format)', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'attachments', label: 'Attachments', type: 'array', description: 'Array of file attachments in the message', example: [], selected: false }
      )
    }
    // Google Calendar triggers
    else if (nodeType === 'google_calendar_trigger_new_event') {
      outputs.push(
        { name: 'eventId', label: 'Event ID', type: 'string', description: 'Unique identifier for the event', example: 'abc123def456', selected: false },
        { name: 'summary', label: 'Summary', type: 'string', description: 'Event title/summary', example: 'Team Meeting', selected: false },
        { name: 'description', label: 'Description', type: 'string', description: 'Event description', example: 'Weekly team sync meeting', selected: false },
        { name: 'startTime', label: 'Start Time', type: 'string', description: 'When the event starts', example: '2024-01-15T10:00:00Z', selected: false },
        { name: 'endTime', label: 'End Time', type: 'string', description: 'When the event ends', example: '2024-01-15T11:00:00Z', selected: false },
        { name: 'location', label: 'Location', type: 'string', description: 'Event location', example: 'Conference Room A', selected: false },
        { name: 'attendees', label: 'Attendees', type: 'array', description: 'List of event attendees', example: ['user1@example.com', 'user2@example.com'], selected: false },
        { name: 'organizer', label: 'Organizer', type: 'string', description: 'Event organizer email', example: 'organizer@example.com', selected: false },
        { name: 'calendarId', label: 'Calendar ID', type: 'string', description: 'ID of the calendar', example: 'primary', selected: false }
      )
    }
    // Google Drive triggers
    else if (nodeType === 'google-drive:new_file_in_folder') {
      outputs.push(
        { name: 'fileId', label: 'File ID', type: 'string', description: 'Unique identifier for the file', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', selected: false },
        { name: 'fileName', label: 'File Name', type: 'string', description: 'Name of the file', example: 'document.pdf', selected: false },
        { name: 'fileType', label: 'File Type', type: 'string', description: 'Type of the file', example: 'application/pdf', selected: false },
        { name: 'fileSize', label: 'File Size', type: 'number', description: 'Size of the file in bytes', example: 1024000, selected: false },
        { name: 'folderId', label: 'Folder ID', type: 'string', description: 'ID of the parent folder', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', selected: false },
        { name: 'folderName', label: 'Folder Name', type: 'string', description: 'Name of the parent folder', example: 'Documents', selected: false },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the file was created', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'modifiedAt', label: 'Modified At', type: 'string', description: 'When the file was last modified', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'owner', label: 'Owner', type: 'string', description: 'Email of the file owner', example: 'owner@example.com', selected: false }
      )
    }
    // Airtable triggers
    else if (nodeType === 'airtable_trigger_new_record') {
      outputs.push(
        { name: 'recordId', label: 'Record ID', type: 'string', description: 'ID of the record', example: 'rec1234567890', selected: false },
        { name: 'tableName', label: 'Table Name', type: 'string', description: 'Name of the table', example: 'Contacts', selected: false },
        { name: 'baseId', label: 'Base ID', type: 'string', description: 'ID of the Airtable base', example: 'app1234567890', selected: false },
        { name: 'fields', label: 'Fields', type: 'object', description: 'Record fields and values', example: { 'Name': 'John Doe', 'Email': 'john@example.com' }, selected: false },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the record was created', example: '2024-01-15T10:30:00Z', selected: false }
      )
    }
    // GitHub triggers
    else if (nodeType === 'github_trigger_new_issue') {
      outputs.push(
        { name: 'issueId', label: 'Issue ID', type: 'number', description: 'ID of the issue', example: 123, selected: false },
        { name: 'issueNumber', label: 'Issue Number', type: 'number', description: 'Issue number in the repository', example: 456, selected: false },
        { name: 'title', label: 'Title', type: 'string', description: 'Issue title', example: 'Bug: Login not working', selected: false },
        { name: 'body', label: 'Body', type: 'string', description: 'Issue description', example: 'Users cannot log in to the application...', selected: false },
        { name: 'author', label: 'Author', type: 'string', description: 'Username of the issue author', example: 'johndoe', selected: false },
        { name: 'repository', label: 'Repository', type: 'string', description: 'Repository name', example: 'myapp', selected: false },
        { name: 'repositoryOwner', label: 'Repository Owner', type: 'string', description: 'Owner of the repository', example: 'mycompany', selected: false },
        { name: 'labels', label: 'Labels', type: 'array', description: 'Issue labels', example: ['bug', 'high-priority'], selected: false },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the issue was created', example: '2024-01-15T10:30:00Z', selected: false }
      )
    }
    // Notion triggers
    else if (nodeType === 'notion_trigger_new_page') {
      outputs.push(
        { name: 'pageId', label: 'Page ID', type: 'string', description: 'ID of the page', example: '12345678-1234-1234-1234-123456789012', selected: false },
        { name: 'pageTitle', label: 'Page Title', type: 'string', description: 'Title of the page', example: 'Meeting Notes', selected: false },
        { name: 'databaseId', label: 'Database ID', type: 'string', description: 'ID of the parent database', example: '87654321-4321-4321-4321-210987654321', selected: false },
        { name: 'databaseName', label: 'Database Name', type: 'string', description: 'Name of the parent database', example: 'Project Notes', selected: false },
        { name: 'properties', label: 'Properties', type: 'object', description: 'Page properties and values', example: { 'Status': 'In Progress', 'Priority': 'High' }, selected: false },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the page was created', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'lastEditedAt', label: 'Last Edited At', type: 'string', description: 'When the page was last edited', example: '2024-01-15T10:30:00Z', selected: false }
      )
    }
    // Twitter triggers
    else if (nodeType === 'twitter_trigger_new_mention') {
      outputs.push(
        { name: 'tweetId', label: 'Tweet ID', type: 'string', description: 'The ID of the tweet that mentioned you', example: '1234567890123456789', selected: false },
        { name: 'tweetText', label: 'Tweet Text', type: 'string', description: 'The text content of the tweet', example: 'Great product! @mycompany', selected: false },
        { name: 'authorId', label: 'Author ID', type: 'string', description: 'The ID of the user who mentioned you', example: '1234567890123456789', selected: false },
        { name: 'authorUsername', label: 'Author Username', type: 'string', description: 'The username of the user who mentioned you', example: 'johndoe', selected: false },
        { name: 'authorName', label: 'Author Name', type: 'string', description: 'The display name of the user who mentioned you', example: 'John Doe', selected: false },
        { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the tweet was created (ISO 8601 format)', example: '2024-01-15T10:30:00Z', selected: false },
        { name: 'retweetCount', label: 'Retweet Count', type: 'number', description: 'Number of retweets', example: 5, selected: false },
        { name: 'likeCount', label: 'Like Count', type: 'number', description: 'Number of likes', example: 25, selected: false },
        { name: 'replyCount', label: 'Reply Count', type: 'number', description: 'Number of replies', example: 3, selected: false }
      )
    }
    // Generic fallback for any trigger
    else {
      // Add provider-specific common outputs as fallback
      if (providerId === 'gmail') {
        outputs.push(
          { name: 'id', label: 'Message ID', type: 'string', description: 'Unique identifier for the email', example: '17c123456789abcd', selected: false },
          { name: 'from', label: 'From', type: 'string', description: 'Sender email address', example: 'sender@example.com', selected: false },
          { name: 'to', label: 'To', type: 'string', description: 'Recipient email address', example: 'recipient@example.com', selected: false },
          { name: 'subject', label: 'Subject', type: 'string', description: 'Email subject line', example: 'Meeting tomorrow', selected: false },
          { name: 'body', label: 'Body', type: 'string', description: 'Email content', example: 'Hi, let\'s meet tomorrow at 2 PM.', selected: false },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the email was received', example: '2024-01-15T10:30:00Z', selected: false }
        )
      } else if (providerId === 'slack' || providerId === 'discord') {
        outputs.push(
          { name: 'messageId', label: 'Message ID', type: 'string', description: 'Unique identifier for the message', example: '1234567890.123456', selected: false },
          { name: 'content', label: 'Content', type: 'string', description: 'Message content', example: 'Hello everyone!', selected: false },
          { name: 'senderId', label: 'Sender ID', type: 'string', description: 'ID of the message sender', example: 'U1234567890', selected: false },
          { name: 'senderName', label: 'Sender Name', type: 'string', description: 'Name of the message sender', example: 'John Doe', selected: false },
          { name: 'channelId', label: 'Channel ID', type: 'string', description: 'ID of the channel', example: 'C1234567890', selected: false },
          { name: 'channelName', label: 'Channel Name', type: 'string', description: 'Name of the channel', example: 'general', selected: false },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the message was sent', example: '2024-01-15T10:30:00Z', selected: false }
        )
      } else if (providerId === 'google-sheets') {
        outputs.push(
          { name: 'spreadsheetId', label: 'Spreadsheet ID', type: 'string', description: 'ID of the spreadsheet', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', selected: false },
          { name: 'sheetName', label: 'Sheet Name', type: 'string', description: 'Name of the sheet', example: 'Sheet1', selected: false },
          { name: 'rowData', label: 'Row Data', type: 'object', description: 'Data from the new/updated row', example: { 'A': 'John', 'B': 'Doe', 'C': 'john@example.com' }, selected: false },
          { name: 'rowNumber', label: 'Row Number', type: 'number', description: 'Row number that was affected', example: 5, selected: false },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the change occurred', example: '2024-01-15T10:30:00Z', selected: false }
        )
      } else if (providerId === 'airtable') {
        outputs.push(
          { name: 'recordId', label: 'Record ID', type: 'string', description: 'ID of the record', example: 'rec1234567890', selected: false },
          { name: 'tableName', label: 'Table Name', type: 'string', description: 'Name of the table', example: 'Contacts', selected: false },
          { name: 'fields', label: 'Fields', type: 'object', description: 'Record fields and values', example: { 'Name': 'John Doe', 'Email': 'john@example.com' }, selected: false },
          { name: 'createdAt', label: 'Created At', type: 'string', description: 'When the record was created', example: '2024-01-15T10:30:00Z', selected: false }
        )
      } else {
        // Generic outputs for any trigger
        outputs.push(
          { name: 'id', label: 'ID', type: 'string', description: 'Unique identifier', example: '1234567890', selected: false },
          { name: 'type', label: 'Type', type: 'string', description: 'Type of the event', example: nodeType, selected: false },
          { name: 'timestamp', label: 'Timestamp', type: 'string', description: 'When the event occurred', example: '2024-01-15T10:30:00Z', selected: false },
          { name: 'data', label: 'Data', type: 'object', description: 'Event data', example: { 'key': 'value' }, selected: false }
        )
      }
    }

    return outputs
  }

  // Get sample values for different field types
  const getSampleValue = (fieldName: string, nodeType: string) => {
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

  // Get icon for provider
  const getProviderIcon = (providerId?: string) => {
    switch (providerId) {
      case 'gmail': return <Mail className="w-4 h-4" />
      case 'slack': return <MessageSquare className="w-4 h-4" />
      case 'discord': return <MessageSquare className="w-4 h-4" />
      case 'google-sheets': return <FileText className="w-4 h-4" />
      case 'google-calendar': return <Calendar className="w-4 h-4" />
      case 'airtable': return <Database className="w-4 h-4" />
      case 'hubspot': return <Users className="w-4 h-4" />
      case 'shopify': return <ShoppingCart className="w-4 h-4" />
      case 'youtube': return <Video className="w-4 h-4" />
      case 'twitter': return <AtSign className="w-4 h-4" />
      case 'github': return <Settings className="w-4 h-4" />
      default: return <Zap className="w-4 h-4" />
    }
  }

  // Get type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'string': return 'bg-blue-100 text-blue-800'
      case 'number': return 'bg-green-100 text-green-800'
      case 'boolean': return 'bg-purple-100 text-purple-800'
      case 'array': return 'bg-orange-100 text-orange-800'
      case 'object': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Initialize trigger outputs when modal opens
  useEffect(() => {
    if (open) {
      const outputs = generateTriggerOutputs()
      setTriggerOutputs(outputs)
    }
  }, [open, workflowData, currentNodeId])

  // Handle output selection
  const handleOutputToggle = (nodeId: string, outputName: string, selected: boolean) => {
    setTriggerOutputs(prev => 
      prev.map(trigger => 
        trigger.nodeId === nodeId 
          ? {
              ...trigger,
              outputs: trigger.outputs.map(output =>
                output.name === outputName 
                  ? { ...output, selected }
                  : output
              )
            }
          : trigger
      )
    )
  }

  // Handle output configuration change
  const handleOutputConfigChange = (nodeId: string, outputName: string, field: 'alias' | 'transform', value: string) => {
    setTriggerOutputs(prev => 
      prev.map(trigger => 
        trigger.nodeId === nodeId 
          ? {
              ...trigger,
              outputs: trigger.outputs.map(output =>
                output.name === outputName 
                  ? { ...output, [field]: value }
                  : output
              )
            }
          : trigger
      )
    )
  }

  // Handle save
  const handleSave = () => {
    const selectedOutputs: Record<string, any> = {}
    
    triggerOutputs.forEach(trigger => {
      trigger.outputs.forEach(output => {
        if (output.selected) {
          const key = output.alias || output.name
          selectedOutputs[key] = {
            source: `${trigger.nodeTitle} (${trigger.nodeType})`,
            type: output.type,
            description: output.description,
            example: output.example,
            transform: output.transform
          }
        }
      })
    })
    
    onOutputSelect(selectedOutputs)
    setOpen(false)
  }

  // Select all outputs for a trigger
  const selectAllOutputs = (nodeId: string) => {
    setTriggerOutputs(prev => 
      prev.map(trigger => 
        trigger.nodeId === nodeId 
          ? {
              ...trigger,
              outputs: trigger.outputs.map(output => ({ ...output, selected: true }))
            }
          : trigger
      )
    )
  }

  // Deselect all outputs for a trigger
  const deselectAllOutputs = (nodeId: string) => {
    setTriggerOutputs(prev => 
      prev.map(trigger => 
        trigger.nodeId === nodeId 
          ? {
              ...trigger,
              outputs: trigger.outputs.map(output => ({ ...output, selected: false }))
            }
          : trigger
      )
    )
  }

  const totalSelectedOutputs = triggerOutputs.reduce(
    (total, trigger) => total + trigger.outputs.filter(o => o.selected).length, 
    0
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Zap className="w-4 h-4" />
            Select Trigger Outputs
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[900px] max-h-[95vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl" style={{ paddingRight: '2rem' }}>
        <DialogHeader className="pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                  Select Trigger Outputs
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Trigger</Badge>
                </DialogTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Choose which trigger outputs should be available as variables in your workflow
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-slate-100 text-slate-800 border-slate-200">
                {totalSelectedOutputs} selected
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 rounded-full transition-all duration-200 group"
              >
                <svg className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <ScrollArea className="h-[calc(80vh-220px)] pr-4 overflow-visible">
          <div className="pt-3 px-2 pb-6">
            {triggerOutputs.length === 0 ? (
              <div className="text-center py-12">
                <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Trigger Nodes Found</h3>
                <p className="text-muted-foreground">
                  Add trigger nodes to your workflow to see available outputs here.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {triggerOutputs.map((trigger) => (
                  <Card key={trigger.nodeId}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            {getProviderIcon(trigger.providerId)}
                          </div>
                          <div>
                            <CardTitle className="text-base">{trigger.nodeTitle}</CardTitle>
                            <p className="text-sm text-muted-foreground">{trigger.nodeType}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectAllOutputs(trigger.nodeId)}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deselectAllOutputs(trigger.nodeId)}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {trigger.outputs.map((output) => (
                          <div key={output.name} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50">
                            <Checkbox
                              checked={output.selected}
                              onCheckedChange={(checked) => 
                                handleOutputToggle(trigger.nodeId, output.name, checked as boolean)
                              }
                            />
                            
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{output.label}</span>
                                <Badge variant="secondary" className={cn("text-xs", getTypeColor(output.type))}>
                                  {output.type}
                                </Badge>
                              </div>
                              
                              {output.description && (
                                <p className="text-xs text-muted-foreground">{output.description}</p>
                              )}
                              
                              {output.example && (
                                <div className="text-xs font-mono bg-muted p-2 rounded">
                                  Example: {typeof output.example === 'object' 
                                    ? JSON.stringify(output.example, null, 2)
                                    : String(output.example)
                                  }
                                </div>
                              )}
                              
                              {output.selected && (
                                <div className="flex items-center gap-2 pt-2">
                                  <div className="flex-1">
                                    <Label className="text-xs">Alias (optional)</Label>
                                    <Input
                                      value={output.alias || output.name}
                                      onChange={(e) => handleOutputConfigChange(trigger.nodeId, output.name, 'alias', e.target.value)}
                                      className="h-7 text-xs"
                                      placeholder="Custom name"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <Label className="text-xs">Transform</Label>
                                    <Select
                                      value={output.transform || 'none'}
                                      onValueChange={(value) => handleOutputConfigChange(trigger.nodeId, output.name, 'transform', value)}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">No Transform</SelectItem>
                                        <SelectItem value="uppercase">Uppercase</SelectItem>
                                        <SelectItem value="lowercase">Lowercase</SelectItem>
                                        <SelectItem value="capitalize">Capitalize</SelectItem>
                                        <SelectItem value="trim">Trim Whitespace</SelectItem>
                                        <SelectItem value="number">Convert to Number</SelectItem>
                                        <SelectItem value="boolean">Convert to Boolean</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Selected outputs will be available as variables in your workflow configuration
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={totalSelectedOutputs === 0}>
              Save Selection ({totalSelectedOutputs})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 