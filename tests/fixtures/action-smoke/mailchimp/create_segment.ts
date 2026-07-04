import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:create_segment (writeSafe) — Mailchimp finisher batch.
 *
 *   execute  create_segment -> create an EMPTY STATIC segment (mode "static",
 *            no static_emails) named with the unique smoke marker on the
 *            discovered audience. Capture { segmentId } into ledger key
 *            "segment".
 *   verify   segment_state (smokeRead) -> INDEPENDENT segment GET-by-id
 *            read-back; markerPath proves the marker on the PERSISTED name.
 *   cleanup  none — Mailchimp has NO registered segment-delete action
 *            (artifact "left": one empty crsmoke-named static segment on the
 *            throwaway audience, zero members, zero campaign impact).
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "create_segment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    mode: "static",
    name: "{{smokeMarker}}segment",
  },
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
  },
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "segment", idPath: "segmentId", kind: "segment" },
    // create_segment echoes the stored name; confirm the marker round-tripped.
    markerEchoPath: "name",
    verify: {
      provider: "mailchimp",
      action: "segment_state",
      smokeRead: true,
      config: {
        audienceId: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
        segmentId: "{{ledger.segment.id}}",
      },
      markerPath: "name",
    },
  },
  notes:
    "Create an empty static smoke segment on the discovered audience -> independent " +
    "segment GET-by-id read-back (marker on name). No registered segment delete -> " +
    "one empty crsmoke segment artifact left per certification run.",
});
