"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
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
  Shield,
  Key,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  AlertTriangle,
  Globe,
  Users,
  Lock,
} from "lucide-react"
import { toast } from "sonner"

interface SSOConfig {
  id: string
  provider: "saml" | "oidc"
  provider_name: string
  entity_id?: string
  sso_url?: string
  slo_url?: string
  client_id?: string
  discovery_url?: string
  is_active: boolean
  enforce_sso: boolean
  auto_provision_users: boolean
  default_role: string
  allowed_domains: string[]
  created_at: string
}

interface DomainMapping {
  id: string
  domain: string
  is_verified: boolean
  verified_at?: string
}

interface SSOConfigurationProps {
  organizationId: string
  isOwner: boolean
}

export function SSOConfiguration({ organizationId, isOwner }: SSOConfigurationProps) {
  const [configs, setConfigs] = useState<SSOConfig[]>([])
  const [domains, setDomains] = useState<DomainMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null)
  const [editingConfig, setEditingConfig] = useState<Partial<SSOConfig> | null>(null)

  // Form state for new/edit config
  const [formData, setFormData] = useState({
    provider: "saml" as "saml" | "oidc",
    providerName: "",
    entityId: "",
    ssoUrl: "",
    sloUrl: "",
    x509Certificate: "",
    clientId: "",
    clientSecret: "",
    discoveryUrl: "",
    enforceSso: false,
    autoProvisionUsers: true,
    defaultRole: "member",
    allowedDomains: "",
  })

  useEffect(() => {
    fetchSSOConfig()
  }, [organizationId])

  const fetchSSOConfig = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/organizations/${organizationId}/sso`)
      if (response.ok) {
        const data = await response.json()
        setConfigs(data.configurations || [])
        setDomains(data.domains || [])
      }
    } catch (error) {
      toast.error("Failed to load SSO configuration")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const endpoint = `/api/organizations/${organizationId}/sso`
      const method = editingConfig?.id ? "PATCH" : "POST"

      const body = editingConfig?.id
        ? { configId: editingConfig.id, ...formData }
        : formData

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save")
      }

      toast.success(editingConfig?.id ? "SSO configuration updated" : "SSO configuration created")
      setShowAddDialog(false)
      setEditingConfig(null)
      resetForm()
      fetchSSOConfig()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (configId: string) => {
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/sso?configId=${configId}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        throw new Error("Failed to delete")
      }

      toast.success("SSO configuration deleted")
      setShowDeleteDialog(null)
      fetchSSOConfig()
    } catch (error) {
      toast.error("Failed to delete SSO configuration")
    }
  }

  const toggleActive = async (config: SSOConfig) => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/sso`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: config.id,
          isActive: !config.is_active,
        }),
      })

      if (!response.ok) throw new Error("Failed to update")

      toast.success(config.is_active ? "SSO deactivated" : "SSO activated")
      fetchSSOConfig()
    } catch (error) {
      toast.error("Failed to update SSO status")
    }
  }

  const resetForm = () => {
    setFormData({
      provider: "saml",
      providerName: "",
      entityId: "",
      ssoUrl: "",
      sloUrl: "",
      x509Certificate: "",
      clientId: "",
      clientSecret: "",
      discoveryUrl: "",
      enforceSso: false,
      autoProvisionUsers: true,
      defaultRole: "member",
      allowedDomains: "",
    })
  }

  const openEditDialog = (config: SSOConfig) => {
    setEditingConfig(config)
    setFormData({
      provider: config.provider,
      providerName: config.provider_name,
      entityId: config.entity_id || "",
      ssoUrl: config.sso_url || "",
      sloUrl: config.slo_url || "",
      x509Certificate: "",
      clientId: config.client_id || "",
      clientSecret: "",
      discoveryUrl: config.discovery_url || "",
      enforceSso: config.enforce_sso,
      autoProvisionUsers: config.auto_provision_users,
      defaultRole: config.default_role,
      allowedDomains: config.allowed_domains?.join(", ") || "",
    })
    setShowAddDialog(true)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  const acsUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sso/saml/callback`
  const oidcCallbackUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sso/oidc/callback`

  if (loading) {
    return (
      <Card className="bg-white dark:bg-gray-900/50">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-rose-600" />
            Single Sign-On (SSO)
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure SAML or OIDC authentication for your organization
          </p>
        </div>
        {isOwner && (
          <Button
            onClick={() => {
              resetForm()
              setEditingConfig(null)
              setShowAddDialog(true)
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add SSO Provider
          </Button>
        )}
      </div>

      {/* Service Provider Info */}
      <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-100">
            Service Provider Information
          </CardTitle>
          <CardDescription className="text-orange-700 dark:text-orange-300">
            Use these values when configuring your Identity Provider
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border border-orange-200 dark:border-orange-900">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">SAML ACS URL</p>
              <p className="text-sm font-mono text-gray-900 dark:text-white">{acsUrl}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(acsUrl)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border border-orange-200 dark:border-orange-900">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">OIDC Callback URL</p>
              <p className="text-sm font-mono text-gray-900 dark:text-white">{oidcCallbackUrl}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(oidcCallbackUrl)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Configurations */}
      {configs.length === 0 ? (
        <Card className="bg-white dark:bg-gray-900/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lock className="w-12 h-12 text-gray-300 dark:text-gray-700 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No SSO configured
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
              Set up Single Sign-On to allow your team members to authenticate using your company's identity provider like Okta, Azure AD, or Google Workspace.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => (
            <Card key={config.id} className="bg-white dark:bg-gray-900/50">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      config.is_active
                        ? "bg-green-100 dark:bg-green-900/30"
                        : "bg-gray-100 dark:bg-gray-800"
                    }`}>
                      <Key className={`w-5 h-5 ${
                        config.is_active
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-400"
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {config.provider_name}
                        </h4>
                        <Badge variant="outline" className={
                          config.provider === "saml"
                            ? "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800"
                            : "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800"
                        }>
                          {config.provider.toUpperCase()}
                        </Badge>
                        {config.is_active ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                        {config.provider === "saml" && config.sso_url && (
                          <p>SSO URL: {config.sso_url}</p>
                        )}
                        {config.provider === "oidc" && config.discovery_url && (
                          <p>Discovery: {config.discovery_url}</p>
                        )}
                        {config.enforce_sso && (
                          <p className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            SSO enforced for all users
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.is_active}
                        onCheckedChange={() => toggleActive(config)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(config)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => setShowDeleteDialog(config.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConfig?.id ? "Edit SSO Configuration" : "Add SSO Provider"}
            </DialogTitle>
            <DialogDescription>
              Configure authentication with your identity provider
            </DialogDescription>
          </DialogHeader>

          <Tabs value={formData.provider} onValueChange={(v) => setFormData({ ...formData, provider: v as any })}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="saml">SAML 2.0</TabsTrigger>
              <TabsTrigger value="oidc">OIDC / OAuth 2.0</TabsTrigger>
            </TabsList>

            <TabsContent value="saml" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Provider Name</Label>
                <Input
                  placeholder="e.g., Okta, Azure AD, OneLogin"
                  value={formData.providerName}
                  onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Entity ID (Issuer)</Label>
                <Input
                  placeholder="https://your-idp.com/entity-id"
                  value={formData.entityId}
                  onChange={(e) => setFormData({ ...formData, entityId: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>SSO URL (Login URL)</Label>
                <Input
                  placeholder="https://your-idp.com/sso/saml"
                  value={formData.ssoUrl}
                  onChange={(e) => setFormData({ ...formData, ssoUrl: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Single Logout URL (Optional)</Label>
                <Input
                  placeholder="https://your-idp.com/slo"
                  value={formData.sloUrl}
                  onChange={(e) => setFormData({ ...formData, sloUrl: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>X.509 Certificate</Label>
                <Textarea
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  rows={4}
                  className="font-mono text-xs"
                  value={formData.x509Certificate}
                  onChange={(e) => setFormData({ ...formData, x509Certificate: e.target.value })}
                />
              </div>
            </TabsContent>

            <TabsContent value="oidc" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Provider Name</Label>
                <Input
                  placeholder="e.g., Google Workspace, Azure AD"
                  value={formData.providerName}
                  onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input
                  placeholder="Your OAuth client ID"
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Client Secret</Label>
                <Input
                  type="password"
                  placeholder="Your OAuth client secret"
                  value={formData.clientSecret}
                  onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Discovery URL</Label>
                <Input
                  placeholder="https://your-idp.com/.well-known/openid-configuration"
                  value={formData.discoveryUrl}
                  onChange={(e) => setFormData({ ...formData, discoveryUrl: e.target.value })}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Common Settings */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium text-gray-900 dark:text-white">Settings</h4>

            <div className="flex items-center justify-between">
              <div>
                <Label>Enforce SSO</Label>
                <p className="text-xs text-gray-500">Require all users to authenticate via SSO</p>
              </div>
              <Switch
                checked={formData.enforceSso}
                onCheckedChange={(v) => setFormData({ ...formData, enforceSso: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-provision Users</Label>
                <p className="text-xs text-gray-500">Automatically create accounts for new SSO users</p>
              </div>
              <Switch
                checked={formData.autoProvisionUsers}
                onCheckedChange={(v) => setFormData({ ...formData, autoProvisionUsers: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>Default Role for New Users</Label>
              <Select
                value={formData.defaultRole}
                onValueChange={(v) => setFormData({ ...formData, defaultRole: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Allowed Email Domains (Optional)</Label>
              <Input
                placeholder="example.com, company.org"
                value={formData.allowedDomains}
                onChange={(e) => setFormData({ ...formData, allowedDomains: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Comma-separated list. Leave empty to allow all domains.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingConfig?.id ? (
                "Update Configuration"
              ) : (
                "Add Configuration"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SSO Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this SSO configuration? Users will no longer be able to sign in using this provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => showDeleteDialog && handleDelete(showDeleteDialog)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
