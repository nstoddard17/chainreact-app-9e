import { Zap } from "lucide-react"
import { NodeComponent } from "../../types"

import { defaultActionSchema } from "./actions/default.schema"
import { messageActionSchema } from "./actions/message.schema"
import { aiRouterNode } from "./aiRouterNode"
import {
  summarizeActionSchema,
  extractActionSchema,
  sentimentActionSchema,
  translateActionSchema,
  generateActionSchema,
  classifyActionSchema,
} from "./actions/dataProcessing.schema"

const aiMessageAction: NodeComponent = {
  ...messageActionSchema,
  icon: Zap
}

const legacyAgentAction: NodeComponent = {
  ...defaultActionSchema,
  icon: Zap,
  deprecated: true,
  replacedBy: "ai_message",
  description: "Legacy AI Agent (use AI Message or AI Router instead)",
  hideInActionSelection: true
}

export const aiNodes: NodeComponent[] = [
  aiMessageAction,
  aiRouterNode,
  summarizeActionSchema,
  extractActionSchema,
  sentimentActionSchema,
  translateActionSchema,
  generateActionSchema,
  classifyActionSchema,
  legacyAgentAction,
]

export {
  aiMessageAction,
  aiRouterNode,
  summarizeActionSchema,
  extractActionSchema,
  sentimentActionSchema,
  translateActionSchema,
  generateActionSchema,
  classifyActionSchema,
  legacyAgentAction,
}
