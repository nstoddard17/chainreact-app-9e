"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { ThemeSlideToggle } from "@/components/ui/theme-slide-toggle"

export default function ProfileSettings() {
  const { user, profile, updateProfile } = useAuthStore()
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    company: "",
    job_title: "",
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        company: profile.company || "",
        job_title: profile.job_title || "",
      })
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSuccess(false)

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
      console.error("Failed to update profile:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-card rounded-2xl shadow-lg border border-border">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-card-foreground">Profile Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={user?.email || ""} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Your email address cannot be changed.</p>
          </div>

          <div className="space-y-2">
            <ThemeSlideToggle />
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
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
