"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Key,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Shield,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { EnhancedEmptyState } from "@/components/common/EnhancedEmptyState"

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
  expires_at: string | null
  scopes: string[]
  is_active: boolean
}

interface CreateApiKeyResponse {
  id: string
  name: string
  key: string // Full key, only shown once
  key_prefix: string
  created_at: string
  expires_at: string | null
  scopes: string[]
}

/**
 * API Keys management section for settings page
 * Allows users to create, view, and revoke personal access tokens
 */
export function ApiKeysSection() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyResult, setNewKeyResult] = useState<CreateApiKeyResponse | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)
  const { toast } = useToast()

  // Fetch API keys on mount
  useEffect(() => {
    fetchApiKeys()
  }, [])

  const fetchApiKeys = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/api-keys")
      if (response.ok) {
        const data = await response.json()
        setApiKeys(data.keys || [])
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load API keys",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for your API key",
        variant: "destructive",
      })
      return
    }

    try {
      setCreating(true)
      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        setNewKeyResult(data.key)
        setNewKeyName("")
        fetchApiKeys()
      } else {
        const error = await response.json()
        throw new Error(error.message || "Failed to create API key")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create API key",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteKey = async () => {
    if (!keyToDelete) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/settings/api-keys/${keyToDelete.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "API Key Revoked",
          description: `"${keyToDelete.name}" has been revoked and can no longer be used.`,
        })
        fetchApiKeys()
      } else {
        throw new Error("Failed to revoke API key")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke API key",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
      setKeyToDelete(null)
    }
  }

  const copyToClipboard = async (text: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKeyId(keyId)
      setTimeout(() => setCopiedKeyId(null), 2000)
      toast({
        title: "Copied!",
        description: "API key copied to clipboard",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      })
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return "Never"
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true })
    } catch {
      return "Unknown"
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Create and manage personal access tokens for API authentication
            </CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : apiKeys.length === 0 ? (
          <EnhancedEmptyState
            type="apps"
            title="No API keys yet"
            description="Create an API key to authenticate with the ChainReact API and build custom integrations."
            onPrimaryAction={() => setCreateDialogOpen(true)}
            primaryActionLabel="Create API Key"
            showTip={false}
            compact
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <code className="px-2 py-1 bg-muted rounded text-xs">
                      {key.key_prefix}...
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {key.last_used_at ? (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(key.last_used_at)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">Never used</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(key.created_at)}
                  </TableCell>
                  <TableCell>
                    {key.is_active ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Revoked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setKeyToDelete(key)
                              setDeleteDialogOpen(true)
                            }}
                            disabled={!key.is_active}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Revoke API key</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Security Note */}
        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Security Note
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                API keys provide full access to your account. Keep them secret and never share them publicly.
                If you suspect a key has been compromised, revoke it immediately.
              </p>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Create API Key Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false)
            setNewKeyName("")
            setNewKeyResult(null)
          } else {
            setCreateDialogOpen(true)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newKeyResult ? "API Key Created" : "Create API Key"}
            </DialogTitle>
            <DialogDescription>
              {newKeyResult
                ? "Your new API key has been created. Copy it now - you won't be able to see it again."
                : "Give your API key a descriptive name so you can identify it later."}
            </DialogDescription>
          </DialogHeader>

          {newKeyResult ? (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center justify-between gap-3">
                  <code className="flex-1 text-sm font-mono break-all">
                    {newKeyResult.key}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(newKeyResult.key, newKeyResult.id)}
                  >
                    {copiedKeyId === newKeyResult.id ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Make sure to copy your API key now. You won't be able to see it again!
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Production Server, CI/CD Pipeline"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {newKeyResult ? (
              <Button onClick={() => {
                setCreateDialogOpen(false)
                setNewKeyResult(null)
              }}>
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateKey} disabled={creating}>
                  {creating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                  Create Key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke "{keyToDelete?.name}". Any applications using this key will no longer be able to authenticate.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteKey}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
