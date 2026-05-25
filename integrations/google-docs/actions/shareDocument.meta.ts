import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-docs:share_document` —
 * Slice 3.GDOCS-4.
 *
 * **Full destructive trio: `isDestructive: true` +
 * `requiresConfirmation: true` + `riskLevel: "high"`.**
 *
 * Rationale per GDOCS-1 §5 + slice spec:
 *   - Ownership transfer can be irreversible — Drive moves the file out
 *     of the connected account's ownership once the new owner accepts.
 *     The source account becomes a writer; reclaiming ownership
 *     requires the new owner's cooperation.
 *   - `makePublic: true` exposes the document via an anyone-link, which
 *     can be indexed (depending on `publicPermission` + `allowDiscovery`)
 *     and is broadly visible. Recovery requires re-running share with
 *     `makePublic: false`, but copies / shares / indexed snapshots
 *     accrued in the meantime persist.
 *   - V2 `ActionMeta` cannot conditionally classify risk based on
 *     individual field values — we cannot ship "low risk when sharing
 *     to a single colleague, high risk when transferring ownership."
 *     Conservative classification: the action carries the destructive
 *     trio for ALL invocations.
 *
 * Mirrors `shareDocument.schema.ts` (8 fields). Field names preserve V1
 * verbatim per GDOCS-1 §8.1.
 *
 * **Q11 — `sendNotification` is REQUIRED EXPLICIT, NO DEFAULT.** Author
 * MUST pick true or false; the runtime handler enforces this via
 * `requireExplicitField` BEFORE any wire call. The Q11 gate lives in
 * the handler today (`shareDocument.ts`); the meta schema declares
 * the field `required: true` with NO `defaultValue` so the renderer
 * surfaces it as an explicit choice and saves nothing implicit.
 *
 * `shareWith` uses the `string-array` field type — paste-or-type list
 * of emails. Google Contacts autocomplete is deferred (slice spec).
 * Schema accepts an empty array when `makePublic: true` is the only
 * sharing path; the renderer description explains the empty-array
 * case.
 *
 * `permission` and `publicPermission` enums are Drive's CANONICAL set
 * (`reader / commenter / writer / owner`) per GDOCS-1 §3.6.
 *
 * Sensitive outputs:
 *   - `sharedWith` — array of email addresses (PII).
 *   - `documentUrl` — links to the shared doc.
 *   - `documentId` / `isPublic` / `permissionIds` / `errors` — opaque
 *     ids / flags / structural error info; not sensitive.
 */
export const googleDocsShareDocumentMeta: ActionMeta = {
  key: "google-docs:share_document",
  provider: "google-docs",
  type: "share_document",
  displayName: "Share Document",
  description:
    "Grant access to a Google Doc via Drive's `permissions.create`. Supports per-user shares (reader / commenter / writer / owner), public anyone-link (makePublic), and ownership transfer (transferOwnership). **Public sharing exposes the document broadly; ownership transfer moves the document out of the connected account's ownership.** sendNotification is required explicit (Q11) — Drive sends a notification email to recipients when true, silently grants access when false.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "documentId",
      label: "Document",
      description:
        "Google Doc to share. Picker lists docs in the connected account.",
      type: "combobox",
      optionsSource: "google-docs:documents",
      required: true,
      placeholder: "Search documents…",
    },
    {
      name: "shareWith",
      label: "Share with (emails)",
      description:
        "Email addresses to grant access. Press Enter to append each address. Required when `makePublic` is false. Empty array is valid ONLY when `makePublic: true` (share via anyone-link without per-user shares). Google Contacts autocomplete is deferred — paste / type emails directly.",
      type: "string-array",
      required: false,
      placeholder: "teammate@example.com",
      stringArrayMaxItems: 50,
    },
    {
      name: "permission",
      label: "Permission",
      description:
        "Drive permission to grant to each `shareWith` recipient. `owner` requires `transferOwnership: true` AND exactly one recipient (Drive enforces these — schema-level superRefine catches the obvious-misconfiguration cases at the resolver boundary).",
      type: "select",
      required: true,
      defaultValue: "reader",
      options: [
        { value: "reader", label: "Reader (view)" },
        { value: "commenter", label: "Commenter (view + comment)" },
        { value: "writer", label: "Writer (edit)" },
        { value: "owner", label: "Owner (requires transferOwnership: true)" },
      ],
    },
    {
      name: "sendNotification",
      label: "Send notification email",
      description:
        "**Required — no default.** When true, Drive emails each recipient that they've been granted access (Drive composes the email). When false, access is granted silently (recipients see the doc in their Shared with me but no email is sent). Pick deliberately — silent sharing is sometimes preferred for ops workflows; notification sharing is the default for collaborative workflows.",
      type: "boolean",
      required: true,
    },
    {
      name: "message",
      label: "Notification message",
      description:
        "Optional. Custom message Drive appends to the notification email. Ignored when `sendNotification: false`. Variables resolve at runtime.",
      type: "textarea",
      required: false,
      placeholder: "Sharing the Q4 planning doc — please review by Friday.",
    },
    {
      name: "makePublic",
      label: "Make public (anyone with link)",
      description:
        "When true, grants `publicPermission` to anyone with the link. **Broad exposure** — the URL becomes share-able without per-user grants. Combine with `allowDiscovery` to make the doc discoverable via Google search.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    {
      name: "publicPermission",
      label: "Public permission",
      description:
        "Permission granted via the anyone-link when `makePublic: true`. Ignored otherwise. Defaults to `reader` (least-privilege).",
      type: "select",
      required: false,
      defaultValue: "reader",
      options: [
        { value: "reader", label: "Reader (view)" },
        { value: "commenter", label: "Commenter (view + comment)" },
        { value: "writer", label: "Writer (edit)" },
        { value: "owner", label: "Owner (not valid for public — Drive rejects)" },
      ],
    },
    {
      name: "allowDiscovery",
      label: "Allow Google search discovery",
      description:
        "When true alongside `makePublic`, Drive permits the doc to surface in public Google search results. Public + discoverable = effectively published on the web.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    {
      name: "transferOwnership",
      label: "Transfer ownership",
      description:
        "When true, transfers ownership of the document to the single email in `shareWith`. Requires `permission: owner` AND `shareWith.length === 1` (schema enforces). **Irreversible without the new owner's cooperation** — the source account becomes a writer; reclaiming ownership requires the new owner to transfer it back.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  outputs: [
    {
      name: "documentId",
      type: "string",
      description: "Echoed document id (== input.documentId).",
    },
    {
      name: "documentUrl",
      type: "string",
      description:
        "Canonical edit URL (`https://docs.google.com/document/d/<id>/edit`). Combine with `makePublic: true` to share broadly; combine with per-user shares to share with named recipients.",
      sensitive: true,
    },
    {
      name: "sharedWith",
      type: "array",
      description:
        "Email addresses that successfully received a permission grant. Subset of `input.shareWith` — Drive may reject individual emails (e.g. non-existent accounts) and the handler logs them in `errors`.",
      sensitive: true,
    },
    {
      name: "isPublic",
      type: "boolean",
      description:
        "True when `makePublic: true` succeeded. Independent of per-user `sharedWith` outcomes.",
    },
    {
      name: "permissionIds",
      type: "array",
      description:
        "Drive permission ids returned by `permissions.create`. Opaque Drive ids — wire to a downstream Drive `permissions.delete` if you need to revoke a grant.",
    },
    {
      name: "errors",
      type: "array",
      description:
        "Per-recipient (or `type: 'public'`) failure messages. Present only when at least one grant failed; missing when all grants succeeded.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Public sharing and ownership transfer are high-impact. `makePublic: true` exposes the document broadly (URL becomes share-able without per-user grants); `transferOwnership: true` moves ownership out of the connected account, recoverable only with the new owner's cooperation. sendNotification is required explicit — author must pick to either email recipients or share silently.",
};
