"use client"

import { useEffect, useMemo, useState } from "react"

import { cn } from "@/lib/utils"

type ConversationHistoryEntry = {
  role: string
  content: string
  timestamp?: string
}

type Conversation = {
  id: string
  status: string
  workflowId: string | null
  executionId: string | null
  nodeId: string | null
  userId: string | null
  channelType: string | null
  channelId: string | null
  guildId: string | null
  timeoutAt: string | null
  timeoutMinutes: number | null
  timeoutAction: string | null
  startedAt: string | null
  updatedAt: string | null
  continuationSignals: string[]
  extractVariables: Record<string, any>
  contextData: string | null
  lastMessage: ConversationHistoryEntry | null
  history: ConversationHistoryEntry[]
}

type StatusResponse = {
  conversations: Conversation[]
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  timeout: "bg-amber-100 text-amber-800",
  completed: "bg-sky-100 text-sky-800",
  cancelled: "bg-rose-100 text-rose-800",
}

export function HitlDebugDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/test/hitl/status")
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data = (await response.json()) as StatusResponse
      setConversations(data.conversations || [])
      setLastUpdated(new Date())
      setError(null)
    } catch (err: any) {
      setError(err?.message || "Failed to load status")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchStatus()

    const interval = setInterval(() => {
      void fetchStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const grouped = useMemo(() => {
    return conversations.reduce<Record<string, Conversation[]>>((acc, conversation) => {
      const key = conversation.workflowId || "unknown"
      acc[key] = acc[key] || []
      acc[key].push(conversation)
      return acc
    }, {})
  }, [conversations])

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading HITL status…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Last refreshed</p>
            <p className="text-sm text-foreground">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
            </p>
          </div>
          <button
            onClick={() => fetchStatus()}
            className="rounded-md border px-3 py-1 text-sm font-medium text-foreground hover:bg-muted"
          >
            Refresh now
          </button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted-foreground">
          No HITL conversations found yet. Trigger the “Ask Human via Chat” node and watch this panel
          update in real time.
        </div>
      ) : (
        Object.entries(grouped).map(([workflowId, items]) => (
          <div key={workflowId} className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Workflow</p>
              <p className="text-sm text-muted-foreground">{workflowId}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((conversation) => (
                <ConversationCard key={conversation.id} conversation={conversation} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function ConversationCard({ conversation }: { conversation: Conversation }) {
  const {
    status,
    executionId,
    nodeId,
    channelType,
    channelId,
    guildId,
    timeoutMinutes,
    timeoutAction,
    continuationSignals,
    extractVariables,
    history,
    startedAt,
    updatedAt,
  } = conversation

  const statusColor = STATUS_COLORS[status] || "bg-slate-200 text-slate-800"

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Conversation</p>
          <p className="text-xs text-muted-foreground">{conversation.id}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
            statusColor
          )}
        >
          {status}
        </span>
      </div>

      <div className="grid gap-3 px-4 py-3 text-sm">
        <InfoRow label="Execution">{executionId || "—"}</InfoRow>
        <InfoRow label="Node">{nodeId || "—"}</InfoRow>
        <InfoRow label="Channel">
          {channelType ? `${channelType} • ${channelId || "?"}` : "—"}
          {guildId && <span className="ml-1 text-xs text-muted-foreground">({guildId})</span>}
        </InfoRow>
        <InfoRow label="Timeout">
          {timeoutMinutes ? `${timeoutMinutes} min` : "Never"} · {timeoutAction || "cancel"}
        </InfoRow>
        <InfoRow label="Continuation">{continuationSignals.join(", ") || "default set"}</InfoRow>
        <InfoRow label="Started">{startedAt ? new Date(startedAt).toLocaleString() : "—"}</InfoRow>
        <InfoRow label="Updated">{updatedAt ? new Date(updatedAt).toLocaleString() : "—"}</InfoRow>
      </div>

      <div className="border-t px-4 py-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Conversation</p>
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1 text-sm">
          {history.length === 0 && (
            <p className="text-muted-foreground">No messages logged yet.</p>
          )}
          {history.map((entry, index) => (
            <div
              key={`${entry.timestamp || index}-${entry.role}`}
              className={cn(
                "rounded-md border px-3 py-2",
                entry.role === "assistant" ? "bg-slate-50" : "bg-white"
              )}
            >
              {entry.role && (
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {entry.role}
                </p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm">{entry.content}</p>
              {entry.timestamp && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Extracted variables</p>
        {Object.keys(extractVariables).length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">None captured yet.</p>
        ) : (
          <div className="mt-2 grid gap-2">
            {Object.entries(extractVariables).map(([key, value]) => (
              <div key={key} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <p className="font-medium">{key}</p>
                <p className="text-muted-foreground">
                  {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="text-foreground">{children}</div>
    </div>
  )
}
