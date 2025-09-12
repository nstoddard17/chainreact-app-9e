import type { Metadata } from "next"
import { requireUsername } from "@/utils/checkUsername"
import { EnterpriseContent } from "@/components/enterprise/EnterpriseContent"

export const metadata: Metadata = {
  title: "Enterprise - ChainReact",
  description: "Enterprise-grade security, compliance, and deployment options",
}

export default async function EnterprisePage() {
  // This will check for username and redirect if needed
  await requireUsername()
  
  return <EnterpriseContent />
}
