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
import { User, Bell, Shield, Palette, Loader2 } from "lucide-react"
import { useTheme } from "next-themes"

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

  useEffect(() => {
    setMounted(true)
  }, [])

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
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" defaultValue={profile?.username || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue={profile?.email || ""} disabled />
                <p className="text-sm text-muted-foreground">Email cannot be changed</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Input id="bio" placeholder="Tell us about yourself" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Save Changes</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Notifications Tab */}
      <TabsContent value="notifications" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Manage how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                </div>
                <Switch
                  checked={notifications.email}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, email: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Slack Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send notifications to Slack</p>
                </div>
                <Switch
                  checked={notifications.slack}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, slack: checked })}
                />
              </div>
              <div className="h-px bg-border my-4" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Workflow Success</Label>
                  <p className="text-sm text-muted-foreground">Notify when workflows complete successfully</p>
                </div>
                <Switch
                  checked={notifications.workflow_success}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, workflow_success: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Workflow Failure</Label>
                  <p className="text-sm text-muted-foreground">Notify when workflows fail</p>
                </div>
                <Switch
                  checked={notifications.workflow_failure}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, workflow_failure: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly Digest</Label>
                  <p className="text-sm text-muted-foreground">Receive a weekly summary email</p>
                </div>
                <Switch
                  checked={notifications.weekly_digest}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, weekly_digest: checked })}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button>Save Preferences</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Security Tab */}
      <TabsContent value="security" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Update your password to keep your account secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current Password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New Password</Label>
              <Input id="new" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input id="confirm" type="password" />
            </div>
            <div className="flex justify-end">
              <Button>Update Password</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <CardDescription>Add an extra layer of security to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">2FA Status</p>
                <p className="text-sm text-muted-foreground">Two-factor authentication is not enabled</p>
              </div>
              <Button>Enable 2FA</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Appearance Tab */}
      <TabsContent value="appearance" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Customize how ChainReact looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mounted ? (
              <div className="grid grid-cols-3 gap-4">
                <div
                  onClick={() => setTheme('light')}
                  className={`cursor-pointer border-2 ${theme === 'light' ? 'border-primary' : 'border-transparent hover:border-muted'} rounded-lg p-4 text-center transition-all`}
                >
                  <div className="w-full h-20 bg-white border border-gray-300 rounded mb-2" />
                  <p className="text-sm font-medium">Light</p>
                </div>
                <div
                  onClick={() => setTheme('dark')}
                  className={`cursor-pointer border-2 ${theme === 'dark' ? 'border-primary' : 'border-transparent hover:border-muted'} rounded-lg p-4 text-center transition-all`}
                >
                  <div className="w-full h-20 bg-slate-900 border border-slate-700 rounded mb-2" />
                  <p className="text-sm font-medium">Dark</p>
                </div>
                <div
                  onClick={() => setTheme('system')}
                  className={`cursor-pointer border-2 ${theme === 'system' ? 'border-primary' : 'border-transparent hover:border-muted'} rounded-lg p-4 text-center transition-all`}
                >
                  <div className="w-full h-20 bg-gradient-to-br from-white to-slate-900 border border-gray-400 rounded mb-2" />
                  <p className="text-sm font-medium">System</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="border-2 border-transparent rounded-lg p-4 text-center">
                  <div className="w-full h-20 bg-muted border rounded mb-2 animate-pulse" />
                  <p className="text-sm font-medium text-muted-foreground">Light</p>
                </div>
                <div className="border-2 border-transparent rounded-lg p-4 text-center">
                  <div className="w-full h-20 bg-muted border rounded mb-2 animate-pulse" />
                  <p className="text-sm font-medium text-muted-foreground">Dark</p>
                </div>
                <div className="border-2 border-transparent rounded-lg p-4 text-center">
                  <div className="w-full h-20 bg-muted border rounded mb-2 animate-pulse" />
                  <p className="text-sm font-medium text-muted-foreground">System</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
