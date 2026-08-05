/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — no-leak proofs: plaintext tokens,
 * ciphertexts (source AND destination), encryption keys, and raw external
 * labels never appear in logs, reports, or thrown errors. Also proves the
 * serialization guard itself catches an unsafe report (non-vacuous).
 */
import {
  buildPlan,
  runApply,
  runDryRun,
} from "@/scripts/integrations-transplant/orchestrator";
import { serializeReport } from "@/scripts/integrations-transplant/report";
import { redactId, redactLabel } from "@/scripts/integrations-transplant/redact";
import type { TransplantReport } from "@/scripts/integrations-transplant/types";
import {
  DEST_KEY,
  FakeSourceReader,
  SOURCE_KEY,
  makeConfig,
  makeDeps,
  makeSourceRow,
  okProbe,
} from "./helpers";

const PLAINTEXT_ACCESS = "source-access-token-plain-value";
const PLAINTEXT_REFRESH = "source-refresh-token-plain-value";

describe("no-leak: apply artifacts", () => {
  it("logs, report, and serialized artifact contain no plaintext, no ciphertext, no keys, no raw label", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps, dest, logs } = makeDeps({
      source,
      probes: { gmail: okProbe(row.provider_account_id) },
    });
    const config = makeConfig();
    const fp = (await buildPlan(deps, config)).fingerprint;
    const { serialized } = await runApply(deps, config, "op-leak", fp);

    const destCiphertext = dest.rows[0]!.accessTokenEncrypted;
    const everything = serialized + "\n" + logs.join("\n");
    for (const secret of [
      PLAINTEXT_ACCESS,
      PLAINTEXT_REFRESH,
      row.access_token_encrypted,
      row.refresh_token_encrypted,
      destCiphertext,
      SOURCE_KEY.toString("base64"),
      DEST_KEY.toString("base64"),
      row.provider_account_id, // raw gmail address
      row.display_name,
    ]) {
      expect(everything).not.toContain(secret as string);
    }
  });

  it("dry-run artifact contains neither plaintext nor ciphertext nor raw labels", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source, probes: { gmail: okProbe(row.provider_account_id) } });
    const { serialized } = await runDryRun(deps, makeConfig(), "op-dry");
    for (const secret of [
      PLAINTEXT_ACCESS,
      row.access_token_encrypted,
      row.refresh_token_encrypted,
      row.provider_account_id,
    ]) {
      expect(serialized).not.toContain(secret as string);
    }
  });

  it("thrown refusals never contain token material", async () => {
    const row = makeSourceRow();
    const source = new FakeSourceReader(undefined, [row]);
    const { deps } = makeDeps({ source, probes: { gmail: okProbe(row.provider_account_id) } });
    let message = "";
    try {
      await runApply(deps, makeConfig(), "op", "wrong-fingerprint");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("dry_run_fingerprint_mismatch");
    expect(message).not.toContain(PLAINTEXT_ACCESS);
    expect(message).not.toContain(row.access_token_encrypted);
  });
});

describe("no-leak: the serialization guard is non-vacuous", () => {
  it("serializeReport THROWS when a sensitive value leaks into the report", () => {
    const report = {
      operationId: "op",
      mode: "apply",
      fingerprint: "fp",
      sourceProjectRef: "x",
      destProjectRef: "y",
      sourceAccountId: "a",
      destAccountId: "b",
      destConnectedByUserId: "c",
      conflictStrategy: "fail",
      verificationMode: "strict",
      items: [
        {
          sourceIntegrationId: "id",
          provider: "gmail",
          classification: "B",
          externalAccountLabel: "leaked-secret-token-value", // simulated leak
          providerAccountId: "redacted",
          intendedAction: "insert",
          conflict: "none",
          verificationSupport: "identity",
          status: "verified",
          reason: "ok",
        },
      ],
      counts: {},
    } as unknown as TransplantReport;
    expect(() => serializeReport(report, ["leaked-secret-token-value"])).toThrow(
      /redaction violation/,
    );
    // And the error itself does not echo the value.
    try {
      serializeReport(report, ["leaked-secret-token-value"]);
    } catch (err) {
      expect((err as Error).message).not.toContain("leaked-secret-token-value");
    }
  });
});

describe("redaction helpers", () => {
  it("redacts emails to a 2-char local prefix + TLD only", () => {
    const redacted = redactLabel("marcus.leonard@gmail.com");
    expect(redacted).toBe("ma…@….com");
    expect(redacted).not.toContain("gmail");
    expect(redacted).not.toContain("marcus.leonard");
  });

  it("redacts opaque ids to a short prefix + length", () => {
    expect(redactId("T0123456789ABCDEF")).toBe("T012…(len 17)");
    expect(redactId(null)).toBe("(none)");
  });
});
