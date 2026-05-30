/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote new_note normalize.
 *
 * Pinned contracts:
 *   - Payload shape matches the newNote.meta.ts payloadShape.
 *   - changeKind: "created".
 *   - eventId: `${pageId}:created` (matches dedup namespace).
 *   - occurredAt: createdDateTime (or wall-clock when missing).
 *   - No body/content/messages fields.
 *   - Sensitive-eligible fields (title/webUrl/contentUrl/notebookName/
 *     sectionName) present even when value is null (so the structural
 *     redaction layer can mark them).
 */

import { normalizeNewNote } from "@/integrations/microsoft-onenote/triggers/newNote/normalize";

const providerAccountId = "alice@contoso.com";

describe("new_note normalize — happy path", () => {
  it("builds a complete TriggerEvent for a fully-populated page", () => {
    const event = normalizeNewNote({
      page: {
        id: "p-1",
        title: "Sprint planning",
        createdDateTime: "2026-05-23T12:10:00Z",
        lastModifiedDateTime: "2026-05-23T12:10:00Z",
        contentUrl: "https://graph/p1",
        links: { oneNoteWebUrl: { href: "https://onenote.com/p1" } },
        parentNotebook: { id: "nb-1", displayName: "Work" },
        parentSection: { id: "sec-1", displayName: "Meetings" },
      },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    expect(event).toEqual({
      provider: "microsoft-onenote",
      eventType: "new_note",
      eventId: "p-1:created",
      occurredAt: "2026-05-23T12:10:00Z",
      providerAccountId,
      payload: {
        changeKind: "created",
        pageId: "p-1",
        title: "Sprint planning",
        webUrl: "https://onenote.com/p1",
        contentUrl: "https://graph/p1",
        notebookId: "nb-1",
        notebookName: "Work",
        sectionId: "sec-1",
        sectionName: "Meetings",
        createdDateTime: "2026-05-23T12:10:00Z",
        lastModifiedDateTime: "2026-05-23T12:10:00Z",
      },
    });
  });
});

describe("new_note normalize — missing optional fields", () => {
  it("emits null for title/webUrl/contentUrl/notebookName/sectionName when absent", () => {
    const event = normalizeNewNote({
      page: { id: "p-2", createdDateTime: "2026-05-23T12:00:00Z" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    expect(event.payload).toMatchObject({
      title: null,
      webUrl: null,
      contentUrl: null,
      notebookName: null,
      sectionName: null,
    });
  });

  it("falls back to current ISO when createdDateTime missing (occurredAt always populated)", () => {
    const before = Date.now();
    const event = normalizeNewNote({
      page: { id: "p-3" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const after = Date.now();
    const occurredMs = Date.parse(event.occurredAt);
    expect(occurredMs).toBeGreaterThanOrEqual(before);
    expect(occurredMs).toBeLessThanOrEqual(after);
  });
});

describe("new_note normalize — banned fields (no body / content in payload)", () => {
  it("does NOT emit content / body / text / messages fields", () => {
    const event = normalizeNewNote({
      page: {
        id: "p-1",
        title: "Hello",
        createdDateTime: "2026-05-23T12:10:00Z",
      },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const payloadKeys = Object.keys(event.payload as Record<string, unknown>);
    for (const banned of ["content", "body", "text", "messages", "snippet"]) {
      expect(payloadKeys).not.toContain(banned);
    }
  });

  it("does NOT emit secret-shaped fields (token / secret / accessToken)", () => {
    const event = normalizeNewNote({
      page: { id: "p-1", createdDateTime: "2026-05-23T12:10:00Z" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const payloadKeys = Object.keys(event.payload as Record<string, unknown>);
    for (const banned of ["token", "secret", "accessToken", "apiKey", "refreshToken"]) {
      expect(payloadKeys).not.toContain(banned);
    }
  });
});
