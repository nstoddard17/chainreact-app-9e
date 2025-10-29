import { httpTriggerNode } from "./httpTrigger"
import { aiGenerateNode } from "./aiGenerate"
import { mapperNode } from "./mapper"
import { ifSwitchNode } from "./ifSwitch"
import { httpRequestNode } from "./httpRequest"
import { notifyNode } from "./notify"
import type { NodeCatalog } from "./types"

export const NODES: NodeCatalog = {
  [httpTriggerNode.type]: httpTriggerNode,
  [aiGenerateNode.type]: aiGenerateNode,
  [mapperNode.type]: mapperNode,
  [ifSwitchNode.type]: ifSwitchNode,
  [httpRequestNode.type]: httpRequestNode,
  [notifyNode.type]: notifyNode,
}

export * from "./types"
