declare global {
  var presenceCleanupInterval: NodeJS.Timeout | undefined
}

export {}

import type { Flow } from "@/src/lib/workflows/builder/schema"

declare module "@/scripts/seeds/seed-flow-v2" {
  export function main(): Promise<void>
}

