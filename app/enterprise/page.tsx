import type { Metadata } from "next"
import { EnterpriseContent } from "@/components/enterprise/EnterpriseContent"

export const metadata: Metadata = {
  title: "Enterprise - ChainReact",
  description: "Enterprise-grade security, compliance, and deployment options",
}

export default function EnterprisePage() {
  return <EnterpriseContent />
}
