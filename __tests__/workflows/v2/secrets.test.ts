import { extractSecretName, redactSecrets, isSecretPlaceholder } from "@/src/lib/workflows/builder/secrets"

describe("secrets helpers", () => {
  test("detects secret placeholders", () => {
    expect(isSecretPlaceholder("{{secret:WEBHOOK}}")).toBe(true)
    expect(isSecretPlaceholder("plain")).toBe(false)
    expect(extractSecretName("{{secret:WEBHOOK}}")).toBe("WEBHOOK")
    expect(extractSecretName("plain")).toBeNull()
  })

  test("redacts secret values", () => {
    const payload = { headers: { Authorization: "Bearer SECRET" }, body: "SECRET value" }
    const redacted = redactSecrets(payload, ["SECRET"])
    expect(redacted.headers.Authorization).toBe("Bearer ••••")
    expect(redacted.body).toBe("•••• value")
  })
})
