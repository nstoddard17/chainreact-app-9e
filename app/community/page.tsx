import { requireUsername } from "@/utils/checkUsername"
import CommunityContent from "@/components/community/CommunityContent"

export default async function CommunityPage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <CommunityContent />
}
