"use client"

import React, { useState, useEffect } from 'react'
import { Plus, X, GripVertical, Type, Image, Minus, Square, List, Code, ChevronDown, ChevronUp, ToggleLeft, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// Block type definitions
type BlockType = 'section' | 'divider' | 'image' | 'actions' | 'context' | 'header'
type ElementType = 'button' | 'static_select' | 'overflow'
type ButtonStyle = 'primary' | 'danger' | undefined

interface SlackButton {
  type: 'button'
  text: { type: 'plain_text'; text: string; emoji?: boolean }
  value?: string
  action_id: string
  style?: ButtonStyle
  url?: string
}

interface SlackSelectOption {
  text: { type: 'plain_text'; text: string }
  value: string
}

interface SlackSelect {
  type: 'static_select'
  placeholder?: { type: 'plain_text'; text: string }
  options: SlackSelectOption[]
  action_id: string
}

interface SlackBlock {
  type: BlockType
  block_id?: string
  text?: { type: 'mrkdwn' | 'plain_text'; text: string }
  accessory?: SlackButton | SlackSelect
  elements?: (SlackButton | SlackSelect | { type: 'mrkdwn' | 'plain_text'; text: string })[]
  image_url?: string
  alt_text?: string
  title?: { type: 'plain_text'; text: string }
}

interface VisualBlock {
  id: string
  type: BlockType
  // Section
  text?: string
  textType?: 'mrkdwn' | 'plain_text'
  // Section accessory
  hasAccessory?: boolean
  accessoryType?: 'button' | 'image'
  accessoryButtonText?: string
  accessoryButtonValue?: string
  accessoryButtonStyle?: ButtonStyle
  accessoryButtonUrl?: string
  accessoryImageUrl?: string
  accessoryImageAlt?: string
  // Image block
  imageUrl?: string
  imageAlt?: string
  imageTitle?: string
  // Header block
  headerText?: string
  // Actions block
  buttons?: {
    id: string
    text: string
    value: string
    style?: ButtonStyle
    url?: string
  }[]
  // Context block
  contextElements?: {
    id: string
    type: 'text' | 'image'
    text?: string
    imageUrl?: string
    imageAlt?: string
  }[]
}

interface SlackBlockBuilderProps {
  value?: any
  onChange: (value: any) => void
  className?: string
  disabled?: boolean
}

// Generate unique ID for blocks
const generateId = () => `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Convert visual blocks to Slack Block Kit JSON
function visualToJson(blocks: VisualBlock[]): SlackBlock[] {
  return blocks.map(block => {
    const base: SlackBlock = { type: block.type }
    if (block.id) base.block_id = block.id

    switch (block.type) {
      case 'section':
        if (block.text) {
          base.text = { type: block.textType || 'mrkdwn', text: block.text }
        }
        if (block.hasAccessory && block.accessoryType === 'button' && block.accessoryButtonText) {
          base.accessory = {
            type: 'button',
            text: { type: 'plain_text', text: block.accessoryButtonText, emoji: true },
            value: block.accessoryButtonValue || 'click',
            action_id: `action_${block.id}`,
            ...(block.accessoryButtonStyle && { style: block.accessoryButtonStyle }),
            ...(block.accessoryButtonUrl && { url: block.accessoryButtonUrl })
          }
        } else if (block.hasAccessory && block.accessoryType === 'image' && block.accessoryImageUrl) {
          base.accessory = {
            type: 'image',
            image_url: block.accessoryImageUrl,
            alt_text: block.accessoryImageAlt || 'Image'
          } as any
        }
        break

      case 'header':
        base.text = { type: 'plain_text', text: block.headerText || '' }
        break

      case 'image':
        base.image_url = block.imageUrl
        base.alt_text = block.imageAlt || 'Image'
        if (block.imageTitle) {
          base.title = { type: 'plain_text', text: block.imageTitle }
        }
        break

      case 'divider':
        // No additional properties needed
        break

      case 'actions':
        base.elements = (block.buttons || []).map(btn => ({
          type: 'button' as const,
          text: { type: 'plain_text' as const, text: btn.text, emoji: true },
          value: btn.value || 'click',
          action_id: `action_${btn.id}`,
          ...(btn.style && { style: btn.style }),
          ...(btn.url && { url: btn.url })
        }))
        break

      case 'context':
        base.elements = (block.contextElements || []).map(elem => {
          if (elem.type === 'image') {
            return {
              type: 'image',
              image_url: elem.imageUrl || '',
              alt_text: elem.imageAlt || 'Image'
            } as any
          }
          return { type: 'mrkdwn' as const, text: elem.text || '' }
        })
        break
    }

    return base
  })
}

// Convert Slack Block Kit JSON to visual blocks
function jsonToVisual(blocks: SlackBlock[]): VisualBlock[] {
  if (!Array.isArray(blocks)) return []

  return blocks.map((block, index) => {
    const visual: VisualBlock = {
      id: block.block_id || generateId(),
      type: block.type
    }

    switch (block.type) {
      case 'section':
        if (block.text) {
          visual.text = block.text.text
          visual.textType = block.text.type
        }
        if (block.accessory) {
          visual.hasAccessory = true
          if (block.accessory.type === 'button') {
            visual.accessoryType = 'button'
            visual.accessoryButtonText = (block.accessory as SlackButton).text?.text
            visual.accessoryButtonValue = (block.accessory as SlackButton).value
            visual.accessoryButtonStyle = (block.accessory as SlackButton).style
            visual.accessoryButtonUrl = (block.accessory as SlackButton).url
          } else if ((block.accessory as any).type === 'image') {
            visual.accessoryType = 'image'
            visual.accessoryImageUrl = (block.accessory as any).image_url
            visual.accessoryImageAlt = (block.accessory as any).alt_text
          }
        }
        break

      case 'header':
        visual.headerText = block.text?.text
        break

      case 'image':
        visual.imageUrl = block.image_url
        visual.imageAlt = block.alt_text
        visual.imageTitle = block.title?.text
        break

      case 'actions':
        visual.buttons = (block.elements || [])
          .filter((e): e is SlackButton => e.type === 'button')
          .map(btn => ({
            id: generateId(),
            text: btn.text?.text || '',
            value: btn.value || '',
            style: btn.style,
            url: btn.url
          }))
        break

      case 'context':
        visual.contextElements = (block.elements || []).map(elem => {
          if ((elem as any).type === 'image') {
            return {
              id: generateId(),
              type: 'image' as const,
              imageUrl: (elem as any).image_url,
              imageAlt: (elem as any).alt_text
            }
          }
          return {
            id: generateId(),
            type: 'text' as const,
            text: (elem as any).text || ''
          }
        })
        break
    }

    return visual
  })
}

// Block type options for the add menu
const blockTypes: { type: BlockType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: 'header', label: 'Header', icon: <Type className="h-4 w-4" />, description: 'Large bold text' },
  { type: 'section', label: 'Section', icon: <MessageSquare className="h-4 w-4" />, description: 'Text with optional button' },
  { type: 'divider', label: 'Divider', icon: <Minus className="h-4 w-4" />, description: 'Horizontal line' },
  { type: 'image', label: 'Image', icon: <Image className="h-4 w-4" />, description: 'Image with alt text' },
  { type: 'actions', label: 'Buttons', icon: <Square className="h-4 w-4" />, description: 'Row of buttons' },
  { type: 'context', label: 'Context', icon: <List className="h-4 w-4" />, description: 'Small text or images' },
]

// Individual block editor component
function BlockEditor({
  block,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  disabled
}: {
  block: VisualBlock
  onChange: (block: VisualBlock) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
  disabled?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const blockInfo = blockTypes.find(b => b.type === block.type)

  const renderBlockContent = () => {
    switch (block.type) {
      case 'header':
        return (
          <div className="space-y-2">
            <Label className="text-xs">Header Text</Label>
            <Input
              value={block.headerText || ''}
              onChange={(e) => onChange({ ...block, headerText: e.target.value })}
              placeholder="Enter header text..."
              disabled={disabled}
            />
          </div>
        )

      case 'section':
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Text</Label>
                <Select
                  value={block.textType || 'mrkdwn'}
                  onValueChange={(v) => onChange({ ...block, textType: v as 'mrkdwn' | 'plain_text' })}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-[120px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mrkdwn">Markdown</SelectItem>
                    <SelectItem value="plain_text">Plain Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={block.text || ''}
                onChange={(e) => onChange({ ...block, text: e.target.value })}
                placeholder="Enter text... (supports *bold*, _italic_, `code`)"
                rows={2}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={block.hasAccessory || false}
                onCheckedChange={(checked) => onChange({ ...block, hasAccessory: checked, accessoryType: 'button' })}
                disabled={disabled}
              />
              <Label className="text-xs">Add accessory (button/image)</Label>
            </div>

            {block.hasAccessory && (
              <div className="pl-4 border-l-2 border-muted space-y-2">
                <Select
                  value={block.accessoryType || 'button'}
                  onValueChange={(v) => onChange({ ...block, accessoryType: v as 'button' | 'image' })}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="button">Button</SelectItem>
                    <SelectItem value="image">Thumbnail Image</SelectItem>
                  </SelectContent>
                </Select>

                {block.accessoryType === 'button' && (
                  <div className="space-y-2">
                    <Input
                      value={block.accessoryButtonText || ''}
                      onChange={(e) => onChange({ ...block, accessoryButtonText: e.target.value })}
                      placeholder="Button text"
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={block.accessoryButtonValue || ''}
                        onChange={(e) => onChange({ ...block, accessoryButtonValue: e.target.value })}
                        placeholder="Value (for callbacks)"
                        disabled={disabled}
                        className="h-8 text-sm"
                      />
                      <Select
                        value={block.accessoryButtonStyle || 'default'}
                        onValueChange={(v) => onChange({ ...block, accessoryButtonStyle: v === 'default' ? undefined : v as ButtonStyle })}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="primary">Primary (Green)</SelectItem>
                          <SelectItem value="danger">Danger (Red)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      value={block.accessoryButtonUrl || ''}
                      onChange={(e) => onChange({ ...block, accessoryButtonUrl: e.target.value })}
                      placeholder="URL (optional - opens link)"
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {block.accessoryType === 'image' && (
                  <div className="space-y-2">
                    <Input
                      value={block.accessoryImageUrl || ''}
                      onChange={(e) => onChange({ ...block, accessoryImageUrl: e.target.value })}
                      placeholder="Image URL"
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                    <Input
                      value={block.accessoryImageAlt || ''}
                      onChange={(e) => onChange({ ...block, accessoryImageAlt: e.target.value })}
                      placeholder="Alt text"
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case 'divider':
        return (
          <div className="py-2">
            <hr className="border-dashed" />
            <p className="text-xs text-muted-foreground text-center mt-1">Horizontal divider</p>
          </div>
        )

      case 'image':
        return (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Image URL</Label>
              <Input
                value={block.imageUrl || ''}
                onChange={(e) => onChange({ ...block, imageUrl: e.target.value })}
                placeholder="https://example.com/image.png"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Alt Text (required)</Label>
              <Input
                value={block.imageAlt || ''}
                onChange={(e) => onChange({ ...block, imageAlt: e.target.value })}
                placeholder="Description of the image"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Title (optional)</Label>
              <Input
                value={block.imageTitle || ''}
                onChange={(e) => onChange({ ...block, imageTitle: e.target.value })}
                placeholder="Image title"
                disabled={disabled}
              />
            </div>
          </div>
        )

      case 'actions':
        const buttons = block.buttons || []
        return (
          <div className="space-y-2">
            <Label className="text-xs">Buttons (max 25)</Label>
            {buttons.map((btn, idx) => (
              <div key={btn.id} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    value={btn.text}
                    onChange={(e) => {
                      const newButtons = [...buttons]
                      newButtons[idx] = { ...btn, text: e.target.value }
                      onChange({ ...block, buttons: newButtons })
                    }}
                    placeholder="Button text"
                    disabled={disabled}
                    className="h-8 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-1">
                    <Input
                      value={btn.value}
                      onChange={(e) => {
                        const newButtons = [...buttons]
                        newButtons[idx] = { ...btn, value: e.target.value }
                        onChange({ ...block, buttons: newButtons })
                      }}
                      placeholder="Value"
                      disabled={disabled}
                      className="h-7 text-xs"
                    />
                    <Select
                      value={btn.style || 'default'}
                      onValueChange={(v) => {
                        const newButtons = [...buttons]
                        newButtons[idx] = { ...btn, style: v === 'default' ? undefined : v as ButtonStyle }
                        onChange({ ...block, buttons: newButtons })
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="danger">Danger</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    onChange({ ...block, buttons: buttons.filter((_, i) => i !== idx) })
                  }}
                  disabled={disabled}
                  className="h-8 w-8 shrink-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {buttons.length < 25 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onChange({
                    ...block,
                    buttons: [...buttons, { id: generateId(), text: '', value: '', style: undefined }]
                  })
                }}
                disabled={disabled}
                className="w-full h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Button
              </Button>
            )}
          </div>
        )

      case 'context':
        const elements = block.contextElements || []
        return (
          <div className="space-y-2">
            <Label className="text-xs">Context Elements (max 10)</Label>
            {elements.map((elem, idx) => (
              <div key={elem.id} className="flex gap-2 items-start">
                <Select
                  value={elem.type}
                  onValueChange={(v) => {
                    const newElements = [...elements]
                    newElements[idx] = { ...elem, type: v as 'text' | 'image' }
                    onChange({ ...block, contextElements: newElements })
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-20 h-8 text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1">
                  {elem.type === 'text' ? (
                    <Input
                      value={elem.text || ''}
                      onChange={(e) => {
                        const newElements = [...elements]
                        newElements[idx] = { ...elem, text: e.target.value }
                        onChange({ ...block, contextElements: newElements })
                      }}
                      placeholder="Context text (supports markdown)"
                      disabled={disabled}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <div className="space-y-1">
                      <Input
                        value={elem.imageUrl || ''}
                        onChange={(e) => {
                          const newElements = [...elements]
                          newElements[idx] = { ...elem, imageUrl: e.target.value }
                          onChange({ ...block, contextElements: newElements })
                        }}
                        placeholder="Image URL"
                        disabled={disabled}
                        className="h-7 text-xs"
                      />
                      <Input
                        value={elem.imageAlt || ''}
                        onChange={(e) => {
                          const newElements = [...elements]
                          newElements[idx] = { ...elem, imageAlt: e.target.value }
                          onChange({ ...block, contextElements: newElements })
                        }}
                        placeholder="Alt text"
                        disabled={disabled}
                        className="h-7 text-xs"
                      />
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    onChange({ ...block, contextElements: elements.filter((_, i) => i !== idx) })
                  }}
                  disabled={disabled}
                  className="h-8 w-8 shrink-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {elements.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onChange({
                    ...block,
                    contextElements: [...elements, { id: generateId(), type: 'text', text: '' }]
                  })
                }}
                disabled={disabled}
                className="w-full h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Element
              </Button>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Card className={cn("border", disabled && "opacity-50")}>
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        <div className="flex items-center gap-2 flex-1">
          {blockInfo?.icon}
          <span className="text-sm font-medium">{blockInfo?.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onMoveUp}
            disabled={isFirst || disabled}
            className="h-6 w-6"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onMoveDown}
            disabled={isLast || disabled}
            className="h-6 w-6"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6"
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            className="h-6 w-6 text-destructive hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {isExpanded && (
        <CardContent className="pt-3 pb-3">
          {renderBlockContent()}
        </CardContent>
      )}
    </Card>
  )
}

export function SlackBlockBuilder({
  value,
  onChange,
  className,
  disabled = false
}: SlackBlockBuilderProps) {
  const [mode, setMode] = useState<'visual' | 'json'>('visual')
  const [visualBlocks, setVisualBlocks] = useState<VisualBlock[]>([])
  const [jsonValue, setJsonValue] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Initialize from value
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        if (Array.isArray(parsed)) {
          setVisualBlocks(jsonToVisual(parsed))
          setJsonValue(JSON.stringify(parsed, null, 2))
        }
      } catch {
        // If parsing fails, treat as raw JSON
        setJsonValue(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
      }
    }
  }, [])

  // Update parent when visual blocks change
  const handleVisualChange = (blocks: VisualBlock[]) => {
    setVisualBlocks(blocks)
    const json = visualToJson(blocks)
    setJsonValue(JSON.stringify(json, null, 2))
    onChange(json)
  }

  // Update parent when JSON changes
  const handleJsonChange = (json: string) => {
    setJsonValue(json)
    try {
      const parsed = JSON.parse(json)
      setJsonError(null)
      setVisualBlocks(jsonToVisual(parsed))
      onChange(parsed)
    } catch (e) {
      setJsonError('Invalid JSON')
    }
  }

  const addBlock = (type: BlockType) => {
    const newBlock: VisualBlock = {
      id: generateId(),
      type,
      ...(type === 'section' && { text: '', textType: 'mrkdwn' as const }),
      ...(type === 'header' && { headerText: '' }),
      ...(type === 'image' && { imageUrl: '', imageAlt: '' }),
      ...(type === 'actions' && { buttons: [{ id: generateId(), text: 'Click me', value: 'click', style: undefined }] }),
      ...(type === 'context' && { contextElements: [{ id: generateId(), type: 'text' as const, text: '' }] }),
    }
    handleVisualChange([...visualBlocks, newBlock])
  }

  const updateBlock = (index: number, block: VisualBlock) => {
    const newBlocks = [...visualBlocks]
    newBlocks[index] = block
    handleVisualChange(newBlocks)
  }

  const removeBlock = (index: number) => {
    handleVisualChange(visualBlocks.filter((_, i) => i !== index))
  }

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...visualBlocks]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newBlocks.length) return
    ;[newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]]
    handleVisualChange(newBlocks)
  }

  return (
    <div className={cn("space-y-3", className)}>
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'visual' | 'json')}>
        <TabsList className="grid w-full grid-cols-2 h-8">
          <TabsTrigger value="visual" className="text-xs h-7">
            <ToggleLeft className="h-3 w-3 mr-1" />
            Visual Builder
          </TabsTrigger>
          <TabsTrigger value="json" className="text-xs h-7">
            <Code className="h-3 w-3 mr-1" />
            Raw JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="mt-3 space-y-3">
          {visualBlocks.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
              <p className="text-sm mb-3">No blocks yet. Add your first block:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {blockTypes.map((bt) => (
                  <Button
                    key={bt.type}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addBlock(bt.type)}
                    disabled={disabled}
                    className="h-8"
                  >
                    {bt.icon}
                    <span className="ml-1">{bt.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {visualBlocks.map((block, index) => (
                <BlockEditor
                  key={block.id}
                  block={block}
                  onChange={(b) => updateBlock(index, b)}
                  onRemove={() => removeBlock(index)}
                  onMoveUp={() => moveBlock(index, 'up')}
                  onMoveDown={() => moveBlock(index, 'down')}
                  isFirst={index === 0}
                  isLast={index === visualBlocks.length - 1}
                  disabled={disabled}
                />
              ))}
              <div className="flex flex-wrap gap-2">
                {blockTypes.map((bt) => (
                  <Button
                    key={bt.type}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addBlock(bt.type)}
                    disabled={disabled}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {bt.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="json" className="mt-3">
          <div className="space-y-2">
            <Textarea
              value={jsonValue}
              onChange={(e) => handleJsonChange(e.target.value)}
              placeholder={`[\n  {\n    "type": "section",\n    "text": {\n      "type": "mrkdwn",\n      "text": "*Hello!* Click the button:"\n    }\n  }\n]`}
              rows={12}
              disabled={disabled}
              className={cn("font-mono text-xs", jsonError && "border-destructive")}
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Use the{' '}
              <a
                href="https://app.slack.com/block-kit-builder"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Slack Block Kit Builder
              </a>
              {' '}to design blocks visually, then paste the JSON here.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
