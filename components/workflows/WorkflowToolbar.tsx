export default function WorkflowToolbar() {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted rounded">
      <span className="text-sm font-medium">Workflow Toolbar:</span>
      <button className="px-3 py-1 bg-background border border-border rounded hover:bg-muted/50">Save</button>
      <button className="px-3 py-1 bg-background border border-border rounded hover:bg-muted/50">Undo</button>
      <button className="px-3 py-1 bg-background border border-border rounded hover:bg-muted/50">Redo</button>
    </div>
  )
}
