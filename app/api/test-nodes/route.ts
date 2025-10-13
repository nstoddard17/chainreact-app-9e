import { NextResponse } from "next/server"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

export async function GET() {
  const aiNodes = ALL_NODE_COMPONENTS.filter(n => n.providerId === 'ai')
  const logicNodes = ALL_NODE_COMPONENTS.filter(n => n.providerId === 'logic')
  const coreNodes = ALL_NODE_COMPONENTS.filter(n => !n.providerId && ['webhook', 'schedule', 'manual'].includes(n.type))
  
  return jsonResponse({
    total: ALL_NODE_COMPONENTS.length,
    ai: {
      count: aiNodes.length,
      nodes: aiNodes.map(n => ({ type: n.type, title: n.title, isTrigger: n.isTrigger }))
    },
    logic: {
      count: logicNodes.length,
      nodes: logicNodes.map(n => ({ type: n.type, title: n.title, isTrigger: n.isTrigger }))
    },
    core: {
      count: coreNodes.length,
      nodes: coreNodes.map(n => ({ type: n.type, title: n.title, isTrigger: n.isTrigger }))
    }
  })
}