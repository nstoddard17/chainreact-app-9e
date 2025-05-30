import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface NodeSuggestionsProps {
  currentNode?: any
  workflow?: any
  onSuggestionSelect?: (suggestion: any) => void
}

export function NodeSuggestions({ currentNode, workflow, onSuggestionSelect }: NodeSuggestionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Node Suggestions</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Get AI-powered suggestions for workflow nodes</p>
      </CardContent>
    </Card>
  )
}
