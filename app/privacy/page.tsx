import { PrivacyPolicy } from "@/components/legal/PrivacyPolicy"
import { StandardHeader } from "@/components/layout/StandardHeader"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      <StandardHeader />
      <PrivacyPolicy />
    </div>
  )
}
