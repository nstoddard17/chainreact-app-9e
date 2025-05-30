import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface WorkflowCommentsProps {
  workflowId: string
  comments: any[]
}

export function WorkflowComments({ workflowId, comments }: WorkflowCommentsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>
      <CardContent>
        <p>No comments yet</p>
      </CardContent>
    </Card>
  )
}
