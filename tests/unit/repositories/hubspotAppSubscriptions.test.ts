/**
 * @jest-environment node
 *
 * Tests for repositories/hubspotAppSubscriptions.ts.
 *
 * The repo is service-role-only — every operation runs from the
 * webhook lifecycle path with no user session. Tests mock the
 * service-role client so no network is touched.
 */

interface ChainState {
  insertPayload?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string } | null;
  // For asserting the .is() call on null property_name lookups.
  isCalls: Array<{ col: string; val: unknown }>;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn(() => builder),
    insert: jest.fn((payload: unknown) => {
      state.insertPayload = payload;
      return builder;
    }),
    delete: jest.fn(() => builder),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    is: jest.fn((col: string, val: unknown) => {
      state.isCalls.push({ col, val });
      state.filters.push({ op: "is", args: [col, val] });
      return builder;
    }),
    single: jest.fn(() =>
      Promise.resolve({ data: state.resultData, error: state.resultError }),
    ),
    maybeSingle: jest.fn(() =>
      Promise.resolve({ data: state.resultData, error: state.resultError }),
    ),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  create,
  deleteById,
  find,
  findById,
  findOrCreate,
} from "@/repositories/hubspotAppSubscriptions";

const baseRow = {
  id: "sub-1",
  app_id: "app-100",
  event_type: "contact.creation",
  property_name: null,
  hubspot_subscription_id: "hs-sub-77",
  status: "active",
  created_at: "2026-05-10T00:00:00Z",
  updated_at: "2026-05-10T00:00:00Z",
};

function freshState(resultData: unknown = baseRow): ChainState {
  return { filters: [], resultData, resultError: null, isCalls: [] };
}

describe("hubspot_app_subscriptions.find", () => {
  it("looks up by (app_id, event_type) and uses .is() for null property_name", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await find({
      appId: "app-100",
      eventType: "contact.creation",
      propertyName: null,
    });
    expect(result?.id).toBe("sub-1");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["app_id", "app-100"],
    });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["event_type", "contact.creation"],
    });
    // .is(property_name, null) is the correct PostgREST predicate for
    // null comparison — .eq() would treat it as the literal text "null".
    expect(state.isCalls).toEqual([{ col: "property_name", val: null }]);
  });

  it("uses .eq() for non-null property_name (propertyChange events)", async () => {
    const state = freshState({ ...baseRow, property_name: "email" });
    mockServiceRole.current = makeMockClient(state);
    const result = await find({
      appId: "app-100",
      eventType: "contact.propertyChange",
      propertyName: "email",
    });
    expect(result?.propertyName).toBe("email");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["property_name", "email"],
    });
    expect(state.isCalls).toEqual([]); // no .is() call when propertyName is non-null
  });

  it("returns null when no row matches", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    const result = await find({
      appId: "app-100",
      eventType: "contact.creation",
      propertyName: null,
    });
    expect(result).toBeNull();
  });

  it("throws when the query fails", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "boom" },
      isCalls: [],
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      find({ appId: "a", eventType: "e", propertyName: null }),
    ).rejects.toThrow(/boom/);
  });
});

describe("hubspot_app_subscriptions.create", () => {
  it("inserts a row with the provided fields and returns the record", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await create({
      appId: "app-100",
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-sub-77",
    });
    expect(result.id).toBe("sub-1");
    expect(state.insertPayload).toEqual({
      app_id: "app-100",
      event_type: "contact.creation",
      property_name: null,
      hubspot_subscription_id: "hs-sub-77",
      status: "active",
    });
  });

  it("propagates the unique-constraint violation as a thrown Error", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: {
        message:
          "duplicate key value violates unique constraint hubspot_app_subscriptions_unique",
      },
      isCalls: [],
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      create({
        appId: "app-100",
        eventType: "contact.creation",
        propertyName: null,
        hubspotSubscriptionId: "hs-sub-77",
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("hubspot_app_subscriptions.findOrCreate", () => {
  it("returns the existing row without calling the creator when one exists", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const creator = jest.fn();
    const result = await findOrCreate(
      {
        appId: "app-100",
        eventType: "contact.creation",
        propertyName: null,
      },
      creator,
    );
    expect(result.id).toBe("sub-1");
    expect(creator).not.toHaveBeenCalled();
  });

  it("calls the creator + inserts when no row exists", async () => {
    // First call (find) returns null; second call (insert -> single)
    // returns the inserted row. We swap state between calls by
    // recreating the client.
    const findState = freshState(null);
    mockServiceRole.current = makeMockClient(findState);

    let createState: ChainState | null = null;
    const creator = jest.fn(async () => {
      // After creator runs, swap to insert-state for the create() call.
      createState = freshState(baseRow);
      mockServiceRole.current = makeMockClient(createState);
      return { hubspotSubscriptionId: "hs-sub-77" };
    });

    const result = await findOrCreate(
      {
        appId: "app-100",
        eventType: "contact.creation",
        propertyName: null,
      },
      creator,
    );
    expect(creator).toHaveBeenCalledTimes(1);
    expect(result.hubspotSubscriptionId).toBe("hs-sub-77");
    expect(createState!.insertPayload).toEqual({
      app_id: "app-100",
      event_type: "contact.creation",
      property_name: null,
      hubspot_subscription_id: "hs-sub-77",
      status: "active",
    });
  });

  it("re-fetches when create races with another caller and hits a unique violation", async () => {
    // Phased mock: each call to `from("hubspot_app_subscriptions")`
    // returns a different builder so we can simulate the race exactly.
    //   1. First find() → maybeSingle returns null (no row yet).
    //   2. creator() runs → returns hubspotSubscriptionId.
    //   3. create() → single returns duplicate-key error.
    //   4. Second find() → maybeSingle returns the racing row.
    const racingRow = {
      ...baseRow,
      id: "sub-race-winner",
      hubspot_subscription_id: "hs-other-sub",
    };
    const phases: ChainState[] = [
      freshState(null), // phase 1: first find -> null
      {
        // phase 3: create -> duplicate-key error
        filters: [],
        resultData: null,
        resultError: {
          message:
            "duplicate key value violates unique constraint hubspot_app_subscriptions_unique",
        },
        isCalls: [],
      },
      freshState(racingRow), // phase 4: second find -> racing row
    ];
    let phaseIndex = 0;
    const phaseClient = {
      from: jest.fn(() => {
        const state = phases[phaseIndex]!;
        phaseIndex += 1;
        return makeMockClient(state).from() as unknown as Record<
          string,
          unknown
        >;
      }),
    };
    mockServiceRole.current =
      phaseClient as unknown as ReturnType<typeof makeMockClient>;

    const creator = jest.fn(async () => ({
      hubspotSubscriptionId: "hs-sub-77",
    }));

    const result = await findOrCreate(
      {
        appId: "app-100",
        eventType: "contact.creation",
        propertyName: null,
      },
      creator,
    );
    expect(creator).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("sub-race-winner");
    expect(result.hubspotSubscriptionId).toBe("hs-other-sub");
    expect(phaseIndex).toBe(3); // all three phases consumed
  });

  it("propagates non-unique errors from create unchanged", async () => {
    const phases: ChainState[] = [
      freshState(null), // first find -> null
      {
        // create -> non-unique error
        filters: [],
        resultData: null,
        resultError: { message: "permission denied for relation" },
        isCalls: [],
      },
    ];
    let phaseIndex = 0;
    const phaseClient = {
      from: jest.fn(() => {
        const state = phases[phaseIndex]!;
        phaseIndex += 1;
        return makeMockClient(state).from() as unknown as Record<
          string,
          unknown
        >;
      }),
    };
    mockServiceRole.current =
      phaseClient as unknown as ReturnType<typeof makeMockClient>;

    const creator = jest.fn(async () => ({
      hubspotSubscriptionId: "hs-sub-77",
    }));
    await expect(
      findOrCreate(
        {
          appId: "app-100",
          eventType: "contact.creation",
          propertyName: null,
        },
        creator,
      ),
    ).rejects.toThrow(/permission denied/);
    // Only 2 phases consumed: find + failed create. No re-fetch on
    // non-unique errors.
    expect(phaseIndex).toBe(2);
  });
});

describe("hubspot_app_subscriptions.deleteById", () => {
  it("deletes the row by id", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    await deleteById("sub-1");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["id", "sub-1"],
    });
  });

  it("throws when the delete fails", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "boom" },
      isCalls: [],
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(deleteById("sub-1")).rejects.toThrow(/boom/);
  });
});

describe("hubspot_app_subscriptions.findById", () => {
  it("returns the row when found", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await findById("sub-1");
    expect(result?.id).toBe("sub-1");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["id", "sub-1"],
    });
  });

  it("returns null when no row matches", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    const result = await findById("does-not-exist");
    expect(result).toBeNull();
  });
});
