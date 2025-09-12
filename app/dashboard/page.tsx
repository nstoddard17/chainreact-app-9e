import { requireUsername } from "@/utils/checkUsername"
import DashboardContent from "@/components/dashboard/DashboardContent"

export default async function DashboardPage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <DashboardContent />
}
