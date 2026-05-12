import {
  classifyTrelloAction,
  normalizeTrelloEvent,
  TRIGGER_EVENT_TO_NORMALIZED,
} from "@/integrations/trello/triggers/_shared/normalize";

/**
 * Tests for Trello webhook event classification + normalization.
 * Ports the spirit of V1's tests at
 * `__tests__/webhooks/normalization.test.ts:297-535`.
 */

describe("classifyTrelloAction", () => {
  it("maps createCard → trello.card.created", () => {
    expect(
      classifyTrelloAction({ action: { type: "createCard" } }),
    ).toBe("trello.card.created");
  });

  it("maps copyCard → trello.card.created", () => {
    expect(
      classifyTrelloAction({ action: { type: "copyCard" } }),
    ).toBe("trello.card.created");
  });

  it("maps commentCard → trello.comment.added", () => {
    expect(
      classifyTrelloAction({ action: { type: "commentCard" } }),
    ).toBe("trello.comment.added");
  });

  it("maps addMemberToCard → trello.member.changed", () => {
    expect(
      classifyTrelloAction({ action: { type: "addMemberToCard" } }),
    ).toBe("trello.member.changed");
  });

  it("maps removeMemberFromCard → trello.member.changed", () => {
    expect(
      classifyTrelloAction({ action: { type: "removeMemberFromCard" } }),
    ).toBe("trello.member.changed");
  });

  it("maps moveCardToBoard / moveCardFromBoard → trello.card.moved", () => {
    expect(
      classifyTrelloAction({ action: { type: "moveCardToBoard" } }),
    ).toBe("trello.card.moved");
    expect(
      classifyTrelloAction({ action: { type: "moveCardFromBoard" } }),
    ).toBe("trello.card.moved");
  });

  it("maps updateCard with listBefore !== listAfter → trello.card.moved", () => {
    expect(
      classifyTrelloAction({
        action: {
          type: "updateCard",
          data: {
            listBefore: { id: "l1" },
            listAfter: { id: "l2" },
          },
        },
      }),
    ).toBe("trello.card.moved");
  });

  it("maps updateCard with `closed` in data.old → trello.card.archived (priority)", () => {
    expect(
      classifyTrelloAction({
        action: {
          type: "updateCard",
          data: {
            old: { closed: false },
          },
        },
      }),
    ).toBe("trello.card.archived");
  });

  it("maps updateCard with `closed` in data.old AND a list change → trello.card.archived (priority over moved)", () => {
    // Archive priority MUST win over the move check — otherwise
    // unarchive-into-a-different-list events would be miscategorized.
    expect(
      classifyTrelloAction({
        action: {
          type: "updateCard",
          data: {
            old: { closed: true },
            listBefore: { id: "l1" },
            listAfter: { id: "l2" },
          },
        },
      }),
    ).toBe("trello.card.archived");
  });

  it("maps generic updateCard → trello.card.updated", () => {
    expect(
      classifyTrelloAction({
        action: {
          type: "updateCard",
          data: { old: { name: "old name" } },
        },
      }),
    ).toBe("trello.card.updated");
    // (Note: `old.name` is NOT the `closed` field; this is generic
    //  update, not an archive change.)
  });

  it("returns null for unsupported action types", () => {
    expect(
      classifyTrelloAction({ action: { type: "createLabel" } }),
    ).toBe(null);
    expect(
      classifyTrelloAction({ action: { type: "deleteCard" } }),
    ).toBe(null);
    expect(classifyTrelloAction({ action: {} })).toBe(null);
    expect(classifyTrelloAction({})).toBe(null);
  });
});

describe("normalizeTrelloEvent — common fields", () => {
  it("uses action.id as eventId and action.date as occurredAt", () => {
    const event = normalizeTrelloEvent({
      eventType: "trello.card.created",
      body: {
        action: {
          id: "act-uuid",
          type: "createCard",
          date: "2026-05-11T12:00:00.000Z",
          data: {
            card: { id: "c1", name: "Card A" },
            board: { id: "b1", name: "Board" },
            list: { id: "l1", name: "Backlog" },
          },
        },
      },
    });
    expect(event.eventId).toBe("act-uuid");
    expect(event.occurredAt).toBe("2026-05-11T12:00:00.000Z");
    expect(event.provider).toBe("trello");
    expect(event.eventType).toBe("trello.card.created");
    expect(event.accountId).toBe("b1");
  });

  it("falls back to a derived eventId when action.id is missing", () => {
    const event = normalizeTrelloEvent({
      eventType: "trello.card.created",
      body: {
        action: {
          type: "createCard",
          date: "2026-05-11T12:00:00Z",
          data: { board: { id: "b1" } },
        },
      },
    });
    expect(event.eventId.startsWith("b1:")).toBe(true);
  });
});

describe("normalizeTrelloEvent — per-eventType payload", () => {
  it("createCard payload includes cardId, name, listId, boardId, cardUrl", () => {
    const event = normalizeTrelloEvent({
      eventType: "trello.card.created",
      body: {
        action: {
          id: "act-1",
          type: "createCard",
          date: "2026-05-11T00:00:00Z",
          data: {
            card: { id: "c1", name: "New Card", shortLink: "abc" },
            board: { id: "b1", name: "Sprint" },
            list: { id: "l1", name: "To Do" },
          },
        },
      },
    });
    expect(event.payload.cardId).toBe("c1");
    expect(event.payload.cardName).toBe("New Card");
    expect(event.payload.cardUrl).toBe("https://trello.com/c/abc");
    expect(event.payload.boardId).toBe("b1");
    expect(event.payload.boardName).toBe("Sprint");
    expect(event.payload.listId).toBe("l1");
    expect(event.payload.listName).toBe("To Do");
    expect(event.payload.actionId).toBe("act-1");
  });

  it("updateCard payload includes changedFields + oldValues", () => {
    const event = normalizeTrelloEvent({
      eventType: "trello.card.updated",
      body: {
        action: {
          id: "act-1",
          type: "updateCard",
          date: "2026-05-11T00:00:00Z",
          data: {
            card: { id: "c1", name: "New Name" },
            board: { id: "b1" },
            old: { name: "Old Name" },
          },
        },
      },
    });
    expect(event.payload.changedFields).toEqual(["name"]);
    expect(event.payload.oldValues).toEqual({ name: "Old Name" });
  });

  it("card_moved payload includes fromList + toList", () => {
    const event = normalizeTrelloEvent({
      eventType: "trello.card.moved",
      body: {
        action: {
          id: "act-1",
          type: "updateCard",
          date: "2026-05-11T00:00:00Z",
          data: {
            card: { id: "c1", name: "Card A" },
            board: { id: "b1" },
            listBefore: { id: "l1", name: "Backlog" },
            listAfter: { id: "l2", name: "Done" },
          },
        },
      },
    });
    expect(event.payload.fromListId).toBe("l1");
    expect(event.payload.fromListName).toBe("Backlog");
    expect(event.payload.toListId).toBe("l2");
    expect(event.payload.toListName).toBe("Done");
  });

  it("comment payload includes commentText + memberCreator info", () => {
    const event = normalizeTrelloEvent({
      eventType: "trello.comment.added",
      body: {
        action: {
          id: "act-1",
          type: "commentCard",
          date: "2026-05-11T00:00:00Z",
          data: {
            text: "great work",
            card: { id: "c1", name: "Card A" },
            board: { id: "b1" },
          },
          memberCreator: { id: "m1", username: "u", fullName: "User One" },
        },
      },
    });
    expect(event.payload.commentText).toBe("great work");
    expect(event.payload.memberCreatorId).toBe("m1");
    expect(event.payload.memberCreatorUsername).toBe("u");
    expect(event.payload.memberCreatorFullName).toBe("User One");
  });

  it("member_changed payload distinguishes 'added' vs 'removed'", () => {
    const added = normalizeTrelloEvent({
      eventType: "trello.member.changed",
      body: {
        action: {
          id: "act-1",
          type: "addMemberToCard",
          date: "2026-05-11T00:00:00Z",
          data: {
            idMember: "m1",
            member: { id: "m1", fullName: "User One" },
            card: { id: "c1" },
            board: { id: "b1" },
          },
        },
      },
    });
    const removed = normalizeTrelloEvent({
      eventType: "trello.member.changed",
      body: {
        action: {
          id: "act-2",
          type: "removeMemberFromCard",
          date: "2026-05-11T00:00:00Z",
          data: {
            idMember: "m1",
            member: { id: "m1", fullName: "User One" },
            card: { id: "c1" },
            board: { id: "b1" },
          },
        },
      },
    });
    expect(added.payload.memberAction).toBe("added");
    expect(removed.payload.memberAction).toBe("removed");
    expect(added.payload.memberId).toBe("m1");
  });

  it("archived payload includes closed boolean and changedFields", () => {
    const event = normalizeTrelloEvent({
      eventType: "trello.card.archived",
      body: {
        action: {
          id: "act-1",
          type: "updateCard",
          date: "2026-05-11T00:00:00Z",
          data: {
            card: { id: "c1", name: "Card A", closed: true },
            board: { id: "b1" },
            old: { closed: false },
          },
        },
      },
    });
    expect(event.payload.closed).toBe(true);
    expect(event.payload.changedFields).toEqual(["closed"]);
  });

  it("forwards the raw body under payload.body for advanced workflow refs", () => {
    const body = {
      action: {
        id: "act-1",
        type: "createCard",
        date: "2026-05-11T00:00:00Z",
        data: { card: { id: "c1" }, board: { id: "b1" } },
      },
    };
    const event = normalizeTrelloEvent({
      eventType: "trello.card.created",
      body,
    });
    expect(event.payload.body).toEqual(body);
  });
});

describe("TRIGGER_EVENT_TO_NORMALIZED mapping", () => {
  it("covers all 6 approved trigger event types", () => {
    expect(Object.keys(TRIGGER_EVENT_TO_NORMALIZED).sort()).toEqual(
      [
        "card_archived",
        "card_moved",
        "card_updated",
        "comment_added",
        "member_changed",
        "new_card",
      ].sort(),
    );
  });

  it("maps each trigger event type to its normalized form", () => {
    expect(TRIGGER_EVENT_TO_NORMALIZED.new_card).toBe("trello.card.created");
    expect(TRIGGER_EVENT_TO_NORMALIZED.card_updated).toBe("trello.card.updated");
    expect(TRIGGER_EVENT_TO_NORMALIZED.card_moved).toBe("trello.card.moved");
    expect(TRIGGER_EVENT_TO_NORMALIZED.comment_added).toBe("trello.comment.added");
    expect(TRIGGER_EVENT_TO_NORMALIZED.member_changed).toBe("trello.member.changed");
    expect(TRIGGER_EVENT_TO_NORMALIZED.card_archived).toBe("trello.card.archived");
  });
});
