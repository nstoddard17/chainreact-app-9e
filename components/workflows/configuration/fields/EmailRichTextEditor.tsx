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
    id: 'introduction',
    name: 'Introduction Email',
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
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [selectedSignature, setSelectedSignature] = useState<string>('')
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false)
  const [fontSize, setFontSize] = useState('14px')
  const [textColor, setTextColor] = useState('#000000')
  const [autoIncludeSignature, setAutoIncludeSignature] = useState(true)
  
  const editorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

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
        
        // Auto-select default signature
        const defaultSignature = data.signatures?.find((sig: EmailSignature) => sig.isDefault)
        if (defaultSignature && autoIncludeSignature) {
          setSelectedSignature(defaultSignature.id)
          if (!value.includes(defaultSignature.content)) {
            onChange(value + '\n\n' + defaultSignature.content)
          }
        }
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
    
    const variables: Array<{name: string, label: string, node: string}> = []
    
    // Get previous nodes
    workflowData.nodes
      .filter(node => node.id !== currentNodeId)
      .forEach(node => {
        if (node.data?.outputSchema) {
          node.data.outputSchema.forEach((output: any) => {
            variables.push({
              name: `{{${node.id}.${output.name}}}`,
              label: output.label || output.name,
              node: node.data?.title || node.data?.type || 'Unknown'
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
      className="h-8 w-8 p-0 hover:bg-gray-100"
    >
      {icon}
    </Button>
  )

  return (
    <div className={cn("border border-gray-200 rounded-lg overflow-hidden bg-white", className)}>
      {/* Toolbar */}
      <div className="border-b border-gray-200 p-2 bg-gray-50">
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
            <SelectTrigger className="w-20 h-8">
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
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="grid grid-cols-4 gap-1">
                {TEXT_COLORS.map(color => (
                  <button
                    key={color}
                    className="w-8 h-8 rounded border border-gray-200 hover:scale-110 transition-transform"
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
              <Button variant="ghost" size="sm" className="h-8 gap-1">
                <Mail className="h-4 w-4" />
                Templates
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0">
              <div className="p-3 border-b">
                <h4 className="text-sm font-medium">Email Templates</h4>
                <p className="text-xs text-gray-500 mt-1">Choose a template to get started</p>
              </div>
              <ScrollArea className="h-64">
                <div className="p-2">
                  {EMAIL_TEMPLATES.map(template => (
                    <div
                      key={template.id}
                      className="p-3 rounded-md hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                      onClick={() => insertTemplate(template.id)}
                    >
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-medium">{template.name}</h5>
                        <Badge variant="secondary" className="text-xs">
                          {template.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {template.content.replace(/<[^>]*>/g, '').substring(0, 80)}...
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          
          {/* Signatures */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1">
                <FileSignature className="h-4 w-4" />
                Signature
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0">
              <div className="p-3 border-b">
                <h4 className="text-sm font-medium">Email Signatures</h4>
                <p className="text-xs text-gray-500 mt-1">Add your signature to the email</p>
                
                <div className="flex items-center space-x-2 mt-3">
                  <Switch
                    id="auto-signature"
                    checked={autoIncludeSignature}
                    onCheckedChange={setAutoIncludeSignature}
                  />
                  <Label htmlFor="auto-signature" className="text-xs">
                    Auto-include signature
                  </Label>
                </div>
              </div>
              <ScrollArea className="h-48">
                <div className="p-2">
                  {isLoadingSignatures ? (
                    <div className="text-center py-8 text-gray-500">
                      Loading signatures...
                    </div>
                  ) : signatures.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileSignature className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">No signatures found</p>
                      <p className="text-xs">Create signatures in your {integrationProvider} account</p>
                    </div>
                  ) : (
                    signatures.map(signature => (
                      <div
                        key={signature.id}
                        className="p-3 rounded-md hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                        onClick={() => insertSignature(signature.id)}
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium">{signature.name}</h5>
                          {signature.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              Default
                            </Badge>
                          )}
                        </div>
                        <div 
                          className="text-xs text-gray-500 mt-1 line-clamp-2"
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
                <Button variant="ghost" size="sm" className="h-8 gap-1">
                  <Variable className="h-4 w-4" />
                  Variables
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0">
                <div className="p-3 border-b">
                  <h4 className="text-sm font-medium">Workflow Variables</h4>
                  <p className="text-xs text-gray-500 mt-1">Insert dynamic content from previous steps</p>
                </div>
                <ScrollArea className="h-48">
                  <div className="p-2">
                    {getVariablesFromWorkflow().map((variable, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-md hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                        onClick={() => insertVariable(variable.name)}
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium">{variable.label}</h5>
                          <Badge variant="secondary" className="text-xs">
                            {variable.node}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 font-mono">
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
            className="h-8 gap-1"
          >
            {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPreviewMode ? 'Edit' : 'Preview'}
          </Button>
        </div>
      </div>
      
      {/* Editor Content */}
      <div className="relative">
        {isPreviewMode ? (
          <div className="p-4 min-h-[200px] bg-white">
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-500">No content to preview</p>' }}
            />
          </div>
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleContentChange}
            onBlur={handleContentChange}
            className="p-4 min-h-[200px] focus:outline-none"
            style={{ fontSize }}
            dangerouslySetInnerHTML={{ __html: value }}
            data-placeholder={placeholder}
            suppressContentEditableWarning
          />
        )}
        
        {!isPreviewMode && !value && (
          <div className="absolute top-4 left-4 text-gray-400 pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
      
      {/* Error Message */}
      {error && (
        <div className="p-2 bg-red-50 border-t border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      
      {/* Footer */}
      <div className="border-t border-gray-200 p-2 bg-gray-50 text-xs text-gray-500">
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