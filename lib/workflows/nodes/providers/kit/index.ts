import { Users, BarChart } from "lucide-react"
import { NodeComponent } from "../../types"

export const kitNodes: NodeComponent[] = [
  {
    type: "kit_trigger_new_subscriber",
    title: "New subscriber added",
    description: "Triggers when a new subscriber is added",
    icon: Users,
    providerId: "kit",
    category: "Email",
    isTrigger: true,
    comingSoon: true,
  },
  {
    type: "kit_trigger_tag_added",
    title: "Tag added to a subscriber",
    description: "Triggers when a tag is added to a subscriber",
    icon: BarChart,
    providerId: "kit",
    category: "Email",
    isTrigger: true,
    comingSoon: true,
  }
]