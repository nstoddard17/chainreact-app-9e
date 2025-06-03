import { SessionChecker } from "./SessionChecker"

export default function IntegrationsContent() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">Connect your favorite tools and services</p>
      </div>

      <SessionChecker />

      {/* Rest of the existing content */}
    </div>
  )
}
