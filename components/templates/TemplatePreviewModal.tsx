"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { TemplatePreviewWithProvider } from "./TemplatePreview"

interface Template {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  nodes: any[]
  connections: any[]
  is_predefined?: boolean
  difficulty?: string
  estimatedTime?: string
  integrations?: string[]
}

interface TemplatePreviewModalProps {
  template: Template | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Helper function to properly capitalize tags
const capitalizeTag = (tag: string): string => {
  const tagMap: Record<string, string> = {
    'ai-agent': 'AI Agent',
    'ai agent': 'AI Agent',
    'ai-message': 'AI Message',
    'ai message': 'AI Message',
    'gmail': 'Gmail',
    'email': 'Email',
    'airtable': 'Airtable',
    'discord': 'Discord',
    'slack': 'Slack',
    'notion': 'Notion',
    'hubspot': 'HubSpot',
    'salesforce': 'Salesforce',
    'stripe': 'Stripe',
    'shopify': 'Shopify',
    'google-sheets': 'Google Sheets',
    'google sheets': 'Google Sheets',
    'google-drive': 'Google Drive',
    'google drive': 'Google Drive',
    'onedrive': 'OneDrive',
    'dropbox': 'Dropbox',
    'trello': 'Trello',
    'asana': 'Asana',
    'leads': 'Leads',
    'crm': 'CRM',
    'sales automation': 'Sales Automation',
    'email automation': 'Email Automation',
    'test': 'Test',
    'advanced': 'Advanced',
    'intermediate': 'Intermediate',
    'beginner': 'Beginner',
  }

  const lowerTag = tag.toLowerCase()
  return tagMap[lowerTag] || tag.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ')
}

export function TemplatePreviewModal({
  template,
  open,
  onOpenChange
}: TemplatePreviewModalProps) {
  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{template.name}</DialogTitle>
            {template.is_predefined && (
              <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
                Official
              </Badge>
            )}
          </div>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        {/* Template metadata */}
        <div className="grid grid-cols-4 gap-4 py-3 border-b">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Category</p>
            <Badge variant="secondary" className="text-xs">{template.category}</Badge>
          </div>
          {template.difficulty && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Difficulty</p>
              <Badge variant="outline" className="text-xs">{capitalizeTag(template.difficulty)}</Badge>
            </div>
          )}
          {template.estimatedTime && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Time</p>
              <p className="text-sm">{template.estimatedTime}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Nodes</p>
            <p className="text-sm font-semibold">{template.nodes?.length || 0}</p>
          </div>
        </div>

        {/* Interactive workflow preview */}
        <div className="rounded-lg border bg-gray-50 overflow-hidden relative" style={{ height: '500px', width: '100%' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}>
            <TemplatePreviewWithProvider
              nodes={template.nodes || []}
              connections={template.connections || []}
              interactive={true}
              showControls={true}
              showMiniMap={false}
              className=""
            />
          </div>
        </div>

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Tags</p>
            <div className="flex flex-wrap gap-1">
              {template.tags.map((tag, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {capitalizeTag(tag)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
