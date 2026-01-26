export type PollingContext = {
  trigger: any
  userRole: string
  now: number
}

export type PollingHandler = {
  id: string
  canHandle: (trigger: any) => boolean
  getIntervalMs: (userRole: string) => number
  poll: (context: PollingContext) => Promise<void>
}

const handlers: PollingHandler[] = []

export function registerPollingHandler(handler: PollingHandler): void {
  handlers.push(handler)
}

export function findPollingHandler(trigger: any): PollingHandler | null {
  return handlers.find(handler => handler.canHandle(trigger)) || null
}

export function getPollingHandlers(): PollingHandler[] {
  return [...handlers]
}
