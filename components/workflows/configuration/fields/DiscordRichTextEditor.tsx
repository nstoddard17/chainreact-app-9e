"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { 
  Bold, 
  Italic, 
  Code, 
  MessageSquare,
  Hash,
  AtSign,
  Smile,
  Link,
  Image,
  Palette,
  Eye,
  EyeOff,
  Variable,
  ChevronDown,
  Zap,
  User,
  Shield,
  Plus,
  X,
  FileImage,
  Calendar
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface DiscordRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableInsert?: (variable: string) => void
  guildId?: string
  channelId?: string
  userId?: string
}

interface DiscordEmbed {
  title?: string
  description?: string
  color?: string
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  image?: string
  thumbnail?: string
  footer?: string
  timestamp?: boolean
}

interface DiscordMessagePreview {
  content: string
  embed?: DiscordEmbed
  mentions: string[]
  roleMentions: string[]
}

const DISCORD_COLORS = [
  { name: 'Discord Blurple', value: '#5865f2' },
  { name: 'Green', value: '#57f287' },
  { name: 'Yellow', value: '#fed330' },
  { name: 'Orange', value: '#fd9644' },
  { name: 'Red', value: '#ed4245' },
  { name: 'Purple', value: '#eb459e' },
  { name: 'Blue', value: '#3498db' },
  { name: 'Dark Grey', value: '#36393f' },
  { name: 'Light Grey', value: '#95a5a6' },
  { name: 'White', value: '#ffffff' }
]

const DISCORD_MARKDOWN_EXAMPLES = [
  { syntax: '**bold text**', description: 'Bold text' },
  { syntax: '*italic text*', description: 'Italic text' },
  { syntax: '***bold italic***', description: 'Bold and italic' },
  { syntax: '__underline__', description: 'Underlined text' },
  { syntax: '~~strikethrough~~', description: 'Strikethrough text' },
  { syntax: '`inline code`', description: 'Inline code' },
  { syntax: '```\ncode block\n```', description: 'Code block' },
  { syntax: '||spoiler||', description: 'Spoiler text' },
  { syntax: '> quote', description: 'Quote' },
  { syntax: '@username', description: 'Mention user' },
  { syntax: '#channel', description: 'Mention channel' },
  { syntax: '@role', description: 'Mention role' }
]

export function DiscordRichTextEditor({
  value,
  onChange,
  placeholder = "Type your Discord message...",
  className = "",
  error,
  workflowData,
  currentNodeId,
  onVariableInsert,
  guildId,
  channelId,
  userId
}: DiscordRichTextEditorProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [useEmbed, setUseEmbed] = useState(false)
  const [embed, setEmbed] = useState<DiscordEmbed>({
    color: '#5865f2'
  })
  const [availableMembers, setAvailableMembers] = useState<Array<{id: string, name: string, avatar?: string}>>([])
  const [availableRoles, setAvailableRoles] = useState<Array<{id: string, name: string, color: string}>>([])
  const [availableChannels, setAvailableChannels] = useState<Array<{id: string, name: string, type: string}>>([])
  const [isLoadingDiscordData, setIsLoadingDiscordData] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  // Debug logging to identify freeze cause
  console.log('[DiscordRichTextEditor] Rendering with:', { guildId, channelId, userId, value })

  const loadDiscordGuildData = useCallback(async () => {
    if (!guildId || !userId) {
      console.log('[DiscordRichTextEditor] Skipping guild data load - missing guildId or userId')
      return;
    }
    
    try {
      console.log('[DiscordRichTextEditor] Loading Discord guild data for:', { guildId, userId })
      setIsLoadingDiscordData(true)
      
      // Load members, roles, and channels for the guild with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const [membersResponse, rolesResponse, channelsResponse] = await Promise.all([
        fetch(`/api/integrations/discord/members?guildId=${guildId}&userId=${userId}`, { signal: controller.signal }),
        fetch(`/api/integrations/discord/roles?guildId=${guildId}&userId=${userId}`, { signal: controller.signal }),
        fetch(`/api/integrations/discord/channels?guildId=${guildId}&userId=${userId}`, { signal: controller.signal })
      ]).catch(err => {
        console.error('[DiscordRichTextEditor] API request failed:', err)
        return [null, null, null]
      })
      
      clearTimeout(timeoutId)
      
      if (membersResponse && membersResponse.ok) {
        const membersData = await membersResponse.json()
        setAvailableMembers(membersData.members || [])
      }
      
      if (rolesResponse && rolesResponse.ok) {
        const rolesData = await rolesResponse.json()
        setAvailableRoles(rolesData.roles || [])
      }
      
      if (channelsResponse && channelsResponse.ok) {
        const channelsData = await channelsResponse.json()
        setAvailableChannels(channelsData.channels || [])
      }
      
      console.log('[DiscordRichTextEditor] Successfully loaded Discord guild data')
    } catch (error) {
      console.error('[DiscordRichTextEditor] Failed to load Discord guild data:', error)
      toast({
        title: "Failed to load Discord data",
        description: "Could not load server members, roles, and channels",
        variant: "destructive"
      })
    } finally {
      setIsLoadingDiscordData(false)
    }
  }, [guildId, userId, toast]) // Removed isLoadingDiscordData to prevent circular dependency

  // Load Discord guild data when guildId changes - disabled for now to prevent freeze
  useEffect(() => {
    // Temporarily disabled auto-loading to prevent freeze
    // Users can still access mentions but data won't preload
    console.log('[DiscordRichTextEditor] Auto-load disabled - guildId present:', !!guildId)
    /*
    if (guildId && userId) {
      loadDiscordGuildData()
    }
    */
  }, [guildId, userId, loadDiscordGuildData])

  const insertMarkdown = useCallback((markdownSyntax: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selectedText = value.substring(start, end)
      
      let newText = ''
      
      // Handle different markdown types
      if (markdownSyntax === '**bold**') {
        newText = selectedText ? `**${selectedText}**` : '**bold text**'
      } else if (markdownSyntax === '*italic*') {
        newText = selectedText ? `*${selectedText}*` : '*italic text*'
      } else if (markdownSyntax === '`code`') {
        newText = selectedText ? `\`${selectedText}\`` : '`inline code`'
      } else if (markdownSyntax === '```code```') {
        newText = selectedText ? `\`\`\`\n${selectedText}\n\`\`\`` : '```\ncode block\n```'
      } else if (markdownSyntax === '||spoiler||') {
        newText = selectedText ? `||${selectedText}||` : '||spoiler text||'
      } else if (markdownSyntax === '~~strikethrough~~') {
        newText = selectedText ? `~~${selectedText}~~` : '~~strikethrough~~'
      } else if (markdownSyntax === '__underline__') {
        newText = selectedText ? `__${selectedText}__` : '__underlined text__'
      } else if (markdownSyntax === '> quote') {
        newText = selectedText ? `> ${selectedText}` : '> quoted text'
      } else {
        newText = markdownSyntax
      }
      
      const newValue = value.substring(0, start) + newText + value.substring(end)
      onChange(newValue)
      
      // Set cursor position after the inserted text
      setTimeout(() => {
        if (textareaRef.current) {
          const newPosition = start + newText.length
          textareaRef.current.setSelectionRange(newPosition, newPosition)
          textareaRef.current.focus()
        }
      }, 10)
    }
  }, [value, onChange])

  const insertMention = (type: 'user' | 'role' | 'channel', id: string, name: string) => {
    let mentionText = ''
    
    if (type === 'user') {
      mentionText = `<@${id}>`
    } else if (type === 'role') {
      mentionText = `<@&${id}>`
    } else if (type === 'channel') {
      mentionText = `<#${id}>`
    }
    
    if (textareaRef.current) {
      const textarea = textareaRef.current
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      
      const newValue = value.substring(0, start) + mentionText + value.substring(end)
      onChange(newValue)
      
      setTimeout(() => {
        if (textareaRef.current) {
          const newPosition = start + mentionText.length
          textareaRef.current.setSelectionRange(newPosition, newPosition)
          textareaRef.current.focus()
        }
      }, 10)
    }
    
    toast({
      title: "Mention added",
      description: `Added ${type} mention for ${name}`,
    })
  }

  const insertVariable = (variable: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      
      const newValue = value.substring(0, start) + variable + value.substring(end)
      onChange(newValue)
      
      setTimeout(() => {
        if (textareaRef.current) {
          const newPosition = start + variable.length
          textareaRef.current.setSelectionRange(newPosition, newPosition)
          textareaRef.current.focus()
        }
      }, 10)
    }
    
    if (onVariableInsert) {
      onVariableInsert(variable)
    }
  }

  const updateEmbed = (field: keyof DiscordEmbed, value: any) => {
    setEmbed(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const addEmbedField = () => {
    const currentFields = embed.fields || []
    setEmbed(prev => ({
      ...prev,
      fields: [...currentFields, { name: '', value: '', inline: false }]
    }))
  }

  const updateEmbedField = (index: number, field: string, value: any) => {
    const newFields = [...(embed.fields || [])]
    newFields[index] = { ...newFields[index], [field]: value }
    setEmbed(prev => ({ ...prev, fields: newFields }))
  }

  const removeEmbedField = (index: number) => {
    const newFields = [...(embed.fields || [])]
    newFields.splice(index, 1)
    setEmbed(prev => ({ ...prev, fields: newFields }))
  }

  const togglePreview = () => {
    setIsPreviewMode(!isPreviewMode)
  }

  const getVariablesFromWorkflow = () => {
    if (!workflowData || !currentNodeId) return []
    
    const variables: Array<{name: string, label: string, node: string}> = []
    
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

  // Prepare the complete Discord message object for backend
  const buildDiscordMessage = () => {
    const message: any = {
      content: value
    }
    
    if (useEmbed && embed) {
      message.embed = embed
    }
    
    return message
  }

  // Removed unnecessary useEffect that was causing re-renders

  return (
    <div className={cn("border border-slate-700 rounded-lg overflow-hidden bg-slate-900", className)}>
      {/* Toolbar */}
      <div className="border-b border-slate-700 p-2 bg-slate-800">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Discord Markdown Formatting */}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('**bold**')}
              title="Bold"
              className="h-8 w-8 p-0 hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('*italic*')}
              title="Italic"
              className="h-8 w-8 p-0 hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('`code`')}
              title="Inline Code"
              className="h-8 w-8 p-0 hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              <Code className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown('||spoiler||')}
              title="Spoiler"
              className="h-8 w-8 p-0 hover:bg-slate-700 text-slate-300 hover:text-white"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Mentions */}
          {guildId && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 gap-1 hover:bg-slate-700 text-slate-300 hover:text-white"
                    onClick={() => {
                      // Load Discord data on demand when user clicks mentions
                      if (!availableMembers.length && !isLoadingDiscordData) {
                        loadDiscordGuildData()
                      }
                    }}
                  >
                    <AtSign className="h-4 w-4" />
                    Users
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-slate-800 border-slate-700">
                  <div className="p-3 border-b border-slate-700">
                    <h4 className="text-sm font-medium text-slate-200">Mention Users</h4>
                    <p className="text-xs text-slate-400 mt-1">Add user mentions to your message</p>
                  </div>
                  <ScrollArea className="h-48">
                    <div className="p-2">
                      {isLoadingDiscordData ? (
                        <div className="text-center py-8 text-slate-400">Loading users...</div>
                      ) : availableMembers.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">No users found</div>
                      ) : (
                        availableMembers.map(member => (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-700 cursor-pointer"
                            onClick={() => insertMention('user', member.id, member.name)}
                          >
                            <User className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-200">{member.name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 hover:bg-slate-700 text-slate-300 hover:text-white">
                    <Shield className="h-4 w-4" />
                    Roles
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-slate-800 border-slate-700">
                  <div className="p-3 border-b border-slate-700">
                    <h4 className="text-sm font-medium text-slate-200">Mention Roles</h4>
                    <p className="text-xs text-slate-400 mt-1">Add role mentions to your message</p>
                  </div>
                  <ScrollArea className="h-48">
                    <div className="p-2">
                      {isLoadingDiscordData ? (
                        <div className="text-center py-8 text-gray-500">Loading roles...</div>
                      ) : availableRoles.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">No roles found</div>
                      ) : (
                        availableRoles.map(role => (
                          <div
                            key={role.id}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-700 cursor-pointer"
                            onClick={() => insertMention('role', role.id, role.name)}
                          >
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: role.color || '#99aab5' }}
                            />
                            <span className="text-sm">{role.name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1 hover:bg-slate-700 text-slate-300 hover:text-white">
                    <Hash className="h-4 w-4" />
                    Channels
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 bg-slate-800 border-slate-700">
                  <div className="p-3 border-b border-slate-700">
                    <h4 className="text-sm font-medium text-slate-200">Mention Channels</h4>
                    <p className="text-xs text-slate-400 mt-1">Add channel mentions to your message</p>
                  </div>
                  <ScrollArea className="h-48">
                    <div className="p-2">
                      {availableChannels.map(channel => (
                        <div
                          key={channel.id}
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                          onClick={() => insertMention('channel', channel.id, channel.name)}
                        >
                          <Hash className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">{channel.name}</span>
                          <Badge variant="secondary" className="text-xs ml-auto">
                            {channel.type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              
              <Separator orientation="vertical" className="h-6" />
            </>
          )}
          
          <Separator orientation="vertical" className="h-6" />
          
          {/* Embed Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="use-embed"
              checked={useEmbed}
              onCheckedChange={setUseEmbed}
            />
            <Label htmlFor="use-embed" className="text-sm">
              Rich Embed
            </Label>
          </div>
          
          <div className="flex-1" />
          
          {/* Preview Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={togglePreview}
            className="h-8 gap-1 hover:bg-slate-700 text-slate-300 hover:text-white"
          >
            {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPreviewMode ? 'Edit' : 'Preview'}
          </Button>
        </div>
      </div>
      
      {/* Message Content */}
      <div className="p-4">
        {isPreviewMode ? (
          <div className="discord-preview bg-gray-800 text-white rounded-lg p-4 min-h-[200px]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                B
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-medium text-white">Bot</span>
                  <span className="text-xs text-gray-400">Today at 12:00 PM</span>
                </div>
                {value && (
                  <div className="text-gray-100 mb-2">
                    {value.split('\n').map((line, i) => (
                      <div key={i}>{line || '\u00A0'}</div>
                    ))}
                  </div>
                )}
                {useEmbed && embed && (embed.title || embed.description) && (
                  <div 
                    className="border-l-4 bg-gray-700 p-4 rounded-r"
                    style={{ borderLeftColor: embed.color || '#5865f2' }}
                  >
                    {embed.title && (
                      <h3 className="text-white font-medium mb-2">{embed.title}</h3>
                    )}
                    {embed.description && (
                      <p className="text-gray-300 text-sm">{embed.description}</p>
                    )}
                    {embed.fields && embed.fields.length > 0 && (
                      <div className="mt-3 grid gap-2">
                        {embed.fields.map((field, i) => (
                          <div key={i} className={field.inline ? "inline-block w-1/3 pr-2" : ""}>
                            <div className="font-medium text-white text-sm">{field.name}</div>
                            <div className="text-gray-300 text-sm">{field.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {embed.footer && (
                      <div className="text-xs text-gray-400 mt-3">{embed.footer}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="message-content" className="text-sm font-medium mb-2 block">
                Message Content
              </Label>
              <Textarea
                ref={textareaRef}
                id="message-content"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
              />
            </div>
            
            {useEmbed && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h4 className="text-sm font-medium">Rich Embed Configuration</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Rich embeds create structured, visually appealing message blocks with titles, descriptions, colored borders, and organized fields.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="embed-title" className="text-sm">Title</Label>
                    <p className="text-xs text-slate-500 mb-2">Large heading text shown at the top of the embed</p>
                    <Input
                      id="embed-title"
                      placeholder="Embed title..."
                      value={embed.title || ''}
                      onChange={(e) => updateEmbed('title', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="embed-color" className="text-sm">Color</Label>
                    <p className="text-xs text-slate-500 mb-2">Color of the vertical border on the left side</p>
                    <Select value={embed.color} onValueChange={(value) => updateEmbed('color', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DISCORD_COLORS.map(color => (
                          <SelectItem key={color.value} value={color.value}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-4 h-4 rounded border"
                                style={{ backgroundColor: color.value }}
                              />
                              {color.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="embed-description" className="text-sm">Description</Label>
                  <p className="text-xs text-slate-500 mb-2">Main text content shown below the title</p>
                  <Textarea
                    id="embed-description"
                    placeholder="Embed description..."
                    value={embed.description || ''}
                    onChange={(e) => updateEmbed('description', e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Label className="text-sm">Fields</Label>
                      <p className="text-xs text-slate-500">Add structured name-value pairs. Toggle 'inline' to display multiple fields side-by-side</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addEmbedField}
                      className="h-8"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Field
                    </Button>
                  </div>
                  {embed.fields && embed.fields.map((field, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 mb-2">
                      <Input
                        placeholder="Field name"
                        value={field.name}
                        onChange={(e) => updateEmbedField(index, 'name', e.target.value)}
                        className="col-span-4"
                      />
                      <Input
                        placeholder="Field value"
                        value={field.value}
                        onChange={(e) => updateEmbedField(index, 'value', e.target.value)}
                        className="col-span-6"
                      />
                      <div className="col-span-1 flex items-center justify-center">
                        <Switch
                          checked={field.inline || false}
                          onCheckedChange={(checked) => updateEmbedField(index, 'inline', checked)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEmbedField(index)}
                        className="col-span-1 h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="embed-footer" className="text-sm">Footer Text</Label>
                    <p className="text-xs text-slate-500 mb-2">Small text shown at the bottom of the embed</p>
                    <Input
                      id="embed-footer"
                      placeholder="Footer text..."
                      value={embed.footer || ''}
                      onChange={(e) => updateEmbed('footer', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col space-y-2 mt-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="embed-timestamp"
                        checked={embed.timestamp || false}
                        onCheckedChange={(checked) => updateEmbed('timestamp', checked)}
                      />
                      <Label htmlFor="embed-timestamp" className="text-sm">
                        Add timestamp
                      </Label>
                    </div>
                    <p className="text-xs text-slate-500">Show current date and time next to footer</p>
                  </div>
                </div>
              </div>
            )}
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
            Discord message editor - Supports markdown, mentions, and embeds
          </span>
          <span>
            {value.length}/2000 characters
          </span>
        </div>
      </div>
    </div>
  )
}