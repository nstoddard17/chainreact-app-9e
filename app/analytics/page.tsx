import { requireUsername } from "@/utils/checkUsername"
import AnalyticsContent from "@/components/analytics/AnalyticsContent"

export default async function AnalyticsPage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <AnalyticsContent />
}
