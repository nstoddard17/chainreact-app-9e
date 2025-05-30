import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface WorkflowDebuggerProps {
  workflowId: string
  debugSession: any
}

export function WorkflowDebugger({ workflowId, debugSession }: WorkflowDebuggerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Debugger</CardTitle>
      </CardHeader>
      <CardContent>
        <p>No debug session active</p>
      </CardContent>
    </Card>
  )
}
