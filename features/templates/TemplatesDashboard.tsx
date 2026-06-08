"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAccountTemplates,
  // aliased: the lib name starts with "use" but it is a plain API call, not a React hook.
  useTemplate as createWorkflowFromTemplateApi,
  forkTemplate,
  updateAccountTemplate,
  deleteAccountTemplate,
  TemplateApiError,
} from "@/lib/api/workflowTemplates";
import { TemplateCard } from "./TemplateCard";
import { toMyTemplateItem, type MarketplaceTemplateSummary, type MyTemplateItem } from "./types";

/**
 * Templates marketplace dashboard (CS-XT-7A) — client orchestrator.
 *
 * Receives SSR-fetched marketplace (official + public) + the active account's own templates.
 * Owns tabs (All / By ChainReact / Community / Your templates), client-side search + sort, and
 * the Use / Fork / publish-toggle / Delete actions against the real template APIs. "Use" opens
 * the created workflow in the builder; "Fork" copies into the active account and refreshes the
 * "Your templates" tab. Tier/limit errors surface as friendly inline toasts.
 */

type Tab = "all" | "official" | "community" | "mine";
type Sort = "popular" | "forks" | "name";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "all", label: "All templates" },
  { id: "official", label: "By ChainReact" },
  { id: "community", label: "Community" },
  { id: "mine", label: "Your templates" },
];

interface Props {
  accountId: string;
  currentUserId: string;
  initialMarketplace: readonly MarketplaceTemplateSummary[];
  initialMine: readonly MyTemplateItem[];
}

export function TemplatesDashboard({ accountId, currentUserId, initialMarketplace, initialMine }: Props) {
  const router = useRouter();
  const [marketplace] = useState<readonly MarketplaceTemplateSummary[]>(initialMarketplace);
  const [mine, setMine] = useState<readonly MyTemplateItem[]>(initialMine);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);

  function flash(message: string, tone: "ok" | "error" = "ok") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }

  const counts = useMemo(
    () => ({
      all: marketplace.length,
      official: marketplace.filter((m) => m.isOfficial).length,
      community: marketplace.filter((m) => !m.isOfficial).length,
      mine: mine.length,
    }),
    [marketplace, mine],
  );

  async function refreshMine() {
    try {
      const rows = await listAccountTemplates(accountId);
      setMine(rows.map((r) => toMyTemplateItem(r, currentUserId)));
    } catch {
      /* keep current list; the action's own toast already informed the user */
    }
  }

  async function handleUse(templateId: string) {
    setBusyId(templateId);
    try {
      const { workflowId } = await createWorkflowFromTemplateApi(templateId, { targetAccountId: accountId });
      flash("Workflow created — opening the builder…");
      router.push(`/workflows/${workflowId}`);
    } catch (err) {
      flash(err instanceof TemplateApiError ? err.message : "Couldn't use that template.", "error");
      setBusyId(null);
    }
  }

  async function handleFork(templateId: string) {
    setBusyId(templateId);
    try {
      await forkTemplate(templateId, { targetAccountId: accountId });
      flash("Saved a private copy to your templates.");
      await refreshMine();
      setTab("mine");
    } catch (err) {
      flash(err instanceof TemplateApiError ? err.message : "Couldn't fork that template.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTogglePublish(item: MyTemplateItem) {
    setBusyId(item.id);
    const next = item.visibility === "private" ? "public" : "private";
    try {
      const updated = await updateAccountTemplate(accountId, item.id, { visibility: next });
      setMine((list) => list.map((m) => (m.id === item.id ? toMyTemplateItem(updated, currentUserId) : m)));
      flash(next === "public" ? "Template published." : "Template set to private.");
    } catch (err) {
      flash(err instanceof TemplateApiError ? err.message : "Couldn't update that template.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: MyTemplateItem) {
    setBusyId(item.id);
    try {
      await deleteAccountTemplate(accountId, item.id);
      setMine((list) => list.filter((m) => m.id !== item.id));
      flash("Template deleted.");
    } catch (err) {
      flash(err instanceof TemplateApiError ? err.message : "Couldn't delete that template.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const visibleMarketplace = useMemo(() => {
    let list = marketplace.slice();
    if (tab === "official") list = list.filter((m) => m.isOfficial);
    if (tab === "community") list = list.filter((m) => !m.isOfficial);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q));
    if (sort === "popular") list.sort((a, b) => b.usageCount - a.usageCount);
    if (sort === "forks") list.sort((a, b) => b.forkCount - a.forkCount);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [marketplace, tab, query, sort]);

  const visibleMine = useMemo(() => {
    let list = mine.slice();
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q));
    if (sort === "popular") list.sort((a, b) => b.usageCount - a.usageCount);
    if (sort === "forks") list.sort((a, b) => b.forkCount - a.forkCount);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [mine, query, sort]);

  const showingMine = tab === "mine";
  const shownCount = showingMine ? visibleMine.length : visibleMarketplace.length;

  return (
    <section data-testid="templates-dashboard" aria-label="Templates" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Template marketplace</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Start from an automation that already works — built by ChainReact or shared by the community —
          or save your own and reuse it across your workflows.
        </p>
      </header>

      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {TABS.map((s) => (
          <button
            key={s.id}
            type="button"
            data-testid={`templates-tab-${s.id}`}
            aria-pressed={tab === s.id}
            onClick={() => setTab(s.id)}
            className={
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
              (tab === s.id
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {s.label}
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {counts[s.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          data-testid="templates-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates by name or what they do…"
          className="max-w-md"
        />
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-44" data-testid="templates-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Most used</SelectItem>
            <SelectItem value="forks">Most forked</SelectItem>
            <SelectItem value="name">A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p data-testid="templates-count" className="text-xs text-muted-foreground">
        Showing <strong className="font-semibold text-foreground">{shownCount}</strong> template{shownCount === 1 ? "" : "s"}
      </p>

      {shownCount === 0 ? (
        <div
          data-testid="templates-empty"
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center"
        >
          <div className="text-sm font-semibold text-foreground">
            {showingMine ? "You haven't saved any templates yet" : "No templates match that"}
          </div>
          <div className="max-w-sm text-sm text-muted-foreground">
            {showingMine
              ? "Save a copy of a marketplace template, or turn one of your workflows into a template, to build your library."
              : "Try a different tab or clear your search."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {showingMine
            ? visibleMine.map((m) => (
                <TemplateCard
                  key={m.id}
                  templateId={m.id}
                  name={m.name}
                  description={m.description}
                  attribution={{ kind: "mine" }}
                  visibility={m.visibility}
                  usageCount={m.usageCount}
                  forkCount={m.forkCount}
                  busy={busyId === m.id}
                  onUse={() => handleUse(m.id)}
                  onFork={() => handleFork(m.id)}
                  manage={
                    m.canManage
                      ? {
                          visibility: m.visibility,
                          onTogglePublish: () => handleTogglePublish(m),
                          onDelete: () => handleDelete(m),
                        }
                      : undefined
                  }
                />
              ))
            : visibleMarketplace.map((m) => (
                <TemplateCard
                  key={m.id}
                  templateId={m.id}
                  name={m.name}
                  description={m.description}
                  attribution={m.isOfficial ? { kind: "official" } : { kind: "creator", name: m.creatorDisplayName }}
                  usageCount={m.usageCount}
                  forkCount={m.forkCount}
                  busy={busyId === m.id}
                  onUse={() => handleUse(m.id)}
                  onFork={() => handleFork(m.id)}
                />
              ))}
        </div>
      )}

      {toast && (
        <div
          role="status"
          data-testid="templates-toast"
          className={
            "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg " +
            (toast.tone === "error"
              ? "bg-destructive text-destructive-foreground"
              : "bg-foreground text-background")
          }
        >
          {toast.message}
        </div>
      )}
    </section>
  );
}
