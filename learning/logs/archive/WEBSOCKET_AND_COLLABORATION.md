# WebSocket Migration & Real-Time Collaboration Guide

## 🔌 Switching from SSE to WebSocket

### How Much Work Is It?

**TL;DR: 2-4 hours of focused work + testing**

The migration is **relatively straightforward** because we designed the SSE implementation to be easily upgradeable. Here's the breakdown:

---

### Migration Effort Breakdown

#### 1. **Backend Changes** (1-2 hours)

**Current SSE:**
```typescript
// app/api/ai/stream-workflow/route.ts
export async function POST(request) {
  const stream = new ReadableStream({
    async start(controller) {
      // Send SSE events
      controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
    }
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  })
}
```

**New WebSocket:**
```typescript
// Need to create custom server in Next.js
// app/api/ai/ws-workflow/route.ts won't work for WS
// Instead, create /server.ts at root

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  // WebSocket server
  const wss = new WebSocketServer({ server, path: '/api/ai/ws' })

  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      const data = JSON.parse(message.toString())

      if (data.type === 'build_workflow') {
        // Build workflow and send events
        ws.send(JSON.stringify({ type: 'thinking', message: '...' }))
        ws.send(JSON.stringify({ type: 'node_created', node: {...} }))
      }

      if (data.type === 'pause') {
        // Handle pause
      }
    })
  })

  server.listen(3000)
})
```

**Files to Create/Modify:**
- `server.ts` (new, ~150 lines)
- `package.json` - update scripts to use custom server
- Move logic from `stream-workflow/route.ts` to WebSocket handler

---

#### 2. **Frontend Changes** (1 hour)

**Current SSE:**
```typescript
const response = await fetch('/api/ai/stream-workflow', { method: 'POST' })
const reader = response.body.getReader()
while (true) {
  const { value } = await reader.read()
  // Process SSE events
}
```

**New WebSocket:**
```typescript
const ws = new WebSocket('ws://localhost:3000/api/ai/ws')

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'build_workflow',
    prompt: userMessage
  }))
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  // Handle events (same logic as SSE)
}

// Two-way communication!
handlePauseBuilding = () => {
  ws.send(JSON.stringify({ type: 'pause' }))
}
```

**Files to Modify:**
- `NewWorkflowBuilderContent.tsx` - Replace fetch with WebSocket (~30 lines changed)

---

#### 3. **Deployment Changes** (30 min + testing)

**Vercel Deployment:**

Your **Vercel Pro plan** (which you have!) supports WebSocket, but requires:

1. **Enable WebSocket in Vercel**:
   ```json
   // vercel.json
   {
     "functions": {
       "server.ts": {
         "runtime": "nodejs20.x",
         "includeFiles": "**"
       }
     },
     "rewrites": [
       {
         "source": "/api/ai/ws",
         "destination": "/server.ts"
       }
     ]
   }
   ```

2. **Use Vercel's WebSocket Support**:
   - Vercel Pro plan includes WebSocket support ✅
   - Max connection time: 5 minutes (Pro plan)
   - After 5 minutes, connection closes (need to reconnect)

3. **Alternative: Use Vercel + External WebSocket Service**:
   - Keep Next.js on Vercel (SSE for API)
   - Add separate WebSocket server on Railway/Render
   - More complex but unlimited connection time

---

### Total Migration Time

| Task | Time | Difficulty |
|------|------|------------|
| Create WebSocket server | 1-2 hours | Medium |
| Update frontend | 1 hour | Easy |
| Test & deploy | 1 hour | Medium |
| **TOTAL** | **3-4 hours** | **Medium** |

---

## ✅ Is Your Vercel Pro Plan Enough?

**YES! Vercel Pro plan (v8.4) supports WebSocket.**

### Vercel Pro Plan Limits

| Feature | Limit | Our Needs |
|---------|-------|-----------|
| **WebSocket connections** | ✅ Supported | ✅ Yes |
| **Max connection time** | 5 minutes | ⚠️ May need reconnect |
| **Concurrent connections** | 1000 | ✅ More than enough |
| **Edge Functions** | ✅ Supported | ✅ Can use Edge |

### The 5-Minute Limit

Vercel Pro connections auto-close after **5 minutes**. For workflow building:
- **Most workflows build in < 30 seconds** ✅
- **Complex workflows might take 2 minutes** ✅
- **Collaboration sessions could last hours** ⚠️ Need reconnection logic

**Solution:** Implement auto-reconnect:
```typescript
let reconnectAttempts = 0
const maxReconnects = 5

ws.onclose = () => {
  if (reconnectAttempts < maxReconnects) {
    setTimeout(() => {
      reconnectAttempts++
      // Reconnect and resume
      connectWebSocket()
    }, 1000 * reconnectAttempts) // Exponential backoff
  }
}
```

---

## 👥 Real-Time Collaborative Workflow Builder

### Architecture for Multi-User Collaboration

Here's how to implement **Google Docs-style real-time collaboration** for workflows:

---

### Phase 1: Basic Presence (Week 1)

**Goal:** See who else is editing the workflow

```typescript
// Data Structure
interface Presence {
  userId: string
  userName: string
  userColor: string
  cursor: { x: number, y: number }
  currentNode: string | null // Which node they're editing
  lastSeen: Date
}
```

**Implementation:**

```typescript
// Server (WebSocket)
const workflowSessions = new Map<string, Set<WebSocket>>()

wss.on('connection', (ws, req) => {
  const workflowId = getWorkflowId(req)
  const userId = getUserId(req)

  // Add to session
  if (!workflowSessions.has(workflowId)) {
    workflowSessions.set(workflowId, new Set())
  }
  workflowSessions.get(workflowId)!.add(ws)

  // Broadcast presence to all users
  broadcastToWorkflow(workflowId, {
    type: 'user_joined',
    user: {
      userId,
      userName: 'John Doe',
      userColor: '#3B82F6'
    }
  })

  // Handle cursor updates
  ws.on('message', (msg) => {
    const data = JSON.parse(msg)

    if (data.type === 'cursor_move') {
      // Broadcast to others
      broadcastToWorkflow(workflowId, {
        type: 'cursor_update',
        userId,
        cursor: data.cursor
      }, ws) // Exclude sender
    }
  })
})

function broadcastToWorkflow(workflowId: string, message: any, exclude?: WebSocket) {
  const sessions = workflowSessions.get(workflowId)
  if (!sessions) return

  const payload = JSON.stringify(message)
  sessions.forEach(client => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}
```

**Frontend:**

```typescript
// Show other users' cursors
const [collaborators, setCollaborators] = useState<Presence[]>([])

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)

  switch (data.type) {
    case 'user_joined':
      setCollaborators(prev => [...prev, data.user])
      break

    case 'cursor_update':
      setCollaborators(prev =>
        prev.map(c =>
          c.userId === data.userId
            ? { ...c, cursor: data.cursor }
            : c
        )
      )
      break
  }
}

// Track local cursor
onMouseMove = (e) => {
  const cursor = { x: e.clientX, y: e.clientY }
  ws.send(JSON.stringify({
    type: 'cursor_move',
    cursor
  }))
}

// Render cursors
{collaborators.map(user => (
  <div
    key={user.userId}
    style={{
      position: 'absolute',
      left: user.cursor.x,
      top: user.cursor.y,
      pointerEvents: 'none'
    }}
  >
    <div style={{ background: user.userColor }}>
      {user.userName}
    </div>
  </div>
))}
```

---

### Phase 2: Live Edits (Week 2)

**Goal:** See changes from other users in real-time

**Operational Transformation (OT) or Conflict-Free Replicated Data Types (CRDTs)**

For simplicity, use **Last-Write-Wins (LWW)** with timestamps:

```typescript
// Server
ws.on('message', (msg) => {
  const data = JSON.parse(msg)

  if (data.type === 'node_update') {
    // Save to database
    await saveNodeUpdate(data.workflowId, data.nodeId, data.updates)

    // Broadcast to others
    broadcastToWorkflow(data.workflowId, {
      type: 'node_updated',
      nodeId: data.nodeId,
      updates: data.updates,
      userId: data.userId,
      timestamp: Date.now()
    }, ws)
  }
})
```

**Frontend:**

```typescript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)

  if (data.type === 'node_updated') {
    // Update node on canvas
    optimizedOnNodesChange([
      {
        type: 'update',
        id: data.nodeId,
        item: data.updates
      }
    ])

    // Show who made the change
    showToast(`${data.userId} updated ${data.nodeId}`)
  }
}
```

---

### Phase 3: Locking & Conflict Resolution (Week 3)

**Problem:** Two users editing same node simultaneously

**Solution:** Optimistic locking

```typescript
// Server tracks who is editing what
const nodeLocks = new Map<string, string>() // nodeId -> userId

ws.on('message', (msg) => {
  const data = JSON.parse(msg)

  if (data.type === 'start_editing') {
    const currentLock = nodeLocks.get(data.nodeId)

    if (currentLock && currentLock !== data.userId) {
      // Node is locked by someone else
      ws.send(JSON.stringify({
        type: 'edit_denied',
        nodeId: data.nodeId,
        lockedBy: currentLock
      }))
    } else {
      // Grant lock
      nodeLocks.set(data.nodeId, data.userId)
      ws.send(JSON.stringify({
        type: 'edit_granted',
        nodeId: data.nodeId
      }))

      // Notify others
      broadcastToWorkflow(data.workflowId, {
        type: 'node_locked',
        nodeId: data.nodeId,
        userId: data.userId
      }, ws)
    }
  }

  if (data.type === 'stop_editing') {
    nodeLocks.delete(data.nodeId)
    broadcastToWorkflow(data.workflowId, {
      type: 'node_unlocked',
      nodeId: data.nodeId
    })
  }
})
```

**Frontend:**

```typescript
// Visual indicator for locked nodes
{nodes.map(node => (
  <Node
    {...node}
    locked={lockedNodes.includes(node.id)}
    lockedBy={getLockedBy(node.id)}
  />
))}

// Modal when trying to edit locked node
if (lockedBy) {
  return (
    <div>
      {lockedBy} is currently editing this node.
      <button onClick={requestTakeover}>Request Takeover</button>
    </div>
  )
}
```

---

### Complete Collaboration Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     WebSocket Server                    │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Presence   │  │  Live Edits  │  │   Locking    │  │
│  │   Manager   │  │   Manager    │  │   Manager    │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  │
│         ↓                 ↓                  ↓          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Session Manager (Per Workflow)           │  │
│  │  - Track connected users                         │  │
│  │  - Broadcast changes                             │  │
│  │  - Handle disconnects                            │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓ ↑
         ┌────────────────┴─┴────────────────┐
         │                                    │
    ┌────▼─────┐                      ┌──────▼───┐
    │  User A  │                      │  User B  │
    │          │                      │          │
    │  Cursor  │                      │  Cursor  │
    │  Edits   │ ←─ Live Updates ───→ │  Edits   │
    │  Locks   │                      │  Locks   │
    └──────────┘                      └──────────┘
```

---

### Database Schema for Collaboration

```sql
-- Track active sessions
CREATE TABLE workflow_sessions (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  user_id UUID REFERENCES user_profiles(id),
  connected_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  cursor_position JSONB,
  editing_node_id TEXT
);

-- Track node locks
CREATE TABLE node_locks (
  node_id TEXT PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  locked_by UUID REFERENCES user_profiles(id),
  locked_at TIMESTAMP DEFAULT NOW()
);

-- Track change history for conflict resolution
CREATE TABLE workflow_changes (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  user_id UUID REFERENCES user_profiles(id),
  change_type TEXT, -- 'node_created', 'node_updated', 'edge_created', etc.
  node_id TEXT,
  changes JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

## 🎯 Recommended Approach

### Start with What You Have (SSE)

**For Now:**
1. ✅ Use SSE for AI workflow building (already implemented!)
2. ✅ Add pause/interrupt (already implemented!)
3. ✅ No changes needed - it works great

### Add WebSocket When You Need Collaboration

**Later (When You Want Multi-User):**
1. Implement WebSocket server (~3-4 hours)
2. Add presence system (Week 1)
3. Add live edits (Week 2)
4. Add locking (Week 3)

**Total for Full Collaboration: ~3 weeks of focused work**

---

## 💡 Hybrid Approach (Best of Both)

**Use SSE for AI building, WebSocket for collaboration:**

```typescript
// AI Building: Use SSE (one-way, simple)
const sseResponse = await fetch('/api/ai/stream-workflow')

// Collaboration: Use WebSocket (two-way, complex)
const ws = new WebSocket('/api/collab/workflow')

// They work together!
sseResponse.onmessage = (aiEvent) => {
  // AI created a node
  ws.send({ type: 'ai_created_node', node: aiEvent.node })
  // Notify collaborators in real-time
}
```

---

## 📊 Complexity Comparison

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| **AI Streaming** | ✅ Perfect | ✅ Works |
| **Pause/Resume** | ✅ Works | ✅ Better |
| **Multi-User Presence** | ❌ Can't | ✅ Yes |
| **Live Edits** | ❌ Can't | ✅ Yes |
| **Setup Complexity** | ⭐ Simple | ⭐⭐⭐ Complex |
| **Vercel Support** | ✅ Native | ✅ Pro plan |
| **Development Time** | 1 day | 1 week |

---

## 🚀 Final Recommendation

### For AI Workflow Building
**Keep SSE** - It's perfect for this use case!
- Simple
- Works on Vercel Pro
- Already implemented
- Great UX

### For Collaboration
**Add WebSocket later** when you're ready:
- Week 1: Presence (cursors)
- Week 2: Live edits
- Week 3: Locking

### Timeline

```
Month 1: Launch with SSE (already done!)
Month 2: Get user feedback
Month 3: Add WebSocket if users want collaboration
```

---

**You have everything you need right now to launch an amazing real-time AI workflow builder!** 🎉

Collaboration can wait until you validate the core feature with users.
