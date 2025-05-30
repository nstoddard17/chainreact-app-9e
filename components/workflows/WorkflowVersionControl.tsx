import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface WorkflowVersionControlProps {
  workflowId: string
  versions: any[]
}

export function WorkflowVersionControl({ workflowId, versions }: WorkflowVersionControlProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Version Control</CardTitle>
      </CardHeader>
      <CardContent>
        <p>No versions yet</p>
      </CardContent>
    </Card>
  )
}
