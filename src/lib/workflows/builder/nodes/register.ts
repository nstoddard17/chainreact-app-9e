import { NODES } from "./index"
import { registerNodeDefinition } from "../runner/registry"

let registered = false

export function registerDefaultNodes() {
  if (registered) return
  Object.values(NODES).forEach((definition) => {
    registerNodeDefinition(definition)
  })
  registered = true
}
