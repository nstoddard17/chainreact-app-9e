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
import { Play, Pause, Settings, Trash2, Loader2, Sparkles, LayoutTemplateIcon as Template } from "lucide-react"
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
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
        <AIChatAssistant />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Workflows</h1>
          <div className="flex gap-2">
            <CreateWorkflowDialog />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="workflows">My Workflows</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="space-y-6">
            {/* AI Generation Section */}
            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  Generate Workflow with AI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Describe your workflow... e.g., 'Send Slack notifications when new emails arrive from important clients'"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button
                    onClick={handleGenerateWithAI}
                    disabled={!aiPrompt.trim() || generatingAI}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
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
              <div className="text-center py-12">
                <div className="text-slate-500 mb-4">No workflows yet</div>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <CreateWorkflowDialog />
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("templates")}
                    className="flex items-center gap-2"
                  >
                    <Template className="w-4 h-4" />
                    Browse Templates
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workflows.map((workflow) => (
                  <Card
                    key={workflow.id}
                    className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold text-slate-900">{workflow.name}</CardTitle>
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                      <p className="text-sm text-slate-600">{workflow.description || "No description"}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>{workflow.nodes?.length || 0} nodes</span>
                        <span>Updated: {new Date(workflow.updated_at).toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white text-black border border-slate-200 hover:bg-slate-100 active:bg-slate-200"
                          onClick={() => handleToggleStatus(workflow.id, workflow.status)}
                        >
                          {workflow.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Link href={`/workflows/builder?id=${workflow.id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-white text-black border border-slate-200 hover:bg-slate-100 active:bg-slate-200"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-white text-blue-600 border border-slate-200 hover:bg-slate-100 active:bg-slate-200"
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
                          className="bg-white text-red-600 border border-slate-200 hover:bg-slate-100 hover:text-red-700 active:bg-slate-200"
                          onClick={() => handleDeleteWorkflow(workflow.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
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

      {/* Template Creation Dialog */}
      <Dialog open={templateDialog.open} onOpenChange={(open) => setTemplateDialog({ open, workflowId: null })}>
        <DialogContent>
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
              />
            </div>
            <div>
              <Label htmlFor="template-category">Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) => setTemplateForm((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setTemplateDialog({ open: false, workflowId: null })}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={!templateForm.name || !templateForm.category}
                className="flex-1"
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
