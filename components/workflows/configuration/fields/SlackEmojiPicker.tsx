"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { Smile, Search, RefreshCw, AlertTriangle } from "lucide-react"

interface SlackEmojiOption {
  value: string
  label: string
  name: string
  url?: string
  isCustom?: boolean
  isAlias?: boolean
  native?: string
}

interface SlackEmojiPickerProps {
  value?: string
  onChange: (emoji: string | undefined) => void
  options?: SlackEmojiOption[]
  loading?: boolean
  onRefresh?: () => void
  error?: string
}

const DEFAULT_CATEGORIES = [
  { key: "standard", label: "Standard" },
  { key: "custom", label: "Custom" },
]

const renderEmojiContent = (option: SlackEmojiOption) => {
  if (option.isCustom && option.url) {
    return <img src={option.url} alt={option.name} className="h-6 w-6" />
  }

  if (option.url && option.url.startsWith("http")) {
    return <img src={option.url} alt={option.name} className="h-6 w-6" />
  }

  if (option.native) {
    return <span className="text-xl">{option.native}</span>
  }

  return <span className="text-xl">{option.url || `:${option.name}:`}</span>
}

export function SlackEmojiPicker({ value, onChange, options = [], loading, onRefresh, error }: SlackEmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("standard")
  const [contentWidth, setContentWidth] = useState<number | undefined>()
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const updateWidth = () => {
    if (triggerRef.current) {
      setContentWidth(triggerRef.current.offsetWidth)
    }
  }

  useEffect(() => {
    updateWidth()
  }, [open, options.length])

  useEffect(() => {
    window.addEventListener("resize", updateWidth)
    return () => window.removeEventListener("resize", updateWidth)
  }, [])

  const categorizedOptions = useMemo(() => {
    if (!options.length) {
      return { standard: [], custom: [] }
    }

    const filterBySearch = (items: SlackEmojiOption[]) => {
      if (!search) return items
      const lower = search.toLowerCase()
      return items.filter(option =>
        option.name.toLowerCase().includes(lower) ||
        option.label.toLowerCase().includes(lower)
      )
    }

    const standard = filterBySearch(options.filter(option => !option.isCustom))
    const custom = filterBySearch(options.filter(option => option.isCustom))

    return { standard, custom }
  }, [options, search])

  const groupedOptions = useMemo(() => ({
    standard: categorizedOptions.standard,
    custom: categorizedOptions.custom,
  }), [categorizedOptions])

  const activeOptions = category === "custom" ? groupedOptions.custom : groupedOptions.standard

  const selectedOption = options.find(option => option.value === value)

  const handleSelect = (option: SlackEmojiOption) => {
    onChange(option.value)
    setOpen(false)
  }

  const renderEmojiButton = (option: SlackEmojiOption) => (
    <button
      key={option.value}
      type="button"
      onClick={() => handleSelect(option)}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md border transition-all",
        value === option.value
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:bg-muted"
      )}
      title={option.label}
      aria-label={option.name}
    >
      {renderEmojiContent(option)}
    </button>
  )

  if (!options.length) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button ref={triggerRef} variant="outline" className="w-full justify-between" type="button">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Smile className="h-4 w-4" />
              <span className="truncate text-sm">No emojis available</span>
            </span>
            <span className="text-xs text-muted-foreground">Open</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-4" align="start" style={{ width: contentWidth }}>
          <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <Smile className="h-6 w-6" />
            <div>No emojis available for this workspace yet.</div>
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} variant="outline" className="w-full justify-between" type="button">
          <span className="flex items-center gap-2">
            {selectedOption ? renderEmojiContent(selectedOption) : <Smile className="h-4 w-4" />}
            <span className="truncate text-sm">
              {selectedOption ? selectedOption.label : "Choose an emoji"}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">{open ? "Close" : "Open"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" style={{ width: contentWidth }}>
        <div className="border-b p-3 space-y-2">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 text-sm"
              placeholder="Search emojis"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
        </div>

        <Tabs value={category} onValueChange={setCategory}>
          <TabsList className="grid w-full grid-cols-2">
            {DEFAULT_CATEGORIES.map(cat => (
              <TabsTrigger value={cat.key} key={cat.key}>
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent className="max-h-[320px]" value="standard">
            <div className="max-h-[320px] overflow-y-auto">
              <div className="grid grid-cols-6 gap-2 p-3">
                {loading ? (
                  <div className="col-span-6 text-center text-xs text-muted-foreground">
                    Loading emojis…
                  </div>
                ) : activeOptions.length ? (
                  activeOptions.map(renderEmojiButton)
                ) : (
                  <div className="col-span-6 text-center text-xs text-muted-foreground">
                    No emojis found
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent className="max-h-[320px]" value="custom">
            <div className="max-h-[320px] overflow-y-auto">
              <div className="grid grid-cols-6 gap-2 p-3">
                {loading ? (
                  <div className="col-span-6 text-center text-xs text-muted-foreground">
                    Loading emojis…
                  </div>
                ) : groupedOptions.custom.length ? (
                  groupedOptions.custom.map(renderEmojiButton)
                ) : (
                  <div className="col-span-6 text-center text-xs text-muted-foreground">
                    No custom emojis found
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between border-t p-3">
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Clear selection
          </Button>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
