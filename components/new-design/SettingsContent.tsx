"use client"

import { useRef, useState, type ChangeEvent, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/utils/supabaseClient"
import { User, Bell, Shield, Palette, Loader2, Sparkles } from "lucide-react"
import { useTheme } from "next-themes"
import { TwoFactorSetup } from "@/components/settings/TwoFactorSetup"

export function SettingsContent() {
  const { profile, updateProfile, user } = useAuthStore()
  const { toast } = useToast()
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState({
    email: true,
    slack: false,
    workflow_success: true,
    workflow_failure: true,
    weekly_digest: true
  })
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorLoading, setTwoFactorLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
    check2FAStatus()
  }, [])

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

    const maxSizeBytes = 1.5 * 1024 * 1024 // 1.5MB
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
    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.width, height: img.height })
        img.onerror = () => reject(new Error("Unable to read image dimensions."))
        img.src = objectUrl
      })

      if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
        setAvatarError(`Please upload an image up to ${maxDimension}x${maxDimension} pixels.`)
        event.target.value = ""
        return
      }
    } catch (imageError: any) {
      setAvatarError(imageError?.message || "Unable to validate image size. Please try another file.")
      event.target.value = ""
      return
    } finally {
      URL.revokeObjectURL(objectUrl)
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
      // Upload the new avatar
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

      // Attempt to remove previous avatar if it exists
      if (profile?.avatar_url?.includes("/user-avatars/")) {
        const [, path] = profile.avatar_url.split("/user-avatars/")
        if (path) {
          await supabase.storage.from("user-avatars").remove([path]).catch(() => {
            // Ignore cleanup errors
          })
        }
      }

      const { data: publicUrlData } = supabase.storage
        .from("user-avatars")
        .getPublicUrl(filePath)

      const newAvatarUrl = publicUrlData?.publicUrl
      if (!newAvatarUrl) {
        setAvatarError("Unable to retrieve public URL for avatar.")
        return
      }

      await updateProfile({ avatar_url: newAvatarUrl })

      toast({
        title: "Profile photo updated",
        description: "Your new avatar will appear across the app.",
      })
    } catch (error: any) {
      setAvatarError(error.message || "Unexpected error while updating avatar.")
    } finally {
      setAvatarUploading(false)
      event.target.value = ""
    }
  }

  return (
    <>
    <Tabs defaultValue="profile" className="space-y-6">
      <TabsList>
        <TabsTrigger value="profile">
          <User className="w-4 h-4 mr-2" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <Bell className="w-4 h-4 mr-2" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="security">
          <Shield className="w-4 h-4 mr-2" />
          Security
        </TabsTrigger>
        <TabsTrigger value="appearance">
          <Palette className="w-4 h-4 mr-2" />
          Appearance
        </TabsTrigger>
      </TabsList>

      {/* Profile Tab */}
      <TabsContent value="profile" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal information and profile details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20 bg-muted">
                {profile?.avatar_url && (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt="Profile avatar"
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <User className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1.5">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <Button
                  variant="outline"
                  size="sm"
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

            {/* Form */}
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                <Input
                  id="username"
                  defaultValue={profile?.username || ""}
                  className="max-w-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue={profile?.email || ""}
                  disabled
                  className="max-w-md bg-muted/50"
                />
                <p className="text-xs text-muted-foreground">
                  Your email address cannot be changed. Contact support if you need to update it.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="full-name" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="full-name"
                  defaultValue={profile?.full_name || ""}
                  placeholder="John Doe"
                  className="max-w-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio" className="text-sm font-medium">Bio</Label>
                <Input
                  id="bio"
                  placeholder="Tell us about yourself..."
                  className="max-w-md"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: A brief description about yourself
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" size="sm">Cancel</Button>
              <Button size="sm">Save Changes</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Notifications Tab */}
      <TabsContent value="notifications" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Manage how and when you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
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
                  <div className="group">
                    <div className="flex items-center justify-between py-4 px-5 rounded-xl border-2 bg-card hover:border-primary/50 transition-all duration-200">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="mt-1 p-2.5 rounded-lg bg-primary/10">
                          <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <div className="space-y-1 flex-1">
                          <Label className="text-sm font-semibold cursor-pointer">Show AI Agent for New Workflows</Label>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Use AI to help build workflows when clicking "New Workflow"
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
                              title: "Preference Updated",
                              description: checked
                                ? "AI agent will be shown when creating new workflows"
                                : "You'll go straight to the manual builder"
                            })
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: "Failed to update preference",
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
              <Button size="sm">Save Preferences</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Security Tab */}
      <TabsContent value="security" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Password & Authentication</CardTitle>
            <CardDescription>Manage your password and security settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
      </TabsContent>

      {/* Appearance Tab */}
      <TabsContent value="appearance" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Theme Preference</CardTitle>
            <CardDescription>Choose how ChainReact looks for you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
      </TabsContent>
    </Tabs>

    {/* Two-Factor Authentication Setup Dialog */}
    <TwoFactorSetup
      open={show2FASetup}
      onOpenChange={setShow2FASetup}
      onSuccess={handle2FASuccess}
    />
    </>
  )
}

// Export with preloader wrapper
import { PagePreloader } from "@/components/common/PagePreloader"

export function SettingsContentWithPreloader() {
  return (
    <PagePreloader
      pageType="settings"
      loadingTitle="Loading Settings"
      loadingDescription="Loading your account settings and preferences..."
    >
      <SettingsContent />
    </PagePreloader>
  )
}
