import type { Metadata } from "next"
import { PlansPage } from "@/components/pricing/PlansPage"

export const metadata: Metadata = {
  title: "Pricing - ChainReact",
  description:
    "Simple, transparent pricing. Start free with AI workflow building, scale when you're ready. Plans from $0 to enterprise.",
  openGraph: {
    title: "Pricing - ChainReact",
    description:
      "Start free with AI workflow building. Scale when you're ready.",
    url: "https://chainreact.app/pricing",
  },
}

export default function PricingPage() {
  return <PlansPage />
}
