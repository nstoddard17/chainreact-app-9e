export default function WorkflowToolbar() {
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
      <button className="px-3 py-1 bg-blue-500 text-white rounded">Save</button>
      <button className="px-3 py-1 bg-gray-200 rounded">Undo</button>
      <button className="px-3 py-1 bg-gray-200 rounded">Redo</button>
    </div>
  )
}
