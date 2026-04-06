"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Sparkles } from "lucide-react"

import { logger } from '@/lib/utils/logger'

export default function ProfileSettings() {
  const { user, profile, updateProfile } = useAuthStore()
  const [formData, setFormData] = useState({
    username: "",
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
        username: profile.username || "",
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

    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false)
        setError("Request timed out. Please try again.")
      }
    }, 10000)

    try {
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

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile section */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Profile</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Your personal information.</p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm text-gray-700 dark:text-gray-300">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="Your username"
                className="max-w-md"
              />
              <p className="text-xs text-gray-400">This is your public display name.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="first_name" className="text-sm text-gray-700 dark:text-gray-300">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name" className="text-sm text-gray-700 dark:text-gray-300">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company" className="text-sm text-gray-700 dark:text-gray-300">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Your company name"
                className="max-w-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="job_title" className="text-sm text-gray-700 dark:text-gray-300">Job Title</Label>
              <Input
                id="job_title"
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                placeholder="Your job title"
                className="max-w-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone_number" className="text-sm text-gray-700 dark:text-gray-300">Phone Number</Label>
              <Input
                id="phone_number"
                type="tel"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="Your phone number"
                className="max-w-md"
              />
            </div>
          </div>
        </div>

        {/* Email section */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Email Address</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">The email address used to sign in to your account.</p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-gray-700 dark:text-gray-300">Primary Email</Label>
              <Input id="email" type="email" value={user?.email || ""} disabled className="bg-gray-50 dark:bg-gray-800 max-w-md" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secondary_email" className="text-sm text-gray-700 dark:text-gray-300">Secondary Email</Label>
              <Input
                id="secondary_email"
                type="email"
                value={formData.secondary_email}
                onChange={(e) => setFormData({ ...formData, secondary_email: e.target.value })}
                placeholder="Backup email address"
                className="max-w-md"
              />
              <p className="text-xs text-gray-400">Optional backup email for notifications.</p>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save profile"
            )}
          </Button>
          {success && <span className="text-sm text-green-600 dark:text-green-400">Profile updated successfully!</span>}
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </form>
    </div>
  )
}
