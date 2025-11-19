"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RichTextSignatureEditor } from './RichTextSignatureEditor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link,
  Image,
  Palette,
  Type,
  Quote,
  Code,
  Undo,
  Redo,
  FileSignature,
  ChevronDown,
  Eye,
  EyeOff,
  Mail,
  User,
  Calendar,
  Building,
  Braces,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Minus,
  IndentDecrease,
  IndentIncrease,
  RemoveFormatting,
  Paintbrush,
  Upload,
  Link2,
  Pencil,
  Trash2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useVariableDropTarget } from '../hooks/useVariableDropTarget'
import { insertVariableIntoContentEditable, normalizeDraggedVariable } from '@/lib/workflows/variableInsertion'
import { GenericSelectField } from './shared/GenericSelectField'

import { logger } from '@/lib/utils/logger'


interface EmailRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  integrationProvider?: string // 'gmail', 'outlook', etc.
  userId?: string
  availableVariables?: string[] // List of available variable keys (e.g., ['trigger.subject', 'trigger.body'])
  workflowNodes?: any[] // Current workflow nodes to extract available variables
}

interface EmailTemplate {
  id: string
  name: string
  content: string
  category: 'business' | 'personal' | 'marketing' | 'support'
}

interface EmailSignature {
  id: string
  name: string
  content: string
  isDefault: boolean
  email?: string
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  // Business Templates
  {
    id: 'meeting-request',
    name: 'Meeting Request',
    content: `<p>Hi {{recipient_name}},</p>

<p>I hope this email finds you well. I would like to schedule a meeting to discuss <strong>{{meeting_topic}}</strong>.</p>

<p>Would you be available for a <strong>{{meeting_duration}}</strong> meeting sometime next week? I'm flexible with timing and can accommodate your schedule.</p>

<p>Please let me know what works best for you.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'follow-up',
    name: 'Follow-up Email',
    content: `<p>Hi {{recipient_name}},</p>

<p>I wanted to follow up on our conversation about <strong>{{discussion_topic}}</strong>.</p>

<p>As discussed, I'm attaching the information you requested. Please let me know if you have any questions or if there's anything else I can help you with.</p>

<p>Looking forward to hearing from you.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'project-update',
    name: 'Project Update',
    content: `<p>Hi Team,</p>

<p><strong>Project Status Update - {{project_name}}</strong></p>

<p><strong>Progress This Week:</strong></p>
<ul>
<li>{{accomplishment_1}}</li>
<li>{{accomplishment_2}}</li>
<li>{{accomplishment_3}}</li>
</ul>

<p><strong>Upcoming Milestones:</strong></p>
<ul>
<li>{{milestone_1}} - {{milestone_1_date}}</li>
<li>{{milestone_2}} - {{milestone_2_date}}</li>
</ul>

<p><strong>Blockers/Issues:</strong><br>
{{blockers_description}}</p>

<p>Please let me know if you have any questions or concerns.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'proposal-submission',
    name: 'Proposal Submission',
    content: `<p>Dear {{client_name}},</p>

<p>Thank you for the opportunity to submit a proposal for <strong>{{project_name}}</strong>.</p>

<p>Based on our discussion, I've prepared a comprehensive proposal that outlines:</p>
<ul>
<li>Project scope and deliverables</li>
<li>Timeline and milestones</li>
<li>Investment and payment terms</li>
</ul>

<p>Please find the detailed proposal attached. I'm confident this solution will meet your needs and exceed your expectations.</p>

<p>I'm available to discuss any questions you may have and look forward to the opportunity to work with you.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'performance-review',
    name: 'Performance Review Request',
    content: `<p>Hi {{employee_name}},</p>

<p>I hope you're doing well. It's time for your quarterly performance review, and I'd like to schedule a meeting to discuss your progress and goals.</p>

<p><strong>Review Topics:</strong></p>
<ul>
<li>Achievements and accomplishments</li>
<li>Areas for improvement and development</li>
<li>Goal setting for next quarter</li>
<li>Career development opportunities</li>
</ul>

<p>Please come prepared to discuss your self-assessment and any feedback you'd like to share.</p>

<p>Let me know your availability for a <strong>60-minute meeting</strong> next week.</p>

<p>Best regards,</p>`,
    category: 'business'
  },

  // Sales Templates
  {
    id: 'cold-outreach',
    name: 'Cold Sales Outreach',
    content: `<p>Hi {{prospect_name}},</p>

<p>I hope this email finds you well. I came across {{company_name}} and was impressed by {{company_detail}}.</p>

<p>I'm reaching out because we help companies like yours {{solution_benefit}}. Many of our clients in {{industry}} have seen {{result_metric}}.</p>

<p>I'd love to share how we could potentially help {{company_name}} achieve similar results. Would you be open to a brief 15-minute conversation this week?</p>

<p>No pressure at all - if it's not a fit, I completely understand.</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },
  {
    id: 'sales-follow-up',
    name: 'Sales Follow-up',
    content: `<p>Hi {{prospect_name}},</p>

<p>I wanted to follow up on our conversation from {{conversation_date}} about {{product_name}}.</p>

<p>Based on what you shared about {{customer_challenge}}, I believe our {{solution_name}} could help you {{specific_benefit}}.</p>

<p>I've attached some additional information that might be helpful, including:</p>
<ul>
<li>Case study from {{similar_company}}</li>
<li>ROI calculator</li>
<li>Implementation timeline</li>
</ul>

<p>Are you available for a quick call this week to discuss next steps?</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },
  {
    id: 'product-demo',
    name: 'Product Demo Invitation',
    content: `<p>Hi {{prospect_name}},</p>

<p>Thank you for your interest in {{product_name}}!</p>

<p>I'd love to show you how {{product_name}} can help {{company_name}} {{specific_benefit}}. During our personalized demo, we'll cover:</p>

<ul>
<li>Live walkthrough of key features</li>
<li>How it addresses your specific use case</li>
<li>Integration possibilities</li>
<li>Pricing and implementation timeline</li>
</ul>

<p>The demo typically takes 30 minutes, and I'll tailor it to your specific needs.</p>

<p>What does your schedule look like for a demo this week or next?</p>

<p>Looking forward to showing you what {{product_name}} can do!</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },

  // Customer Support Templates
  {
    id: 'support-response',
    name: 'Customer Support Response',
    content: `<p>Hi {{customer_name}},</p>

<p>Thank you for contacting us regarding {{issue_description}}.</p>

<p>I understand how frustrating this must be, and I'm here to help resolve this quickly.</p>

<p><strong>Here's what I've found:</strong><br>
{{issue_explanation}}</p>

<p><strong>To resolve this, please:</strong></p>
<ol>
<li>{{resolution_step_1}}</li>
<li>{{resolution_step_2}}</li>
<li>{{resolution_step_3}}</li>
</ol>

<p>If you continue to experience issues after following these steps, please don't hesitate to reach out. I'm here to help!</p>

<p>Is there anything else I can assist you with today?</p>

<p>Best regards,</p>`,
    category: 'support'
  },
  {
    id: 'escalation-response',
    name: 'Issue Escalation Response',
    content: `<p>Dear {{customer_name}},</p>

<p>I want to personally address the issue you've experienced with {{product_name}}. I sincerely apologize for the inconvenience this has caused.</p>

<p><strong>What happened:</strong><br>
{{issue_explanation}}</p>

<p><strong>What we're doing to fix it:</strong></p>
<ul>
<li>{{action_1}}</li>
<li>{{action_2}}</li>
<li>{{action_3}}</li>
</ul>

<p><strong>Timeline for resolution:</strong> {{resolution_timeline}}</p>

<p>As an apology for this inconvenience, we'd like to offer {{compensation_offer}}.</p>

<p>I'll personally monitor this issue and keep you updated every step of the way. You can reach me directly at {{direct_contact}}.</p>

<p>Thank you for your patience and for giving us the opportunity to make this right.</p>

<p>Sincerely,</p>`,
    category: 'support'
  },

  // Personal Templates
  {
    id: 'introduction',
    name: 'Professional Introduction',
    content: `<p>Hello {{recipient_name}},</p>

<p>I hope you're doing well. I wanted to reach out and introduce myself.</p>

<p>My name is <strong>{{your_name}}</strong>, and I work as <strong>{{your_role}}</strong> at <strong>{{your_company}}</strong>. I came across your profile and was impressed by your work in <strong>{{their_field}}</strong>.</p>

<p>I'd love to connect and learn more about what you're working on.</p>

<p>Best regards,</p>`,
    category: 'personal'
  },
  {
    id: 'thank-you',
    name: 'Thank You Email',
    content: `<p>Dear {{recipient_name}},</p>

<p>Thank you so much for <strong>{{thank_you_reason}}</strong>. I really appreciate your time and effort.</p>

<p>Your insights about <strong>{{discussion_topic}}</strong> were particularly valuable and will definitely help us move forward.</p>

<p>I look forward to continuing our collaboration.</p>

<p>With gratitude,</p>`,
    category: 'personal'
  },
  {
    id: 'networking-follow-up',
    name: 'Networking Follow-up',
    content: `<p>Hi {{recipient_name}},</p>

<p>It was great meeting you at <strong>{{event_name}}</strong> yesterday! I really enjoyed our conversation about <strong>{{discussion_topic}}</strong>.</p>

<p>As promised, I'm attaching <strong>{{resource_name}}</strong> that we discussed. I think you'll find it helpful for <strong>{{use_case}}</strong>.</p>

<p>I'd love to continue our conversation sometime. Would you be interested in grabbing coffee next week?</p>

<p>Looking forward to staying in touch!</p>

<p>Best regards,</p>`,
    category: 'personal'
  },
  {
    id: 'collaboration-request',
    name: 'Collaboration Request',
    content: `<p>Hi {{recipient_name}},</p>

<p>I hope this email finds you well. I've been following your work on <strong>{{their_project}}</strong> and I'm really impressed by what you've accomplished.</p>

<p>I'm reaching out because I think there might be an opportunity for us to collaborate on <strong>{{project_idea}}</strong>.</p>

<p><strong>What I'm proposing:</strong></p>
<ul>
<li>{{collaboration_detail_1}}</li>
<li>{{collaboration_detail_2}}</li>
<li>{{mutual_benefit}}</li>
</ul>

<p>I believe this could be mutually beneficial because <strong>{{reason}}</strong>.</p>

<p>Would you be open to a brief call to discuss this further?</p>

<p>Best regards,</p>`,
    category: 'personal'
  },

  // Event & Marketing Templates
  {
    id: 'event-invitation',
    name: 'Event Invitation',
    content: `<p>Dear {{recipient_name}},</p>

<p>You're invited to <strong>{{event_name}}</strong>!</p>

<p><strong>Event Details:</strong></p>
<ul>
<li><strong>Date:</strong> {{event_date}}</li>
<li><strong>Time:</strong> {{event_time}}</li>
<li><strong>Location:</strong> {{event_location}}</li>
<li><strong>Dress Code:</strong> {{dress_code}}</li>
</ul>

<p><strong>What to Expect:</strong></p>
<ul>
<li>{{activity_1}}</li>
<li>{{activity_2}}</li>
<li>{{activity_3}}</li>
</ul>

<p>We're excited to have you join us for what promises to be an amazing event!</p>

<p>Please RSVP by <strong>{{rsvp_date}}</strong> so we can plan accordingly.</p>

<p>Looking forward to seeing you there!</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },
  {
    id: 'newsletter',
    name: 'Newsletter Template',
    content: `<p>Hi {{recipient_name}},</p>

<p><strong>Welcome to this week's newsletter!</strong></p>

<p><strong>🔥 This Week's Highlights:</strong></p>
<ul>
<li><strong>{{highlight_1_title}}</strong> - {{highlight_1_description}}</li>
<li><strong>{{highlight_2_title}}</strong> - {{highlight_2_description}}</li>
<li><strong>{{highlight_3_title}}</strong> - {{highlight_3_description}}</li>
</ul>

<p><strong>📚 Featured Article:</strong><br>
<strong>{{article_title}}</strong><br>
{{article_summary}}</p>

<p><strong>💡 Quick Tip:</strong><br>
{{quick_tip}}</p>

<p><strong>📅 Upcoming Events:</strong></p>
<ul>
<li>{{event_1}} - {{event_1_date}}</li>
<li>{{event_2}} - {{event_2_date}}</li>
</ul>

<p>That's all for this week! Have a great weekend.</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },
  {
    id: 'product-launch',
    name: 'Product Launch Announcement',
    content: `<p>Dear {{recipient_name}},</p>

<p>We're thrilled to announce the launch of <strong>{{product_name}}</strong>!</p>

<p>After months of development and testing, we're excited to share <strong>{{product_description}}</strong> with you.</p>

<p><strong>🎉 What's New:</strong></p>
<ul>
<li><strong>{{feature_1}}</strong> - {{benefit_1}}</li>
<li><strong>{{feature_2}}</strong> - {{benefit_2}}</li>
<li><strong>{{feature_3}}</strong> - {{benefit_3}}</li>
</ul>

<p><strong>🎁 Special Launch Offer:</strong><br>
As a valued customer, you get <strong>{{special_offer}}</strong> for the first <strong>{{offer_period}}</strong>.</p>

<p>Ready to try it out? <strong>{{call_to_action}}</strong></p>

<p>Questions? Reply to this email - we'd love to help!</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },

  // HR & Internal Templates
  {
    id: 'job-offer',
    name: 'Job Offer',
    content: `<p>Dear {{candidate_name}},</p>

<p>We are delighted to extend an offer for the position of <strong>{{job_title}}</strong> at <strong>{{company_name}}</strong>.</p>

<p>After careful consideration of your background and our interview discussions, we believe you would be an excellent addition to our team.</p>

<p><strong>Position Details:</strong></p>
<ul>
<li><strong>Title:</strong> {{job_title}}</li>
<li><strong>Department:</strong> {{department}}</li>
<li><strong>Start Date:</strong> {{start_date}}</li>
<li><strong>Salary:</strong> {{salary}}</li>
<li><strong>Benefits:</strong> {{benefits_summary}}</li>
</ul>

<p>Please review the attached formal offer letter for complete details.</p>

<p>We're excited about the possibility of you joining our team and would love to have your response by <strong>{{response_date}}</strong>.</p>

<p>Please don't hesitate to reach out if you have any questions.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'team-announcement',
    name: 'Team Announcement',
    content: `<p>Hi Team,</p>

<p>I'm excited to share some important news with you all.</p>

<p><strong>{{announcement_title}}</strong></p>

<p>{{announcement_description}}</p>

<p><strong>What this means for you:</strong></p>
<ul>
<li>{{impact_1}}</li>
<li>{{impact_2}}</li>
<li>{{impact_3}}</li>
</ul>

<p><strong>Next Steps:</strong></p>
<ol>
<li>{{step_1}} - {{step_1_timeline}}</li>
<li>{{step_2}} - {{step_2_timeline}}</li>
<li>{{step_3}} - {{step_3_timeline}}</li>
</ol>

<p>I know you may have questions, and I'm here to address them. Please feel free to reach out to me directly or we can discuss during our next team meeting on <strong>{{meeting_date}}</strong>.</p>

<p>Thank you for your continued dedication and hard work.</p>

<p>Best regards,</p>`,
    category: 'business'
  },

  // Apology & Recovery Templates
  {
    id: 'service-apology',
    name: 'Service Apology',
    content: `<p>Dear {{customer_name}},</p>

<p>I want to personally apologize for the service disruption you experienced on <strong>{{incident_date}}</strong>.</p>

<p>We fell short of the high standards you expect and deserve from us, and I take full responsibility for this failure.</p>

<p><strong>What happened:</strong><br>
{{incident_explanation}}</p>

<p><strong>What we're doing to prevent this in the future:</strong></p>
<ul>
<li>{{preventive_measure_1}}</li>
<li>{{preventive_measure_2}}</li>
<li>{{preventive_measure_3}}</li>
</ul>

<p>As an apology, we'd like to offer you <strong>{{compensation_offer}}</strong>.</p>

<p>Your trust means everything to us, and we're committed to earning it back through our actions.</p>

<p>If you have any concerns or questions, please don't hesitate to contact me directly.</p>

<p>Sincerely,</p>`,
    category: 'support'
  },

  // Invoice & Payment Templates
  {
    id: 'invoice-send',
    name: 'Invoice Submission',
    content: `<p>Dear {{client_name}},</p>

<p>I hope this email finds you well.</p>

<p>Please find attached invoice <strong>#{{invoice_number}}</strong> for the services provided during <strong>{{service_period}}</strong>.</p>

<p><strong>Invoice Details:</strong></p>
<ul>
<li><strong>Invoice Date:</strong> {{invoice_date}}</li>
<li><strong>Due Date:</strong> {{due_date}}</li>
<li><strong>Amount:</strong> {{invoice_amount}}</li>
<li><strong>Services:</strong> {{service_description}}</li>
</ul>

<p>Payment can be made via <strong>{{payment_methods}}</strong>. Please let me know if you need any additional information or have questions about the invoice.</p>

<p>Thank you for your business!</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'payment-reminder',
    name: 'Payment Reminder',
    content: `<p>Dear {{client_name}},</p>

<p>I hope you're doing well.</p>

<p>This is a friendly reminder that invoice <strong>#{{invoice_number}}</strong> for <strong>{{invoice_amount}}</strong> was due on <strong>{{due_date}}</strong>.</p>

<p>If you've already sent the payment, please disregard this message. If not, could you please let me know when we can expect payment?</p>

<p>I've attached a copy of the invoice for your reference.</p>

<p>If there are any issues or concerns with the invoice, please don't hesitate to reach out so we can resolve them quickly.</p>

<p>Thank you for your attention to this matter.</p>

<p>Best regards,</p>`,
    category: 'business'
  }
]

const FONT_FAMILIES = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Palatino', label: 'Palatino' }
]

const FONT_SIZES = [
  { value: '10', label: '10px' },
  { value: '12', label: '12px' },
  { value: '14', label: '14px' },
  { value: '16', label: '16px' },
  { value: '18', label: '18px' },
  { value: '20', label: '20px' },
  { value: '24', label: '24px' },
  { value: '28', label: '28px' },
  { value: '32', label: '32px' },
  { value: '36', label: '36px' }
]

const TEXT_COLORS = [
  '#000000', '#333333', '#666666', '#999999', '#ffffff',
  '#e74c3c', '#e67e22', '#f39c12', '#f1c40f', '#27ae60',
  '#2ecc71', '#3498db', '#9b59b6', '#34495e', '#95a5a6',
  '#c0392b', '#d35400', '#16a085', '#8e44ad', '#1abc9c'
]

const BACKGROUND_COLORS = [
  '#ffffff', '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da',
  '#ffebee', '#fff3e0', '#fff9c4', '#e8f5e9', '#e3f2fd',
  '#f3e5f5', '#fce4ec', '#e0f2f1', '#f1f8e9', '#fff8e1'
]

interface EmailVariable {
  name: string
  variable: string
  category: 'trigger' | 'recipient' | 'sender' | 'workflow' | 'datetime'
  description: string
}

const COMMON_VARIABLES: EmailVariable[] = [
  // Trigger Variables
  { name: 'Trigger Email Subject', variable: '{{trigger.subject}}', category: 'trigger', description: 'Subject from triggering email' },
  { name: 'Trigger Email Body', variable: '{{trigger.body}}', category: 'trigger', description: 'Body content from triggering email' },
  { name: 'Trigger Sender Name', variable: '{{trigger.sender_name}}', category: 'trigger', description: 'Name of email sender' },
  { name: 'Trigger Sender Email', variable: '{{trigger.sender_email}}', category: 'trigger', description: 'Email address of sender' },

  // Recipient Variables
  { name: 'Recipient Name', variable: '{{recipient_name}}', category: 'recipient', description: 'Name of email recipient' },
  { name: 'Recipient Email', variable: '{{recipient_email}}', category: 'recipient', description: 'Email address of recipient' },
  { name: 'Recipient First Name', variable: '{{recipient_first_name}}', category: 'recipient', description: 'First name of recipient' },

  // Sender Variables
  { name: 'Your Name', variable: '{{sender_name}}', category: 'sender', description: 'Your full name' },
  { name: 'Your Email', variable: '{{sender_email}}', category: 'sender', description: 'Your email address' },
  { name: 'Your Company', variable: '{{sender_company}}', category: 'sender', description: 'Your company name' },
  { name: 'Your Role', variable: '{{sender_role}}', category: 'sender', description: 'Your job title' },

  // Workflow Variables
  { name: 'Workflow Name', variable: '{{workflow.name}}', category: 'workflow', description: 'Name of this workflow' },
  { name: 'Execution ID', variable: '{{workflow.execution_id}}', category: 'workflow', description: 'Unique execution identifier' },

  // Date/Time Variables
  { name: 'Current Date', variable: '{{current_date}}', category: 'datetime', description: 'Today\'s date' },
  { name: 'Current Time', variable: '{{current_time}}', category: 'datetime', description: 'Current time' },
  { name: 'Current DateTime', variable: '{{current_datetime}}', category: 'datetime', description: 'Current date and time' },
]

export function EmailRichTextEditor({
  value,
  onChange,
  placeholder = "Compose your email...",
  className = "",
  error,
  integrationProvider = 'gmail',
  userId,
  availableVariables,
  workflowNodes
}: EmailRichTextEditorProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState<string>('all')
  const [selectedVariableCategory, setSelectedVariableCategory] = useState<string>('all')
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [selectedSignature, setSelectedSignature] = useState<string>('')
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false)
  const [fontSize, setFontSize] = useState('12')
  const [customFontSize, setCustomFontSize] = useState('')
  const [fontFamily, setFontFamily] = useState('Arial')
  const [textColor, setTextColor] = useState('#000000')
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [showCreateSignatureDialog, setShowCreateSignatureDialog] = useState(false)
  const [newSignatureName, setNewSignatureName] = useState('')
  const [newSignatureContent, setNewSignatureContent] = useState('')
  const [isCreatingSignature, setIsCreatingSignature] = useState(false)
  const [deleteSignature, setDeleteSignature] = useState<EmailSignature | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editSignature, setEditSignature] = useState<{ id: string; name: string; content: string; email: string } | undefined>(undefined)
  // Auto-include signature removed - signatures must be manually added by user
  const [isEditorInitialized, setIsEditorInitialized] = useState(false)
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableRows, setTableRows] = useState('3')
  const [tableColumns, setTableColumns] = useState('3')
  const savedSelectionRef = useRef<Range | null>(null)

  // Save selection before interacting with dropdowns
  const saveSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
    }
  }, [])

  // Restore selection before applying formatting
  const restoreSelection = useCallback(() => {
    if (savedSelectionRef.current && editorRef.current) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(savedSelectionRef.current)
      editorRef.current.focus()
    }
  }, [])

  // Helper function to collect existing styles from selected content
  const collectExistingStyles = useCallback((fragment: DocumentFragment): CSSStyleDeclaration | null => {
    // Check if the fragment contains a single styled element
    if (fragment.childNodes.length === 1) {
      const node = fragment.firstChild
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement
        if (element.style && element.style.length > 0) {
          return element.style
        }
      }
    }

    // Check if we have multiple nodes, find the first with styles
    const styledNodes = Array.from(fragment.childNodes).filter(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement
        return element.style && element.style.length > 0
      }
      return false
    })

    if (styledNodes.length > 0) {
      return (styledNodes[0] as HTMLElement).style
    }

    return null
  }, [])

  // Apply font size using inline styles (works with any px value)
  const applyFontSize = useCallback((sizeInPx: string) => {
    if (!editorRef.current) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)

    // If nothing is selected, just update state for default font size
    if (range.collapsed) {
      setFontSize(sizeInPx)
      return
    }

    // Extract the selected content
    const selectedContent = range.extractContents()

    // Collect existing styles before wrapping
    const existingStyles = collectExistingStyles(selectedContent)

    // Create a span with the font size
    const span = document.createElement('span')

    // Preserve existing styles if any
    if (existingStyles) {
      // Copy all existing styles
      Array.from(existingStyles).forEach(styleName => {
        span.style.setProperty(styleName, existingStyles.getPropertyValue(styleName))
      })
    }

    // Apply the new font size (override if it existed)
    span.style.fontSize = `${sizeInPx}px`

    // Append the selected content to the span
    span.appendChild(selectedContent)

    // Insert the wrapped content
    range.insertNode(span)

    // Update the editor content
    onChange(editorRef.current.innerHTML)
  }, [onChange, collectExistingStyles])

  // Apply font family using inline styles
  const applyFontFamily = useCallback((fontName: string) => {
    if (!editorRef.current) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)

    // If nothing is selected, just update state for default font family
    if (range.collapsed) {
      setFontFamily(fontName)
      return
    }

    // Extract the selected content
    const selectedContent = range.extractContents()

    // Collect existing styles before wrapping
    const existingStyles = collectExistingStyles(selectedContent)

    // Create a span with the font family
    const span = document.createElement('span')

    // Preserve existing styles if any
    if (existingStyles) {
      // Copy all existing styles
      Array.from(existingStyles).forEach(styleName => {
        span.style.setProperty(styleName, existingStyles.getPropertyValue(styleName))
      })
    }

    // Apply the new font family (override if it existed)
    span.style.fontFamily = fontName

    // Append the selected content to the span
    span.appendChild(selectedContent)

    // Insert the wrapped content
    range.insertNode(span)

    // Update the editor content
    onChange(editorRef.current.innerHTML)
  }, [onChange, collectExistingStyles])

  // Extract available variables from workflow nodes
  const extractedVariables = useMemo(() => {
    if (!workflowNodes || workflowNodes.length === 0) {
      return []
    }

    const variables: string[] = []

    // Check if there's a trigger node
    const triggerNode = workflowNodes.find(node => node.data?.isTrigger)
    if (triggerNode) {
      // Add trigger variables
      variables.push('trigger.subject', 'trigger.body', 'trigger.sender_name', 'trigger.sender_email')
    }

    // Always include sender, recipient, workflow, and datetime variables as they're always available
    variables.push(
      'recipient_name', 'recipient_email', 'recipient_first_name',
      'sender_name', 'sender_email', 'sender_company', 'sender_role',
      'workflow.name', 'workflow.execution_id',
      'current_date', 'current_time', 'current_datetime'
    )

    return variables
  }, [workflowNodes])

  // Determine which variables to show
  const displayVariables = useMemo(() => {
    const variablesToUse = availableVariables || extractedVariables

    // If no workflow context, show only non-trigger variables (sender, recipient, workflow, datetime)
    // This prevents showing trigger variables when there's no trigger node
    if (variablesToUse.length === 0) {
      return COMMON_VARIABLES.filter(v => v.category !== 'trigger')
    }

    // Filter variables based on available ones
    return COMMON_VARIABLES.filter(variable => {
      // Extract the variable key without {{ }}
      const variableKey = variable.variable.replace(/\{\{|\}\}/g, '')
      return variablesToUse.includes(variableKey)
    })
  }, [availableVariables, extractedVariables])
  
  const editorRef = useRef<HTMLDivElement | null>(null)
  const handleVariableInsert = useCallback((rawVariable: string) => {
    if (!editorRef.current) return

    const variableText = normalizeDraggedVariable(rawVariable)
    if (!variableText) return

    const updatedHtml = insertVariableIntoContentEditable(editorRef.current, variableText)
    onChange(updatedHtml)
  }, [onChange])

  const { eventHandlers: dropHandlers, isDragOver } = useVariableDropTarget({
    fieldId: "email-rich-text-body",
    fieldLabel: "Email Body",
    elementRef: editorRef,
    onInsert: handleVariableInsert
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  // Initialize editor content and sync with value prop
  useEffect(() => {
    logger.debug('📧 [EmailRichTextEditor] Value prop changed:', {
      value: value?.substring(0, 100) + (value?.length > 100 ? '...' : ''),
      length: value?.length,
      hasEditorRef: !!editorRef.current,
      isInitialized: isEditorInitialized
    })
    
    if (editorRef.current) {
      // Only update if the content is different to prevent cursor jumps
      if (editorRef.current.innerHTML !== value && !editorRef.current.contains(document.activeElement)) {
        logger.debug('📧 [EmailRichTextEditor] Updating editor content')
        editorRef.current.innerHTML = value || ''
      }
      setIsEditorInitialized(true)
    }
  }, [value])

  // Load user's email signatures
  useEffect(() => {
    if (userId && integrationProvider) {
      loadEmailSignatures()
    }
  }, [userId, integrationProvider])

  const loadEmailSignatures = async () => {
    try {
      setIsLoadingSignatures(true)
      const response = await fetch(`/api/integrations/${integrationProvider}/signatures?userId=${userId}`)
      
      if (response.ok) {
        const data = await response.json()
        setSignatures(data.signatures || [])
        
        // Check if integration needs connection
        if (data.needsConnection) {
          logger.debug(`🔍 [SIGNATURES] ${integrationProvider} integration not connected for user`)
          // Still set empty signatures array - the UI will handle showing no signatures available
          return
        }
        
        // Auto-select default signature but DON'T add it to the content
        const defaultSignature = data.signatures?.find((sig: EmailSignature) => sig.isDefault)
        if (defaultSignature) {
          // Check if signature is already in the content
          if (value && value.includes(defaultSignature.content)) {
            // If the signature is already in the value, just set it as selected
            setSelectedSignature(defaultSignature.id)
          }
          // Don't auto-add signature - user must manually add it using the signature button
        }
      } else {
        logger.error(`Failed to load ${integrationProvider} signatures:`, response.status, response.statusText)
      }
    } catch (error) {
      logger.error('Failed to load email signatures:', error)
    } finally {
      setIsLoadingSignatures(false)
    }
  }

  const execCommand = useCallback((command: string, value?: string) => {
    if (editorRef.current) {
      // Ensure editor has focus before executing command
      editorRef.current.focus()

      // Execute the command
      document.execCommand(command, false, value)

      // Trigger onChange with updated content
      setTimeout(() => {
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML)
        }
      }, 10)
    }
  }, [onChange])

  const insertTemplate = (templateId: string) => {
    const template = EMAIL_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      // Replace current content with template
      onChange(template.content)
      if (editorRef.current) {
        editorRef.current.innerHTML = template.content
      }
      
      // Don't auto-add signature when inserting template
      // User can manually add signature if needed
      
      setSelectedTemplate('')
      toast({
        title: "Template applied",
        description: `${template.name} template has been applied to your email.`,
      })
    }
  }

  const insertSignature = (signatureId: string) => {
    const signature = signatures.find(sig => sig.id === signatureId)
    if (signature) {
      // Get current content
      const currentContent = editorRef.current?.innerHTML || value || ''

      // Normalize both contents for comparison
      const normalizeContent = (content: string) => {
        return content
          .replace(/<[^>]*>/g, '') // Remove all HTML tags
          .replace(/&nbsp;/g, ' ') // Replace &nbsp; with regular spaces
          .replace(/&amp;/g, '&') // Replace &amp; with &
          .replace(/&lt;/g, '<') // Replace &lt; with <
          .replace(/&gt;/g, '>') // Replace &gt; with >
          .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
          .trim() // Remove leading/trailing whitespace
          .toLowerCase() // Case insensitive comparison
      }

      const normalizedCurrent = normalizeContent(currentContent)
      const normalizedSignature = normalizeContent(signature.content)

      // Only check if signature has meaningful content (more than just whitespace)
      if (normalizedSignature.length > 5 && normalizedCurrent.includes(normalizedSignature)) {
        toast({
          title: "Signature already present",
          description: "This signature is already in your email.",
          variant: "default"
        })
        return
      }

      const newContent = `${currentContent }\n\n${ signature.content}`
      onChange(newContent)
      if (editorRef.current) {
        editorRef.current.innerHTML = newContent
      }
    }
  }

  const createSignature = async () => {
    if (!newSignatureName.trim() || !newSignatureContent.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide both a signature name and content.",
        variant: "destructive"
      })
      return
    }

    try {
      setIsCreatingSignature(true)
      const response = await fetch(`/api/integrations/${integrationProvider}/signatures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          name: newSignatureName.trim(),
          content: newSignatureContent.trim(),
          isDefault: signatures.length === 0 // Make first signature the default
        })
      })

      if (response.ok) {
        const data = await response.json()
        toast({
          title: editSignature ? "Signature updated" : "Signature created",
          description: `"${newSignatureName}" has been ${editSignature ? 'updated' : 'created'} successfully.`
        })

        // Reload signatures
        await loadEmailSignatures()

        // Reset form and close dialog
        setNewSignatureName('')
        setNewSignatureContent('')
        setEditSignature(undefined)
        setShowCreateSignatureDialog(false)
      } else {
        const errorData = await response.json()
        toast({
          title: "Failed to create signature",
          description: errorData.error || "An error occurred while creating the signature.",
          variant: "destructive"
        })
      }
    } catch (error) {
      logger.error('Error creating signature:', error)
      toast({
        title: "Error",
        description: "Failed to create signature. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsCreatingSignature(false)
    }
  }

  const handleDeleteSignature = async () => {
    if (!deleteSignature || !userId) return

    try {
      setIsDeleting(true)

      const response = await fetch(
        `/api/integrations/${integrationProvider}/signatures?userId=${userId}&email=${encodeURIComponent(deleteSignature.email || '')}`,
        {
          method: 'DELETE'
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete signature')
      }

      toast({
        title: "Signature deleted",
        description: `${deleteSignature.name} has been deleted successfully.`,
      })

      // Clear the deleted signature from selected if it was selected
      if (selectedSignature === deleteSignature.id) {
        setSelectedSignature('')
      }

      // Clear signatures state first to force a refresh
      setSignatures([])

      // Close dialog
      setDeleteSignature(null)

      // Refresh signatures list
      await loadEmailSignatures()

    } catch (error: any) {
      logger.error('Failed to delete signature:', error)
      toast({
        title: "Failed to delete signature",
        description: error.message || "An error occurred while deleting the signature.",
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleEditSignature = (signature: EmailSignature) => {
    setEditSignature({
      id: signature.id,
      name: signature.name,
      content: signature.content,
      email: signature.email || ''
    })
    setNewSignatureName(signature.name)
    setNewSignatureContent(signature.content)
    setShowCreateSignatureDialog(true)
  }

  const insertVariable = (variableText: string) => {
    if (!editorRef.current) return

    // Get current selection or cursor position
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      // No selection, append to end
      const currentContent = editorRef.current.innerHTML || ''
      const newContent = `${currentContent} ${variableText}`
      onChange(newContent)
      if (editorRef.current) {
        editorRef.current.innerHTML = newContent
      }
    } else {
      // Insert at cursor position
      const range = selection.getRangeAt(0)
      range.deleteContents()

      const variableNode = document.createTextNode(variableText)
      range.insertNode(variableNode)

      // Move cursor after inserted variable
      range.setStartAfter(variableNode)
      range.setEndAfter(variableNode)
      selection.removeAllRanges()
      selection.addRange(range)

      // Update content
      onChange(editorRef.current.innerHTML)
    }

    toast({
      title: "Variable inserted",
      description: `${variableText} has been added to your email.`,
    })
  }


  const updateFormatState = useCallback(() => {
    if (!editorRef.current) return

    try {
      // Get the current selection to check if cursor is in styled content
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      let currentElement = range.startContainer

      // If it's a text node, get its parent element
      if (currentElement.nodeType === Node.TEXT_NODE) {
        currentElement = currentElement.parentElement
      }

      // Only update format state if cursor is inside an element with inline styles
      if (currentElement && currentElement instanceof HTMLElement) {
        const computedStyle = window.getComputedStyle(currentElement)

        // Check for explicit font-family on the element
        if (currentElement.style.fontFamily) {
          const cleanFont = currentElement.style.fontFamily.replace(/['"]/g, '')
          const matchingFont = FONT_FAMILIES.find(f =>
            f.value.toLowerCase() === cleanFont.toLowerCase()
          )
          if (matchingFont && matchingFont.value !== fontFamily) {
            setFontFamily(matchingFont.value)
          }
        }

        // Check for explicit font-size on the element
        if (currentElement.style.fontSize) {
          const fontSizePx = currentElement.style.fontSize.replace('px', '')
          const matchingSize = FONT_SIZES.find(s => s.value === fontSizePx)
          if (matchingSize && matchingSize.value !== fontSize) {
            setFontSize(matchingSize.value)
          }
        }
      }
    } catch (error) {
      // Ignore errors from selection API
    }
  }, [fontFamily, fontSize])

  const handleContentChange = () => {
    if (editorRef.current) {
      const content = editorRef.current.innerHTML
      logger.debug('📧 [EmailRichTextEditor] Content changed:', {
        content: content?.substring(0, 100) + (content?.length > 100 ? '...' : ''),
        length: content?.length
      })
      onChange(content)
    }
  }

  const handleSelectionChange = useCallback(() => {
    updateFormatState()
  }, [updateFormatState])

  const togglePreview = () => {
    setIsPreviewMode(!isPreviewMode)
  }

  const insertLink = () => {
    const selection = window.getSelection()
    if (selection && selection.toString()) {
      setLinkText(selection.toString())
      // Save the selection so we can restore it when applying the link
      saveSelection()
    }
    setShowLinkDialog(true)
  }

  const applyLink = () => {
    if (linkUrl) {
      if (linkText) {
        // Restore the saved selection so we replace the highlighted text
        restoreSelection()
        const html = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" title="${linkUrl}" style="color: #0066cc; text-decoration: underline;">${linkText}</a>`
        execCommand('insertHTML', html)
      } else {
        // For selected text, wrap it in a styled link
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0 && selection.toString()) {
          const selectedText = selection.toString()
          const html = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" title="${linkUrl}" style="color: #0066cc; text-decoration: underline;">${selectedText}</a>`
          execCommand('insertHTML', html)
        } else {
          // No text selected, insert the URL as both text and link
          const html = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" title="${linkUrl}" style="color: #0066cc; text-decoration: underline;">${linkUrl}</a>`
          execCommand('insertHTML', html)
        }
      }
      setLinkUrl('')
      setLinkText('')
      setShowLinkDialog(false)
    }
  }

  const insertImage = () => {
    setShowImageDialog(true)
  }

  const applyImage = () => {
    if (imageUrl) {
      const html = `<img src="${imageUrl}" alt="${imageAlt || 'Image'}" style="max-width: 100%; height: auto;" />`
      execCommand('insertHTML', html)
      setImageUrl('')
      setImageAlt('')
      setShowImageDialog(false)
      toast({
        title: "Image inserted",
        description: "Image has been added to your email.",
      })
    }
  }

  const insertTable = () => {
    const rows = parseInt(tableRows) || 3
    const cols = parseInt(tableColumns) || 3

    // Generate header row
    let headerCells = ''
    for (let i = 1; i <= cols; i++) {
      headerCells += `<th style="border: 1px solid #ddd; padding: 10px; text-align: left; font-weight: 600;">Column ${i}</th>`
    }

    // Generate body rows
    let bodyRows = ''
    for (let i = 0; i < rows; i++) {
      const rowStyle = i % 2 === 1 ? ' style="background-color: #fafafa;"' : ''
      let cells = ''
      for (let j = 1; j <= cols; j++) {
        cells += `<td style="border: 1px solid #ddd; padding: 10px;" contenteditable="true">Cell ${i + 1},${j}</td>`
      }
      bodyRows += `<tr${rowStyle}>${cells}</tr>`
    }

    const html = `
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
      <p><br></p>
    `
    execCommand('insertHTML', html)
    setShowTableDialog(false)
    toast({
      title: "Table inserted",
      description: `${rows}x${cols} table has been added to your email.`,
    })
  }

  const insertHorizontalRule = () => {
    execCommand('insertHorizontalRule')
    toast({
      title: "Divider inserted",
      description: "Horizontal line has been added.",
    })
  }

  const clearFormatting = () => {
    execCommand('removeFormat')
  }

  const applyCustomFontSize = () => {
    if (customFontSize && !isNaN(Number(customFontSize))) {
      const size = Number(customFontSize)
      if (size >= 8 && size <= 72) {
        applyFontSize(customFontSize)
        toast({
          title: "Font size applied",
          description: `Text size set to ${customFontSize}px`,
        })
      } else {
        toast({
          title: "Invalid size",
          description: "Font size must be between 8px and 72px",
          variant: "destructive"
        })
      }
    }
  }

  const formatToolbarButton = (
    icon: React.ReactNode,
    command: string,
    title: string,
    value?: string
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => execCommand(command, value)}
      title={title}
      className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
    >
      {icon}
    </Button>
  )

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden bg-background", className)}>
      {/* Comprehensive Toolbar - Multi-row */}
      <div className="border-b border-border p-2 bg-muted/50">
        {/* Row 1: Basic Text Formatting */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* Font Family */}
          <div className="w-36">
            <GenericSelectField
              field={{
                name: 'fontFamily',
                type: 'select',
                placeholder: 'Font',
                disableSearch: true,
                hideClearButton: true
              }}
              value={fontFamily}
              onChange={(value) => {
                restoreSelection()
                applyFontFamily(value)
              }}
              options={FONT_FAMILIES}
            />
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Font Size with Custom Input */}
          <div className="flex items-center gap-1">
            <div className="w-20">
              <GenericSelectField
                field={{
                  name: 'fontSize',
                  type: 'select',
                  placeholder: 'Size',
                  disableSearch: true,
                  hideClearButton: true
                }}
                value={fontSize}
                onChange={(value) => {
                  restoreSelection()
                  applyFontSize(value)
                }}
                options={FONT_SIZES}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Custom font size"
                >
                  <Type className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-3 bg-background border-border">
                <div className="space-y-2">
                  <Label className="text-sm text-foreground">Custom Font Size (8-72px)</Label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="8"
                      max="72"
                      value={customFontSize}
                      onChange={(e) => setCustomFontSize(e.target.value)}
                      placeholder="Enter size"
                      className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
                    />
                    <Button
                      size="sm"
                      onClick={applyCustomFontSize}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Text Formatting */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<Bold className="h-4 w-4" />, 'bold', 'Bold (Ctrl+B)')}
            {formatToolbarButton(<Italic className="h-4 w-4" />, 'italic', 'Italic (Ctrl+I)')}
            {formatToolbarButton(<Underline className="h-4 w-4" />, 'underline', 'Underline (Ctrl+U)')}
            {formatToolbarButton(<Strikethrough className="h-4 w-4" />, 'strikeThrough', 'Strikethrough')}
            {formatToolbarButton(<Subscript className="h-4 w-4" />, 'subscript', 'Subscript')}
            {formatToolbarButton(<Superscript className="h-4 w-4" />, 'superscript', 'Superscript')}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Colors */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Text color"
              >
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-3 bg-background border-border">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Text Color</Label>
                <div className="grid grid-cols-5 gap-1">
                  {TEXT_COLORS.map(color => (
                    <button
                      key={color}
                      className="w-8 h-8 rounded border border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setTextColor(color)
                        execCommand('foreColor', color)
                      }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Background color"
              >
                <Paintbrush className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-3 bg-background border-border">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Background Color</Label>
                <div className="grid grid-cols-5 gap-1">
                  {BACKGROUND_COLORS.map(color => (
                    <button
                      key={color}
                      className="w-8 h-8 rounded border border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setBackgroundColor(color)
                        execCommand('backColor', color)
                      }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Separator orientation="vertical" className="h-6" />

          {/* Clear Formatting */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFormatting}
            title="Clear formatting"
            className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <RemoveFormatting className="h-4 w-4" />
          </Button>
        </div>

        {/* Row 2: Lists, Alignment, Indent */}
        <div className="flex items-center gap-1 flex-wrap mt-2">
          {/* Lists */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<List className="h-4 w-4" />, 'insertUnorderedList', 'Bullet List')}
            {formatToolbarButton(<ListOrdered className="h-4 w-4" />, 'insertOrderedList', 'Numbered List')}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Alignment */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<AlignLeft className="h-4 w-4" />, 'justifyLeft', 'Align Left')}
            {formatToolbarButton(<AlignCenter className="h-4 w-4" />, 'justifyCenter', 'Align Center')}
            {formatToolbarButton(<AlignRight className="h-4 w-4" />, 'justifyRight', 'Align Right')}
            {formatToolbarButton(<AlignJustify className="h-4 w-4" />, 'justifyFull', 'Justify')}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Indent */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<IndentDecrease className="h-4 w-4" />, 'outdent', 'Decrease Indent')}
            {formatToolbarButton(<IndentIncrease className="h-4 w-4" />, 'indent', 'Increase Indent')}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Block Formatting */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<Quote className="h-4 w-4" />, 'formatBlock', 'Block Quote', '<blockquote>')}
            {formatToolbarButton(<Code className="h-4 w-4" />, 'formatBlock', 'Code Block', '<pre>')}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Insert Elements */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={insertLink}
              title="Insert link"
              className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Link2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={insertImage}
              title="Insert image"
              className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Popover open={showTableDialog} onOpenChange={setShowTableDialog}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Insert table"
                  className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Table className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Insert Table</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Configure your table dimensions. You can right-click on the table after insertion to add/remove rows and columns.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="table-rows" className="text-sm">Rows</Label>
                      <Input
                        id="table-rows"
                        type="number"
                        min="1"
                        max="20"
                        value={tableRows}
                        onChange={(e) => setTableRows(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="table-columns" className="text-sm">Columns</Label>
                      <Input
                        id="table-columns"
                        type="number"
                        min="1"
                        max="10"
                        value={tableColumns}
                        onChange={(e) => setTableColumns(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTableDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={insertTable}
                      disabled={!tableRows || !tableColumns || parseInt(tableRows) < 1 || parseInt(tableColumns) < 1}
                    >
                      Insert Table
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={insertHorizontalRule}
              title="Insert horizontal line"
              className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<Undo className="h-4 w-4" />, 'undo', 'Undo (Ctrl+Z)')}
            {formatToolbarButton(<Redo className="h-4 w-4" />, 'redo', 'Redo (Ctrl+Y)')}
          </div>
        </div>

        {/* Row 3: Content Insertion (Variables, Templates, Signatures, Preview) */}
        <div className="flex items-center gap-1 flex-wrap mt-2">
          {/* Variables */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Insert workflow variables"
              >
                <Braces className="h-4 w-4" />
                Variables
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0 bg-background border-border overflow-hidden" align="start" side="bottom" sideOffset={4}>
              <div className="p-3 border-b border-border">
                <h4 className="text-sm font-medium text-foreground">Workflow Variables</h4>
                <p className="text-xs text-muted-foreground mt-1">Insert dynamic data into your email</p>

                {/* Category Filter */}
                <div className="mt-3">
                  <GenericSelectField
                    field={{
                      name: 'variableCategory',
                      label: 'Category',
                      type: 'select',
                      placeholder: 'Filter by category',
                      disableSearch: true
                    }}
                    value={selectedVariableCategory}
                    onChange={setSelectedVariableCategory}
                    options={[
                      { value: 'all', label: 'All Categories' },
                      { value: 'trigger', label: 'Trigger Data' },
                      { value: 'recipient', label: 'Recipient Info' },
                      { value: 'sender', label: 'Sender Info' },
                      { value: 'workflow', label: 'Workflow Info' },
                      { value: 'datetime', label: 'Date & Time' }
                    ]}
                  />
                </div>
              </div>
              <ScrollArea className="h-[320px] w-full">
                <div className="p-2">
                  {displayVariables
                    .filter(variable => selectedVariableCategory === 'all' || variable.category === selectedVariableCategory)
                    .map(variable => (
                      <div
                        key={variable.variable}
                        className="px-3 py-2.5 rounded-md hover:bg-muted cursor-pointer border border-transparent hover:border-border mb-1"
                        onClick={() => insertVariable(variable.variable)}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <h5 className="text-sm font-medium text-foreground">{variable.name}</h5>
                          <code className="text-xs bg-muted px-2 py-1 rounded text-foreground font-mono whitespace-nowrap flex-shrink-0">
                            {variable.variable}
                          </code>
                        </div>
                        <p className="text-xs text-muted-foreground">{variable.description}</p>
                      </div>
                    ))}
                  {displayVariables.filter(variable => selectedVariableCategory === 'all' || variable.category === selectedVariableCategory).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Braces className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">No variables available</p>
                      <p className="text-xs mt-1">Add nodes to your workflow to see available variables</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Templates */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Insert email templates with variable placeholders"
              >
                <Mail className="h-4 w-4" />
                Templates
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0 bg-background border-border max-h-[400px] overflow-hidden" align="start" side="bottom" sideOffset={4}>
              <div className="p-3 border-b border-border">
                <h4 className="text-sm font-medium text-foreground">Email Templates</h4>
                <p className="text-xs text-muted-foreground mt-1">Choose a template to get started</p>

                {/* Instructive Help Banner */}
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    <strong>💡 Tip:</strong> Templates use <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[11px]">{'{{variable_name}}'}</code> placeholders.
                    Use the <strong>Variables</strong> dropdown to insert workflow data and replace placeholders.
                  </p>
                </div>

                {/* Category Filter */}
                <div className="mt-3">
                  <GenericSelectField
                    field={{
                      name: 'templateCategory',
                      label: 'Category',
                      type: 'select',
                      placeholder: 'Filter by category',
                      disableSearch: true
                    }}
                    value={selectedTemplateCategory}
                    onChange={setSelectedTemplateCategory}
                    options={[
                      { value: 'all', label: 'All Categories' },
                      { value: 'business', label: 'Business' },
                      { value: 'personal', label: 'Personal' },
                      { value: 'marketing', label: 'Marketing' },
                      { value: 'support', label: 'Support' }
                    ]}
                  />
                </div>
              </div>
              <ScrollArea className="h-64 w-full" type="always">
                <div className="p-2">
                  {EMAIL_TEMPLATES
                    .filter(template => selectedTemplateCategory === 'all' || template.category === selectedTemplateCategory)
                    .map(template => (
                      <div
                        key={template.id}
                        className="p-3 rounded-md hover:bg-muted cursor-pointer border border-transparent hover:border-border"
                        onClick={() => insertTemplate(template.id)}
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium text-foreground">{template.name}</h5>
                          <Badge variant="secondary" className="text-xs">
                            {template.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {template.content.replace(/<[^>]*>/g, '').substring(0, 80)}...
                        </p>
                      </div>
                    ))}
                  {EMAIL_TEMPLATES.filter(template => selectedTemplateCategory === 'all' || template.category === selectedTemplateCategory).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">No templates in this category</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          
          {/* Signatures */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 hover:bg-muted text-muted-foreground hover:text-foreground">
                <FileSignature className="h-4 w-4" />
                Signature
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0 bg-background border-border max-h-[500px] overflow-hidden" align="start" side="bottom" sideOffset={4}>
              <div className="p-3 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Email Signatures</h4>
                    <p className="text-xs text-muted-foreground mt-1">Add your signature to the email</p>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      setEditSignature(undefined)
                      setNewSignatureName('')
                      setNewSignatureContent('')
                      setShowCreateSignatureDialog(true)
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Create New
                  </Button>
                </div>

                {/* Link to Gmail/Outlook Settings */}
                <a
                  href={integrationProvider === 'gmail'
                    ? 'https://mail.google.com/mail/u/0/#settings/general'
                    : 'https://outlook.live.com/mail/0/options/mail/messageContent'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Manage signatures in {integrationProvider === 'gmail' ? 'Gmail' : 'Outlook'} →
                </a>

                {/* Help Tip */}
                <div className="p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    <strong>💡 Tip:</strong> To sync signatures from {integrationProvider === 'gmail' ? 'Gmail' : 'Outlook'},
                    create them in your email settings and they'll appear here automatically.
                    Or create custom signatures directly in ChainReact using the "Create New" button.
                  </p>
                </div>
              </div>
              <ScrollArea className="max-h-48 w-full" type="scroll" scrollHideDelay={600}>
                <div className="p-2">
                  {isLoadingSignatures ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading signatures...
                    </div>
                  ) : signatures.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileSignature className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">No signatures found</p>
                      <p className="text-xs">Create signatures in your {integrationProvider} account</p>
                    </div>
                  ) : (
                    signatures.map(signature => (
                      <div
                        key={signature.id}
                        className="p-3 rounded-md hover:bg-muted border border-transparent hover:border-border"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-foreground">{signature.name}</h5>
                          {signature.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                        <div
                          className="text-xs text-muted-foreground mb-3 break-words overflow-hidden [&_*]:text-foreground [&_*]:!text-foreground"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            maxHeight: '4.5rem',
                            color: 'var(--foreground)'
                          }}
                          dangerouslySetInnerHTML={{
                            __html: `${signature.content.substring(0, 200) }...`
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => insertSignature(signature.id)}
                          >
                            Insert
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditSignature(signature)
                            }}
                            title="Edit signature"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteSignature(signature)
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete signature"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          
          
          <div className="flex-1" />
          
          {/* Preview Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={togglePreview}
            className="h-8 gap-1 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPreviewMode ? 'Edit' : 'Preview'}
          </Button>
        </div>
      </div>

      {/* Link Insert Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLinkDialog(false)}>
          <div className="bg-background border border-border rounded-lg p-4 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-foreground mb-4">Insert Link</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-foreground">Link Text (optional)</Label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (linkUrl) {
                        applyLink()
                      }
                    }
                  }}
                  placeholder="Enter link text"
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-foreground"
                />
              </div>
              <div>
                <Label className="text-sm text-foreground">URL *</Label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (linkUrl) {
                        applyLink()
                      }
                    }
                  }}
                  placeholder="https://example.com"
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-foreground"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLinkDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={applyLink}
                  disabled={!linkUrl}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Insert Link
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Insert Dialog */}
      {showImageDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowImageDialog(false)}>
          <div className="bg-background border border-border rounded-lg p-4 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-foreground mb-4">Insert Image</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-foreground">Image URL *</Label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (imageUrl) {
                        applyImage()
                      }
                    }
                  }}
                  placeholder="https://example.com/image.jpg"
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-foreground"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-sm text-foreground">Alt Text (optional)</Label>
                <input
                  type="text"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (imageUrl) {
                        applyImage()
                      }
                    }
                  }}
                  placeholder="Describe the image"
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-foreground"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImageDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={applyImage}
                  disabled={!imageUrl}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Insert Image
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Signature Dialog */}
      {showCreateSignatureDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => {
          setShowCreateSignatureDialog(false)
          setEditSignature(undefined)
          setNewSignatureName('')
          setNewSignatureContent('')
        }}>
          <div className="bg-background border border-border rounded-lg p-6 w-[700px] max-w-[90vw] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {editSignature ? 'Edit Email Signature' : 'Create Email Signature'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Use the formatting toolbar to customize your signature. All formatting and line breaks will be preserved.
            </p>
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-foreground">Signature Name *</Label>
                <input
                  type="text"
                  value={newSignatureName}
                  onChange={(e) => setNewSignatureName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                  }}
                  placeholder="e.g., Work Signature, Personal, Sales Team"
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-foreground"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-sm text-foreground mb-2 block">Signature Design *</Label>
                <RichTextSignatureEditor
                  value={newSignatureContent}
                  onChange={setNewSignatureContent}
                  placeholder="Best regards,&#10;Your Name&#10;Your Title&#10;Company Name"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCreateSignatureDialog(false)
                    setEditSignature(undefined)
                    setNewSignatureName('')
                    setNewSignatureContent('')
                  }}
                  disabled={isCreatingSignature}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={createSignature}
                  disabled={!newSignatureName.trim() || !newSignatureContent.trim() || isCreatingSignature}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isCreatingSignature ? (editSignature ? 'Updating...' : 'Creating...') : (editSignature ? 'Update Signature' : 'Create Signature')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor Content */}
      <div className="relative h-[300px] overflow-hidden">
        {isPreviewMode ? (
          <div className="h-full overflow-y-auto p-4 bg-background">
            <div 
              className="prose prose-sm max-w-none dark:prose-invert prose-slate"
              dangerouslySetInnerHTML={{ __html: value || '<p class="text-muted-foreground">No content to preview</p>' }}
            />
          </div>
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleContentChange}
            onKeyDown={(e) => {
              // Prevent Enter key from submitting form/closing modal
              if (e.key === 'Enter') {
                // Stop the event from bubbling up to the form/modal
                e.stopPropagation()
                // Allow Enter to work normally in the editor (creates new line)
                // The contentEditable div handles the newline insertion natively
              }
            }}
            onKeyUp={handleSelectionChange}
            onClick={handleSelectionChange}
            onMouseUp={saveSelection}
            onFocus={(e) => {
              dropHandlers.onFocus(e)
              updateFormatState()
            }}
            onBlur={(event) => {
              dropHandlers.onBlur()
              handleContentChange()
            }}
            onDragOver={dropHandlers.onDragOver}
            onDragLeave={dropHandlers.onDragLeave}
            onDrop={dropHandlers.onDrop}
            className={cn(
              "h-full overflow-y-auto p-4 focus:outline-none resize-none",
              isDragOver && "ring-2 ring-blue-500 ring-offset-1"
            )}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: fontFamily,
              color: '#000000',
              backgroundColor: '#ffffff',
              caretColor: '#000000'
            }}
            data-placeholder={placeholder}
            suppressContentEditableWarning
          />
        )}
        
        {!isPreviewMode && !value && (
          <div
            className="absolute top-4 left-4 text-muted-foreground pointer-events-none z-10"
            style={{ fontSize: '12px', fontFamily: fontFamily }}
          >
            {placeholder}
          </div>
        )}
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="p-2 bg-destructive/10 border-t border-destructive/50">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      
      {/* Footer */}
      <div className="border-t border-border p-2 bg-muted/50 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            {isPreviewMode ? 'Preview mode' : 'Rich text editor'}
          </span>
          <span>
            {value.length} characters
          </span>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSignature} onOpenChange={(open) => !open && setDeleteSignature(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Signature</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteSignature?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSignature}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
