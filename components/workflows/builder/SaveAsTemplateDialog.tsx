"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, FileText, Globe, Lock, Users, Building } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { usePlanRestrictions } from "@/hooks/use-plan-restrictions"
import { Badge } from "@/components/ui/badge"

interface SaveAsTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflow: {
    id?: string
    name: string
    description?: string
    nodes: any[]
    connections?: any[]
  } | null
}

const TEMPLATE_CATEGORIES = [
  { value: "marketing", label: "Marketing & Sales" },
  { value: "productivity", label: "Productivity" },
  { value: "communication", label: "Communication" },
  { value: "data", label: "Data & Analytics" },
  { value: "hr", label: "HR & Operations" },
  { value: "development", label: "Development" },
  { value: "finance", label: "Finance" },
  { value: "customer-support", label: "Customer Support" },
  { value: "other", label: "Other" },
]

type VisibilityType = "private" | "team" | "organization" | "public"

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  workflow,
}: SaveAsTemplateDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useAuthStore()
  const { checkFeatureAccess } = usePlanRestrictions()

  const [isSaving, setIsSaving] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [category, setCategory] = useState("other")
  const [visibility, setVisibility] = useState<VisibilityType>("private")
  const [tags, setTags] = useState("")

  // Check if user has team sharing access
  const teamSharingAccess = checkFeatureAccess("teamSharing")
  const canShareWithTeam = teamSharingAccess.allowed

  // Reset form when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && workflow) {
      setTemplateName(workflow.name ? `${workflow.name} Template` : "")
      setTemplateDescription(workflow.description || "")
      setCategory("other")
      setVisibility("private")
      setTags("")
    }
    onOpenChange(isOpen)
  }

  const handleSaveAsTemplate = async () => {
    if (!workflow) return

    if (!templateName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your template.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)

    try {
      // Filter out placeholder nodes
      const filteredNodes = workflow.nodes.filter((node: any) => {
        const nodeType = node.data?.type || node.type
        return (
          nodeType !== "addAction" &&
          nodeType !== "insertAction" &&
          nodeType !== "chain_placeholder" &&
          !node.data?.hasAddButton &&
          !node.data?.isPlaceholder
        )
      })

      // Extract integration requirements from nodes
      const integrations: string[] = []
      filteredNodes.forEach((node: any) => {
        const providerId = node.data?.providerId
        if (providerId && !integrations.includes(providerId)) {
          integrations.push(providerId)
        }
      })

      // Build template payload
      const templatePayload = {
        name: templateName.trim(),
        description: templateDescription.trim(),
        workflow_json: {
          nodes: filteredNodes,
          connections: workflow.connections || [],
        },
        category,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        is_public: visibility === "public",
        status: "published",
        integration_setup: integrations.length > 0 ? { required: integrations } : null,
      }

      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templatePayload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create template")
      }

      const { template } = await response.json()

      toast({
        title: "Template created!",
        description: `"${templateName}" has been saved as a template.`,
      })

      onOpenChange(false)

      // Optionally navigate to templates page
      // router.push("/templates")
    } catch (error: any) {
      console.error("Error saving template:", error)
      toast({
        title: "Failed to save template",
        description: error.message || "An error occurred while saving the template.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Save as Template
          </DialogTitle>
          <DialogDescription>
            Convert this workflow into a reusable template that you can use again or share with others.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Email to Slack Notification"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Describe what this template does..."
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="template-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="template-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="template-tags">Tags</Label>
            <Input
              id="template-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., email, slack, notifications (comma-separated)"
            />
            <p className="text-xs text-muted-foreground">
              Separate multiple tags with commas
            </p>
          </div>

          {/* Visibility */}
          <div className="space-y-3">
            <Label>Visibility</Label>
            <RadioGroup
              value={visibility}
              onValueChange={(v) => setVisibility(v as VisibilityType)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="private" id="visibility-private" />
                <Label
                  htmlFor="visibility-private"
                  className="flex-1 cursor-pointer flex items-center gap-2"
                >
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Private</div>
                    <div className="text-xs text-muted-foreground">
                      Only you can see and use this template
                    </div>
                  </div>
                </Label>
              </div>

              <div
                className={`flex items-center space-x-3 rounded-md border p-3 transition-colors ${
                  canShareWithTeam
                    ? "hover:bg-accent/50"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <RadioGroupItem
                  value="team"
                  id="visibility-team"
                  disabled={!canShareWithTeam}
                />
                <Label
                  htmlFor="visibility-team"
                  className={`flex-1 flex items-center gap-2 ${
                    canShareWithTeam ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
                >
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Team
                      {!canShareWithTeam && (
                        <Badge variant="outline" className="text-xs">
                          Team Plan
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Share with your team members
                    </div>
                  </div>
                </Label>
              </div>

              <div
                className={`flex items-center space-x-3 rounded-md border p-3 transition-colors ${
                  canShareWithTeam
                    ? "hover:bg-accent/50"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <RadioGroupItem
                  value="organization"
                  id="visibility-org"
                  disabled={!canShareWithTeam}
                />
                <Label
                  htmlFor="visibility-org"
                  className={`flex-1 flex items-center gap-2 ${
                    canShareWithTeam ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
                >
                  <Building className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Organization
                      {!canShareWithTeam && (
                        <Badge variant="outline" className="text-xs">
                          Team Plan
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Share with your entire organization
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-accent/50 transition-colors border-dashed">
                <RadioGroupItem value="public" id="visibility-public" />
                <Label
                  htmlFor="visibility-public"
                  className="flex-1 cursor-pointer flex items-center gap-2"
                >
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Public (Coming Soon)</div>
                    <div className="text-xs text-muted-foreground">
                      Submit to the public template gallery for review
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveAsTemplate} disabled={isSaving || !templateName.trim()}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Save Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
