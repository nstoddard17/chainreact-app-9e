import { Metadata } from "next"
import BetaTestersContent from "@/components/admin/BetaTestersContent"

export const metadata: Metadata = {
  title: "Beta Testers Management | ChainReact Admin",
  description: "Manage beta testers and their access",
}

export default function BetaTestersPage() {
  return <BetaTestersContent />
}