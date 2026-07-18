"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createWorkflow, WorkflowApiError } from "@/lib/api/workflows";
import { postOnboardingEvent } from "@/lib/api/onboarding";
import { ObIcons } from "./onboardingIcons";

/**
 * Create-step chooser (5.ONBOARD-1 Batch 2) — the design's single "New
 * workflow" CTA opens a chooser over the three REAL ChainReact creation
 * paths (task "Step 1" contract): describe it to React (create + builder,
 * where the React Agent rail lives), start from a template (/templates), or
 * build from scratch (create + builder). No fake in-onboarding builder.
 */
export function OnboardingCreateChooser() {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function createAndOpen(creationPath: "agent" | "manual") {
    postOnboardingEvent({ event: "cta_clicked", stepKey: "create", creationPath });
    setCreating(true);
    setError(null);
    try {
      const created = await createWorkflow({ name: "My first workflow" });
      router.push(`/workflows/${created.id}`);
    } catch (err) {
      setError(
        err instanceof WorkflowApiError
          ? err.message
          : "Couldn't create the workflow. Try again.",
      );
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="onboarding-create-cta"
          disabled={creating}
          className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-primary px-[13px] py-2 text-[13px] font-semibold text-primary-foreground transition hover:brightness-110 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {creating ? "Creating…" : "New workflow"}
          <ObIcons.Arrow size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2"
        data-app-surface="dark"
        data-testid="onboarding-create-chooser"
      >
        <button
          type="button"
          data-testid="onboarding-create-react"
          disabled={creating}
          onClick={() => void createAndOpen("agent")}
          className="block w-full rounded-md px-2.5 py-2 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block text-sm font-medium text-foreground">
            Describe it to React
          </span>
          <span className="block text-xs text-muted-foreground">
            Tell the agent what to automate — it drafts the workflow with you.
          </span>
        </button>
        <Link
          href="/templates"
          data-testid="onboarding-create-template"
          onClick={() => {
            postOnboardingEvent({
              event: "cta_clicked",
              stepKey: "create",
              creationPath: "template",
            });
            setOpen(false);
          }}
          className="block w-full rounded-md px-2.5 py-2 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block text-sm font-medium text-foreground">
            Start from a template
          </span>
          <span className="block text-xs text-muted-foreground">
            Pick an automation that already works and make it yours.
          </span>
        </Link>
        <button
          type="button"
          data-testid="onboarding-create-scratch"
          disabled={creating}
          onClick={() => void createAndOpen("manual")}
          className="block w-full rounded-md px-2.5 py-2 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block text-sm font-medium text-foreground">
            Build from scratch
          </span>
          <span className="block text-xs text-muted-foreground">
            Open the builder and pick your own trigger and actions.
          </span>
        </button>
        {error && (
          <p role="alert" className="px-2.5 pb-1 pt-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
