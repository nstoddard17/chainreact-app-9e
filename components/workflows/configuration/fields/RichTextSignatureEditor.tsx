"use client"

import React, { useRef, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link,
  Image,
  Palette
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RichTextSignatureEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

// Common web-safe fonts + popular Google Fonts
const FONT_FAMILIES = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Courier New, monospace', label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
  { value: 'Comic Sans MS, cursive', label: 'Comic Sans MS' },
  { value: 'Impact, fantasy', label: 'Impact' },
  { value: 'Segoe UI, sans-serif', label: 'Segoe UI' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: 'Open Sans, sans-serif', label: 'Open Sans' },
  { value: 'Lato, sans-serif', label: 'Lato' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
  { value: 'Poppins, sans-serif', label: 'Poppins' },
]

const FONT_SIZES = [
  { value: '10px', label: '10' },
  { value: '12px', label: '12' },
  { value: '14px', label: '14' },
  { value: '16px', label: '16' },
  { value: '18px', label: '18' },
  { value: '20px', label: '20' },
  { value: '24px', label: '24' },
  { value: '28px', label: '28' },
  { value: '32px', label: '32' },
  { value: '36px', label: '36' },
]

const PRESET_COLORS = [
  '#000000', '#444444', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF',
  '#9900FF', '#FF00FF', '#8B4513', '#2F4F4F', '#008080', '#4B0082',
]

export function RichTextSignatureEditor({
  value,
  onChange,
  placeholder = "Design your signature..."
}: RichTextSignatureEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [customFont, setCustomFont] = useState('')

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    // Trigger onChange to capture the new HTML
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const handleFontFamily = useCallback((fontFamily: string) => {
    execCommand('fontName', fontFamily)
  }, [execCommand])

  const handleFontSize = useCallback((fontSize: string) => {
    // Use inline style for more precise control
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const span = document.createElement('span')
      span.style.fontSize = fontSize
      range.surroundContents(span)
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML)
      }
    }
  }, [onChange])

  const handleColor = useCallback((color: string) => {
    execCommand('foreColor', color)
  }, [execCommand])

  const handleBackgroundColor = useCallback((color: string) => {
    execCommand('backColor', color)
  }, [execCommand])

  const handleInsertLink = useCallback(() => {
    if (linkUrl) {
      execCommand('createLink', linkUrl)
      setLinkUrl('')
      setShowLinkInput(false)
    }
  }, [linkUrl, execCommand])

  const handleInsertImage = useCallback(() => {
    if (imageUrl) {
      execCommand('insertImage', imageUrl)
      setImageUrl('')
      setShowImageInput(false)
    }
  }, [imageUrl, execCommand])

  const handleAddCustomFont = useCallback(() => {
    if (customFont) {
      // Add the font to the document head
      const link = document.createElement('link')
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(customFont)}&display=swap`
      link.rel = 'stylesheet'
      document.head.appendChild(link)

      // Apply the font
      handleFontFamily(`'${customFont}', sans-serif`)
      setCustomFont('')
    }
  }, [customFont, handleFontFamily])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  return (
    <div className="border rounded-lg bg-white">
      {/* Toolbar - single row compact design */}
      <div className="flex items-center gap-0.5 p-1.5 border-b bg-muted/30 flex-wrap">
        {/* Font Family */}
        <div className="w-[150px]">
          <Combobox
            value=""
            onChange={handleFontFamily}
            options={FONT_FAMILIES}
            placeholder="Arial"
            className="h-8 text-xs border-0"
            disableSearch={false}
          />
        </div>

        {/* Font Size */}
        <div className="w-[70px]">
          <Combobox
            value=""
            onChange={handleFontSize}
            options={FONT_SIZES}
            placeholder="12px"
            className="h-8 text-xs border-0"
            disableSearch={true}
          />
        </div>

        {/* Text Formatting */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('bold')}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('italic')}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('underline')}
          title="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
        </Button>

        {/* Text Color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Text Color"
            >
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px]">
            <div className="space-y-2">
              <Label className="text-xs">Text Color</Label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => handleColor(color)}
                    title={color}
                  />
                ))}
              </div>
              <Input
                type="color"
                onChange={(e) => handleColor(e.target.value)}
                className="h-8"
              />
              <Label className="text-xs mt-2">Background Color</Label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={`bg-${color}`}
                    type="button"
                    className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => handleBackgroundColor(color)}
                    title={color}
                  />
                ))}
              </div>
              <Input
                type="color"
                onChange={(e) => handleBackgroundColor(e.target.value)}
                className="h-8"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Alignment */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('justifyLeft')}
          title="Align Left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('justifyCenter')}
          title="Align Center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('justifyRight')}
          title="Align Right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Button>

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('insertUnorderedList')}
          title="Bullet List"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand('insertOrderedList')}
          title="Numbered List"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>

        {/* Link */}
        <Popover open={showLinkInput} onOpenChange={setShowLinkInput}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Insert Link"
            >
              <Link className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <Label>Link URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleInsertLink()
                  }
                }}
              />
              <Button onClick={handleInsertLink} size="sm" className="w-full">
                Insert Link
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Image */}
        <Popover open={showImageInput} onOpenChange={setShowImageInput}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Insert Image"
            >
              <Image className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleInsertImage()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                For best results, use images up to 150px height
              </p>
              <Button onClick={handleInsertImage} size="sm" className="w-full">
                Insert Image
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Custom Font */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-1.5 text-[11px]"
              title="Add Custom Font"
            >
              Font+
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <Label>Google Font Name</Label>
              <Input
                value={customFont}
                onChange={(e) => setCustomFont(e.target.value)}
                placeholder="e.g., Playfair Display"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustomFont()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Visit <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Fonts</a> to find font names
              </p>
              <Button onClick={handleAddCustomFont} size="sm" className="w-full">
                Add Font
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          dangerouslySetInnerHTML={{ __html: value }}
          onInput={handleInput}
          className="min-h-[200px] max-h-[400px] overflow-y-auto p-3 focus:outline-none"
          style={{
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}
          suppressContentEditableWarning
        />

        {!value && (
          <div className="absolute top-3 left-3 pointer-events-none text-muted-foreground text-sm">
            {placeholder}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
        <span>Rich text editor</span>
        <span>{value.replace(/<[^>]*>/g, '').length} characters</span>
      </div>
    </div>
  )
}
