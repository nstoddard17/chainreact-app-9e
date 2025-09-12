import { requireUsername } from "@/utils/checkUsername"
import LearnContent from "@/components/learn/LearnContent"

export default async function LearnPage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <LearnContent />
}
