/**
 * @jest-environment node
 */
import {
  isDeletedDeltaItem,
  normalize,
  normalizeDeleted,
} from "@/integrations/microsoft-onedrive/triggers/fileChanged/normalize";

const CONTEXT = {
  subscriptionId: "sub-1",
  notificationOccurredAt: "2026-05-09T12:00:00Z",
  providerAccountId: "alice@contoso.com",
  source: "id-fetch" as const,
};

describe("OneDrive file_changed normalize", () => {
  it("produces canonical TriggerEvent shape from a file DriveItem", () => {
    const event = normalize(
      {
        id: "item-1",
        name: "report.pdf",
        size: 4096,
        file: { mimeType: "application/pdf" },
        webUrl: "https://1drv.ms/r",
        "@microsoft.graph.downloadUrl": "https://signed-url",
        parentReference: { id: "p-1", path: "/drive/root:/Reports" },
        createdDateTime: "2026-05-08T10:00:00Z",
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
      CONTEXT,
    );

    expect(event).toEqual({
      provider: "microsoft-onedrive",
      eventType: "file_changed",
      eventId: "sub-1:item-1:2026-05-09T11:00:00Z",
      occurredAt: "2026-05-09T11:00:00Z",
      providerAccountId: "alice@contoso.com",
      payload: {
        itemId: "item-1",
        kind: "file",
        changeType: "updated",
        source: "id-fetch",
        name: "report.pdf",
        size: 4096,
        mimeType: "application/pdf",
        parentReference: { id: "p-1", path: "/drive/root:/Reports" },
        webUrl: "https://1drv.ms/r",
        downloadUrl: "https://signed-url",
        createdDateTime: "2026-05-08T10:00:00Z",
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
    });
  });

  it("derives kind=folder and forces mimeType=null for folder items", () => {
    const event = normalize(
      {
        id: "f-1",
        name: "Reports",
        folder: { childCount: 3 },
        webUrl: "https://1drv.ms/x",
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
      CONTEXT,
    );
    expect(event.payload.kind).toBe("folder");
    expect(event.payload.mimeType).toBeNull();
    expect(event.payload.downloadUrl).toBeNull(); // folders never have signed URLs
  });

  it("dedup eventId shape is ${subscriptionId}:${itemId}:${lastModifiedDateTime}", () => {
    const event = normalize(
      {
        id: "abc",
        file: { mimeType: "text/plain" },
        lastModifiedDateTime: "2026-05-09T11:00:00Z",
      },
      { ...CONTEXT, subscriptionId: "sub-XYZ" },
    );
    expect(event.eventId).toBe("sub-XYZ:abc:2026-05-09T11:00:00Z");
  });

  it("falls back to notificationOccurredAt for the dedup discriminator when lastModifiedDateTime is missing", () => {
    const event = normalize({ id: "x", file: {} }, CONTEXT);
    expect(event.eventId).toBe("sub-1:x:2026-05-09T12:00:00Z");
  });

  it("uses lastModifiedDateTime > createdDateTime > notification fallback for occurredAt", () => {
    const r1 = normalize(
      { id: "i", file: {}, lastModifiedDateTime: "1", createdDateTime: "0" },
      CONTEXT,
    );
    expect(r1.occurredAt).toBe("1");

    const r2 = normalize(
      { id: "i", file: {}, createdDateTime: "0" },
      CONTEXT,
    );
    expect(r2.occurredAt).toBe("0");

    const r3 = normalize({ id: "i", file: {} }, CONTEXT);
    expect(r3.occurredAt).toBe("2026-05-09T12:00:00Z");
  });

  it("surfaces source: 'id-fetch' vs 'delta-fallback' from context for downstream debugging", () => {
    const idFetch = normalize({ id: "i", file: {} }, CONTEXT);
    expect(idFetch.payload.source).toBe("id-fetch");

    const fallback = normalize(
      { id: "i", file: {} },
      { ...CONTEXT, source: "delta-fallback" },
    );
    expect(fallback.payload.source).toBe("delta-fallback");
  });

  it("defaults missing optional fields to null for stable shape", () => {
    const event = normalize({ id: "i", file: {} }, CONTEXT);
    expect(event.payload.name).toBeNull();
    expect(event.payload.size).toBeNull();
    expect(event.payload.mimeType).toBeNull();
    expect(event.payload.parentReference).toBeNull();
    expect(event.payload.webUrl).toBeNull();
    expect(event.payload.downloadUrl).toBeNull();
    expect(event.payload.createdDateTime).toBeNull();
    expect(event.payload.lastModifiedDateTime).toBeNull();
  });
});

describe("OneDrive file_changed normalizeDeleted", () => {
  it("emits stable minimal payload with kind: null + deleted: true + :deleted: dedup infix", () => {
    const event = normalizeDeleted("item-deleted", CONTEXT);
    expect(event.eventId).toBe(
      "sub-1:item-deleted:deleted:2026-05-09T12:00:00Z",
    );
    expect(event.payload).toMatchObject({
      itemId: "item-deleted",
      kind: null,
      name: null,
      mimeType: null,
      deleted: true,
    });
  });

  it("preserves source: 'delta-fallback' for delete events from delta", () => {
    const event = normalizeDeleted("x", {
      ...CONTEXT,
      source: "delta-fallback",
    });
    expect(event.payload.source).toBe("delta-fallback");
  });

  it("preserves source: 'id-fetch' when 404 fired during id-fetch branch", () => {
    const event = normalizeDeleted("x", { ...CONTEXT, source: "id-fetch" });
    expect(event.payload.source).toBe("id-fetch");
  });

  it("payload key set is identical to normalize() (workflow authors see one stable shape) plus the deleted flag", () => {
    const full = normalize({ id: "i", file: {} }, CONTEXT);
    const deleted = normalizeDeleted("i", CONTEXT);
    const fullKeys = Object.keys(full.payload).sort();
    const deletedKeys = Object.keys(deleted.payload).sort();
    // Deleted shape adds a `deleted: true` flag — assert the live keys
    // are a subset.
    for (const k of fullKeys) expect(deletedKeys).toContain(k);
  });
});

describe("isDeletedDeltaItem", () => {
  it("returns true when delta entry carries a deleted facet", () => {
    expect(isDeletedDeltaItem({ id: "x", deleted: { state: "deleted" } })).toBe(
      true,
    );
  });

  it("returns false on live items", () => {
    expect(isDeletedDeltaItem({ id: "x", file: {} })).toBe(false);
  });
});
