/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote updated_note normalize.
 *
 * Pinned contracts:
 *   - changeKind: "updated".
 *   - eventId: `${pageId}:${lastModifiedDateTime}`.
 *   - occurredAt: lastModifiedDateTime (no fallback — required).
 *   - Throws when lastModifiedDateTime missing (eventId composition
 *     requires it).
 *   - No body / content / secret-shaped fields in payload.
 */

import { normalizeUpdatedNote } from "@/integrations/microsoft-onenote/triggers/updatedNote/normalize";

const providerAccountId = "alice@contoso.com";

describe("updated_note normalize — happy path", () => {
  it("builds a complete TriggerEvent with composite eventId", () => {
    const event = normalizeUpdatedNote({
      page: {
        id: "p-1",
        title: "Doc",
        createdDateTime: "2026-05-20T00:00:00Z",
        lastModifiedDateTime: "2026-05-23T12:20:00Z",
        contentUrl: "https://graph/p1",
        links: { oneNoteWebUrl: { href: "https://onenote.com/p1" } },
        parentNotebook: { displayName: "Work" },
        parentSection: { displayName: "Meetings" },
      },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    expect(event).toEqual({
      provider: "microsoft-onenote",
      eventType: "updated_note",
      eventId: "p-1:2026-05-23T12:20:00Z",
      occurredAt: "2026-05-23T12:20:00Z",
      providerAccountId,
      payload: {
        changeKind: "updated",
        pageId: "p-1",
        title: "Doc",
        webUrl: "https://onenote.com/p1",
        contentUrl: "https://graph/p1",
        notebookId: "nb-1",
        notebookName: "Work",
        sectionId: "sec-1",
        sectionName: "Meetings",
        createdDateTime: "2026-05-20T00:00:00Z",
        lastModifiedDateTime: "2026-05-23T12:20:00Z",
      },
    });
  });
});

describe("updated_note normalize — error guards", () => {
  it("throws when lastModifiedDateTime missing (required for eventId composition)", () => {
    expect(() =>
      normalizeUpdatedNote({
        page: { id: "p-1" /* no lastModifiedDateTime */ },
        providerAccountId,
        notebookId: "nb-1",
        sectionId: "sec-1",
      }),
    ).toThrow(/lastModifiedDateTime is required/);
  });
});

describe("updated_note normalize — banned fields", () => {
  it("does NOT emit content / body / text / messages fields", () => {
    const event = normalizeUpdatedNote({
      page: {
        id: "p-1",
        title: "Hello",
        lastModifiedDateTime: "2026-05-23T12:20:00Z",
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

  it("does NOT emit secret-shaped fields", () => {
    const event = normalizeUpdatedNote({
      page: { id: "p-1", lastModifiedDateTime: "2026-05-23T12:20:00Z" },
      providerAccountId,
      notebookId: "nb-1",
      sectionId: "sec-1",
    });
    const payloadKeys = Object.keys(event.payload as Record<string, unknown>);
    for (const banned of [
      "token",
      "secret",
      "accessToken",
      "apiKey",
      "refreshToken",
    ]) {
      expect(payloadKeys).not.toContain(banned);
    }
  });
});
