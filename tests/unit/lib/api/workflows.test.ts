/**
 * @jest-environment node
 *
 * Tests for lib/api/workflows.ts. Mocks global fetch.
 *
 * Verifies:
 *   - URL + method + body for each operation
 *   - WorkflowApiError carries the LifecycleError code from the server response
 *   - id is URL-encoded
 *   - non-JSON / no-error-field server responses fall back to a generic message
 */
import {
  WorkflowApiError,
  activateWorkflow,
  createWorkflow,
  disableWorkflow,
  getWorkflow,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflows,
  pauseWorkflow,
  resumeWorkflow,
  updateWorkflow,
} from "@/lib/api/workflows";

const SAMPLE: import("@/contracts/workflow").WorkflowSummary = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test workflow",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  deletedAt: null,
  createdAt: "2026-05-06T12:00:00Z",
  updatedAt: "2026-05-06T12:00:00Z",
};

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("createWorkflow", () => {
  it("POSTs to /api/workflows with JSON body and returns the parsed summary", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE), { status: 201 }),
    );
    const result = await createWorkflow({ name: "Test workflow" });
    expect(result).toEqual(SAMPLE);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/workflows",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
        body: JSON.stringify({ name: "Test workflow" }),
      }),
    );
  });

  it("throws WorkflowApiError with code BAD_REQUEST on 400 without server code", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Workflow name is required." }), {
        status: 400,
      }),
    );
    await expect(createWorkflow({ name: "" })).rejects.toMatchObject({
      name: "WorkflowApiError",
      code: "BAD_REQUEST",
      status: 400,
      message: "Workflow name is required.",
    });
  });
});

describe("listWorkflows", () => {
  it("GETs /api/workflows and returns workflows array", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ workflows: [SAMPLE] }), { status: 200 }),
    );
    const result = await listWorkflows();
    expect(result).toEqual([SAMPLE]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/workflows");
  });

  it("propagates a 401 as WorkflowApiError code UNAUTHENTICATED", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }),
    );
    await expect(listWorkflows()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("lifecycle action endpoints", () => {
  it("activateWorkflow POSTs to /api/workflows/<id>/activate with no body", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ...SAMPLE, state: "active" }), { status: 200 }),
    );
    const result = await activateWorkflow(SAMPLE.id);
    expect(result.state).toBe("active");
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/workflows/${SAMPLE.id}/activate`,
      expect.objectContaining({ method: "POST", body: null }),
    );
  });

  it("pauseWorkflow POSTs to the correct URL", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ...SAMPLE, state: "paused" }), { status: 200 }),
    );
    await pauseWorkflow(SAMPLE.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/workflows/${SAMPLE.id}/pause`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("resumeWorkflow POSTs to the correct URL", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ...SAMPLE, state: "active" }), { status: 200 }),
    );
    await resumeWorkflow(SAMPLE.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/workflows/${SAMPLE.id}/resume`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("disableWorkflow POSTs reason + context as JSON body", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...SAMPLE,
          state: "disabled",
          disabledReason: "manual_admin",
        }),
        { status: 200 },
      ),
    );
    await disableWorkflow(SAMPLE.id, {
      reason: "manual_admin",
      context: "Quarterly audit",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/workflows/${SAMPLE.id}/disable`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "manual_admin", context: "Quarterly audit" }),
      }),
    );
  });

  it("URL-encodes the workflow id", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE), { status: 200 }),
    );
    await activateWorkflow("with/slash and space");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "/api/workflows/with%2Fslash%20and%20space/activate",
    );
  });
});

describe("getWorkflow / updateWorkflow", () => {
  const detail = {
    ...SAMPLE,
    activeRevisionId: null,
    draftDefinition: { nodes: [], edges: [] },
  };

  it("getWorkflow GETs /api/workflows/<id> and returns the detail", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(detail), { status: 200 }),
    );
    const result = await getWorkflow(SAMPLE.id);
    expect(result).toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledWith(`/api/workflows/${SAMPLE.id}`);
  });

  it("getWorkflow surfaces 404 as WORKFLOW_NOT_FOUND", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }),
        { status: 404 },
      ),
    );
    await expect(getWorkflow(SAMPLE.id)).rejects.toMatchObject({
      code: "WORKFLOW_NOT_FOUND",
      status: 404,
    });
  });

  it("updateWorkflow PATCHes the body and returns the updated detail", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ...detail, name: "Renamed" }), { status: 200 }),
    );
    const result = await updateWorkflow(SAMPLE.id, { name: "Renamed" });
    expect(result.name).toBe("Renamed");
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/workflows/${SAMPLE.id}`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "content-type": "application/json" }),
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
  });

  it("updateWorkflow surfaces a 400 with the server-provided message", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Workflow name is required." }), {
        status: 400,
      }),
    );
    await expect(
      updateWorkflow(SAMPLE.id, { name: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
  });
});

describe("listWorkflowRuns", () => {
  const sampleRun = {
    id: "44444444-4444-4444-4444-444444444444",
    workflowId: SAMPLE.id,
    status: "succeeded" as const,
    triggerNodeId: "t1",
    startedAt: "2026-05-07T00:00:00Z",
    finishedAt: "2026-05-07T00:00:01Z",
    errorClassification: null,
  };

  it("GETs /api/workflows/<id>/runs and returns the runs array", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ runs: [sampleRun] }), { status: 200 }),
    );
    const result = await listWorkflowRuns(SAMPLE.id);
    expect(result).toEqual([sampleRun]);
    expect(fetchSpy).toHaveBeenCalledWith(`/api/workflows/${SAMPLE.id}/runs`);
  });

  it("forwards opts.limit as a query param", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ runs: [] }), { status: 200 }),
    );
    await listWorkflowRuns(SAMPLE.id, { limit: 50 });
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/workflows/${SAMPLE.id}/runs?limit=50`,
    );
  });

  it("propagates a 401 as WorkflowApiError code UNAUTHENTICATED", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }),
    );
    await expect(listWorkflowRuns(SAMPLE.id)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("getWorkflowRun", () => {
  const sampleDetail = {
    id: "44444444-4444-4444-4444-444444444444",
    workflowId: SAMPLE.id,
    status: "succeeded" as const,
    triggerNodeId: "t1",
    startedAt: "2026-05-17T00:00:00Z",
    finishedAt: "2026-05-17T00:00:01Z",
    errorClassification: null,
    triggerEvent: {
      provider: "native",
      eventType: "manual.run",
      eventId: "ev1",
      occurredAt: "2026-05-17T00:00:00Z",
      accountId: "system",
      payload: { inputs: {} },
    },
    steps: [
      { nodeId: "t1", status: "succeeded" as const, output: {} },
      { nodeId: "a1", status: "succeeded" as const, output: { sentTo: "C123" } },
    ],
    fatalError: null,
  };

  it("GETs /api/workflows/<id>/runs/<runId> and returns the detail", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(sampleDetail), { status: 200 }),
    );
    const result = await getWorkflowRun(SAMPLE.id, sampleDetail.id);
    expect(result).toEqual(sampleDetail);
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/workflows/${SAMPLE.id}/runs/${sampleDetail.id}`,
    );
  });

  it("URL-encodes both ids", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(sampleDetail), { status: 200 }),
    );
    await getWorkflowRun("wf with space", "run/slash");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/workflows/wf%20with%20space/runs/run%2Fslash",
    );
  });

  it("throws WORKFLOW_NOT_FOUND on 404", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Run not found." }), { status: 404 }),
    );
    await expect(getWorkflowRun(SAMPLE.id, "missing")).rejects.toMatchObject({
      code: "WORKFLOW_NOT_FOUND",
      status: 404,
    });
  });

  it("throws UNAUTHENTICATED on 401", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }),
    );
    await expect(getWorkflowRun(SAMPLE.id, "run-1")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("WorkflowApiError code mapping (server-supplied)", () => {
  const cases: ReadonlyArray<[number, string, WorkflowApiError["code"]]> = [
    [404, "WORKFLOW_NOT_FOUND", "WORKFLOW_NOT_FOUND"],
    [409, "INVALID_TRANSITION", "INVALID_TRANSITION"],
    [409, "LIFECYCLE_CONFLICT", "LIFECYCLE_CONFLICT"],
    [422, "MISSING_PRECONDITIONS", "MISSING_PRECONDITIONS"],
    [502, "TRIGGER_REGISTRATION_FAILED", "TRIGGER_REGISTRATION_FAILED"],
  ];
  it.each(cases)(
    "status %i + server code %s -> client code %s",
    async (status, serverCode, expectedCode) => {
      jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "x", code: serverCode }), { status }),
      );
      await expect(activateWorkflow(SAMPLE.id)).rejects.toMatchObject({
        code: expectedCode,
        status,
      });
    },
  );

  it("falls back to a generic message when response is not JSON", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("oops", { status: 500 }));
    await expect(activateWorkflow(SAMPLE.id)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      status: 500,
      message: expect.stringMatching(/HTTP 500/),
    });
  });

  it("unknown server code resolves to UNKNOWN", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "x", code: "WHO_KNOWS" }), { status: 418 }),
    );
    await expect(activateWorkflow(SAMPLE.id)).rejects.toMatchObject({
      code: "UNKNOWN",
    });
  });
});

// ── Slice 3.POSTSEC-5 — CONFIRMATION_REQUIRED parsing + retry payload ─────
describe("CONFIRMATION_REQUIRED handling (Slice 3.POSTSEC-5)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const apiModule = require("@/lib/api/workflows") as typeof import("@/lib/api/workflows");
  const {
    WorkflowConfirmationRequiredError,
    isConfirmationRequiredError,
    runNowWorkflow,
  } = apiModule;

  const RAW_409_BODY = {
    error: "CONFIRMATION_REQUIRED",
    requiresConfirmation: true,
    confirmationText: "CONFIRM",
    actions: [
      {
        nodeId: "refund-node",
        provider: "stripe",
        type: "create_refund",
        displayName: "Create Refund",
        riskDescription:
          "Reverses a Stripe charge — moves money back to the customer.",
      },
    ],
  } as const;

  describe("parseError shape detection", () => {
    it("returns WorkflowConfirmationRequiredError with detail on 409 CONFIRMATION_REQUIRED", async () => {
      jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(RAW_409_BODY), { status: 409 }),
      );
      try {
        await activateWorkflow(SAMPLE.id);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowConfirmationRequiredError);
        expect(err).toBeInstanceOf(WorkflowApiError);
        const e = err as InstanceType<typeof WorkflowConfirmationRequiredError>;
        expect(e.code).toBe("CONFIRMATION_REQUIRED");
        expect(e.status).toBe(409);
        expect(e.detail.requiresConfirmation).toBe(true);
        expect(e.detail.confirmationText).toBe("CONFIRM");
        expect(e.detail.actions).toHaveLength(1);
        expect(e.detail.actions[0]).toEqual({
          nodeId: "refund-node",
          provider: "stripe",
          type: "create_refund",
          displayName: "Create Refund",
          riskDescription:
            "Reverses a Stripe charge — moves money back to the customer.",
        });
      }
    });

    it("filters malformed entries from actions[] (defensive parsing)", async () => {
      jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...RAW_409_BODY,
            actions: [
              RAW_409_BODY.actions[0]!,
              { nodeId: "bad" }, // missing provider/type/displayName — dropped
              null, // not an object — dropped
              { nodeId: "x", provider: "stripe", type: "noop", displayName: 42 }, // wrong type — dropped
            ],
          }),
          { status: 409 },
        ),
      );
      try {
        await activateWorkflow(SAMPLE.id);
        throw new Error("expected throw");
      } catch (err) {
        const e = err as InstanceType<typeof WorkflowConfirmationRequiredError>;
        expect(e.detail.actions).toHaveLength(1);
        expect(e.detail.actions[0]!.nodeId).toBe("refund-node");
      }
    });

    it("falls back to the plain WorkflowApiError when body does not match the CONFIRMATION_REQUIRED shape", async () => {
      // Same error name but missing the structured fields — server
      // hypothetically returned a non-conformant 409.
      jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "CONFIRMATION_REQUIRED" }),
          { status: 409 },
        ),
      );
      try {
        await activateWorkflow(SAMPLE.id);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowApiError);
        expect(err).not.toBeInstanceOf(WorkflowConfirmationRequiredError);
        const e = err as WorkflowApiError;
        // Without `code` in the body and no LifecycleError code, the
        // generic mapper for 409 falls through to UNKNOWN.
        expect(e.code).toBe("UNKNOWN");
      }
    });
  });

  describe("isConfirmationRequiredError type guard", () => {
    it("returns true for a real WorkflowConfirmationRequiredError instance", () => {
      const err = new WorkflowConfirmationRequiredError("x", 409, {
        requiresConfirmation: true,
        confirmationText: "CONFIRM",
        actions: [],
      });
      expect(isConfirmationRequiredError(err)).toBe(true);
    });

    it("returns true for a shape-compatible Error even when the prototype was lost (e.g. cross-module mock)", () => {
      // Simulate what happens when Jest mocks the workflows module — the
      // thrown error may be a different class with the same shape. The
      // guard MUST accept it so route layers branch correctly.
      const fake = new Error("x") as Error & {
        code: string;
        detail: InstanceType<typeof WorkflowConfirmationRequiredError>["detail"];
      };
      fake.code = "CONFIRMATION_REQUIRED";
      fake.detail = {
        requiresConfirmation: true,
        confirmationText: "CONFIRM",
        actions: [
          {
            nodeId: "n1",
            provider: "stripe",
            type: "create_refund",
            displayName: "Create Refund",
          },
        ],
      };
      expect(isConfirmationRequiredError(fake)).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isConfirmationRequiredError(new Error("oops"))).toBe(false);
      expect(
        isConfirmationRequiredError(
          new WorkflowApiError("x", "LIFECYCLE_CONFLICT", 409),
        ),
      ).toBe(false);
      expect(isConfirmationRequiredError(null)).toBe(false);
      expect(isConfirmationRequiredError(undefined)).toBe(false);
      expect(isConfirmationRequiredError("CONFIRMATION_REQUIRED")).toBe(false);
    });

    it("returns false for a shape with the right code but malformed detail", () => {
      const fake = new Error("x") as Error & { code: string; detail: unknown };
      fake.code = "CONFIRMATION_REQUIRED";
      fake.detail = { requiresConfirmation: false }; // wrong literal
      expect(isConfirmationRequiredError(fake)).toBe(false);
    });
  });

  describe("activateWorkflow accepts confirmationText", () => {
    it("default call still posts body: null (back-compat with pre-POSTSEC-5 routes)", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(SAMPLE), { status: 200 }),
      );
      await activateWorkflow(SAMPLE.id);
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/workflows/${SAMPLE.id}/activate`,
        expect.objectContaining({ method: "POST", body: null }),
      );
    });

    it("posts confirmationText as a JSON body when supplied", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(SAMPLE), { status: 200 }),
      );
      await activateWorkflow(SAMPLE.id, { confirmationText: "CONFIRM" });
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/workflows/${SAMPLE.id}/activate`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "content-type": "application/json",
          }),
          body: JSON.stringify({ confirmationText: "CONFIRM" }),
        }),
      );
    });
  });

  describe("runNowWorkflow accepts confirmationText", () => {
    it("default call posts inputs only (no confirmationText sibling)", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ runId: "r1", enqueuedAt: "2026-05-23T00:00:00Z" }),
          { status: 202 },
        ),
      );
      await runNowWorkflow(SAMPLE.id);
      const body = fetchSpy.mock.calls[0]![1]!.body as string;
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed).toEqual({ inputs: {} });
      expect(parsed).not.toHaveProperty("confirmationText");
    });

    it("posts confirmationText as a sibling of inputs when supplied", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ runId: "r1", enqueuedAt: "2026-05-23T00:00:00Z" }),
          { status: 202 },
        ),
      );
      await runNowWorkflow(
        SAMPLE.id,
        { inputs: { x: 1 } },
        { confirmationText: "CONFIRM" },
      );
      const body = fetchSpy.mock.calls[0]![1]!.body as string;
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed).toEqual({
        inputs: { x: 1 },
        confirmationText: "CONFIRM",
      });
    });
  });
});
