import { requireUsername } from "@/utils/checkUsername"
import TeamsContent from "@/components/teams/TeamsContent"

export default async function TeamsPage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <TeamsContent />
}
