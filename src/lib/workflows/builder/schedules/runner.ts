import { randomUUID } from "crypto"

import { createSupabaseServiceClient } from "@/utils/supabase/server"
import { getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { getLatestPublishedRevision } from "@/src/lib/workflows/builder/publish"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { computeNextRun } from "./index"
import { executeRun, createSupabaseRunStore } from "@/src/lib/workflows/builder/runner/execute"

export async function runDueSchedules(now: Date = new Date()) {
  const client = await createSupabaseServiceClient()
  const repository = await getFlowRepository(client)

  const nowIso = now.toISOString()

  const { data: schedules, error } = await client
    .from("flow_v2_schedules")
    .select("id, flow_id, cron_expression, timezone, enabled, revision_id")
    .eq("enabled", true)
    .lte("next_run_at", nowIso)

  if (error) throw new Error(error.message)
  if (!schedules || schedules.length === 0) {
    return { triggered: 0 }
  }

  const store = createSupabaseRunStore(client)
  let triggered = 0

  for (const schedule of schedules) {
    try {
      let revision = schedule.revision_id
        ? await repository.loadRevisionById(schedule.revision_id)
        : null

      if (!revision) {
        const publishedId = await getLatestPublishedRevision(schedule.flow_id)
        if (publishedId) {
          revision = await repository.loadRevisionById(publishedId)
        }
      }

      if (!revision) {
        revision = await repository.loadRevision({ flowId: schedule.flow_id })
      }

      if (!revision) {
        continue
      }

      await executeRun({
        flow: FlowSchema.parse(revision.graph),
        revisionId: revision.id,
        runId: randomUUID(),
        inputs: {},
        globals: {},
        store,
      })

      triggered += 1

      const nextRunAt = computeNextRun(schedule.cron_expression, schedule.timezone)
      await client
        .from("flow_v2_schedules")
        .update({
          last_run_at: nowIso,
          next_run_at: nextRunAt,
        })
        .eq("id", schedule.id)
    } catch (error) {
      console.error("Failed to execute schedule", schedule.id, error)
    }
  }

  return { triggered }
}
