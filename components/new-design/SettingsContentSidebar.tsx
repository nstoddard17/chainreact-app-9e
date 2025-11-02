"use client"

import { useRef, useState, type ChangeEvent, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/utils/supabaseClient"
import { User, Bell, Shield, Palette, Loader2, ChevronRight, Sparkles, Briefcase, Users, Building2, Check, X } from "lucide-react"
import { useTheme } from "next-themes"
import { TwoFactorSetup } from "@/components/settings/TwoFactorSetup"
import { cn } from "@/lib/utils"
import { useSignedAvatarUrl } from "@/hooks/useSignedAvatarUrl"
import { useSearchParams, useRouter } from "next/navigation"
import { useWorkspaces } from "@/hooks/useWorkspaces"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type SettingsSection = 'profile' | 'workspace' | 'notifications' | 'security' | 'appearance'

export function SettingsContent() {
  const { profile, updateProfile, user } = useAuthStore()
  const { toast } = useToast()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get('section') as SettingsSection | null
  const [activeSection, setActiveSection] = useState<SettingsSection>(sectionParam || 'profile')

  // DEBUG: Log profile data to see admin field
  console.log('🔍 SETTINGS PAGE - Profile Debug:', {
    hasProfile: !!profile,
    admin: profile?.admin,
    adminType: typeof profile?.admin,
    role: profile?.role,
    fullProfile: profile
  })
  const [notifications, setNotifications] = useState({
    email: true,
    slack: false,
    workflow_success: true,
    workflow_failure: true,
    weekly_digest: true
  })
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Use signed URL for secure avatar access
  const displayAvatarUrl = previewUrl || profile?.avatar_url
  const { signedUrl: avatarSignedUrl } = useSignedAvatarUrl(displayAvatarUrl)
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorLoading, setTwoFactorLoading] = useState(true)

  // Workspace state
  const [workspace, setWorkspace] = useState<any>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceDescription, setWorkspaceDescription] = useState("")
  const [workspaceSaving, setWorkspaceSaving] = useState(false)

  // Default workspace state
  const { workspaces } = useWorkspaces()
  const { updateDefaultWorkspace, clearDefaultWorkspace } = useAuthStore()
  const [defaultWorkspaceValue, setDefaultWorkspaceValue] = useState<string>("")
  const [savingDefaultWorkspace, setSavingDefaultWorkspace] = useState(false)

  useEffect(() => {
    setMounted(true)
    check2FAStatus()
    // Only fetch workspace if user is viewing workspace section
    if (sectionParam === 'workspace') {
      fetchWorkspace()
    } else {
      // Set workspace loading to false if not viewing workspace section
      setWorkspaceLoading(false)
    }
  }, [])

  // Update active section when URL parameter changes
  useEffect(() => {
    if (sectionParam && ['profile', 'workspace', 'notifications', 'security', 'appearance'].includes(sectionParam)) {
      setActiveSection(sectionParam)
      // Fetch workspace data when user navigates to workspace section
      if (sectionParam === 'workspace') {
        fetchWorkspace()
      }
    }
  }, [sectionParam])

  // Sync default workspace value from profile
  useEffect(() => {
    if (profile?.default_workspace_type) {
      const value = `${profile.default_workspace_type}:${profile.default_workspace_id || ''}`
      setDefaultWorkspaceValue(value)
    } else {
      setDefaultWorkspaceValue("")
    }
  }, [profile?.default_workspace_type, profile?.default_workspace_id])

  // Debug: Log profile changes
  useEffect(() => {
    const displaySrc = previewUrl || profile?.avatar_url
    console.log('👤 Profile changed:')
    console.log('  - avatar_url:', profile?.avatar_url)
    console.log('  - previewUrl:', previewUrl)
    console.log('  - avatarUploading:', avatarUploading)
    console.log('  - displayingSrc:', displaySrc)
    console.log('  - has displaySrc?:', !!displaySrc)
  }, [profile?.avatar_url, previewUrl])

  // Clear preview when profile avatar_url changes (upload completed)
  useEffect(() => {
    if (profile?.avatar_url && previewUrl && !avatarUploading) {
      // Profile has been updated with new avatar URL and upload is complete
      // Clear the preview after a short delay to ensure smooth transition
      console.log('🧹 Clearing preview URL in 500ms...')
      const currentPreviewUrl = previewUrl
      const timer = setTimeout(() => {
        console.log('🧹 Preview URL cleared')
        if (currentPreviewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(currentPreviewUrl)
        }
        setPreviewUrl(null)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [profile?.avatar_url, previewUrl, avatarUploading])

  const check2FAStatus = async () => {
    try {
      setTwoFactorLoading(true)
      const response = await fetch('/api/auth/2fa/status')
      if (response.ok) {
        const data = await response.json()
        setTwoFactorEnabled(data.enabled)
      }
    } catch (error) {
      console.error('Error checking 2FA status:', error)
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const handle2FASuccess = () => {
    setTwoFactorEnabled(true)
    check2FAStatus()
  }

  const fetchWorkspace = async () => {
    try {
      setWorkspaceLoading(true)
      // Get current workspace ID from localStorage
      const workspaceId = localStorage.getItem('current_workspace_id')
      if (!workspaceId) {
        // No workspace ID means user is in personal workspace
        // Set workspace to null and use profile data instead
        setWorkspace(null)
        setWorkspaceName(profile?.full_name || profile?.username || "Personal Workspace")
        setWorkspaceDescription("Your personal workspace")
        setWorkspaceLoading(false)
        return
      }

      const response = await fetch(`/api/organizations/${workspaceId}`)
      if (!response.ok) throw new Error('Failed to fetch workspace')

      const data = await response.json()
      setWorkspace(data)
      setWorkspaceName(data.name || "")
      setWorkspaceDescription(data.description || "")
    } catch (error) {
      console.error('Error fetching workspace:', error)
      toast({ title: "Error", description: "Failed to load workspace settings", variant: "destructive" })
    } finally {
      setWorkspaceLoading(false)
    }
  }

  const saveWorkspaceSettings = async () => {
    if (!workspace) return

    try {
      setWorkspaceSaving(true)
      const response = await fetch(`/api/organizations/${workspace.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workspaceName.trim(),
          description: workspaceDescription.trim()
        })
      })

      if (!response.ok) throw new Error('Failed to save workspace settings')

      toast({ title: "Success", description: "Workspace settings saved successfully" })
      fetchWorkspace()
    } catch (error) {
      console.error('Error saving workspace:', error)
      toast({ title: "Error", description: "Failed to save workspace settings", variant: "destructive" })
    } finally {
      setWorkspaceSaving(false)
    }
  }

  const handleDefaultWorkspaceChange = async (value: string) => {
    try {
      setSavingDefaultWorkspace(true)

      if (!value) {
        // Clear default workspace
        await clearDefaultWorkspace()
        toast({ title: "Success", description: "Default workspace cleared" })
      } else {
        // Parse and save default workspace
        const [workspaceType, workspaceId] = value.split(':')
        await updateDefaultWorkspace(
          workspaceType as 'personal' | 'team' | 'organization',
          workspaceId || null
        )

        const selectedWorkspace = workspaces.find(w =>
          w.type === workspaceType && (w.id || '') === (workspaceId || '')
        )
        toast({
          title: "Success",
          description: `Default workspace set to ${selectedWorkspace?.name || 'selected workspace'}`
        })
      }

      setDefaultWorkspaceValue(value)
    } catch (error) {
      console.error('Error updating default workspace:', error)
      toast({ title: "Error", description: "Failed to update default workspace", variant: "destructive" })
    } finally {
      setSavingDefaultWorkspace(false)
    }
  }

  const handleClearDefaultWorkspace = async () => {
    try {
      setSavingDefaultWorkspace(true)
      await clearDefaultWorkspace()
      setDefaultWorkspaceValue("")
      toast({ title: "Success", description: "Default workspace cleared" })
    } catch (error) {
      console.error('Error clearing default workspace:', error)
      toast({ title: "Error", description: "Failed to clear default workspace", variant: "destructive" })
    } finally {
      setSavingDefaultWorkspace(false)
    }
  }

  const disable2FA = async () => {
    try {
      const response = await fetch('/api/auth/2fa/status')
      if (!response.ok) return

      const data = await response.json()
      const factor = data.factors?.[0]

      if (!factor) return

      const disableResponse = await fetch('/api/auth/2fa/unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factor_id: factor.id }),
      })

      if (disableResponse.ok) {
        setTwoFactorEnabled(false)
        toast({
          title: "2FA disabled",
          description: "Two-factor authentication has been turned off",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disable 2FA",
        variant: "destructive",
      })
    }
  }

  const handleAvatarButtonClick = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const maxSizeBytes = 1.5 * 1024 * 1024
    const maxDimension = 1024
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose a valid image file (PNG, JPG, or GIF).")
      event.target.value = ""
      return
    }

    if (file.size > maxSizeBytes) {
      setAvatarError("Image is too large. Please upload a file smaller than 1.5MB.")
      event.target.value = ""
      return
    }

    setAvatarError(null)

    const objectUrl = URL.createObjectURL(file)

    // Set preview URL immediately
    setPreviewUrl(objectUrl)

    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.width, height: img.height })
        img.onerror = () => reject(new Error("Unable to read image dimensions."))
        img.src = objectUrl
      })

      if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
        setAvatarError(`Please upload an image up to ${maxDimension}x${maxDimension} pixels.`)
        setPreviewUrl(null)
        URL.revokeObjectURL(objectUrl)
        event.target.value = ""
        return
      }
    } catch (imageError: any) {
      setAvatarError(imageError?.message || "Unable to validate image size. Please try another file.")
      setPreviewUrl(null)
      URL.revokeObjectURL(objectUrl)
      event.target.value = ""
      return
    }

    setAvatarUploading(true)

    const userId = profile?.id || user?.id

    if (!userId) {
      setAvatarError("Unable to determine user identity. Please refresh and try again.")
      setAvatarUploading(false)
      event.target.value = ""
      return
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const fileName = `avatar-${Date.now()}.${extension}`
    const filePath = `${userId}/${fileName}`

    try {
      const { error: uploadError } = await supabase.storage
        .from("user-avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        })

      if (uploadError) {
        setAvatarError(uploadError.message || "Failed to upload avatar. Please try again.")
        return
      }

      if (profile?.avatar_url?.includes("/user-avatars/")) {
        const [, path] = profile.avatar_url.split("/user-avatars/")
        if (path) {
          await supabase.storage.from("user-avatars").remove([path]).catch(() => {})
        }
      }

      const { data: publicUrlData } = supabase.storage
        .from("user-avatars")
        .getPublicUrl(filePath)

      const newAvatarUrl = publicUrlData?.publicUrl
      if (!newAvatarUrl) {
        setAvatarError("Unable to retrieve public URL for avatar.")
        setPreviewUrl(null)
        URL.revokeObjectURL(objectUrl)
        return
      }

      // Add cache-busting parameter to force reload
      const cacheBustedUrl = `${newAvatarUrl}?t=${Date.now()}`

      console.log('🖼️ Uploading avatar:', {
        newAvatarUrl,
        cacheBustedUrl,
        currentProfile: profile?.avatar_url
      })

      await updateProfile({ avatar_url: cacheBustedUrl })

      console.log('✅ Avatar update call completed')

      toast({
        title: "Profile photo updated",
        description: "Your new avatar will appear across the app.",
      })

      // Don't revoke object URL yet - let the useEffect handle cleanup after profile updates
      // URL.revokeObjectURL will be called when preview is cleared
    } catch (error: any) {
      setAvatarError(error.message || "Unexpected error while updating avatar.")
      setPreviewUrl(null)
      URL.revokeObjectURL(objectUrl)
    } finally {
      setAvatarUploading(false)
      event.target.value = ""
    }
  }

  const navigationItems = [
    { id: 'profile' as const, label: 'Profile', icon: User, description: 'Manage your personal information' },
    { id: 'workspace' as const, label: 'Workspace', icon: Briefcase, description: 'Your personal workspace settings' },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell, description: 'Configure notification preferences' },
    { id: 'security' as const, label: 'Security', icon: Shield, description: 'Password and authentication settings' },
    { id: 'appearance' as const, label: 'Appearance', icon: Palette, description: 'Customize your theme' },
  ]

  return (
    <>
    <div className="flex gap-8 max-w-7xl mx-auto">
      {/* Sidebar Navigation */}
      <aside className="w-64 shrink-0">
        <div className="sticky top-6 space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id)
                  router.push(`/settings?section=${item.id}`)
                }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn(
                    "w-5 h-5 transition-transform group-hover:scale-110",
                    isActive ? "text-primary-foreground" : ""
                  )} />
                  <div className="flex-1">
                    <div className={cn(
                      "font-semibold text-sm",
                      isActive ? "text-primary-foreground" : ""
                    )}>
                      {item.label}
                    </div>
                    {!isActive && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {item.description}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-primary-foreground" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">
        {/* Profile Section */}
        {activeSection === 'profile' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Profile Information</h2>
              <p className="text-muted-foreground mt-2">Update your personal information and profile details</p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-6">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-muted ring-4 ring-border">
                    {avatarSignedUrl ? (
                      <img
                        src={avatarSignedUrl}
                        alt="Profile avatar"
                        className="w-full h-full object-cover"
                        onLoad={() => {
                          console.log('✅ Avatar image loaded successfully:', avatarSignedUrl)
                        }}
                        onError={(e) => {
                          console.error('❌ Avatar image FAILED to load:', avatarSignedUrl)
                          console.error('Error details:', e)
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
                        <User className="w-12 h-12" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <Button
                      variant="outline"
                      onClick={handleAvatarButtonClick}
                      disabled={avatarUploading}
                    >
                      {avatarUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Change Photo"
                      )}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      PNG, JPG, or GIF. Max size 1.5MB.
                    </p>
                    {avatarError && (
                      <p className="text-sm text-destructive">{avatarError}</p>
                    )}
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Form */}
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                      <Input
                        id="username"
                        defaultValue={profile?.username || ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        defaultValue={profile?.email || ""}
                        disabled
                        className="bg-muted/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="full-name" className="text-sm font-medium">Full Name</Label>
                    <Input
                      id="full-name"
                      defaultValue={profile?.full_name || ""}
                      placeholder="John Doe"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio" className="text-sm font-medium">Bio</Label>
                    <Input
                      id="bio"
                      placeholder="Tell us about yourself..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Optional: A brief description about yourself
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button variant="outline">Cancel</Button>
                  <Button>Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Workspace Section */}
        {activeSection === 'workspace' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Workspace Settings</h2>
              <p className="text-muted-foreground mt-2">Manage your personal workspace details</p>
            </div>

            {workspaceLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ) : workspace ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Workspace Details</CardTitle>
                    <CardDescription>Update your workspace's basic information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="workspace-name">Workspace Name *</Label>
                      <Input
                        id="workspace-name"
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        placeholder="My Workspace"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="workspace-slug">URL Slug</Label>
                      <Input
                        id="workspace-slug"
                        value={workspace.slug || ""}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        The URL slug cannot be changed
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="workspace-description">Description</Label>
                      <Input
                        id="workspace-description"
                        value={workspaceDescription}
                        onChange={(e) => setWorkspaceDescription(e.target.value)}
                        placeholder="Your personal workspace"
                      />
                    </div>

                    <Button onClick={saveWorkspaceSettings} disabled={workspaceSaving}>
                      {workspaceSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Workspace Stats</CardTitle>
                    <CardDescription>Overview of your workspace</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <User className="w-4 h-4" />
                          <span className="text-sm">Owner</span>
                        </div>
                        <p className="text-2xl font-bold">{profile?.username || profile?.email || 'You'}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Briefcase className="w-4 h-4" />
                          <span className="text-sm">Type</span>
                        </div>
                        <p className="text-2xl font-bold">Personal</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">No workspace found</p>
                </CardContent>
              </Card>
            )}

            {/* Default Workspace Settings - Show for all users */}
            <Card>
              <CardHeader>
                <CardTitle>Default Workspace</CardTitle>
                <CardDescription>Set your preferred workspace for creating new workflows</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current Default Display */}
                {profile?.default_workspace_type ? (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      {profile.default_workspace_type === 'personal' ? (
                        <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      ) : profile.default_workspace_type === 'team' ? (
                        <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Current Default: {workspaces.find(w =>
                            w.type === profile.default_workspace_type &&
                            (w.id || '') === (profile.default_workspace_id || '')
                          )?.name || profile.default_workspace_type}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          New workflows will be created here automatically
                        </p>
                      </div>
                      <Check className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      No default workspace set. You'll be asked each time you create a workflow.
                    </p>
                  </div>
                )}

                {/* Workspace Selector */}
                <div className="space-y-2">
                  <Label htmlFor="default-workspace">Change Default Workspace</Label>
                  <Select
                    value={defaultWorkspaceValue}
                    onValueChange={handleDefaultWorkspaceChange}
                    disabled={savingDefaultWorkspace}
                  >
                    <SelectTrigger id="default-workspace">
                      <SelectValue placeholder="Select workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((workspace) => {
                        const value = `${workspace.type}:${workspace.id || ''}`
                        const icon = workspace.type === 'personal'
                          ? <User className="w-4 h-4" />
                          : workspace.type === 'team'
                          ? <Users className="w-4 h-4" />
                          : <Building2 className="w-4 h-4" />

                        return (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              {icon}
                              <span>{workspace.name}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose where new workflows should be created by default
                  </p>
                </div>

                {/* Clear Default Button */}
                {profile?.default_workspace_type && (
                  <Button
                    variant="outline"
                    onClick={handleClearDefaultWorkspace}
                    disabled={savingDefaultWorkspace}
                    className="w-full"
                  >
                    {savingDefaultWorkspace ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <X className="w-4 h-4 mr-2" />
                    )}
                    Clear Default Workspace
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Notifications Section */}
        {activeSection === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Notification Preferences</h2>
              <p className="text-muted-foreground mt-2">Manage how and when you receive notifications</p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-8">
                {/* Communication Channels */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Communication Channels</h3>
                    <p className="text-xs text-muted-foreground mb-4">Choose where you'd like to receive notifications</p>
                    <div className="space-y-3">
                      <div className="group">
                        <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-primary/50 transition-all duration-200">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="mt-1 p-2.5 rounded-lg bg-primary/10">
                              <Bell className="w-4 h-4 text-primary" />
                            </div>
                            <div className="space-y-1 flex-1">
                              <Label className="text-sm font-semibold cursor-pointer">Email Notifications</Label>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Receive notifications via email at {profile?.email}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={notifications.email}
                            onCheckedChange={(checked) => setNotifications({ ...notifications, email: checked })}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>
                      </div>
                      <div className="group">
                        <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-primary/50 transition-all duration-200">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="mt-1 p-2.5 rounded-lg bg-blue-500/10">
                              <Bell className="w-4 h-4 text-blue-500" />
                            </div>
                            <div className="space-y-1 flex-1">
                              <Label className="text-sm font-semibold cursor-pointer">Slack Notifications</Label>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Send notifications directly to your Slack workspace
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={notifications.slack}
                            onCheckedChange={(checked) => setNotifications({ ...notifications, slack: checked })}
                            className="data-[state=checked]:bg-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Workflow Notifications */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Workflow Notifications</h3>
                    <p className="text-xs text-muted-foreground mb-4">Get notified about your workflow activity</p>
                    <div className="space-y-3">
                      <div className="group">
                        <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-green-500/50 transition-all duration-200">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="mt-1 p-2.5 rounded-lg bg-green-500/10">
                              <Bell className="w-4 h-4 text-green-500" />
                            </div>
                            <div className="space-y-1 flex-1">
                              <Label className="text-sm font-semibold cursor-pointer">Workflow Success</Label>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Get notified when your workflows complete successfully
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={notifications.workflow_success}
                            onCheckedChange={(checked) => setNotifications({ ...notifications, workflow_success: checked })}
                            className="data-[state=checked]:bg-green-500"
                          />
                        </div>
                      </div>
                      <div className="group">
                        <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-red-500/50 transition-all duration-200">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="mt-1 p-2.5 rounded-lg bg-red-500/10">
                              <Bell className="w-4 h-4 text-red-500" />
                            </div>
                            <div className="space-y-1 flex-1">
                              <Label className="text-sm font-semibold cursor-pointer">Workflow Failure</Label>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Get notified immediately when workflows encounter errors
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={notifications.workflow_failure}
                            onCheckedChange={(checked) => setNotifications({ ...notifications, workflow_failure: checked })}
                            className="data-[state=checked]:bg-red-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* AI Agent Preferences */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-1">AI Agent Settings</h3>
                    <p className="text-xs text-muted-foreground mb-4">Control how the AI agent appears when creating workflows</p>
                    <div className="space-y-3">
                      <div className="group">
                        <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-primary/50 transition-all duration-200">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="mt-1 p-2.5 rounded-lg bg-primary/10">
                              <Sparkles className="w-4 h-4 text-primary" />
                            </div>
                            <div className="space-y-1 flex-1">
                              <Label className="text-sm font-semibold cursor-pointer">Show React Agent Chat</Label>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Automatically open the AI assistant when opening the workflow builder
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={profile?.ai_agent_preference !== 'always_skip'}
                            onCheckedChange={async (checked) => {
                              try {
                                await updateProfile({
                                  ai_agent_preference: checked ? 'always_show' : 'always_skip',
                                  ai_agent_skip_count: 0
                                })
                                toast({
                                  title: "Preference updated",
                                  description: checked
                                    ? "React Agent will now appear when you create workflows"
                                    : "React Agent will stay hidden when you create workflows"
                                })
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to update preference. Please try again.",
                                  variant: "destructive"
                                })
                              }
                            }}
                            className="data-[state=checked]:bg-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Digest Notifications */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Digest & Summaries</h3>
                    <p className="text-xs text-muted-foreground mb-4">Receive periodic summaries of your activity</p>
                    <div className="space-y-3">
                      <div className="group">
                        <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-purple-500/50 transition-all duration-200">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="mt-1 p-2.5 rounded-lg bg-purple-500/10">
                              <Bell className="w-4 h-4 text-purple-500" />
                            </div>
                            <div className="space-y-1 flex-1">
                              <Label className="text-sm font-semibold cursor-pointer">Weekly Digest</Label>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                Receive a comprehensive weekly summary of your workflow activity
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={notifications.weekly_digest}
                            onCheckedChange={(checked) => setNotifications({ ...notifications, weekly_digest: checked })}
                            className="data-[state=checked]:bg-purple-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button>Save Preferences</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Security Section */}
        {activeSection === 'security' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Security Settings</h2>
              <p className="text-muted-foreground mt-2">Manage your password and authentication settings</p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-6">
                {/* Password Section */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Password</Label>
                      <p className="text-sm text-muted-foreground">
                        Last changed: Never
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/auth/send-reset', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: user?.email })
                          })

                          if (response.ok) {
                            toast({
                              title: "Password reset email sent",
                              description: `We've sent a password reset link to ${user?.email}. Check your inbox and follow the instructions.`,
                              duration: 6000,
                            })
                          } else {
                            toast({
                              title: "Failed to send reset email",
                              description: "Please try again or contact support if the problem persists.",
                              variant: "destructive",
                            })
                          }
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Something went wrong. Please try again.",
                            variant: "destructive",
                          })
                        }
                      }}
                    >
                      Reset Password
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    For security reasons, we'll send a password reset link to your email address.
                  </p>
                </div>

                <div className="h-px bg-border" />

                {/* Two-Factor Authentication Section */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <Label className="text-base font-semibold">Two-Factor Authentication</Label>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security with authenticator apps
                      </p>
                    </div>
                    {twoFactorLoading ? (
                      <Button variant="outline" disabled>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </Button>
                    ) : twoFactorEnabled ? (
                      <Button variant="outline" onClick={disable2FA}>
                        Disable 2FA
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setShow2FASetup(true)}>
                        Enable 2FA
                      </Button>
                    )}
                  </div>
                  <div className={`rounded-lg p-4 ${twoFactorEnabled ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/50'}`}>
                    <div className="flex items-start gap-3">
                      <Shield className={`w-5 h-5 mt-0.5 ${twoFactorEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <div className="flex-1 space-y-2">
                        <p className="text-sm">
                          <span className="font-medium text-foreground">Status:</span>{' '}
                          <span className={twoFactorEnabled ? 'text-green-600 dark:text-green-500 font-medium' : 'text-muted-foreground'}>
                            {twoFactorEnabled ? 'Enabled ✓' : 'Not enabled'}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {twoFactorEnabled
                            ? 'Your account is protected with TOTP-based two-factor authentication. You\'ll need to enter a code from your authenticator app when signing in.'
                            : 'Two-factor authentication adds an extra layer of security by requiring a code from an authenticator app (like Google Authenticator, Authy, 1Password, or Microsoft Authenticator) in addition to your password.'
                          }
                        </p>
                        {twoFactorEnabled && (
                          <div className="pt-2">
                            <p className="text-xs text-muted-foreground">
                              <strong>Supported apps:</strong> Google Authenticator • Authy • 1Password • Microsoft Authenticator • Any TOTP-compatible app
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Active Sessions Section */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-base font-semibold">Active Sessions</Label>
                    <p className="text-sm text-muted-foreground">
                      Manage devices and sessions where you're logged in
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Current Session</p>
                        <p className="text-xs text-muted-foreground">Active now</p>
                      </div>
                      <Button variant="ghost" size="sm" disabled>
                        Current Device
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Appearance Section */}
        {activeSection === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Appearance Settings</h2>
              <p className="text-muted-foreground mt-2">Choose how ChainReact looks for you</p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-6">
                {mounted ? (
                  <div className="grid grid-cols-3 gap-6">
                    <button
                      onClick={() => setTheme('light')}
                      className={`group relative cursor-pointer border-2 rounded-xl p-6 text-center transition-all hover:shadow-lg ${
                        theme === 'light'
                          ? 'border-primary shadow-md'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="w-full h-24 bg-white border border-gray-300 rounded-lg mb-3 flex items-center justify-center shadow-sm">
                        <div className="space-y-1.5 w-full px-3">
                          <div className="h-2 bg-gray-300 rounded w-3/4" />
                          <div className="h-2 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>
                      <p className="text-sm font-semibold">Light</p>
                      <p className="text-xs text-muted-foreground mt-1">Clean and bright</p>
                      {theme === 'light' && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`group relative cursor-pointer border-2 rounded-xl p-6 text-center transition-all hover:shadow-lg ${
                        theme === 'dark'
                          ? 'border-primary shadow-md'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="w-full h-24 bg-slate-900 border border-slate-700 rounded-lg mb-3 flex items-center justify-center shadow-sm">
                        <div className="space-y-1.5 w-full px-3">
                          <div className="h-2 bg-slate-700 rounded w-3/4" />
                          <div className="h-2 bg-slate-800 rounded w-1/2" />
                        </div>
                      </div>
                      <p className="text-sm font-semibold">Dark</p>
                      <p className="text-xs text-muted-foreground mt-1">Easy on the eyes</p>
                      {theme === 'dark' && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => setTheme('system')}
                      className={`group relative cursor-pointer border-2 rounded-xl p-6 text-center transition-all hover:shadow-lg ${
                        theme === 'system'
                          ? 'border-primary shadow-md'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="w-full h-24 bg-gradient-to-br from-white via-gray-200 to-slate-900 border border-gray-400 rounded-lg mb-3 shadow-sm" />
                      <p className="text-sm font-semibold">System</p>
                      <p className="text-xs text-muted-foreground mt-1">Match your device</p>
                      {theme === 'system' && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="border-2 border-border rounded-xl p-6 text-center">
                        <div className="w-full h-24 bg-muted rounded-lg mb-3 animate-pulse" />
                        <div className="h-4 bg-muted rounded w-16 mx-auto mb-2 animate-pulse" />
                        <div className="h-3 bg-muted rounded w-24 mx-auto animate-pulse" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>

    {/* Two-Factor Authentication Setup Dialog */}
    <TwoFactorSetup
      open={show2FASetup}
      onOpenChange={setShow2FASetup}
      onSuccess={handle2FASuccess}
    />
    </>
  )
}
