"use client"

import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { User, Bell, Shield, Palette, Trash2 } from "lucide-react"

export function SettingsContent() {
  const { profile } = useAuthStore()
  const [notifications, setNotifications] = useState({
    email: true,
    slack: false,
    workflow_success: true,
    workflow_failure: true,
    weekly_digest: true
  })

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
              <Avatar className="w-20 h-20">
                <AvatarFallback className="text-2xl">
                  {profile?.username?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <Button variant="outline" size="sm">Change Photo</Button>
                <p className="text-sm text-muted-foreground mt-1">JPG, GIF or PNG. Max size of 800KB</p>
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
            <div className="grid grid-cols-3 gap-4">
              <div className="cursor-pointer border-2 border-primary rounded-lg p-4 text-center">
                <div className="w-full h-20 bg-background border rounded mb-2" />
                <p className="text-sm font-medium">Light</p>
              </div>
              <div className="cursor-pointer border-2 border-transparent hover:border-muted rounded-lg p-4 text-center">
                <div className="w-full h-20 bg-slate-900 border rounded mb-2" />
                <p className="text-sm font-medium">Dark</p>
              </div>
              <div className="cursor-pointer border-2 border-transparent hover:border-muted rounded-lg p-4 text-center">
                <div className="w-full h-20 bg-gradient-to-br from-background to-slate-900 border rounded mb-2" />
                <p className="text-sm font-medium">System</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
