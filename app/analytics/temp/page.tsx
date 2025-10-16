"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function AnalyticsTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Analytics"
      description="Preview of the upcoming analytics workspace — cleaner modules for adoption, performance, and experiment tracking."
      actions={<TempButton>Explore reports</TempButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">What&apos;s changing?</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Segment automations by business objective, not raw trigger IDs.</li>
            <li>Layer in benchmark insights and anomaly detection per workflow.</li>
            <li>Provide executive summaries with suggested follow-up actions.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Feedback welcome</p>
          <p className="mt-2">
            Drop product requirements or datasets you want in the beta and we&apos;ll incorporate them before production rollout.
          </p>
        </div>
      </div>
    </TempPlaceholder>
  )
}

