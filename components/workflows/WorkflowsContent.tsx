"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/layout/AppLayout"
import { AIChatAssistant } from "@/components/ai/AIChatAssistant"
import { TemplateGallery } from "@/components/templates/TemplateGallery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Play, Pause, Settings, Trash2, Loader2, Sparkles, LayoutTemplateIcon as Template, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import CreateWorkflowDialog from "./CreateWorkflowDialog"
import { useWorkflows } from "@/hooks/use-workflows"
import { Workflow } from "@/stores/cachedWorkflowStore"

export default function WorkflowsContent() {
  const {
    workflows,
    loading,
    error,
    loadAllWorkflows,
    updateWorkflowById,
    deleteWorkflowById,
  } = useWorkflows()
  
  const [activeTab, setActiveTab] = useState("workflows")
  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAI, setGeneratingAI] = useState(false)
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; workflowId: string | null }>({
    open: false,
    workflowId: null,
  })
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    category: "",
    tags: "",
    is_public: false,
  })
  const { toast } = useToast()

  useEffect(() => {
    const loadData = async () => {
      try {
        await loadAllWorkflows()
      } catch (err) {
        console.error("Failed to load workflows:", err)
      }
    }
    
    if (!workflows && !loading) {
      loadData()
    }
  }, [workflows, loading, loadAllWorkflows])

  const handleToggleStatus = async (id: string, currentStatus?: string) => {
    const status = currentStatus || "draft"
    const newStatus = status === "active" ? "paused" : "active"
    
    try {
      await updateWorkflowById(id, { status: newStatus })
      toast({
        title: "Success",
        description: `Workflow ${newStatus === "active" ? "activated" : "paused"}`,
      })
    } catch (error) {
      console.error("Failed to update workflow status:", error)
      toast({
        title: "Error",
        description: "Failed to update workflow status",
        variant: "destructive",
      })
    }
  }

  const handleDeleteWorkflow = async (id: string) => {
    if (confirm("Are you sure you want to delete this workflow?")) {
      try {
        await deleteWorkflowById(id)
        toast({
          title: "Success",
          description: "Workflow deleted successfully",
        })
      } catch (error) {
        console.error("Failed to delete workflow:", error)
        toast({
          title: "Error",
          description: "Failed to delete workflow",
          variant: "destructive",
        })
      }
    }
  }

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) return

    setGeneratingAI(true)
    try {
      toast({
        title: "Not implemented",
        description: "AI workflow generation is not implemented in the cached version yet",
      })
    } catch (error) {
      console.error("Failed to generate workflow:", error)
      toast({
        title: "Error",
        description: "Failed to generate workflow with AI",
        variant: "destructive",
      })
    } finally {
      setGeneratingAI(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!templateDialog.workflowId) return

    try {
      setTemplateDialog({ open: false, workflowId: null })
      setTemplateForm({
        name: "",
        description: "",
        category: "",
        tags: "",
        is_public: false,
      })

      toast({
        title: "Not implemented",
        description: "Template creation is not implemented in the cached version yet",
      })
    } catch (error) {
      console.error("Failed to create template:", error)
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <AppLayout title="Workflows">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <AIChatAssistant />
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="Workflows">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-red-500 mb-4">Error loading workflows: {error}</div>
          <Button onClick={() => loadAllWorkflows(true)}>Retry</Button>
        </div>
        <AIChatAssistant />
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Workflows">
      <div className="space-y-8 p-6">
        <div className="flex justify-end">
          <CreateWorkflowDialog />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-lg">
            <TabsTrigger
              value="workflows"
              className="transition-all duration-200 hover:bg-card hover:shadow-sm focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              My Workflows
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="transition-all duration-200 hover:bg-card hover:shadow-sm focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="space-y-8">
            <Card className="bg-gradient-to-br from-muted/30 via-muted/20 to-muted/10 border-border shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  Generate Workflow with AI
                </CardTitle>
                <p className="text-slate-600 text-sm">
                  Describe what you want your workflow to do, and AI will create it for you.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Describe your workflow... e.g., 'Send Slack notifications when new emails arrive from important clients'"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={3}
                      className="resize-none border-border focus:border-primary focus:ring-primary transition-all duration-200"
                    />
                  </div>
                  <Button
                    onClick={handleGenerateWithAI}
                    disabled={!aiPrompt.trim() || generatingAI}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:shadow-lg hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 px-6"
                  >
                    {generatingAI ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {!workflows || workflows.length === 0 ? (
              <div className="text-center py-16">
                <div className="max-w-md mx-auto space-y-6">
                  <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                    <Plus className="w-8 h-8 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No workflows yet</h3>
                    <p className="text-slate-500 text-sm">
                      Create your first workflow to automate your tasks and processes.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <CreateWorkflowDialog />
                    <Button
                      variant="outline"
                      onClick={() => setActiveTab("templates")}
                      className="flex items-center gap-2 hover:bg-slate-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
                    >
                      <Template className="w-4 h-4" />
                      Browse Templates
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workflows.map((workflow) => (
                  <Card key={workflow.id} className="overflow-hidden border-border hover:border-primary/40 hover:shadow-md transition-all duration-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="font-semibold text-lg">{workflow.name}</CardTitle>
                      {workflow.description && (
                        <p className="text-sm text-slate-500 line-clamp-2">{workflow.description}</p>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0 pb-4">
                      <div className="flex flex-wrap gap-2 text-xs mb-3">
                        <div
                          className={`px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            workflow.status === "active"
                              ? "bg-green-100 text-green-800"
                              : workflow.status === "paused"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {workflow.status === "active" ? (
                            <>
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Active
                            </>
                          ) : workflow.status === "paused" ? (
                            <>
                              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                              Paused
                            </>
                          ) : (
                            <>
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              Draft
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-slate-500">
                          {workflow.updated_at ? `Updated ${new Date(workflow.updated_at).toLocaleDateString()}` : 'Not yet updated'}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {workflow.status === "active" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.preventDefault()
                                handleToggleStatus(workflow.id, workflow.status)
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Pause className="h-4 w-4 text-slate-500" />
                              <span className="sr-only">Pause</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.preventDefault()
                                handleToggleStatus(workflow.id, workflow.status)
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Play className="h-4 w-4 text-slate-500" />
                              <span className="sr-only">Activate</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.preventDefault()
                              handleDeleteWorkflow(workflow.id)
                            }}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                    <Link
                      href={`/workflows/builder?id=${workflow.id}`}
                      className="block w-full bg-slate-50 hover:bg-slate-100 p-2 text-center text-sm font-medium border-t border-border transition-colors duration-200"
                    >
                      Edit Workflow
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates">
            <TemplateGallery />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={templateDialog.open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setTemplateDialog({ open: false, workflowId: null })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Share your workflow as a template for other users. Templates can be public or private to your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                placeholder="Enter template name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this template does"
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="productivity">Productivity</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="data">Data Management</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                placeholder="e.g. email, automation, slack"
                value={templateForm.tags}
                onChange={(e) => setTemplateForm({ ...templateForm, tags: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_public"
                checked={templateForm.is_public}
                onCheckedChange={(checked) => setTemplateForm({ ...templateForm, is_public: checked })}
              />
              <Label htmlFor="is_public">Make this template public</Label>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setTemplateDialog({ open: false, workflowId: null })}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={!templateForm.name}>
              Create Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AIChatAssistant />
    </AppLayout>
  )
}
