import { requireUsername } from "@/utils/checkUsername"
import ProfileContent from "@/components/profile/ProfileContent"

export default async function ProfilePage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <ProfileContent />
} 