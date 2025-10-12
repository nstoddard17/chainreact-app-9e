"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { Key, Plus, Trash2, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

import { logger } from '@/lib/utils/logger'

interface APIKey {
  id: string
  name: string
  key_preview: string // Last 4 characters
  created_at: string
}

export default function AIAPISettings() {
  const { profile } = useAuthStore()
  const { toast } = useToast()

  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [defaultModel, setDefaultModel] = useState("gpt-4o-mini")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Add new key dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyValue, setNewKeyValue] = useState("")
  const [showNewKey, setShowNewKey] = useState(false)
  const [addingKey, setAddingKey] = useState(false)

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // OpenAI model options
  const modelOptions = [
    { value: "gpt-4o", label: "GPT-4o (Most Capable)", badges: ["Latest", "128k Context"] },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Balanced)", badges: ["Recommended", "Cost-Efficient"] },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo", badges: ["Fast", "128k Context"] },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Budget)", badges: ["Ultra-Fast", "Lowest Cost"] },
  ]

  // Load API keys and default model
  useEffect(() => {
    loadAPIKeys()
  }, [])

  async function loadAPIKeys() {
    try {
      setLoading(true)
      const response = await fetch("/api/user/ai-api-keys")
      if (response.ok) {
        const data = await response.json()
        setApiKeys(data.keys || [])
        setDefaultModel(data.defaultModel || "gpt-4o-mini")
      }
    } catch (error) {
      logger.error("Failed to load API keys:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddKey() {
    if (!newKeyName.trim() || !newKeyValue.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a name and API key.",
        variant: "destructive",
      })
      return
    }

    // Basic validation for OpenAI key format
    if (!newKeyValue.startsWith("sk-")) {
      toast({
        title: "Invalid API Key",
        description: "OpenAI API keys should start with 'sk-'",
        variant: "destructive",
      })
      return
    }

    try {
      setAddingKey(true)
      const response = await fetch("/api/user/ai-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          key: newKeyValue.trim(),
        }),
      })

      if (response.ok) {
        toast({
          title: "✅ API Key Added",
          description: "Your OpenAI API key has been saved securely.",
        })

        // Reset form and reload keys
        setNewKeyName("")
        setNewKeyValue("")
        setShowAddDialog(false)
        loadAPIKeys()
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to add API key")
      }
    } catch (error: any) {
      toast({
        title: "Failed to Add Key",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setAddingKey(false)
    }
  }

  async function handleDeleteKey(keyId: string) {
    try {
      setDeleting(true)
      const response = await fetch(`/api/user/ai-api-keys?keyId=${keyId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "API Key Deleted",
          description: "The API key has been removed.",
        })
        setDeleteConfirmId(null)
        loadAPIKeys()
      } else {
        throw new Error("Failed to delete API key")
      }
    } catch (error: any) {
      toast({
        title: "Failed to Delete Key",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveDefaultModel() {
    try {
      setSaving(true)
      const response = await fetch("/api/user/ai-api-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultModel }),
      })

      if (response.ok) {
        toast({
          title: "✅ Default Model Updated",
          description: `Default model set to ${modelOptions.find(m => m.value === defaultModel)?.label}`,
        })
      } else {
        throw new Error("Failed to update default model")
      }
    } catch (error: any) {
      toast({
        title: "Failed to Update",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            AI API Configuration
          </CardTitle>
          <CardDescription>
            Loading your API settings...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            AI API Configuration
          </CardTitle>
          <CardDescription>
            Optional: Add your own OpenAI API keys to bypass platform usage limits. By default, AI Agents use our platform API key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Model Selection */}
          <div className="space-y-3">
            <Label>Default OpenAI Model</Label>
            <div className="flex gap-2">
              <Select value={defaultModel} onValueChange={setDefaultModel}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select default model" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      <div className="flex items-center gap-2">
                        <span>{model.label}</span>
                        {model.badges.map((badge) => (
                          <Badge key={badge} variant="secondary" className="text-xs">
                            {badge}
                          </Badge>
                        ))}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSaveDefaultModel}
                disabled={saving}
                size="default"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              This model will be pre-selected when creating new AI Agent nodes.
            </p>
          </div>

          <Separator />

          {/* API Keys Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Your OpenAI API Keys</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Optional: Add your keys to bypass platform limits and use your own OpenAI account.
                </p>
              </div>
              <Button onClick={() => setShowAddDialog(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Key
              </Button>
            </div>

            {/* API Keys List */}
            {apiKeys.length === 0 ? (
              <div className="border border-dashed rounded-lg p-8 text-center">
                <Key className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">Using Platform API Key</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  AI Agents currently use our platform OpenAI key. Add your own key if you want to bypass usage limits and use your own OpenAI account.
                </p>
                <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your Own API Key
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{key.name}</div>
                        <div className="text-sm text-muted-foreground">
                          ••••{key.key_preview} • Added {new Date(key.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(key.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-blue-500">How to get your OpenAI API Key:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Visit <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com/api-keys</a></li>
                  <li>Click "Create new secret key"</li>
                  <li>Copy the key and paste it here</li>
                </ol>
                <p className="text-muted-foreground pt-2">
                  Your API keys are encrypted and never shared. When using your own key, OpenAI will charge your account directly based on usage.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Key Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add OpenAI API Key</DialogTitle>
            <DialogDescription>
              Enter your OpenAI API key. It will be encrypted and stored securely.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., Personal API Key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                A friendly name to identify this key
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showNewKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowNewKey(!showNewKey)}
                >
                  {showNewKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Your OpenAI API key (starts with sk-)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddKey} disabled={addingKey}>
              {addingKey ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Key"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key? This action cannot be undone.
              Workflows using this key will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDeleteKey(deleteConfirmId)}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Key"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}