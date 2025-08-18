"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  Variable,
  Mail,
  User,
  Calendar,
  Building
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface EmailRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableInsert?: (variable: string) => void
  integrationProvider?: string // 'gmail', 'outlook', etc.
  userId?: string
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
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  // Business Templates
  {
    id: 'meeting-request',
    name: 'Meeting Request',
    content: `<p>Hi there,</p>

<p>I hope this email finds you well. I would like to schedule a meeting to discuss <strong>[TOPIC]</strong>.</p>

<p>Would you be available for a <strong>[DURATION]</strong> meeting sometime next week? I'm flexible with timing and can accommodate your schedule.</p>

<p>Please let me know what works best for you.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'follow-up',
    name: 'Follow-up Email',
    content: `<p>Hi [NAME],</p>

<p>I wanted to follow up on our conversation about <strong>[TOPIC]</strong>.</p>

<p>As discussed, I'm attaching the information you requested. Please let me know if you have any questions or if there's anything else I can help you with.</p>

<p>Looking forward to hearing from you.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'project-update',
    name: 'Project Update',
    content: `<p>Hi Team,</p>

<p><strong>Project Status Update - [PROJECT NAME]</strong></p>

<p><strong>Progress This Week:</strong></p>
<ul>
<li>[ACCOMPLISHMENT 1]</li>
<li>[ACCOMPLISHMENT 2]</li>
<li>[ACCOMPLISHMENT 3]</li>
</ul>

<p><strong>Upcoming Milestones:</strong></p>
<ul>
<li>[MILESTONE 1] - [DATE]</li>
<li>[MILESTONE 2] - [DATE]</li>
</ul>

<p><strong>Blockers/Issues:</strong><br>
[DESCRIBE ANY ISSUES OR NONE]</p>

<p>Please let me know if you have any questions or concerns.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'proposal-submission',
    name: 'Proposal Submission',
    content: `<p>Dear [CLIENT NAME],</p>

<p>Thank you for the opportunity to submit a proposal for <strong>[PROJECT NAME]</strong>.</p>

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
    content: `<p>Hi [EMPLOYEE NAME],</p>

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
    content: `<p>Hi [NAME],</p>

<p>I hope this email finds you well. I came across [COMPANY] and was impressed by [SPECIFIC DETAIL ABOUT THEIR BUSINESS].</p>

<p>I'm reaching out because we help companies like yours [SPECIFIC BENEFIT/SOLUTION]. Many of our clients in [INDUSTRY] have seen [SPECIFIC RESULT/METRIC].</p>

<p>I'd love to share how we could potentially help [COMPANY] achieve similar results. Would you be open to a brief 15-minute conversation this week?</p>

<p>No pressure at all - if it's not a fit, I completely understand.</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },
  {
    id: 'sales-follow-up',
    name: 'Sales Follow-up',
    content: `<p>Hi [NAME],</p>

<p>I wanted to follow up on our conversation from [DATE] about [SOLUTION/PRODUCT].</p>

<p>Based on what you shared about [THEIR CHALLENGE], I believe our [SOLUTION] could help you [SPECIFIC BENEFIT].</p>

<p>I've attached some additional information that might be helpful, including:</p>
<ul>
<li>Case study from [SIMILAR COMPANY]</li>
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
    content: `<p>Hi [NAME],</p>

<p>Thank you for your interest in [PRODUCT NAME]!</p>

<p>I'd love to show you how [PRODUCT] can help [COMPANY] [SPECIFIC BENEFIT]. During our personalized demo, we'll cover:</p>

<ul>
<li>Live walkthrough of key features</li>
<li>How it addresses your specific use case</li>
<li>Integration possibilities</li>
<li>Pricing and implementation timeline</li>
</ul>

<p>The demo typically takes 30 minutes, and I'll tailor it to your specific needs.</p>

<p>What does your schedule look like for a demo this week or next?</p>

<p>Looking forward to showing you what [PRODUCT] can do!</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },

  // Customer Support Templates
  {
    id: 'support-response',
    name: 'Customer Support Response',
    content: `<p>Hi [CUSTOMER NAME],</p>

<p>Thank you for contacting us regarding [ISSUE DESCRIPTION].</p>

<p>I understand how frustrating this must be, and I'm here to help resolve this quickly.</p>

<p><strong>Here's what I've found:</strong><br>
[EXPLANATION OF ISSUE]</p>

<p><strong>To resolve this, please:</strong></p>
<ol>
<li>[STEP 1]</li>
<li>[STEP 2]</li>
<li>[STEP 3]</li>
</ol>

<p>If you continue to experience issues after following these steps, please don't hesitate to reach out. I'm here to help!</p>

<p>Is there anything else I can assist you with today?</p>

<p>Best regards,</p>`,
    category: 'support'
  },
  {
    id: 'escalation-response',
    name: 'Issue Escalation Response',
    content: `<p>Dear [CUSTOMER NAME],</p>

<p>I want to personally address the issue you've experienced with [PRODUCT/SERVICE]. I sincerely apologize for the inconvenience this has caused.</p>

<p><strong>What happened:</strong><br>
[CLEAR EXPLANATION OF THE ISSUE]</p>

<p><strong>What we're doing to fix it:</strong></p>
<ul>
<li>[ACTION 1]</li>
<li>[ACTION 2]</li>
<li>[ACTION 3]</li>
</ul>

<p><strong>Timeline for resolution:</strong> [SPECIFIC DATE/TIME]</p>

<p>As an apology for this inconvenience, we'd like to offer [COMPENSATION/GESTURE].</p>

<p>I'll personally monitor this issue and keep you updated every step of the way. You can reach me directly at [CONTACT INFO].</p>

<p>Thank you for your patience and for giving us the opportunity to make this right.</p>

<p>Sincerely,</p>`,
    category: 'support'
  },

  // Personal Templates
  {
    id: 'introduction',
    name: 'Professional Introduction',
    content: `<p>Hello [NAME],</p>

<p>I hope you're doing well. I wanted to reach out and introduce myself.</p>

<p>My name is <strong>[YOUR NAME]</strong>, and I work as <strong>[YOUR ROLE]</strong> at <strong>[COMPANY]</strong>. I came across your profile and was impressed by your work in <strong>[FIELD/INDUSTRY]</strong>.</p>

<p>I'd love to connect and learn more about what you're working on.</p>

<p>Best regards,</p>`,
    category: 'personal'
  },
  {
    id: 'thank-you',
    name: 'Thank You Email',
    content: `<p>Dear [NAME],</p>

<p>Thank you so much for <strong>[REASON]</strong>. I really appreciate your time and effort.</p>

<p>Your insights about <strong>[TOPIC]</strong> were particularly valuable and will definitely help us move forward.</p>

<p>I look forward to continuing our collaboration.</p>

<p>With gratitude,</p>`,
    category: 'personal'
  },
  {
    id: 'networking-follow-up',
    name: 'Networking Follow-up',
    content: `<p>Hi [NAME],</p>

<p>It was great meeting you at <strong>[EVENT NAME]</strong> yesterday! I really enjoyed our conversation about <strong>[TOPIC DISCUSSED]</strong>.</p>

<p>As promised, I'm attaching <strong>[RESOURCE/DOCUMENT]</strong> that we discussed. I think you'll find it helpful for <strong>[RELEVANT USE CASE]</strong>.</p>

<p>I'd love to continue our conversation sometime. Would you be interested in grabbing coffee next week?</p>

<p>Looking forward to staying in touch!</p>

<p>Best regards,</p>`,
    category: 'personal'
  },
  {
    id: 'collaboration-request',
    name: 'Collaboration Request',
    content: `<p>Hi [NAME],</p>

<p>I hope this email finds you well. I've been following your work on <strong>[PROJECT/TOPIC]</strong> and I'm really impressed by what you've accomplished.</p>

<p>I'm reaching out because I think there might be an opportunity for us to collaborate on <strong>[SPECIFIC PROJECT/IDEA]</strong>.</p>

<p><strong>What I'm proposing:</strong></p>
<ul>
<li>[COLLABORATION DETAIL 1]</li>
<li>[COLLABORATION DETAIL 2]</li>
<li>[MUTUAL BENEFIT]</li>
</ul>

<p>I believe this could be mutually beneficial because <strong>[REASON]</strong>.</p>

<p>Would you be open to a brief call to discuss this further?</p>

<p>Best regards,</p>`,
    category: 'personal'
  },

  // Event & Marketing Templates
  {
    id: 'event-invitation',
    name: 'Event Invitation',
    content: `<p>Dear [NAME],</p>

<p>You're invited to <strong>[EVENT NAME]</strong>!</p>

<p><strong>Event Details:</strong></p>
<ul>
<li><strong>Date:</strong> [DATE]</li>
<li><strong>Time:</strong> [TIME]</li>
<li><strong>Location:</strong> [VENUE/VIRTUAL LINK]</li>
<li><strong>Dress Code:</strong> [DRESS CODE]</li>
</ul>

<p><strong>What to Expect:</strong></p>
<ul>
<li>[ACTIVITY 1]</li>
<li>[ACTIVITY 2]</li>
<li>[ACTIVITY 3]</li>
</ul>

<p>We're excited to have you join us for what promises to be an amazing event!</p>

<p>Please RSVP by <strong>[RSVP DATE]</strong> so we can plan accordingly.</p>

<p>Looking forward to seeing you there!</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },
  {
    id: 'newsletter',
    name: 'Newsletter Template',
    content: `<p>Hi [NAME],</p>

<p><strong>Welcome to this week's newsletter!</strong></p>

<p><strong>🔥 This Week's Highlights:</strong></p>
<ul>
<li><strong>[HIGHLIGHT 1]</strong> - [BRIEF DESCRIPTION]</li>
<li><strong>[HIGHLIGHT 2]</strong> - [BRIEF DESCRIPTION]</li>
<li><strong>[HIGHLIGHT 3]</strong> - [BRIEF DESCRIPTION]</li>
</ul>

<p><strong>📚 Featured Article:</strong><br>
<strong>[ARTICLE TITLE]</strong><br>
[BRIEF SUMMARY WITH LINK]</p>

<p><strong>💡 Quick Tip:</strong><br>
[ACTIONABLE TIP]</p>

<p><strong>📅 Upcoming Events:</strong></p>
<ul>
<li>[EVENT 1] - [DATE]</li>
<li>[EVENT 2] - [DATE]</li>
</ul>

<p>That's all for this week! Have a great weekend.</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },
  {
    id: 'product-launch',
    name: 'Product Launch Announcement',
    content: `<p>Dear [NAME],</p>

<p>We're thrilled to announce the launch of <strong>[PRODUCT NAME]</strong>!</p>

<p>After months of development and testing, we're excited to share <strong>[BRIEF PRODUCT DESCRIPTION]</strong> with you.</p>

<p><strong>🎉 What's New:</strong></p>
<ul>
<li><strong>[FEATURE 1]</strong> - [BENEFIT]</li>
<li><strong>[FEATURE 2]</strong> - [BENEFIT]</li>
<li><strong>[FEATURE 3]</strong> - [BENEFIT]</li>
</ul>

<p><strong>🎁 Special Launch Offer:</strong><br>
As a valued customer, you get <strong>[SPECIAL OFFER]</strong> for the first <strong>[TIME PERIOD]</strong>.</p>

<p>Ready to try it out? <strong>[CALL TO ACTION BUTTON/LINK]</strong></p>

<p>Questions? Reply to this email - we'd love to help!</p>

<p>Best regards,</p>`,
    category: 'marketing'
  },

  // HR & Internal Templates
  {
    id: 'job-offer',
    name: 'Job Offer',
    content: `<p>Dear [CANDIDATE NAME],</p>

<p>We are delighted to extend an offer for the position of <strong>[JOB TITLE]</strong> at <strong>[COMPANY NAME]</strong>.</p>

<p>After careful consideration of your background and our interview discussions, we believe you would be an excellent addition to our team.</p>

<p><strong>Position Details:</strong></p>
<ul>
<li><strong>Title:</strong> [JOB TITLE]</li>
<li><strong>Department:</strong> [DEPARTMENT]</li>
<li><strong>Start Date:</strong> [START DATE]</li>
<li><strong>Salary:</strong> [SALARY]</li>
<li><strong>Benefits:</strong> [BENEFITS SUMMARY]</li>
</ul>

<p>Please review the attached formal offer letter for complete details.</p>

<p>We're excited about the possibility of you joining our team and would love to have your response by <strong>[RESPONSE DATE]</strong>.</p>

<p>Please don't hesitate to reach out if you have any questions.</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'team-announcement',
    name: 'Team Announcement',
    content: `<p>Hi Team,</p>

<p>I'm excited to share some important news with you all.</p>

<p><strong>[ANNOUNCEMENT TITLE]</strong></p>

<p>[DETAILED ANNOUNCEMENT DESCRIPTION]</p>

<p><strong>What this means for you:</strong></p>
<ul>
<li>[IMPACT 1]</li>
<li>[IMPACT 2]</li>
<li>[IMPACT 3]</li>
</ul>

<p><strong>Next Steps:</strong></p>
<ol>
<li>[STEP 1] - [TIMELINE]</li>
<li>[STEP 2] - [TIMELINE]</li>
<li>[STEP 3] - [TIMELINE]</li>
</ol>

<p>I know you may have questions, and I'm here to address them. Please feel free to reach out to me directly or we can discuss during our next team meeting on <strong>[DATE]</strong>.</p>

<p>Thank you for your continued dedication and hard work.</p>

<p>Best regards,</p>`,
    category: 'business'
  },

  // Apology & Recovery Templates
  {
    id: 'service-apology',
    name: 'Service Apology',
    content: `<p>Dear [CUSTOMER NAME],</p>

<p>I want to personally apologize for the service disruption you experienced on <strong>[DATE]</strong>.</p>

<p>We fell short of the high standards you expect and deserve from us, and I take full responsibility for this failure.</p>

<p><strong>What happened:</strong><br>
[CLEAR, HONEST EXPLANATION]</p>

<p><strong>What we're doing to prevent this in the future:</strong></p>
<ul>
<li>[PREVENTIVE MEASURE 1]</li>
<li>[PREVENTIVE MEASURE 2]</li>
<li>[PREVENTIVE MEASURE 3]</li>
</ul>

<p>As an apology, we'd like to offer you <strong>[COMPENSATION]</strong>.</p>

<p>Your trust means everything to us, and we're committed to earning it back through our actions.</p>

<p>If you have any concerns or questions, please don't hesitate to contact me directly.</p>

<p>Sincerely,</p>`,
    category: 'support'
  },

  // Invoice & Payment Templates
  {
    id: 'invoice-send',
    name: 'Invoice Submission',
    content: `<p>Dear [CLIENT NAME],</p>

<p>I hope this email finds you well.</p>

<p>Please find attached invoice <strong>#[INVOICE NUMBER]</strong> for the services provided during <strong>[TIME PERIOD]</strong>.</p>

<p><strong>Invoice Details:</strong></p>
<ul>
<li><strong>Invoice Date:</strong> [DATE]</li>
<li><strong>Due Date:</strong> [DUE DATE]</li>
<li><strong>Amount:</strong> [AMOUNT]</li>
<li><strong>Services:</strong> [SERVICE DESCRIPTION]</li>
</ul>

<p>Payment can be made via <strong>[PAYMENT METHODS]</strong>. Please let me know if you need any additional information or have questions about the invoice.</p>

<p>Thank you for your business!</p>

<p>Best regards,</p>`,
    category: 'business'
  },
  {
    id: 'payment-reminder',
    name: 'Payment Reminder',
    content: `<p>Dear [CLIENT NAME],</p>

<p>I hope you're doing well.</p>

<p>This is a friendly reminder that invoice <strong>#[INVOICE NUMBER]</strong> for <strong>[AMOUNT]</strong> was due on <strong>[DUE DATE]</strong>.</p>

<p>If you've already sent the payment, please disregard this message. If not, could you please let me know when we can expect payment?</p>

<p>I've attached a copy of the invoice for your reference.</p>

<p>If there are any issues or concerns with the invoice, please don't hesitate to reach out so we can resolve them quickly.</p>

<p>Thank you for your attention to this matter.</p>

<p>Best regards,</p>`,
    category: 'business'
  }
]

const FONT_SIZES = [
  { value: '12px', label: 'Small' },
  { value: '14px', label: 'Normal' },
  { value: '16px', label: 'Medium' },
  { value: '18px', label: 'Large' },
  { value: '24px', label: 'X-Large' }
]

const TEXT_COLORS = [
  '#000000', '#333333', '#666666', '#999999',
  '#e74c3c', '#e67e22', '#f39c12', '#27ae60',
  '#3498db', '#9b59b6', '#34495e', '#95a5a6'
]

export function EmailRichTextEditor({
  value,
  onChange,
  placeholder = "Compose your email...",
  className = "",
  error,
  workflowData,
  currentNodeId,
  onVariableInsert,
  integrationProvider = 'gmail',
  userId
}: EmailRichTextEditorProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState<string>('all')
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [selectedSignature, setSelectedSignature] = useState<string>('')
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false)
  const [fontSize, setFontSize] = useState('14px')
  const [textColor, setTextColor] = useState('#000000')
  const [autoIncludeSignature, setAutoIncludeSignature] = useState(true)
  const [isEditorInitialized, setIsEditorInitialized] = useState(false)
  
  const editorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  // Initialize editor content only once to prevent cursor issues
  useEffect(() => {
    if (editorRef.current && !isEditorInitialized) {
      editorRef.current.innerHTML = value || ''
      setIsEditorInitialized(true)
    }
  }, [value, isEditorInitialized])

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
          console.log(`🔍 [SIGNATURES] ${integrationProvider} integration not connected for user`)
          // Still set empty signatures array - the UI will handle showing no signatures available
          return
        }
        
        // Auto-select default signature
        const defaultSignature = data.signatures?.find((sig: EmailSignature) => sig.isDefault)
        if (defaultSignature && autoIncludeSignature) {
          setSelectedSignature(defaultSignature.id)
          if (!value.includes(defaultSignature.content)) {
            onChange(value + '\n\n' + defaultSignature.content)
          }
        }
      } else {
        console.error(`Failed to load ${integrationProvider} signatures:`, response.status, response.statusText)
      }
    } catch (error) {
      console.error('Failed to load email signatures:', error)
    } finally {
      setIsLoadingSignatures(false)
    }
  }

  const execCommand = useCallback((command: string, value?: string) => {
    if (editorRef.current) {
      document.execCommand(command, false, value)
      editorRef.current.focus()
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
      
      // Add signature if auto-include is enabled
      if (autoIncludeSignature && selectedSignature) {
        const signature = signatures.find(sig => sig.id === selectedSignature)
        if (signature) {
          const contentWithSignature = template.content + '\n\n' + signature.content
          onChange(contentWithSignature)
          if (editorRef.current) {
            editorRef.current.innerHTML = contentWithSignature
          }
        }
      }
      
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
      const newContent = value + '\n\n' + signature.content
      onChange(newContent)
      if (editorRef.current) {
        editorRef.current.innerHTML = newContent
      }
      toast({
        title: "Signature added",
        description: "Email signature has been added to your message.",
      })
    }
  }

  const insertVariable = (variable: string) => {
    if (editorRef.current) {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const variableSpan = document.createElement('span')
        variableSpan.className = 'inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-medium mx-1'
        variableSpan.textContent = variable
        variableSpan.setAttribute('data-variable', variable)
        
        range.deleteContents()
        range.insertNode(variableSpan)
        range.setStartAfter(variableSpan)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        
        // Update content
        onChange(editorRef.current.innerHTML)
      }
    }
    
    if (onVariableInsert) {
      onVariableInsert(variable)
    }
  }

  const handleContentChange = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }

  const togglePreview = () => {
    setIsPreviewMode(!isPreviewMode)
  }

  const getVariablesFromWorkflow = () => {
    if (!workflowData || !currentNodeId) return []
    
    const variables: Array<{name: string, label: string, node: string, nodeType: string, provider: string}> = []
    
    // Get previous nodes
    workflowData.nodes
      .filter(node => node.id !== currentNodeId)
      .forEach(node => {
        if (node.data?.outputSchema) {
          // Determine node type and provider info
          const nodeType = node.data?.isTrigger ? 'Trigger' : 'Action'
          const provider = node.data?.providerId ? 
            node.data.providerId.charAt(0).toUpperCase() + node.data.providerId.slice(1) : 
            ''
          const title = node.data?.title || node.data?.type || 'Unknown'
          
          // Format display name: "Trigger: Gmail: New Email" or "Action: Slack: Send Message"
          const nodeDisplayName = provider ? 
            `${nodeType}: ${provider}: ${title}` : 
            `${nodeType}: ${title}`
          
          node.data.outputSchema.forEach((output: any) => {
            variables.push({
              name: `{{${node.id}.${output.name}}}`,
              label: output.label || output.name,
              node: nodeDisplayName,
              nodeType,
              provider
            })
          })
        }
      })
    
    return variables
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
      {/* Toolbar */}
      <div className="border-b border-border p-2 bg-muted/50">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Text Formatting */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<Bold className="h-4 w-4" />, 'bold', 'Bold')}
            {formatToolbarButton(<Italic className="h-4 w-4" />, 'italic', 'Italic')}
            {formatToolbarButton(<Underline className="h-4 w-4" />, 'underline', 'Underline')}
          </div>
          
          <Separator orientation="vertical" className="h-6" />
          
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
          </div>
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Font Size */}
          <Select value={fontSize} onValueChange={(value) => {
            setFontSize(value)
            execCommand('fontSize', value)
          }}>
            <SelectTrigger className="w-20 h-8 bg-background border-border text-foreground">
              <Type className="h-4 w-4" />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map(size => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Text Color */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted text-muted-foreground hover:text-foreground">
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2 bg-background border-border">
              <div className="grid grid-cols-4 gap-1">
                {TEXT_COLORS.map(color => (
                  <button
                    key={color}
                    className="w-8 h-8 rounded border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setTextColor(color)
                      execCommand('foreColor', color)
                    }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            {formatToolbarButton(<Undo className="h-4 w-4" />, 'undo', 'Undo')}
            {formatToolbarButton(<Redo className="h-4 w-4" />, 'redo', 'Redo')}
          </div>
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Templates */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 hover:bg-muted text-muted-foreground hover:text-foreground">
                <Mail className="h-4 w-4" />
                Templates
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0 bg-background border-border" align="start" side="bottom" sideOffset={4}>
              <div className="p-3 border-b border-border">
                <h4 className="text-sm font-medium text-foreground">Email Templates</h4>
                <p className="text-xs text-muted-foreground mt-1">Choose a template to get started</p>
                
                {/* Category Filter */}
                <div className="mt-3">
                  <Select value={selectedTemplateCategory} onValueChange={setSelectedTemplateCategory}>
                    <SelectTrigger className="h-8 text-xs bg-background border-border">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border">
                      <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                      <SelectItem value="business" className="text-xs">Business</SelectItem>
                      <SelectItem value="personal" className="text-xs">Personal</SelectItem>
                      <SelectItem value="marketing" className="text-xs">Marketing</SelectItem>
                      <SelectItem value="support" className="text-xs">Support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ScrollArea className="h-64 w-full" type="scroll">
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
            <PopoverContent className="w-80 p-0 bg-background border-border" align="start" side="bottom" sideOffset={4}>
              <div className="p-3 border-b border-border">
                <h4 className="text-sm font-medium text-foreground">Email Signatures</h4>
                <p className="text-xs text-muted-foreground mt-1">Add your signature to the email</p>
                
                <div className="flex items-center space-x-2 mt-3">
                  <Switch
                    id="auto-signature"
                    checked={autoIncludeSignature}
                    onCheckedChange={setAutoIncludeSignature}
                  />
                  <Label htmlFor="auto-signature" className="text-xs text-foreground">
                    Auto-include signature
                  </Label>
                </div>
              </div>
              <ScrollArea className="h-48 w-full">
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
                        className="p-3 rounded-md hover:bg-muted cursor-pointer border border-transparent hover:border-border"
                        onClick={() => insertSignature(signature.id)}
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium text-foreground">{signature.name}</h5>
                          {signature.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                        <div 
                          className="text-xs text-muted-foreground mt-1 line-clamp-2"
                          dangerouslySetInnerHTML={{ 
                            __html: signature.content.substring(0, 100) + '...' 
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          
          {/* Variables */}
          {workflowData && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1 hover:bg-muted text-muted-foreground hover:text-foreground">
                  <Variable className="h-4 w-4" />
                  Variables
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 bg-background border-border" align="start" side="bottom" sideOffset={4}>
                <div className="p-3 border-b border-border">
                  <h4 className="text-sm font-medium text-foreground">Workflow Variables</h4>
                  <p className="text-xs text-muted-foreground mt-1">Insert dynamic content from previous steps</p>
                </div>
                <ScrollArea className="h-48 w-full" type="scroll">
                  <div className="p-2">
                    {getVariablesFromWorkflow().map((variable, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-md hover:bg-muted cursor-pointer border border-transparent hover:border-border"
                        onClick={() => insertVariable(variable.name)}
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium text-foreground">{variable.label}</h5>
                          <Badge variant="secondary" className="text-xs">
                            {variable.node}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                          {variable.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}
          
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
      
      {/* Editor Content */}
      <div className="relative">
        {isPreviewMode ? (
          <div className="p-4 min-h-[200px] bg-background">
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
            onBlur={handleContentChange}
            className="p-4 min-h-[200px] focus:outline-none bg-background text-foreground"
            style={{ fontSize }}
            data-placeholder={placeholder}
            suppressContentEditableWarning
            {...(!isEditorInitialized && { dangerouslySetInnerHTML: { __html: value || '' } })}
          />
        )}
        
        {!isPreviewMode && !value && (
          <div className="absolute top-4 left-4 text-muted-foreground pointer-events-none">
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
    </div>
  )
}