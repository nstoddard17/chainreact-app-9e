"use client"

interface Collaborator {
  id: string
  user_id: string
  user_name: string
  user_avatar?: string
  cursor_position?: { x: number; y: number }
  selected_nodes: string[]
  color: string
}

interface CollaboratorCursorsProps {
  collaborators: Collaborator[]
}

export function CollaboratorCursors({ collaborators }: CollaboratorCursorsProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {collaborators
        .filter((collaborator): collaborator is Collaborator & { cursor_position: { x: number; y: number } } => 
          collaborator.cursor_position !== undefined && collaborator.cursor_position !== null
        )
        .map((collaborator) => (
          <div
            key={collaborator.id}
            className="absolute transition-all duration-200 ease-out"
            style={{
              left: collaborator.cursor_position.x,
              top: collaborator.cursor_position.y,
              transform: "translate(-2px, -2px)",
            }}
          >
        
          {/* Cursor */}
          <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm">
            <path
              d="M0 0L0 16L5 12L8 16L12 14L8 10L16 10L0 0Z"
              fill={collaborator.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>

          {/* User name label */}
          <div
            className="absolute top-5 left-2 px-2 py-1 text-xs text-white rounded shadow-lg whitespace-nowrap"
            style={{ backgroundColor: collaborator.color }}
          >
            {collaborator.user_name}
          </div>
        </div>
      ))}
    </div>
  )
}
