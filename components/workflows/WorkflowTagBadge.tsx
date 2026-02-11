"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tag,
  Plus,
  X,
  Check,
  Palette,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useWorkflowTags,
  TAG_COLORS,
  TagColorName,
} from "@/hooks/useWorkflowTags"

interface WorkflowTagBadgeProps {
  workflowId: string
  compact?: boolean
  editable?: boolean
  className?: string
}

/**
 * Component to display and manage tags for a workflow
 */
export function WorkflowTagBadge({
  workflowId,
  compact = false,
  editable = true,
  className,
}: WorkflowTagBadgeProps) {
  const {
    allTags,
    getWorkflowTags,
    getTagColor,
    addTag,
    removeTag,
    createTag,
    setTagColor,
  } = useWorkflowTags()

  const [isOpen, setIsOpen] = useState(false)
  const [newTagName, setNewTagName] = useState("")

  const tags = getWorkflowTags(workflowId)

  const handleAddTag = async (tag: string) => {
    await addTag(workflowId, tag)
  }

  const handleRemoveTag = async (tag: string) => {
    await removeTag(workflowId, tag)
  }

  const handleCreateNewTag = async () => {
    if (!newTagName.trim()) return
    await createTag(newTagName.trim())
    await addTag(workflowId, newTagName.trim())
    setNewTagName("")
  }

  // Available tags (not yet added to this workflow)
  const availableTags = allTags.filter((t) => !tags.includes(t))

  if (!editable && tags.length === 0) {
    return null
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {/* Display existing tags */}
      {tags.map((tag) => {
        const color = getTagColor(tag)
        const colorClasses = TAG_COLORS[color]

        return (
          <Badge
            key={tag}
            variant="outline"
            className={cn(
              "flex items-center gap-1 transition-colors",
              colorClasses.bg,
              colorClasses.text,
              colorClasses.border,
              compact && "text-xs px-1.5 py-0"
            )}
          >
            <Tag className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
            {tag}
            {editable && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveTag(tag)
                }}
                className="ml-0.5 hover:opacity-70 transition-opacity"
              >
                <X className={cn(compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
              </button>
            )}
          </Badge>
        )
      })}

      {/* Add tag button */}
      {editable && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-6 px-2 text-xs text-muted-foreground hover:text-foreground",
                compact && "h-5 px-1.5"
              )}
            >
              <Plus className={cn(compact ? "w-3 h-3" : "w-3.5 h-3.5", "mr-1")} />
              {!compact && "Add Tag"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search or create tag..." />
              <CommandList>
                <CommandEmpty>
                  <div className="p-2">
                    <p className="text-sm text-muted-foreground mb-2">
                      No tags found
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="New tag name"
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleCreateNewTag()
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={handleCreateNewTag}
                        disabled={!newTagName.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CommandEmpty>

                {availableTags.length > 0 && (
                  <CommandGroup heading="Available Tags">
                    {availableTags.map((tag) => {
                      const color = getTagColor(tag)
                      const colorClasses = TAG_COLORS[color]

                      return (
                        <CommandItem
                          key={tag}
                          onSelect={() => {
                            handleAddTag(tag)
                            setIsOpen(false)
                          }}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "w-3 h-3 rounded-full",
                                colorClasses.bg
                              )}
                            />
                            <span>{tag}</span>
                          </div>
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )}

                <CommandSeparator />

                <CommandGroup heading="Create New">
                  <div className="p-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="New tag name"
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleCreateNewTag()
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={handleCreateNewTag}
                        disabled={!newTagName.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/**
 * Tag Manager Component - For managing all tags
 */
interface TagManagerProps {
  className?: string
}

export function TagManager({ className }: TagManagerProps) {
  const { allTags, getTagColor, setTagColor, deleteTag } = useWorkflowTags()
  const [editingTag, setEditingTag] = useState<string | null>(null)

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Manage Tags</h3>
        <span className="text-xs text-muted-foreground">
          {allTags.length} tag{allTags.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {allTags.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No tags yet. Add tags to workflows to see them here.
          </p>
        ) : (
          allTags.map((tag) => {
            const color = getTagColor(tag)
            const colorClasses = TAG_COLORS[color]

            return (
              <div
                key={tag}
                className="flex items-center justify-between p-2 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "flex items-center gap-1",
                      colorClasses.bg,
                      colorClasses.text,
                      colorClasses.border
                    )}
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </Badge>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => setEditingTag(tag)}
                    >
                      <Palette className="w-4 h-4 mr-2" />
                      Change Color
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => deleteTag(tag)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Tag
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })
        )}
      </div>

      {/* Color picker dialog */}
      {editingTag && (
        <Popover open={!!editingTag} onOpenChange={() => setEditingTag(null)}>
          <PopoverContent className="w-64" align="center">
            <div className="space-y-3">
              <div className="font-medium text-sm">
                Choose color for "{editingTag}"
              </div>
              <div className="grid grid-cols-6 gap-2">
                {(Object.keys(TAG_COLORS) as TagColorName[]).map((colorName) => {
                  const colorClasses = TAG_COLORS[colorName]
                  const isSelected = getTagColor(editingTag) === colorName

                  return (
                    <button
                      key={colorName}
                      onClick={() => {
                        setTagColor(editingTag, colorName)
                        setEditingTag(null)
                      }}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        colorClasses.bg,
                        "border-2",
                        isSelected
                          ? "border-foreground"
                          : "border-transparent hover:border-muted-foreground/50"
                      )}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/**
 * Tag Filter Component - For filtering workflows by tag
 */
interface TagFilterProps {
  selectedTags: string[]
  onTagsChange: (tags: string[]) => void
  className?: string
}

export function TagFilter({
  selectedTags,
  onTagsChange,
  className,
}: TagFilterProps) {
  const { allTags, getTagColor } = useWorkflowTags()

  if (allTags.length === 0) {
    return null
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <span className="text-xs text-muted-foreground mr-1">Tags:</span>
      {allTags.map((tag) => {
        const color = getTagColor(tag)
        const colorClasses = TAG_COLORS[color]
        const isSelected = selectedTags.includes(tag)

        return (
          <Badge
            key={tag}
            variant="outline"
            className={cn(
              "cursor-pointer transition-all",
              isSelected
                ? cn(colorClasses.bg, colorClasses.text, colorClasses.border)
                : "bg-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => {
              if (isSelected) {
                onTagsChange(selectedTags.filter((t) => t !== tag))
              } else {
                onTagsChange([...selectedTags, tag])
              }
            }}
          >
            <Tag className="w-3 h-3 mr-1" />
            {tag}
            {isSelected && <Check className="w-3 h-3 ml-1" />}
          </Badge>
        )
      })}

      {selectedTags.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onTagsChange([])}
        >
          Clear
        </Button>
      )}
    </div>
  )
}
