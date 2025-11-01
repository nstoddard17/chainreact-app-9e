import { randomUUID } from "crypto"
import cronParser from "cron-parser"

import { createSupabaseServiceClient } from "@/utils/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface ScheduleRow {
  id: string
  flow_id: string
  cron_expression: string
  timezone: string
  enabled: boolean
  last_run_at?: string | null
  next_run_at?: string | null
  revision_id?: string | null
  created_at: string
}

export interface ScheduleInput {
  flowId: string
  cronExpression: string
  timezone?: string
  enabled?: boolean
  createdBy?: string
  workspaceId?: string
}

export function validateCronExpression(expression: string): boolean {
  try {
    cronParser.parseExpression(expression)
    return true
  } catch (error) {
    return false
  }
}

export function computeNextRun(
  cronExpression: string,
  timezone = "UTC",
  fromDate: Date = new Date()
): string {
  const interval = cronParser.parseExpression(cronExpression, {
    tz: timezone,
    currentDate: fromDate,
  })
  return interval.next().toISOString()
}

export function nextRunTimes(cronExpression: string, timezone = "UTC", count = 5): string[] {
  const interval = cronParser.parseExpression(cronExpression, { tz: timezone })
  const times: string[] = []
  for (let i = 0; i < count; i++) {
    times.push(interval.next().toISOString())
  }
  return times
}

async function resolveClient(client?: SupabaseClient<any>) {
  return client ?? (await createSupabaseServiceClient())
}

export async function listSchedules(flowId: string, client?: SupabaseClient<any>) {
  const supabase = await resolveClient(client)
  const { data, error } = await supabase
    .from("flow_v2_schedules")
    .select("id, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at")
    .eq("flow_id", flowId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ScheduleRow[]
}

export async function createSchedule(input: ScheduleInput, client?: SupabaseClient<any>) {
  if (!validateCronExpression(input.cronExpression)) {
    throw new Error("Invalid cron expression")
  }

  const supabase = await resolveClient(client)
  const nextRunAt = computeNextRun(input.cronExpression, input.timezone)

  const { data, error } = await supabase
    .from("flow_v2_schedules")
    .insert({
      id: randomUUID(),
      flow_id: input.flowId,
      cron_expression: input.cronExpression,
      timezone: input.timezone ?? "UTC",
      enabled: input.enabled ?? true,
      next_run_at: nextRunAt,
      created_by: input.createdBy ?? null,
      workspace_id: input.workspaceId ?? null,
    })
    .select("id, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at")
    .single()

  if (error) throw new Error(error.message)
  return data as ScheduleRow
}

export async function updateSchedule(id: string, updates: Partial<ScheduleInput>, client?: SupabaseClient<any>) {
  const supabase = await resolveClient(client)
  const { data: existing, error: existingError } = await supabase
    .from("flow_v2_schedules")
    .select("id, cron_expression, timezone, enabled, last_run_at, next_run_at, flow_id, created_at")
    .eq("id", id)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (!existing) throw new Error("Schedule not found")

  if (updates.cronExpression && !validateCronExpression(updates.cronExpression)) {
    throw new Error("Invalid cron expression")
  }

  const cronExpression = updates.cronExpression ?? existing.cron_expression
  const timezone = updates.timezone ?? (existing.timezone as string)
  const nextRunAt = computeNextRun(cronExpression, timezone)

  const { data, error } = await supabase
    .from("flow_v2_schedules")
    .update({
      cron_expression: cronExpression,
      timezone,
      enabled: updates.enabled ?? existing.enabled,
      next_run_at,
    })
    .eq("id", id)
    .select("id, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at")
    .single()

  if (error) throw new Error(error.message)
  return data as ScheduleRow
}

export async function deleteSchedule(id: string, client?: SupabaseClient<any>) {
  const supabase = await resolveClient(client)
  const { error } = await supabase
    .from("flow_v2_schedules")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
}
