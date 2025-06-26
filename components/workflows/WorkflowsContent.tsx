"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/layout/AppLayout"
import { useWorkflowStore } from "@/stores/workflowStore"
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

export default function WorkflowsContent() {
  const {
    workflows,
    loading,
    fetchWorkflows,
    updateWorkflow,
    deleteWorkflow,
    generateWorkflowWithAI,
    createTemplateFromWorkflow,
  } = useWorkflowStore()
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
    fetchWorkflows()
  }, [fetchWorkflows])

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active"
    try {
      await updateWorkflow(id, { status: newStatus })
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
        await deleteWorkflow(id)
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
      const workflow = await generateWorkflowWithAI(aiPrompt)
      setAiPrompt("")
      toast({
        title: "Success",
        description: "AI workflow generated successfully!",
      })
      // Navigate to the new workflow
      window.location.href = `/workflows/builder?id=${workflow.id}`
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
      await createTemplateFromWorkflow(templateDialog.workflowId, {
        ...templateForm,
        tags: templateForm.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      setTemplateDialog({ open: false, workflowId: null })
      setTemplateForm({
        name: "",
        description: "",
        category: "",
        tags: "",
        is_public: false,
      })

      toast({
        title: "Success",
        description: "Template created successfully!",
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

  return (
    <AppLayout title="Workflows">
      <div className="space-y-8 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Workflows</h1>
          <div className="flex gap-3">
            <CreateWorkflowDialog />
          </div>
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
            {/* AI Generation Section */}
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

            {/* Workflows Grid */}
            {workflows.length === 0 ? (
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {workflows.map((workflow) => {
                  const functionalNodes = workflow.nodes?.filter(n => n.type !== 'addAction') || [];
                  
                  return (
                    <Card
                      key={workflow.id}
                      className="bg-card rounded-xl shadow-sm border border-border hover:shadow-lg hover:border-muted-foreground transition-all duration-300 transform hover:-translate-y-1 group"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors duration-200 line-clamp-1">
                            {workflow.name}
                          </CardTitle>
                          <div
                            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${
                              workflow.status === "active"
                                ? "bg-green-100 text-green-700"
                                : workflow.status === "paused"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {workflow.status}
                          </div>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2 min-h-[2.5rem]">
                          {workflow.description || "No description"}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center text-sm text-slate-500 bg-slate-50 p-2 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${functionalNodes.length > 0 ? 'bg-primary' : 'bg-muted-foreground'}`}></div>
                            <span>{functionalNodes.length} nodes</span>
                          </div>
                          <div className="flex-1 text-right">
                            Updated: {new Date(workflow.updated_at).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 hover:bg-slate-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-all duration-200"
                            onClick={() => handleToggleStatus(workflow.id, workflow.status)}
                          >
                            {workflow.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </Button>
                          <Link href={`/workflows/builder?id=${workflow.id}`} className="flex-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full hover:bg-slate-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-all duration-200"
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 hover:bg-primary/5 hover:text-primary hover:border-primary/20 focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-all duration-200"
                            onClick={() => {
                              setTemplateDialog({ open: true, workflowId: workflow.id })
                              setTemplateForm((prev) => ({ ...prev, name: `${workflow.name} Template` }))
                            }}
                          >
                            <Template className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 hover:bg-red-50 hover:text-red-600 hover:border-red-200 focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-all duration-200"
                            onClick={() => handleDeleteWorkflow(workflow.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates">
            <TemplateGallery />
          </TabsContent>
        </Tabs>
      </div>

      {/* Template Creation Dialog */}
      <Dialog open={templateDialog.open} onOpenChange={(open) => setTemplateDialog({ open, workflowId: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>Share your workflow as a template for others to use</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Template name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateForm.description}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this template does"
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="template-category">Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) => setTemplateForm((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="CRM">CRM</SelectItem>
                  <SelectItem value="DevOps">DevOps</SelectItem>
                  <SelectItem value="Communication">Communication</SelectItem>
                  <SelectItem value="Data Processing">Data Processing</SelectItem>
                  <SelectItem value="E-commerce">E-commerce</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="template-tags">Tags (comma-separated)</Label>
              <Input
                id="template-tags"
                value={templateForm.tags}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, tags: e.target.value }))}
                placeholder="automation, slack, email"
                className="mt-1"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="template-public"
                checked={templateForm.is_public}
                onCheckedChange={(checked) => setTemplateForm((prev) => ({ ...prev, is_public: checked }))}
              />
              <Label htmlFor="template-public">Make public (visible to all users)</Label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setTemplateDialog({ open: false, workflowId: null })}
                className="flex-1 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={!templateForm.name || !templateForm.category}
                className="flex-1 hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
              >
                Create Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AIChatAssistant />
    </AppLayout>
  )
}
