/** @jest-environment node */
/**
 * GET /api/ai/actions — the ChainReact AI catalog route (AI-PROVIDER-4 CS-4).
 *
 * Proves the honest-visibility contract: the route is the ONLY place that
 * knows about the server-only `AI_PROCESSOR_ENABLED` flag, and a disabled
 * processor yields an empty catalog (never a leaked env value, never a
 * placeholder action).
 */
const listActionMetasForProvider = jest.fn();
const requireUser = jest.fn();

jest.mock("@/services/discovery/_registry", () => ({
  listActionMetasForProvider: (...args: unknown[]) =>
    listActionMetasForProvider(...args),
}));
jest.mock("@/app/api/providers/_shared", () => ({
  requireUser: () => requireUser(),
}));

import { GET } from "@/app/api/ai/actions/route";

const SAVED = process.env.AI_PROCESSOR_ENABLED;

describe("GET /api/ai/actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireUser.mockResolvedValue({ ok: true, user: { id: "u1" } });
    listActionMetasForProvider.mockReturnValue([]);
    delete process.env.AI_PROCESSOR_ENABLED;
  });
  afterEach(() => {
    if (SAVED === undefined) delete process.env.AI_PROCESSOR_ENABLED;
    else process.env.AI_PROCESSOR_ENABLED = SAVED;
  });

  it("requires an authenticated user", async () => {
    const denied = new Response("nope", { status: 401 });
    requireUser.mockResolvedValue({ ok: false, response: denied });
    const res = await GET();
    expect(res).toBe(denied);
    expect(listActionMetasForProvider).not.toHaveBeenCalled();
  });

  it("returns an EMPTY catalog while the AI processor is disabled (no registry read)", async () => {
    const res = await GET();
    const body = (await res.json()) as { provider: string; actions: unknown[] };
    expect(res.status).toBe(200);
    expect(body).toEqual({ provider: "ai", actions: [] });
    expect(listActionMetasForProvider).not.toHaveBeenCalled();
  });

  it("never leaks the env var name or value into the response", async () => {
    process.env.AI_PROCESSOR_ENABLED = "true";
    const res = await GET();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("AI_PROCESSOR_ENABLED");
    expect(text).not.toContain("process.env");
  });

  it("serves ONLY the ai provider's actions when enabled", async () => {
    process.env.AI_PROCESSOR_ENABLED = "true";
    const aiMeta = {
      key: "ai:analyze_document",
      provider: "ai",
      type: "analyze_document",
      displayName: "Analyze Document",
    };
    listActionMetasForProvider.mockReturnValue([aiMeta]);

    const res = await GET();
    const body = (await res.json()) as {
      provider: string;
      actions: Array<{ provider: string }>;
    };
    expect(listActionMetasForProvider).toHaveBeenCalledWith("ai");
    expect(listActionMetasForProvider).toHaveBeenCalledTimes(1);
    expect(body.provider).toBe("ai");
    expect(body.actions).toEqual([aiMeta]);
    // No native / provider leakage: everything returned is the ai provider.
    for (const action of body.actions) expect(action.provider).toBe("ai");
  });

  it("returns the stable shape even when the registry has no ai actions yet (CS-4 reality)", async () => {
    process.env.AI_PROCESSOR_ENABLED = "true";
    listActionMetasForProvider.mockReturnValue([]);
    const res = await GET();
    expect(await res.json()).toEqual({ provider: "ai", actions: [] });
  });
});
