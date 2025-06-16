import { NextResponse } from "next/server"

export async function GET() {
  const executions = [
    {
      id: "1",
      status: "success",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      execution_time_ms: 1200,
    },
    {
      id: "2",
      status: "error",
      started_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      completed_at: new Date().toISOString(),
      execution_time_ms: 2000,
      error_message: "Sample error",
    },
  ]

  return NextResponse.json(executions)
}
