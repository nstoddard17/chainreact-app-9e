import type { FieldMeta, OutputMeta } from "@/contracts/actionMeta";
import { EDEN_SCHEDULING_PLATFORMS } from "@/integrations/_shared/eden/api/scheduling";

/**
 * Shared Builder-metadata fragments for the Eden scheduling write actions (EDEN-6). Keeps the
 * content-body field set + output shape in ONE place so draft/schedule/publish stay identical.
 * Structured fields only — no raw JSON, no MCP tool names, no resource URIs surfaced to authors.
 */

const PLATFORM_OPTIONS = EDEN_SCHEDULING_PLATFORMS.map((p) => ({
  value: p,
  label:
    p === "twitter" ? "X (Twitter)" : p === "youtube" ? "YouTube (Shorts)" : p.charAt(0).toUpperCase() + p.slice(1),
}));

export const edenWorkspaceField: FieldMeta = {
  name: "workspaceId",
  label: "Workspace",
  description: "The workspace to post from. Leave empty to use your default workspace.",
  type: "combobox",
  required: false,
  optionsSource: "eden:workspaces",
  placeholder: "Default workspace",
};

export const edenScheduleField: FieldMeta = {
  name: "scheduleId",
  label: "Schedule",
  description: "The posting schedule (social set) to use. Leave empty for your default schedule.",
  type: "combobox",
  required: false,
  optionsSource: "eden:schedules",
  placeholder: "Default schedule",
};

/** The content-body fields (platforms, text, segments, media, youtube title, timezone, idempotency). */
export function edenContentFields(opts?: { textLabel?: string }): FieldMeta[] {
  return [
    {
      name: "platforms",
      label: "Platforms",
      description:
        "Which connected platforms to post to. Instagram, TikTok, and YouTube require media; YouTube is Shorts only (needs a video + title). Leave empty to use the schedule's active text platforms.",
      type: "select",
      required: false,
      multiple: true,
      options: PLATFORM_OPTIONS,
    },
    {
      name: "text",
      label: opts?.textLabel ?? "Post text",
      description:
        "The post body. Line breaks are preserved. For X/Threads, long text auto-splits into a thread unless you provide segments.",
      type: "textarea",
      required: true,
      placeholder: "What do you want to post?",
    },
    {
      name: "segments",
      label: "Thread segments (X/Threads)",
      description:
        "Optional. Each entry is one post in an X/Threads thread. Leave empty to let Eden auto-split the text.",
      type: "string-array",
      required: false,
      stringArrayMaxItems: 100,
    },
    {
      name: "media",
      label: "Media (public URLs)",
      description:
        "Optional. Publicly reachable image / video / PDF URLs to attach. Required for Instagram, TikTok, and YouTube. No file uploads — paste a public URL or wire one from an earlier step.",
      type: "object-list",
      required: false,
      listMaxItems: 20,
      itemFields: [
        { name: "url", label: "Public URL", type: "text", required: true, placeholder: "https://…" },
        { name: "mimeType", label: "MIME type", type: "text", required: false, placeholder: "image/png" },
        { name: "alt", label: "Alt text", type: "text", required: false, placeholder: "Describe the media" },
      ],
    },
    {
      name: "youtubeTitle",
      label: "YouTube title",
      description: "Required when posting to YouTube. The Short's title (≤100 chars), separate from the description text.",
      type: "text",
      required: false,
      placeholder: "My Short's title",
    },
    {
      name: "timezone",
      label: "Timezone",
      description: "Optional. IANA timezone for scheduling. Defaults to the schedule's timezone.",
      type: "timezone",
      required: false,
    },
    {
      name: "idempotencyKey",
      label: "Idempotency key",
      description:
        "Optional. Reuse the same key to make a retry return the same post instead of creating a duplicate. Leave empty — a stable per-run key is generated automatically.",
      type: "text",
      required: false,
      advanced: true,
    },
  ];
}

/** The bounded output shape returned by draft/schedule/publish/update. */
export const edenPostOutputs: OutputMeta[] = [
  { name: "id", type: "string", description: "The scheduled post / draft id (use it to edit, reschedule, or cancel)." },
  { name: "status", type: "string", description: "Provider status (draft, scheduled, publishing, posted, …), or null.", nullable: true },
  { name: "scheduleId", type: "string", description: "The schedule the post belongs to, or null.", nullable: true },
  { name: "timezone", type: "string", description: "The post's timezone, or null.", nullable: true },
  { name: "platforms", type: "array", description: "The target platform ids." },
  { name: "scheduledFor", type: "number", description: "Publish time as epoch milliseconds, or null (drafts).", nullable: true },
  { name: "scheduledAtIso", type: "string", description: "Publish time as an ISO-8601 string, or null (drafts).", nullable: true },
  { name: "targets", type: "array", description: "Per-platform targets: { platform, kind, status }. No account identifiers." },
];
