import { NextResponse } from "next/server"

export async function GET() {
  const chartData = [
    { name: "Mon", workflows: 0, executions: 0 },
    { name: "Tue", workflows: 0, executions: 0 },
    { name: "Wed", workflows: 0, executions: 0 },
    { name: "Thu", workflows: 0, executions: 0 },
    { name: "Fri", workflows: 0, executions: 0 },
    { name: "Sat", workflows: 0, executions: 0 },
    { name: "Sun", workflows: 0, executions: 0 },
  ]

  return NextResponse.json({ success: true, data: chartData })
}
