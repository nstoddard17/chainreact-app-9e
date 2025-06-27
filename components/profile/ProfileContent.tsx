"use client"

import AppLayout from "@/components/layout/AppLayout"
import ProfileSettings from "@/components/settings/ProfileSettings"

export default function ProfileContent() {
  return (
    <AppLayout title="Profile">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Profile</h1>
          <p className="text-muted-foreground mt-2">Manage your profile information and preferences.</p>
        </div>

        <ProfileSettings />
      </div>
    </AppLayout>
  )
} 