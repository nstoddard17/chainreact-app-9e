/**
 * @jest-environment node
 *
 * Output-metadata HONESTY for the smoke-arc Trello card actions: every output a
 * handler returns as `value ?? null` MUST be declared `nullable: true` in its
 * meta. Otherwise the variable picker / downstream consumers are told a field is
 * always present when it can be absent (the add_comment finding, generalized).
 */
import type { ActionMeta, OutputMeta } from "@/contracts/actionMeta";
import { trelloAddCommentMeta } from "@/integrations/trello/actions/addComment.meta";
import { trelloCreateCardMeta } from "@/integrations/trello/actions/createCard.meta";
import { trelloUpdateCardMeta } from "@/integrations/trello/actions/updateCard.meta";
import { trelloArchiveCardMeta } from "@/integrations/trello/actions/archiveCard.meta";

function out(meta: ActionMeta, name: string): OutputMeta {
  const o = meta.outputs.find((x) => x.name === name);
  if (!o) throw new Error(`no output "${name}" on ${meta.key}`);
  return o;
}
const nullableNames = (meta: ActionMeta): string[] =>
  meta.outputs.filter((o) => o.nullable === true).map((o) => o.name).sort();

describe("trello:add_comment — output honesty (text no longer echoes input)", () => {
  it("text is nullable + sensitive, and the description no longer claims an echo", () => {
    const text = out(trelloAddCommentMeta, "text");
    expect(text.nullable).toBe(true);
    expect(text.sensitive).toBe(true);
    expect(text.description ?? "").not.toMatch(/echo/i);
  });

  it("every provider-optional field is marked nullable; commentId is not", () => {
    expect(nullableNames(trelloAddCommentMeta)).toEqual(
      ["date", "memberCreatorFullName", "memberCreatorId", "memberCreatorUsername", "text"].sort(),
    );
    expect(out(trelloAddCommentMeta, "commentId").nullable).toBeUndefined();
  });
});

describe("smoke-arc Trello card actions — nullable outputs match the handler", () => {
  // The handler returns these as `card.<x> ?? null`; cardId/name/idMembers/idLabels
  // are always present.
  const CARD_NULLABLE = ["closed", "desc", "due", "dueComplete", "idBoard", "idList", "pos", "shortUrl", "start", "url"].sort();

  it("create_card marks the provider-optional card fields nullable", () => {
    expect(nullableNames(trelloCreateCardMeta)).toEqual(CARD_NULLABLE);
    expect(out(trelloCreateCardMeta, "cardId").nullable).toBeUndefined();
    expect(out(trelloCreateCardMeta, "name").nullable).toBeUndefined();
  });

  it("update_card marks the provider-optional card fields nullable", () => {
    expect(nullableNames(trelloUpdateCardMeta)).toEqual(CARD_NULLABLE);
  });

  it("archive_card marks closed + url nullable (cardId/name always present)", () => {
    expect(nullableNames(trelloArchiveCardMeta)).toEqual(["closed", "url"]);
    expect(out(trelloArchiveCardMeta, "cardId").nullable).toBeUndefined();
  });
});
