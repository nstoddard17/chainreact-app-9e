"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Sparkles } from "lucide-react"
import { RoleBadge } from "@/components/ui/role-badge"
import { type UserRole } from "@/lib/utils/roles"

import { logger } from '@/lib/utils/logger'

export default function ProfileSettings() {
  const { user, profile, updateProfile } = useAuthStore()
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    company: "",
    job_title: "",
    secondary_email: "",
    phone_number: "",
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        company: profile.company || "",
        job_title: profile.job_title || "",
        secondary_email: profile.secondary_email || "",
        phone_number: profile.phone_number || "",
      })
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSuccess(false)
    setError(null)

    // Set a timeout to prevent getting stuck in loading state
    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false)
        setError("Request timed out. Please try again.")
      }
    }, 10000) // 10 seconds timeout

    try {
      // Combine first_name and last_name to create full_name
      const updatedData = {
        ...formData,
        full_name: `${formData.first_name} ${formData.last_name}`.trim()
      }
      
      await updateProfile(updatedData)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (error) {
      logger.error("Failed to update profile:", error)
      setError(error instanceof Error ? error.message : "Failed to update profile. Please try again.")
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  const userRole = (profile?.role as UserRole) || 'free'
  const isBetaTester = userRole === 'beta-pro'

  return (
    <div className="space-y-6">
      {/* Membership Status Card - Show for beta testers */}
      {isBetaTester && (
        <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold">Membership Status</CardTitle>
              <RoleBadge role={userRole} size="md" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-2 rounded-full">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Thank you for being a beta tester! You have access to all Pro features while helping us improve ChainReact.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card rounded-2xl shadow-lg border border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold text-card-foreground">Profile Settings</CardTitle>
            {!isBetaTester && <RoleBadge role={userRole} size="sm" />}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={profile?.username || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Your username cannot be changed.</p>
            </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="Your first name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Your last name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Your company name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job_title">Job Title</Label>
            <Input
              id="job_title"
              value={formData.job_title}
              onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
              placeholder="Your job title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              type="tel"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              placeholder="Your phone number"
            />
            <p className="text-xs text-muted-foreground">Optional phone number for contact purposes.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={user?.email || ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Your email address cannot be changed.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondary_email">Secondary Email</Label>
            <Input
              id="secondary_email"
              type="email"
              value={formData.secondary_email}
              onChange={(e) => setFormData({ ...formData, secondary_email: e.target.value })}
              placeholder="Your secondary email address"
            />
            <p className="text-xs text-muted-foreground">Optional backup email address for notifications.</p>
          </div>

          <div className="flex items-center space-x-4">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            {success && <span className="text-green-600 dark:text-green-400">Profile updated successfully!</span>}
            {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
    </div>
  )
}
