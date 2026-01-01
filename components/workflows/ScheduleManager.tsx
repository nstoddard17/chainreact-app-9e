"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Plus, Clock, Edit, Trash2 } from "lucide-react"
import { createClient } from "@/utils/supabaseClient"

import { logger } from '@/lib/utils/logger'

interface Schedule {
  id: string
  cron_expression: string
  timezone: string
  enabled: boolean
  next_run: string | null
  last_run: string | null
}

interface ScheduleManagerProps {
  workflowId: string
}

export default function ScheduleManager({ workflowId }: ScheduleManagerProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [formData, setFormData] = useState({
    cron_expression: "0 9 * * 1-5",
    timezone: "UTC",
    enabled: true,
  })

  const timezones = [
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
  ]

  const cronPresets = [
    { label: "Every minute", value: "* * * * *" },
    { label: "Every 5 minutes", value: "*/5 * * * *" },
    { label: "Every hour", value: "0 * * * *" },
    { label: "Daily at 9 AM", value: "0 9 * * *" },
    { label: "Weekdays at 9 AM", value: "0 9 * * 1-5" },
    { label: "Weekly on Monday", value: "0 9 * * 1" },
    { label: "Monthly on 1st", value: "0 9 1 * *" },
  ]

  useEffect(() => {
    fetchSchedules()
  }, [workflowId])

  const fetchSchedules = async () => {
    const supabase = createClient()

    try {
      const { data, error } = await supabase
        .from("workflows_schedules")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: false })

      if (error) throw error

      setSchedules(data || [])
    } catch (error) {
      logger.error("Failed to fetch schedules:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()

    try {
      if (editingSchedule) {
        const { error } = await supabase.from("workflow_schedules").update(formData).eq("id", editingSchedule.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("workflow_schedules").insert({
          workflow_id: workflowId,
          ...formData,
        })

        if (error) throw error
      }

      await fetchSchedules()
      setIsOpen(false)
      setEditingSchedule(null)
      setFormData({ cron_expression: "0 9 * * 1-5", timezone: "UTC", enabled: true })
    } catch (error) {
      logger.error("Failed to save schedule:", error)
    }
  }

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    setFormData({
      cron_expression: schedule.cron_expression,
      timezone: schedule.timezone,
      enabled: schedule.enabled,
    })
    setIsOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this schedule?")) {
      const supabase = createClient()

      try {
        const { error } = await supabase.from("workflow_schedules").delete().eq("id", id)

        if (error) throw error

        await fetchSchedules()
      } catch (error) {
        logger.error("Failed to delete schedule:", error)
      }
    }
  }

  const toggleSchedule = async (id: string, enabled: boolean) => {
    const supabase = createClient()

    try {
      const { error } = await supabase.from("workflow_schedules").update({ enabled }).eq("id", id)

      if (error) throw error

      await fetchSchedules()
    } catch (error) {
      logger.error("Failed to toggle schedule:", error)
    }
  }

  return (
    <Card className="bg-card rounded-2xl shadow-lg border border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-slate-600" />
            <CardTitle className="text-xl font-semibold text-slate-900">Schedules</CardTitle>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                onClick={() => {
                  setEditingSchedule(null)
                  setFormData({ cron_expression: "0 9 * * 1-5", timezone: "UTC", enabled: true })
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Schedule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingSchedule ? "Edit Schedule" : "Add Schedule"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="preset">Quick Presets</Label>
                  <Select onValueChange={(value) => setFormData({ ...formData, cron_expression: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {cronPresets.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cron">Cron Expression</Label>
                  <Input
                    id="cron"
                    value={formData.cron_expression}
                    onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                    placeholder="0 9 * * 1-5"
                    required
                  />
                  <p className="text-xs text-slate-500">Format: minute hour day month weekday</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={formData.timezone}
                    onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="enabled"
                    checked={formData.enabled}
                    onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
                  />
                  <Label htmlFor="enabled">Enabled</Label>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">{editingSchedule ? "Update" : "Create"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
              {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading schedules...</div>
                ) : schedules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
            No schedules configured. Add a schedule to run this workflow automatically.
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Badge variant={schedule.enabled ? "default" : "secondary"}>
                    {schedule.enabled ? "Active" : "Disabled"}
                  </Badge>
                  <div>
                    <div className="font-medium text-slate-900">{schedule.cron_expression}</div>
                    <div className="text-sm text-slate-500">
                      {schedule.timezone} • Next:{" "}
                      {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : "Not scheduled"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={schedule.enabled}
                    onCheckedChange={(enabled) => toggleSchedule(schedule.id, enabled)}
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(schedule)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(schedule.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
