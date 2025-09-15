import { Zap } from "lucide-react"
import { NodeComponent } from "../../types"

// Import action schemas
import { defaultActionSchema } from "./actions/default.schema"

// Apply icons to actions
const aiAction: NodeComponent = {
  ...defaultActionSchema,
  icon: Zap
}

// Export all ai nodes
export const aiNodes: NodeComponent[] = [
  aiAction,
]

// Export individual nodes for direct access
export {
  aiAction,
}