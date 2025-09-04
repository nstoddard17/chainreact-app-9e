import { NodeComponent } from "../../types"

// Generic triggers have been moved to the automation provider
// This file is kept for backward compatibility but exports an empty array
// All trigger nodes (webhook, schedule, manual) are now in providers/automation/
export const genericTriggers: NodeComponent[] = []