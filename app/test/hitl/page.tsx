import { HitlTestHarness } from "@/components/test/HitlTestHarness"
import { HitlDebugDashboard } from "@/components/test/HitlDebugDashboard"

export const dynamic = "force-dynamic"

export default function HitlTestPage() {
  return (
    <div className="space-y-10 p-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Ask Human via Chat — Test Console</h1>
        <p className="text-muted-foreground">
          Configure the HITL node, launch a test conversation, and watch every event update in real
          time—without bouncing between tabs.
        </p>
      </section>

      <HitlTestHarness />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Live Execution Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Below you can inspect the database snapshot for every HITL conversation (status,
            timeout, continuation signals, extracted variables, and the full Discord transcript).
          </p>
        </div>
        <HitlDebugDashboard />
      </section>
    </div>
  )
}
