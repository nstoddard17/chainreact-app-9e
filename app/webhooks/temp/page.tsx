"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function WebhooksTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Webhooks"
      description="Showcasing the cleaner webhook monitoring surface with delivery traces, retries, and schema visibility."
      actions={<TempButton>View delivery log</TempButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Endpoint pipeline</p>
          <p className="mt-2 text-sm text-slate-600">
            Visualise which automations rely on a given webhook along with secret rotation reminders and replay tooling.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Incoming security</p>
          <p className="mt-2 text-sm text-slate-600">
            mTLS certificates, IP allow lists, and payload inspectors appear here for faster debugging.
          </p>
        </div>
      </div>
    </TempPlaceholder>
  )
}

